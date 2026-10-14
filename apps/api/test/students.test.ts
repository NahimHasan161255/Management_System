import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { Queryable, QueryResult } from "../src/database/queryable.js";
import type { StudentRow } from "../src/students/student.js";

const now = new Date("2026-10-14T00:00:00.000Z");

function makeStudentRow(overrides: Partial<StudentRow> = {}): StudentRow {
  return {
    id: "e9c76a51-8b06-4eeb-b5e6-3e0dca105243",
    internal_id: "STU-123456ABCDEF",
    full_name: "Aiko Example",
    email: "aiko@example.test",
    phone: null,
    nationality: "Bangladeshi",
    status: "consultation",
    created_at: now,
    updated_at: now,
    ...overrides
  };
}

function makeQueryableRow(overrides: Partial<{
  internal_id: string;
  full_name: string;
  email: string | null;
  status: string;
}> = {}) {
  return {
    internal_id: "STU-EXISTING0001",
    full_name: "Aiko Example",
    email: "aiko@example.test",
    status: "consultation",
    ...overrides
  };
}

function databaseFor(
  handler: (text: string, values: readonly unknown[]) => Promise<QueryResult<unknown>>
): Queryable {
  return {
    query: async <Row>(text: string, values: readonly unknown[] = []) =>
      await handler(text, values) as QueryResult<Row>
  };
}

describe("student records API", () => {
  it("creates a student with a generated internal ID and returns the saved record", async () => {
    let capturedValues: readonly unknown[] = [];
    const database = databaseFor(async (text, values) => {
      if (text.includes("lower(full_name)")) return { rows: [], rowCount: 0 };
      assert.match(text, /INSERT INTO students/);
      capturedValues = values;
      return { rows: [makeStudentRow({ internal_id: String(values[0]), full_name: String(values[1]) })], rowCount: 1 };
    });

    const response = await request(createApp(database))
      .post("/api/students")
      .send({ fullName: "Aiko Example", email: "aiko@example.test", nationality: "Bangladeshi", status: "consultation" });

    assert.equal(response.status, 201);
    assert.match(response.body.student.internalId, /^STU-[A-F0-9]{12}$/);
    assert.equal(response.body.student.fullName, "Aiko Example");
    assert.equal(capturedValues[1], "Aiko Example");
  });

  it("rejects an invalid student body", async () => {
    const response = await request(createApp(databaseFor(async () => ({ rows: [], rowCount: 0 }))))
      .post("/api/students")
      .send({ fullName: " ", status: "invented" });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
  });

  it("warns about likely duplicates instead of merging or creating automatically", async () => {
    let insertAttempted = false;
    const database = databaseFor(async (text) => {
      if (text.includes("lower(full_name)")) {
        return { rows: [makeQueryableRow()], rowCount: 1 };
      }
      insertAttempted = true;
      return { rows: [makeStudentRow()], rowCount: 1 };
    });

    const response = await request(createApp(database))
      .post("/api/students")
      .send({ fullName: "Aiko Example", email: "aiko@example.test", status: "consultation" });

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, "POTENTIAL_DUPLICATE");
    assert.equal(response.body.error.details[0].internal_id, "STU-EXISTING0001");
    assert.equal(insertAttempted, false);
  });

  it("allows a separate record only after duplicate confirmation", async () => {
    const database = databaseFor(async (text, values) => {
      if (text.includes("lower(full_name)")) {
        return { rows: [makeQueryableRow()], rowCount: 1 };
      }
      return {
        rows: [makeStudentRow({
          internal_id: String(values[0]),
          full_name: String(values[1])
        })],
        rowCount: 1
      };
    });

    const response = await request(createApp(database))
      .post("/api/students")
      .send({
        fullName: "Aiko Example",
        email: "aiko@example.test",
        status: "consultation",
        confirmPotentialDuplicate: true
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.student.fullName, "Aiko Example");
  });

  it("searches using bound query parameters and returns paginated results", async () => {
    const calls: { text: string; values: readonly unknown[] }[] = [];
    const database = databaseFor(async (text, values) => {
      calls.push({ text, values });
      if (text.includes("count(*)")) return { rows: [{ total: "1" }], rowCount: 1 };
      return { rows: [makeStudentRow()], rowCount: 1 };
    });

    const response = await request(createApp(database))
      .get("/api/students")
      .query({ q: "' OR true --", status: "consultation", page: "1", pageSize: "10" });

    assert.equal(response.status, 200);
    assert.equal(response.body.total, 1);
    assert.equal(response.body.items[0].internalId, "STU-123456ABCDEF");
    assert.equal(calls[0]!.values[0], "' OR true --");
    assert.doesNotMatch(calls[0]!.text, /OR true/);
    assert.deepEqual(calls[0]!.values.slice(1), ["consultation"]);
    assert.deepEqual(calls[1]!.values.slice(-2), [10, 0]);
  });

  it("updates only supplied fields and reports missing records", async () => {
    let capturedText = "";
    let capturedValues: readonly unknown[] = [];
    const database = databaseFor(async (text, values) => {
      capturedText = text;
      capturedValues = values;
      return { rows: [], rowCount: 0 };
    });

    const response = await request(createApp(database))
      .patch("/api/students/e9c76a51-8b06-4eeb-b5e6-3e0dca105243")
      .send({ status: "profile_assessment" });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "STUDENT_NOT_FOUND");
    assert.match(capturedText, /status = \$2/);
    assert.doesNotMatch(capturedText, /email =|phone =|nationality =/);
    assert.deepEqual(capturedValues, ["e9c76a51-8b06-4eeb-b5e6-3e0dca105243", "profile_assessment"]);
  });
});

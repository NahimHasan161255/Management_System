import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { Queryable, QueryResult } from "../src/database/queryable.js";
import type { StudentRow } from "../src/students/student.js";

const now = new Date("2026-10-15T00:00:00.000Z");

function studentRow(): StudentRow {
  return {
    id: "e9c76a51-8b06-4eeb-b5e6-3e0dca105243",
    internal_id: "STU-123456ABCDEF",
    full_name: "Aiko Example",
    email: "aiko@example.test",
    phone: "+880123456789",
    nationality: null,
    sns_url: "https://example.test/aiko",
    last_degree: "HSC",
    language_qualification: "IELTS",
    study_fields: ["Computer Science"],
    status: "consultation",
    created_at: now,
    updated_at: now
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

const profile = {
  fullName: "Aiko Example",
  email: "aiko@example.test",
  phone: "+880123456789",
  snsUrl: "https://example.test/aiko",
  lastDegree: "HSC",
  languageQualification: "IELTS",
  studyFields: ["Computer Science", "Data Science"]
};

describe("student self-intake API", () => {
  it("creates a student profile and stores a valid private PDF document", async () => {
    let insertValues: readonly unknown[] = [];
    const database = databaseFor(async (text, values) => {
      if (text.includes("SELECT id FROM students")) return { rows: [], rowCount: 0 };
      assert.match(text, /INSERT INTO students/);
      assert.match(text, /INSERT INTO student_documents/);
      insertValues = values;
      return { rows: [studentRow()], rowCount: 1 };
    });

    const response = await request(createApp(database))
      .post("/api/student-intake")
      .field("profile", JSON.stringify(profile))
      .attach("ssc_certificate", Buffer.from("%PDF-1.7 sample"), {
        filename: "ssc.pdf",
        contentType: "application/pdf"
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.student.fullName, "Aiko Example");
    assert.equal(response.body.student.studyFields.length, 1);
    assert.ok(insertValues.some((value) => Buffer.isBuffer(value)));
  });

  it("rejects more than five study fields", async () => {
    const response = await request(createApp(databaseFor(async () => ({ rows: [], rowCount: 0 }))))
      .post("/api/student-intake")
      .field("profile", JSON.stringify({
        ...profile,
        studyFields: ["A", "B", "C", "D", "E", "F"]
      }));

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
  });

  it("rejects a PDF upload with invalid file content", async () => {
    const response = await request(createApp(databaseFor(async () => ({ rows: [], rowCount: 0 }))))
      .post("/api/student-intake")
      .field("profile", JSON.stringify(profile))
      .attach("passport", Buffer.from("not a PDF"), {
        filename: "passport.pdf",
        contentType: "application/pdf"
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_DOCUMENT");
  });

  it("does not create another record for an email already on file", async () => {
    let insertAttempted = false;
    const database = databaseFor(async (text) => {
      if (text.includes("SELECT id FROM students")) {
        return { rows: [{ id: "e9c76a51-8b06-4eeb-b5e6-3e0dca105243" }], rowCount: 1 };
      }
      insertAttempted = true;
      return { rows: [studentRow()], rowCount: 1 };
    });

    const response = await request(createApp(database))
      .post("/api/student-intake")
      .field("profile", JSON.stringify(profile));

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, "STUDENT_ALREADY_EXISTS");
    assert.equal(insertAttempted, false);
  });

  it("serves stored documents as non-cacheable attachments", async () => {
    const pdf = Buffer.from("%PDF-1.7 sample");
    const database = databaseFor(async () => ({
      rows: [{
        document_type: "passport",
        original_name: "passport.pdf",
        mime_type: "application/pdf",
        file_data: pdf
      }],
      rowCount: 1
    }));

    const response = await request(createApp(database))
      .get("/api/students/e9c76a51-8b06-4eeb-b5e6-3e0dca105243/documents/passport");

    assert.equal(response.status, 200);
    const contentDisposition = response.headers["content-disposition"];
    assert.ok(contentDisposition);
    assert.match(contentDisposition, /attachment/);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers["content-type"], "application/pdf");
    assert.deepEqual(response.body, pdf);
  });
});

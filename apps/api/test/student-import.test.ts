import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { Queryable, QueryResult } from "../src/database/queryable.js";
import type { StudentRow } from "../src/students/student.js";

const createdStudent: StudentRow = {
  id: "e9c76a51-8b06-4eeb-b5e6-3e0dca105243",
  internal_id: "STU-123456ABCDEF",
  full_name: "Aiko Example",
  email: "aiko@example.test",
  phone: "+880123456789",
  nationality: null,
  sns_url: null,
  last_degree: "HSC",
  language_qualification: "IELTS",
  study_fields: ["Computer Science", "Data Science"],
  status: "consultation",
  created_at: new Date("2026-10-15T00:00:00.000Z"),
  updated_at: new Date("2026-10-15T00:00:00.000Z")
};

function databaseFor(
  handler: (text: string, values: readonly unknown[]) => Promise<QueryResult<unknown>>
): Queryable {
  return {
    query: async <Row>(text: string, values: readonly unknown[] = []) =>
      await handler(text, values) as QueryResult<Row>
  };
}

function uploadCsv(csv: string, database: Queryable) {
  return request(createApp(database))
    .post("/api/students/import")
    .attach("file", Buffer.from(csv), {
      filename: "responses.csv",
      contentType: "text/csv"
    });
}

describe("Google Forms CSV import", () => {
  it("imports student details and validated Google Drive document links", async () => {
    const calls: { text: string; values: readonly unknown[] }[] = [];
    const database = databaseFor(async (text, values) => {
      calls.push({ text, values });
      if (text.includes("SELECT internal_id FROM students")) return { rows: [], rowCount: 0 };
      assert.match(text, /INSERT INTO students/);
      assert.match(text, /INSERT INTO student_documents/);
      return { rows: [createdStudent], rowCount: 1 };
    });
    const csv = [
      "Timestamp,Full name,Email address,Contact number,Last completed degree,Language qualification,Interested study fields (up to 5),Passport",
      '2026-10-15,Aiko Example,aiko@example.test,+880123456789,HSC,IELTS,"Computer Science;Data Science",https://drive.google.com/file/d/abc/view'
    ].join("\r\n");

    const response = await uploadCsv(csv, database);

    assert.equal(response.status, 200);
    assert.equal(response.body.totalRows, 1);
    assert.equal(response.body.imported[0].fullName, "Aiko Example");
    assert.equal(response.body.imported[0].row, 2);
    assert.deepEqual(response.body.skipped, []);
    assert.ok(calls[1]!.values.includes("https://drive.google.com/file/d/abc/view"));
  });

  it("skips unsafe document links and invalid student rows without inserting them", async () => {
    let insertAttempted = false;
    const database = databaseFor(async (text) => {
      if (text.includes("SELECT internal_id FROM students")) return { rows: [], rowCount: 0 };
      insertAttempted = true;
      return { rows: [createdStudent], rowCount: 1 };
    });
    const csv = [
      "Full name,Email address,Contact number,Last completed degree,Interested study fields (up to 5),Passport",
      "Aiko Example,aiko@example.test,+880123456789,HSC,Computer Science,https://evil.example/passport.pdf",
      "Bad Row,not-an-email,+880123456789,HSC,Computer Science,"
    ].join("\n");

    const response = await uploadCsv(csv, database);

    assert.equal(response.status, 200);
    assert.equal(response.body.imported.length, 0);
    assert.equal(response.body.skipped.length, 2);
    assert.match(response.body.skipped[0].reason, /drive\.google\.com/);
    assert.match(response.body.skipped[1].reason, /email/);
    assert.equal(insertAttempted, false);
  });

  it("rejects CSV files missing required columns", async () => {
    const response = await uploadCsv(
      "Name,Email address\nAiko Example,aiko@example.test",
      databaseFor(async () => ({ rows: [], rowCount: 0 }))
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_CSV");
    assert.match(response.body.error.message, /required columns/);
  });

  it("skips duplicate email or name records", async () => {
    let insertAttempted = false;
    const database = databaseFor(async (text) => {
      if (text.includes("SELECT internal_id FROM students")) {
        return { rows: [{ internal_id: "STU-EXISTING0001" }], rowCount: 1 };
      }
      insertAttempted = true;
      return { rows: [createdStudent], rowCount: 1 };
    });
    const csv = [
      "Full name,Email address,Contact number,Last completed degree,Interested study fields (up to 5)",
      "Aiko Example,aiko@example.test,+880123456789,HSC,Computer Science"
    ].join("\n");

    const response = await uploadCsv(csv, database);

    assert.equal(response.status, 200);
    assert.equal(response.body.imported.length, 0);
    assert.match(response.body.skipped[0].reason, /STU-EXISTING0001/);
    assert.equal(insertAttempted, false);
  });

  it("returns imported Drive links in the student's document list", async () => {
    const database = databaseFor(async (text) => {
      assert.match(text, /external_url/);
      return {
        rows: [{
          document_type: "passport",
          original_name: "Passport",
          mime_type: "application/pdf",
          size: null,
          external_url: "https://drive.google.com/file/d/abc/view"
        }],
        rowCount: 1
      };
    });

    const response = await request(createApp(database))
      .get("/api/students/e9c76a51-8b06-4eeb-b5e6-3e0dca105243/documents");

    assert.equal(response.status, 200);
    assert.equal(response.body.documents[0].externalUrl, "https://drive.google.com/file/d/abc/view");
    assert.equal(response.body.documents[0].size, null);
  });
});

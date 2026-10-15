import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { down, up } from "../migrations/20261014170000_initial_accounts_and_access.js";
import {
  down as downStudents,
  up as upStudents
} from "../migrations/20261014180000_create_students.js";
import {
  down as downStudentIntake,
  up as upStudentIntake
} from "../migrations/20261015090000_add_student_intake_details.js";
import {
  down as downExternalStudentDocuments,
  up as upExternalStudentDocuments
} from "../migrations/20261015093000_support_external_student_documents.js";

describe("initial access-control migration", () => {
  it("creates constrained accounts, role-based permissions, and hashed sessions", () => {
    const statements = [];
    up({ sql: (statement) => statements.push(statement) });

    assert.equal(statements.length, 1);
    const sql = statements[0];
    assert.match(sql, /CREATE TABLE app_users/);
    assert.match(sql, /CREATE UNIQUE INDEX app_users_email_lower_unique/);
    assert.match(sql, /CREATE TABLE user_roles/);
    assert.match(sql, /CREATE TABLE role_permissions/);
    assert.match(sql, /CREATE TABLE user_sessions/);
    assert.match(sql, /token_hash char\(64\)/);
    assert.match(sql, /VALUES \('admin', 'Admin'\), \('staff', 'Staff'\)/);
    assert.match(sql, /WHERE roles\.code = 'admin'/);
    assert.match(sql, /WHERE roles\.code = 'staff'/);
  });

  describe("student intake migration", () => {
    it("adds the requested profile fields and private document storage", () => {
      const statements = [];
      upStudentIntake({ sql: (statement) => statements.push(statement) });

      assert.equal(statements.length, 1);
      const sql = statements[0];
      assert.match(sql, /ADD COLUMN sns_url text/);
      assert.match(sql, /ADD COLUMN last_degree varchar\(200\)/);
      assert.match(sql, /ADD COLUMN study_fields text\[\]/);
      assert.match(sql, /cardinality\(study_fields\) <= 5/);
      assert.match(sql, /CREATE TABLE student_documents/);
      assert.match(sql, /file_data bytea NOT NULL/);
      assert.match(sql, /REFERENCES students\(id\) ON DELETE CASCADE/);
    });

    it("allows validated external document links while preserving either-or file storage", () => {
      const statements = [];
      upExternalStudentDocuments({ sql: (statement) => statements.push(statement) });

      assert.equal(statements.length, 1);
      assert.match(statements[0], /ADD COLUMN external_url text/);
      assert.match(statements[0], /file_data IS NOT NULL AND external_url IS NULL/);
      assert.match(statements[0], /drive.*google/);

      const rollbackStatements = [];
      downExternalStudentDocuments({ sql: (statement) => rollbackStatements.push(statement) });
      assert.match(rollbackStatements[0], /DELETE FROM student_documents WHERE external_url IS NOT NULL/);
      assert.match(rollbackStatements[0], /DROP COLUMN external_url/);
    });

    it("rolls back the document table and intake fields", () => {
      const statements = [];
      downStudentIntake({ sql: (statement) => statements.push(statement) });

      assert.equal(statements.length, 1);
      assert.match(statements[0], /DROP TABLE student_documents/);
      assert.match(statements[0], /DROP COLUMN study_fields/);
    });
  });

  it("rolls back child tables before their referenced account tables", () => {
    const statements = [];
    down({ sql: (statement) => statements.push(statement) });

    assert.equal(statements.length, 1);
    const sql = statements[0];
    assert.ok(sql.indexOf("DROP TABLE user_sessions") < sql.indexOf("DROP TABLE app_users"));
    assert.ok(sql.indexOf("DROP TABLE user_roles") < sql.indexOf("DROP TABLE app_users"));
    assert.ok(sql.indexOf("DROP TABLE roles") < sql.indexOf("DROP TABLE app_users"));
  });

  it("creates student records with stable IDs, valid lifecycle stages, and staff assignment", () => {
    const statements = [];
    upStudents({ sql: (statement) => statements.push(statement) });

    assert.equal(statements.length, 1);
    const sql = statements[0];
    assert.match(sql, /CREATE TABLE students/);
    assert.match(sql, /internal_id varchar\(20\) NOT NULL UNIQUE/);
    assert.match(sql, /assigned_staff_id uuid REFERENCES app_users\(id\)/);
    assert.match(sql, /'consultation'/);
    assert.match(sql, /'admitted'/);
    assert.match(sql, /CREATE INDEX students_status_updated_idx/);

    const rollbackStatements = [];
    downStudents({ sql: (statement) => rollbackStatements.push(statement) });
    assert.match(rollbackStatements[0], /DROP TABLE students/);
  });
});

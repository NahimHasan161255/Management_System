import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../errors/api-error.js";
import type { Queryable } from "../database/queryable.js";
import { validateBody } from "../middleware/validate-body.js";
import { createStudentImportHandler } from "./student-import.js";
import { isStudentDocumentType, studentStatuses, toStudent } from "./student.js";
import type { StudentDocumentRow, StudentRow } from "./student.js";

const selectedStudentFields = `id, internal_id, full_name, email, phone, nationality, sns_url,
  last_degree, language_qualification, study_fields, status, created_at, updated_at`;

const studentFields = {
  fullName: z.string().trim().min(1).max(200),
  email: z.union([z.string().trim().email().max(320), z.literal("")]).nullable().optional(),
  phone: z.union([z.string().trim().max(50), z.literal("")]).nullable().optional(),
  nationality: z.union([z.string().trim().max(100), z.literal("")]).nullable().optional(),
  status: z.enum(studentStatuses)
};

const createStudentSchema = z.object({
  ...studentFields,
  confirmPotentialDuplicate: z.boolean().default(false)
});
const updateStudentSchema = z.object({
  fullName: studentFields.fullName.optional(),
  email: studentFields.email,
  phone: studentFields.phone,
  nationality: studentFields.nationality,
  status: studentFields.status.optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field must be provided");

const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(studentStatuses).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

const idSchema = z.string().uuid();

export function createStudentRouter(database: Queryable) {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/", async (request, response, next) => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      next(new ApiError(400, "VALIDATION_ERROR", "Query parameters are invalid", query.error.issues));
      return;
    }

    const { q, status, page, pageSize } = query.data;
    const values: unknown[] = [];
    const conditions: string[] = [];

    if (q) {
      values.push(q);
      conditions.push(`position(lower($${values.length}) in lower(concat_ws(' ', internal_id, full_name, email, phone, nationality, sns_url, last_degree, language_qualification, study_fields))) > 0`);
    }
    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    try {
      const countResult = await database.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM students ${where}`,
        values
      );
      const total = Number(countResult.rows[0]?.total ?? 0);
      const pageValues = [...values, pageSize, (page - 1) * pageSize];
      const result = await database.query<StudentRow>(
        `SELECT ${selectedStudentFields}
         FROM students ${where}
         ORDER BY updated_at DESC, id
         LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
        pageValues
      );

      response.json({
        items: result.rows.map(toStudent),
        total,
        page,
        pageSize
      });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get("/:id/documents", async (request, response, next) => {
    const id = idSchema.safeParse(request.params.id);
    if (!id.success) {
      next(new ApiError(400, "VALIDATION_ERROR", "Student ID must be a UUID"));
      return;
    }

    try {
      const result = await database.query<{
        document_type: string;
        original_name: string;
        mime_type: string;
        size: number | null;
        external_url: string | null;
      }>(
        `SELECT document_type, original_name, mime_type,
           CASE WHEN file_data IS NULL THEN NULL ELSE octet_length(file_data) END AS size,
           external_url
         FROM student_documents WHERE student_id = $1 ORDER BY document_type`,
        [id.data]
      );
      response.json({
        documents: result.rows.map((row) => ({
          type: row.document_type,
          fileName: row.original_name,
          contentType: row.mime_type,
          size: row.size === null ? null : Number(row.size),
          externalUrl: row.external_url
        }))
      });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get("/:id/documents/:documentType", async (request, response, next) => {
    const id = idSchema.safeParse(request.params.id);
    const documentType = request.params.documentType;
    if (!id.success || !isStudentDocumentType(documentType)) {
      next(new ApiError(400, "VALIDATION_ERROR", "Student ID or document type is invalid"));
      return;
    }

    try {
      const result = await database.query<StudentDocumentRow>(
        `SELECT document_type, original_name, mime_type, file_data, external_url
         FROM student_documents WHERE student_id = $1 AND document_type = $2`,
        [id.data, documentType]
      );
      const document = result.rows[0];
      if (!document) {
        next(new ApiError(404, "DOCUMENT_NOT_FOUND", "The requested document was not found"));
        return;
      }
      if (document.external_url) {
        response.status(409).json({
          error: {
            code: "EXTERNAL_DOCUMENT",
            message: "This document is stored in Google Drive and must be opened there."
          },
          externalUrl: document.external_url
        });
        return;
      }
      if (!document.file_data) {
        next(new ApiError(500, "DOCUMENT_STORAGE_ERROR", "The requested document has no stored file data"));
        return;
      }

      response.setHeader("X-Content-Type-Options", "nosniff");
      response.attachment(document.original_name);
      response.type(document.mime_type);
      response.send(document.file_data);
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/import", createStudentImportHandler(database));

  router.get("/:id", async (request, response, next) => {
    const id = idSchema.safeParse(request.params.id);
    if (!id.success) {
      next(new ApiError(400, "VALIDATION_ERROR", "Student ID must be a UUID"));
      return;
    }

    try {
      const result = await database.query<StudentRow>(
        `SELECT ${selectedStudentFields}
         FROM students WHERE id = $1`,
        [id.data]
      );
      const student = result.rows[0];
      if (!student) {
        next(new ApiError(404, "STUDENT_NOT_FOUND", "Student was not found"));
        return;
      }
      response.json({ student: toStudent(student) });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/", validateBody(createStudentSchema), async (request, response, next) => {
    const input = createStudentSchema.parse(request.body);
    const internalId = `STU-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;

    try {
      const duplicateResult = await database.query<{
        internal_id: string;
        full_name: string;
        email: string | null;
        status: string;
      }>(
        `SELECT internal_id, full_name, email, status
         FROM students
         WHERE lower(full_name) = lower($1)
            OR ($2::text IS NOT NULL AND lower(email) = lower($2))
         ORDER BY updated_at DESC
         LIMIT 5`,
        [input.fullName, input.email || null]
      );

      if (duplicateResult.rows.length > 0 && !input.confirmPotentialDuplicate) {
        next(new ApiError(
          409,
          "POTENTIAL_DUPLICATE",
          "Similar student records already exist. Review them before creating another record.",
          duplicateResult.rows
        ));
        return;
      }

      const result = await database.query<StudentRow>(
        `INSERT INTO students (internal_id, full_name, email, phone, nationality, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${selectedStudentFields}`,
        [
          internalId,
          input.fullName,
          input.email || null,
          input.phone || null,
          input.nationality || null,
          input.status
        ]
      );
      response.status(201).json({ student: toStudent(result.rows[0]!) });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.patch("/:id", validateBody(updateStudentSchema), async (request, response, next) => {
    const id = idSchema.safeParse(request.params.id);
    if (!id.success) {
      next(new ApiError(400, "VALIDATION_ERROR", "Student ID must be a UUID"));
      return;
    }
    const input = updateStudentSchema.parse(request.body);
    const columns: Record<keyof typeof input, string> = {
      fullName: "full_name",
      email: "email",
      phone: "phone",
      nationality: "nationality",
      status: "status"
    };
    const entries = Object.entries(input) as [keyof typeof input, unknown][];
    const assignments = entries.map(([key], index) => `${columns[key]} = $${index + 2}`);
    const values = entries.map(([, value]) => value === "" ? null : value);

    try {
      const result = await database.query<StudentRow>(
        `UPDATE students SET ${assignments.join(", ")}, updated_at = now()
         WHERE id = $1
         RETURNING ${selectedStudentFields}`,
        [id.data, ...values]
      );
      const student = result.rows[0];
      if (!student) {
        next(new ApiError(404, "STUDENT_NOT_FOUND", "Student was not found"));
        return;
      }
      response.json({ student: toStudent(student) });
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}

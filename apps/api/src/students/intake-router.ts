import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import type { RequestHandler } from "express";
import { z } from "zod";
import { ApiError } from "../errors/api-error.js";
import type { Queryable } from "../database/queryable.js";
import { languageQualifications, toStudent } from "./student.js";
import type { StudentRow } from "./student.js";

const documentFields = [
  "passport_photo",
  "ssc_certificate",
  "ssc_transcript",
  "hsc_certificate",
  "hsc_transcript",
  "bachelor_certificate",
  "bachelor_transcript",
  "last_degree_certificate",
  "last_degree_transcript",
  "passport",
  "language_proof"
] as const;

const profileSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(1).max(50),
  snsUrl: z.union([z.string().trim().url().max(2048), z.literal("")]).optional(),
  lastDegree: z.string().trim().min(1).max(200),
  languageQualification: z.union([z.enum(languageQualifications), z.literal("")]).optional(),
  studyFields: z.array(z.string().trim().min(1).max(100)).min(1).max(5)
    .refine((values) => new Set(values.map((value) => value.toLowerCase())).size === values.length)
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: documentFields.length,
    fields: 1,
    parts: documentFields.length + 1
  }
}).fields(documentFields.map((name) => ({ name, maxCount: 1 })));

const uploadDocuments: RequestHandler = (request, response, next) => {
  upload(request, response, (error: unknown) => {
    if (error) {
      const message = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
        ? "Each document must be no larger than 10 MB"
        : "The uploaded files could not be accepted";
      next(new ApiError(400, "INVALID_UPLOAD", message));
      return;
    }
    next();
  });
};

function uploadedFiles(request: Parameters<RequestHandler>[0]): Express.Multer.File[] {
  const files = request.files;
  if (!files || Array.isArray(files)) return [];
  return Object.values(files).flat();
}

function isValidFile(file: Express.Multer.File): boolean {
  const bytes = file.buffer;
  if (file.fieldname === "passport_photo") {
    const isJpeg = file.mimetype === "image/jpeg" &&
      bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = file.mimetype === "image/png" &&
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    return isJpeg || isPng;
  }
  return file.mimetype === "application/pdf" &&
    bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}

function safeFileName(fileName: string): string {
  const leafName = fileName.split(/[\\/]/).pop() ?? "document";
  const cleaned = leafName.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 255);
  return cleaned || "document";
}

export function createIntakeRouter(database: Queryable) {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  router.post("/", uploadDocuments, async (request, response, next) => {
    let rawProfile: unknown = request.body.profile;
    if (typeof rawProfile === "string") {
      try {
        rawProfile = JSON.parse(rawProfile) as unknown;
      } catch {
        next(new ApiError(400, "VALIDATION_ERROR", "Student information is invalid"));
        return;
      }
    }
    const parsedProfile = profileSchema.safeParse(rawProfile);
    if (!parsedProfile.success) {
      next(new ApiError(400, "VALIDATION_ERROR", "Student information is invalid", parsedProfile.error.issues));
      return;
    }

    const files = uploadedFiles(request);
    if (files.reduce((total, file) => total + file.size, 0) > 35 * 1024 * 1024) {
      next(new ApiError(400, "INVALID_UPLOAD", "All selected files together must be no larger than 35 MB"));
      return;
    }
    if (files.some((file) => !documentFields.some((field) => field === file.fieldname) || !isValidFile(file))) {
      next(new ApiError(
        400,
        "INVALID_DOCUMENT",
        "Upload a JPG or PNG passport photo and PDF files for all other documents"
      ));
      return;
    }

    const input = parsedProfile.data;
    try {
      const existing = await database.query<{ id: string }>(
        "SELECT id FROM students WHERE lower(email) = lower($1) LIMIT 1",
        [input.email]
      );
      if (existing.rows.length > 0) {
        next(new ApiError(
          409,
          "STUDENT_ALREADY_EXISTS",
          "A student record may already exist for this email. Please contact the staff member helping you."
        ));
        return;
      }

      const values: unknown[] = [
        `STU-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
        input.fullName,
        input.email,
        input.phone,
        null,
        input.snsUrl || null,
        input.lastDegree,
        input.languageQualification || null,
        input.studyFields,
        "consultation"
      ];
      const documentInserts = files.map((file) => {
        values.push(file.fieldname, safeFileName(file.originalname), file.mimetype, file.buffer);
        const offset = values.length - 3;
        return `SELECT id, $${offset}, $${offset + 1}, $${offset + 2}, $${offset + 3} FROM new_student`;
      });
      const saveDocuments = documentInserts.length > 0
        ? `, saved_documents AS (
            INSERT INTO student_documents (student_id, document_type, original_name, mime_type, file_data)
            ${documentInserts.join(" UNION ALL ")}
            RETURNING student_id
          )`
        : "";

      const result = await database.query<StudentRow>(
        `WITH new_student AS (
           INSERT INTO students (
             internal_id, full_name, email, phone, nationality, sns_url, last_degree,
             language_qualification, study_fields, status
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id, internal_id, full_name, email, phone, nationality, sns_url,
             last_degree, language_qualification, study_fields, status, created_at, updated_at
         )${saveDocuments}
         SELECT id, internal_id, full_name, email, phone, nationality, sns_url,
           last_degree, language_qualification, study_fields, status, created_at, updated_at
         FROM new_student`,
        values
      );

      response.status(201).json({ student: toStudent(result.rows[0]!) });
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}

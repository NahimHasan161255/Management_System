import { randomUUID } from "node:crypto";
import multer from "multer";
import type { RequestHandler } from "express";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { ApiError } from "../errors/api-error.js";
import type { Queryable } from "../database/queryable.js";
import { languageQualifications } from "./student.js";
import type { StudentDocumentType } from "./student.js";

const maximumCsvSize = 2 * 1024 * 1024;
const maximumRows = 200;

const columns = {
  fullName: ["full name", "name"],
  email: ["email address", "email", "gmail"],
  phone: ["contact number", "phone number", "phone"],
  snsUrl: ["one social media profile link", "social media profile link", "sns link"],
  lastDegree: ["last completed degree", "last degree"],
  languageQualification: ["language qualification", "jlpt/ielts/moi", "jlpt ielts moi"],
  studyFields: ["interested study fields (up to 5)", "interested study field", "study fields"],
  passport_photo: ["passport-size photo", "passport photo"],
  ssc_certificate: ["ssc certificate"],
  ssc_transcript: ["ssc transcript"],
  hsc_certificate: ["hsc certificate"],
  hsc_transcript: ["hsc transcript"],
  bachelor_certificate: ["bachelor certificate"],
  bachelor_transcript: ["bachelor transcript"],
  last_degree_certificate: ["last degree certificate"],
  last_degree_transcript: ["last degree transcript"],
  passport: ["passport"],
  language_proof: ["jlpt / ielts / moi proof", "language proof"]
} as const;

type ImportColumn = keyof typeof columns;
type ImportDocumentType = Extract<ImportColumn, StudentDocumentType>;

const documentColumns = [
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
] as const satisfies readonly ImportDocumentType[];

const documentLabels: Record<ImportDocumentType, string> = {
  passport_photo: "Passport-size photo",
  ssc_certificate: "SSC certificate",
  ssc_transcript: "SSC transcript",
  hsc_certificate: "HSC certificate",
  hsc_transcript: "HSC transcript",
  bachelor_certificate: "Bachelor certificate",
  bachelor_transcript: "Bachelor transcript",
  last_degree_certificate: "Last degree certificate",
  last_degree_transcript: "Last degree transcript",
  passport: "Passport",
  language_proof: "Language proof"
};

const profileSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(1).max(50),
  snsUrl: z.union([z.string().trim().url().max(2048), z.literal("")]),
  lastDegree: z.string().trim().min(1).max(200),
  languageQualification: z.union([z.enum(languageQualifications), z.literal("")]),
  studyFields: z.array(z.string().trim().min(1).max(100)).min(1).max(5)
    .refine((values) => new Set(values.map((value) => value.toLowerCase())).size === values.length)
});

interface CsvRow {
  [column: string]: string;
}

interface ImportedDocument {
  type: ImportDocumentType;
  url: string;
  contentType: string;
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getCell(row: CsvRow, headerMap: Map<ImportColumn, string>, column: ImportColumn): string {
  const header = headerMap.get(column);
  return header ? (row[header] ?? "").trim() : "";
}

function safeDriveUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !["drive.google.com", "docs.google.com"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function readDocuments(row: CsvRow, headerMap: Map<ImportColumn, string>): ImportedDocument[] {
  const documents: ImportedDocument[] = [];
  for (const type of documentColumns) {
    const cell = getCell(row, headerMap, type);
    if (!cell) continue;
    const links = cell.split(/[\s,]+/).filter(Boolean);
    if (links.length !== 1) {
      throw new Error(`${documentLabels[type]} must contain a single Google Drive file link`);
    }
    const url = safeDriveUrl(links[0]!);
    if (!url) {
      throw new Error(`${documentLabels[type]} link must use drive.google.com or docs.google.com`);
    }
    documents.push({
      type,
      url,
      contentType: type === "passport_photo" ? "application/octet-stream" : "application/pdf"
    });
  }
  return documents;
}

function parseProfile(row: CsvRow, headerMap: Map<ImportColumn, string>) {
  const language = getCell(row, headerMap, "languageQualification").toUpperCase();
  const fields = getCell(row, headerMap, "studyFields")
    .split(/[,;|]/)
    .map((field) => field.trim())
    .filter(Boolean);
  const parsed = profileSchema.safeParse({
    fullName: getCell(row, headerMap, "fullName"),
    email: getCell(row, headerMap, "email"),
    phone: getCell(row, headerMap, "phone"),
    snsUrl: getCell(row, headerMap, "snsUrl"),
    lastDegree: getCell(row, headerMap, "lastDegree"),
    languageQualification: language,
    studyFields: fields
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(issue ? `${issue.path.join(".")}: ${issue.message}` : "Student information is invalid");
  }
  return parsed.data;
}

function parseCsv(buffer: Buffer): { rows: CsvRow[]; headerMap: Map<ImportColumn, string> } {
  const rows = parse(buffer, {
    bom: true,
    columns: (headers: string[]) => headers.map((header) => header.trim()),
    skip_empty_lines: true,
    max_record_size: 100_000,
    relax_column_count: false
  }) as CsvRow[];
  if (rows.length === 0) throw new Error("The CSV contains no student responses");
  if (rows.length > maximumRows) throw new Error(`Import no more than ${maximumRows} students at a time`);

  const rawHeaders = Object.keys(rows[0]!);
  const headerMap = new Map<ImportColumn, string>();
  for (const column of Object.keys(columns) as ImportColumn[]) {
    const aliases = columns[column].map(normalizeHeader);
    const matched = rawHeaders.find((header) => aliases.includes(normalizeHeader(header)));
    if (matched) headerMap.set(column, matched);
  }
  const missing = (["fullName", "email", "phone", "lastDegree", "studyFields"] as const)
    .filter((column) => !headerMap.has(column));
  if (missing.length) {
    throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);
  }
  return { rows, headerMap };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maximumCsvSize, files: 1, fields: 0, parts: 1 }
}).single("file");

export function createStudentImportHandler(database: Queryable): RequestHandler {
  return (request, response, next) => {
    upload(request, response, (uploadError: unknown) => {
      if (uploadError) {
        const message = uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE"
          ? "The CSV file must be no larger than 2 MB"
          : "Upload one CSV file using the file field";
        next(new ApiError(400, "INVALID_IMPORT_FILE", message));
        return;
      }

      void importCsv(database, request, response, next);
    });
  };
}

async function importCsv(
  database: Queryable,
  request: Parameters<RequestHandler>[0],
  response: Parameters<RequestHandler>[1],
  next: Parameters<RequestHandler>[2]
): Promise<void> {
  const file = request.file;
  if (!file || !file.originalname.toLowerCase().endsWith(".csv")) {
    next(new ApiError(400, "INVALID_IMPORT_FILE", "Choose a .csv file exported from Google Sheets"));
    return;
  }

  let parsedCsv: ReturnType<typeof parseCsv>;
  try {
    parsedCsv = parseCsv(file.buffer);
  } catch (error: unknown) {
    next(new ApiError(
      400,
      "INVALID_CSV",
      error instanceof Error ? error.message : "The CSV file could not be read"
    ));
    return;
  }

  const imported: { row: number; fullName: string; internalId: string }[] = [];
  const skipped: { row: number; fullName: string; reason: string }[] = [];

  for (const [index, row] of parsedCsv.rows.entries()) {
    const rowNumber = index + 2;
    let fullName = getCell(row, parsedCsv.headerMap, "fullName") || `Row ${rowNumber}`;
    let profile: ReturnType<typeof parseProfile>;
    let documents: ImportedDocument[];
    try {
      profile = parseProfile(row, parsedCsv.headerMap);
      fullName = profile.fullName;
      documents = readDocuments(row, parsedCsv.headerMap);
    } catch (error: unknown) {
      skipped.push({
        row: rowNumber,
        fullName,
        reason: error instanceof Error ? error.message : "Student information is invalid"
      });
      continue;
    }

    try {
      const duplicate = await database.query<{ internal_id: string }>(
        `SELECT internal_id FROM students
         WHERE lower(email) = lower($1) OR lower(full_name) = lower($2)
         ORDER BY updated_at DESC LIMIT 1`,
        [profile.email, profile.fullName]
      );
      if (duplicate.rows.length) {
        skipped.push({
          row: rowNumber,
          fullName,
          reason: `Possible duplicate (${duplicate.rows[0]!.internal_id})`
        });
        continue;
      }

      const internalId = `STU-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
      const values: unknown[] = [
        internalId,
        profile.fullName,
        profile.email,
        profile.phone,
        null,
        profile.snsUrl || null,
        profile.lastDegree,
        profile.languageQualification || null,
        profile.studyFields,
        "consultation"
      ];
      const documentSelects = documents.map((document) => {
        values.push(document.type, documentLabels[document.type], document.contentType, document.url);
        const offset = values.length - 3;
        return `SELECT id, $${offset}, $${offset + 1}, $${offset + 2}, NULL, $${offset + 3} FROM new_student`;
      });
      const saveDocuments = documentSelects.length
        ? `, saved_documents AS (
             INSERT INTO student_documents (
               student_id, document_type, original_name, mime_type, file_data, external_url
             )
             ${documentSelects.join(" UNION ALL ")}
             RETURNING student_id
           )`
        : "";

      await database.query(
        `WITH new_student AS (
           INSERT INTO students (
             internal_id, full_name, email, phone, nationality, sns_url, last_degree,
             language_qualification, study_fields, status
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id
         )${saveDocuments}
         SELECT id FROM new_student`,
        values
      );
      imported.push({ row: rowNumber, fullName, internalId });
    } catch (error: unknown) {
      next(error);
      return;
    }
  }

  response.status(200).json({
    totalRows: parsedCsv.rows.length,
    imported,
    skipped
  });
}

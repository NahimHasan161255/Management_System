export const studentStatuses = [
  "consultation",
  "profile_assessment",
  "research_selection",
  "application_preparation",
  "submitted",
  "admitted",
  "completed",
  "inactive"
] as const;

export type StudentStatus = (typeof studentStatuses)[number];

export const languageQualifications = ["JLPT", "IELTS", "MOI"] as const;
export type LanguageQualification = (typeof languageQualifications)[number];

export const studentDocumentTypes = [
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
export type StudentDocumentType = (typeof studentDocumentTypes)[number];

export function isStudentDocumentType(value: string): value is StudentDocumentType {
  return studentDocumentTypes.some((type) => type === value);
}

export interface Student {
  id: string;
  internalId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  snsUrl: string | null;
  lastDegree: string | null;
  languageQualification: LanguageQualification | null;
  studyFields: string[];
  status: StudentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StudentDocument {
  type: StudentDocumentType;
  fileName: string;
  contentType: string;
  size: number;
}

export interface StudentDocumentRow {
  document_type: StudentDocumentType;
  original_name: string;
  mime_type: string;
  file_data: Buffer;
}

export interface StudentRow {
  id: string;
  internal_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  sns_url?: string | null;
  last_degree?: string | null;
  language_qualification?: LanguageQualification | null;
  study_fields?: string[] | null;
  status: StudentStatus;
  created_at: Date | string;
  updated_at: Date | string;
}

export function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    internalId: row.internal_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    nationality: row.nationality,
    snsUrl: row.sns_url ?? null,
    lastDegree: row.last_degree ?? null,
    languageQualification: row.language_qualification ?? null,
    studyFields: row.study_fields ?? [],
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

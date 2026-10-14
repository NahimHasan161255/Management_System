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

export interface Student {
  id: string;
  internalId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  status: StudentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StudentRow {
  id: string;
  internal_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
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
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

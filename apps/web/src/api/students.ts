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

export interface StudentInput {
  fullName: string;
  email: string;
  phone: string;
  nationality: string;
  status: StudentStatus;
}

export interface StudentPage {
  items: Student[];
  total: number;
  page: number;
  pageSize: number;
}

export class StudentApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "StudentApiError";
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "message" in body.error &&
      typeof body.error.message === "string"
        ? body.error.message
        : `Request failed with HTTP ${response.status}`;
    const code =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "code" in body.error &&
      typeof body.error.code === "string"
        ? body.error.code
        : "REQUEST_FAILED";
    const details =
      typeof body === "object" && body !== null && "error" in body &&
      typeof body.error === "object" && body.error !== null && "details" in body.error
        ? body.error.details
        : undefined;
    throw new StudentApiError(message, code, details);
  }

  return body as T;
}

export async function listStudents(options: {
  q?: string;
  status?: StudentStatus;
  page: number;
  pageSize: number;
  signal?: AbortSignal;
}): Promise<StudentPage> {
  const params = new URLSearchParams({
    page: String(options.page),
    pageSize: String(options.pageSize)
  });
  if (options.q) params.set("q", options.q);
  if (options.status) params.set("status", options.status);

  const response = await fetch(`/api/students?${params}`, { signal: options.signal });
  return readResponse<StudentPage>(response);
}

export async function createStudent(
  input: StudentInput,
  confirmPotentialDuplicate = false
): Promise<Student> {
  const response = await fetch("/api/students", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, confirmPotentialDuplicate })
  });
  const body = await readResponse<{ student: Student }>(response);
  return body.student;
}

export async function updateStudent(id: string, input: StudentInput): Promise<Student> {
  const response = await fetch(`/api/students/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const body = await readResponse<{ student: Student }>(response);
  return body.student;
}

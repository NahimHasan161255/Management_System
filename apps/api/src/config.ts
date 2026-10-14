import { z } from "zod";

const environmentSchema = z.object({
  API_HOST: z.enum(["127.0.0.1", "::1", "localhost"]).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().refine(
    (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
    "DATABASE_URL must use the postgres or postgresql protocol"
  )
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  console.error(JSON.stringify({
    level: "error",
    event: "invalid_environment",
    issues: parsedEnvironment.error.issues.map((issue) => ({
      variable: issue.path.join("."),
      message: issue.message
    }))
  }));
  throw new Error("Invalid application environment configuration");
}

export const environment = parsedEnvironment.data;

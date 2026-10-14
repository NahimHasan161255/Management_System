import express from "express";
import type { Queryable } from "./database/queryable.js";
import { ApiError } from "./errors/api-error.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { createStudentRouter } from "./students/student-router.js";

export function createApp(database: Queryable) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.status(200).json({ status: "ok", service: "api" });
  });

  app.get("/api/ready", async (_request, response, next) => {
    try {
      await database.query("SELECT 1");
      response.status(200).json({ status: "ok", database: "ok" });
    } catch (error: unknown) {
      next(new ApiError(
        503,
        "DEPENDENCY_UNAVAILABLE",
        "Database is unavailable",
        undefined,
        { cause: error }
      ));
    }
  });

  app.use("/api/students", createStudentRouter(database));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

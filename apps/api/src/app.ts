import express from "express";
import { ApiError } from "./errors/api-error.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";

export interface DatabaseProbe {
  query(text: string): Promise<unknown>;
}

export function createApp(database: DatabaseProbe) {
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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

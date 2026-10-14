import type { ErrorRequestHandler, RequestHandler } from "express";
import { ApiError } from "../errors/api-error.js";

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new ApiError(404, "NOT_FOUND", "Route not found"));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const apiError = error instanceof ApiError ? error : undefined;
  const statusCode = apiError?.statusCode ?? 500;

  if (statusCode >= 500) {
    console.error(JSON.stringify({
      level: "error",
      event: "request_failed",
      method: request.method,
      path: request.path,
      error: error instanceof Error ? error.name : "UnknownError"
    }));
  }

  response.status(statusCode).json({
    error: {
      code: apiError?.code ?? "INTERNAL_SERVER_ERROR",
      message: apiError?.message ?? "An unexpected error occurred",
      ...(apiError?.details === undefined ? {} : { details: apiError.details })
    }
  });
};

import express from "express";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";

export const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.status(200).json({ status: "ok", service: "api" });
});

app.use(notFoundHandler);
app.use(errorHandler);

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { app as apiApp } from "../src/app.js";
import { errorHandler, notFoundHandler } from "../src/middleware/error-handler.js";
import { validateBody } from "../src/middleware/validate-body.js";

const app = express();
app.use(express.json());
app.post(
  "/validated",
  validateBody(z.object({ name: z.string().min(1) })),
  (request, response) => response.status(200).json(request.body)
);
app.use(notFoundHandler);
app.use(errorHandler);

describe("API foundation", () => {
  it("reports API health without claiming database health", async () => {
    const response = await request(apiApp).get("/api/health");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: "ok", service: "api" });
  });

  it("accepts a valid request body", async () => {
    const response = await request(app).post("/validated").send({ name: "Sample" });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { name: "Sample" });
  });

  it("returns structured validation errors for invalid input", async () => {
    const response = await request(app).post("/validated").send({ name: "" });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
    assert.equal(response.body.error.message, "Request body is invalid");
    assert.equal(response.body.error.details[0].path, "name");
  });

  it("returns a structured not-found error", async () => {
    const response = await request(app).get("/missing");

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "NOT_FOUND");
  });
});

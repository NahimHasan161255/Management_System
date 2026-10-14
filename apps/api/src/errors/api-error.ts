export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ApiError";
  }
}

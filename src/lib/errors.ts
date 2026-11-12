/**
 * Application error types.
 *
 * Messages on these classes are safe to show to an authenticated user. Any
 * other thrown value is logged server side and replaced with a generic message
 * before it reaches the browser.
 */

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code = "app_error", statusCode = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "You need to sign in to continue.") {
    super(message, "unauthenticated", 401);
    this.name = "AuthenticationError";
  }
}

export class AuthorisationError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, "forbidden", 403);
    this.name = "AuthorisationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "That record could not be found.") {
    super(message, "not_found", 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  readonly fieldErrors: Record<string, string[]>;

  constructor(message = "Please check the highlighted fields.", fieldErrors = {}) {
    super(message, "validation_failed", 422);
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export class ConflictError extends AppError {
  constructor(message = "That action conflicts with the current record state.") {
    super(message, "conflict", 409);
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = "Too many attempts. Please try again shortly.") {
    super(message, "rate_limited", 429);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class IntegrationError extends AppError {
  constructor(message: string, code = "integration_error") {
    super(message, code, 502);
    this.name = "IntegrationError";
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Converts any thrown value into a message that is safe to return to a client.
 * Unexpected errors are logged with a reference so operators can correlate them.
 */
export function toSafeMessage(error: unknown): string {
  if (isAppError(error)) return error.message;
  const reference = Math.random().toString(36).slice(2, 10);
  console.error(`[kea] unexpected error ref=${reference}`, error);
  return `Something went wrong. Quote reference ${reference} if you contact support.`;
}

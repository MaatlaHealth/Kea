import { ZodError, type ZodSchema } from "zod";

import { isAppError, toSafeMessage, ValidationError } from "@/lib/errors";

/**
 * Shared shape for every server action result.
 *
 * Actions never throw across the server boundary. They return a discriminated
 * result so the form can show a field level message, a form level message or a
 * success state without leaking an internal error.
 */

export type ActionState<TData = undefined> =
  | { status: "idle" }
  | { status: "success"; message?: string; data?: TData }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[]>;
      code?: string;
      /** Extra context the form needs in order to recover, such as duplicate candidates. */
      data?: TData;
    };

export const idleState: ActionState<never> = { status: "idle" };

export function successState<T>(message?: string, data?: T): ActionState<T> {
  return { status: "success", message, data };
}

export function errorState(
  message: string,
  fieldErrors?: Record<string, string[]>,
  code?: string,
): ActionState<never> {
  return { status: "error", message, fieldErrors, code };
}

/** Converts any thrown value into an error state that is safe to return. */
export function toActionError(error: unknown): ActionState<never> {
  if (error instanceof ZodError) {
    return errorState(
      "Please check the highlighted fields.",
      error.flatten().fieldErrors as Record<string, string[]>,
      "validation_failed",
    );
  }
  if (error instanceof ValidationError) {
    return errorState(error.message, error.fieldErrors, error.code);
  }
  if (isAppError(error)) {
    return errorState(error.message, undefined, error.code);
  }
  return errorState(toSafeMessage(error));
}

/** Parses form data with a schema, converting entries to plain values first. */
export function parseForm<T>(schema: ZodSchema<T>, formData: FormData): T {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;
    if (key.endsWith("[]")) {
      const name = key.slice(0, -2);
      const existing = raw[name];
      raw[name] = Array.isArray(existing) ? [...existing, value] : [value];
      continue;
    }
    if (key in raw) {
      const existing = raw[key];
      raw[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      continue;
    }
    raw[key] = value;
  }
  return schema.parse(raw);
}

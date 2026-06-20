import { z } from "zod";
import { errorResponseSchema } from "@contract/errors";
import { API_BASE } from "./config";

/**
 * Structured error thrown by apiFetch when the server returns a non-2xx
 * response. `code` is the stable machine-checkable string from the API
 * contract (errors.ts); `message` is the human-readable text.
 */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Typed fetch wrapper for the IdentityHub API.
 *
 * - Always sends `credentials: "include"` so the session cookie is attached.
 * - Parses non-2xx bodies through `errorResponseSchema` so callers receive a
 *   typed ApiError rather than raw JSON.
 * - `responseSchema` is the zod schema for the success body. Pass `z.void()`
 *   for 204 responses.
 */
export async function apiFetch<S extends z.ZodTypeAny>(
  path: string,
  responseSchema: S,
  init?: RequestInit
): Promise<z.infer<S>> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    },
    credentials: "include"
  });

  if (!res.ok) {
    let code = "INTERNAL_ERROR";
    let message = `Request failed with status ${res.status}`;
    try {
      const raw: unknown = await res.json();
      const parsed = errorResponseSchema.safeParse(raw);
      if (parsed.success) {
        code = parsed.data.error.code;
        message = parsed.data.error.message;
      }
    } catch {
      // ignore JSON parse failure — fall back to the default message above
    }
    throw new ApiError(code, message, res.status);
  }

  if (res.status === 204) {
    return undefined as z.infer<S>;
  }

  const raw: unknown = await res.json();
  return responseSchema.parse(raw) as z.infer<S>;
}

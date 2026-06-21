/**
 * Unit tests for apiFetch and ApiError.
 * fetch is stubbed globally — no real HTTP calls are made.
 */
import { z } from "zod";
import { apiFetch, ApiError } from "./client";

// ── helpers ─────────────────────────────────────────────────────────────────

/** Returns a minimal fetch-compatible response object. */
function mockOk(body: unknown, status = 200) {
  return { ok: true, status, json: () => Promise.resolve(body) };
}

function mockErr(body: unknown, status: number) {
  return { ok: false, status, json: () => Promise.resolve(body) };
}

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── tests ────────────────────────────────────────────────────────────────────

describe("apiFetch — success paths", () => {
  it("parses and returns a 200 response through the schema", async () => {
    const schema = z.object({ value: z.number() }).strict();
    fetchSpy.mockResolvedValueOnce(mockOk({ value: 42 }));

    const result = await apiFetch("/api/test", schema);
    expect(result).toEqual({ value: 42 });
  });

  it("returns undefined for a 204 response without calling json()", async () => {
    const jsonSpy = vi.fn();
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 204, json: jsonSpy });

    const result = await apiFetch("/api/test", z.void());
    expect(result).toBeUndefined();
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it("throws a zod error when the success body does not match the schema", async () => {
    const schema = z.object({ value: z.number() }).strict();
    fetchSpy.mockResolvedValueOnce(mockOk({ value: "not-a-number" }));

    await expect(apiFetch("/api/test", schema)).rejects.toThrow();
  });
});

describe("apiFetch — error paths", () => {
  it("throws ApiError with the parsed code and message on a structured error body", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockErr(
        { error: { code: "UNAUTHENTICATED", message: "Not logged in" } },
        401
      )
    );

    const err = await apiFetch("/api/test", z.void()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.code).toBe("UNAUTHENTICATED");
    expect(apiErr.message).toBe("Not logged in");
    expect(apiErr.status).toBe(401);
  });

  it("falls back to INTERNAL_ERROR when the error body is not valid JSON", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError("Unexpected token"))
    });

    const err = await apiFetch("/api/test", z.void()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.code).toBe("INTERNAL_ERROR");
    expect(apiErr.status).toBe(500);
  });

  it("falls back to INTERNAL_ERROR when the error body does not match the schema", async () => {
    fetchSpy.mockResolvedValueOnce(mockErr({ unexpected: "shape" }, 500));

    const err = await apiFetch("/api/test", z.void()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.code).toBe("INTERNAL_ERROR");
  });
});

describe("apiFetch — request shape", () => {
  it("always includes credentials: include", async () => {
    fetchSpy.mockResolvedValueOnce(mockOk(null));
    await apiFetch("/api/test", z.null());

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/test"),
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("adds Content-Type: application/json when a body is provided", async () => {
    fetchSpy.mockResolvedValueOnce(mockOk(null));
    await apiFetch("/api/test", z.null(), {
      method: "POST",
      body: JSON.stringify({ key: "value" })
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" })
      })
    );
  });

  it("does not add Content-Type when no body is provided", async () => {
    fetchSpy.mockResolvedValueOnce(mockOk(null));
    await apiFetch("/api/test", z.null());

    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" })
      })
    );
  });
});

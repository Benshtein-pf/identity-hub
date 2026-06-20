/**
 * Root URL of the Fastify API server. Defaults to localhost:3000 for local
 * development. Override with VITE_API_BASE_URL for other environments.
 */
export const API_BASE: string =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "http://localhost:3000";

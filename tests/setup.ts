/**
 * src/config/env.ts validates process.env eagerly at import time (fail-fast
 * at boot). Any test file that transitively imports src/app.ts (and through
 * it, env.ts) needs these set BEFORE that import runs, so they're set here
 * in a vitest setupFile, which loads before test files are imported.
 */
process.env.NODE_ENV = "test";
process.env.PORT = "3999"; // tests use app.inject(), never app.listen(); any valid port satisfies the schema
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.DATABASE_PATH = ":memory:";
process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.ATLASSIAN_CLIENT_ID = "test-client-id";
process.env.ATLASSIAN_CLIENT_SECRET = "test-client-secret";
process.env.ATLASSIAN_REDIRECT_URI = "http://localhost:3000/api/jira/callback";
process.env.SESSION_COOKIE_NAME = "ih_session";
process.env.SESSION_TTL_DAYS = "7";
process.env.API_KEY_RATE_LIMIT_MAX = "30";
process.env.API_KEY_RATE_LIMIT_WINDOW_MS = "60000";

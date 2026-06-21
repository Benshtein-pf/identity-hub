# IdentityHub — Jira Integration

POC that lets IdentityHub users file Jira tickets for NHI findings
(stale service accounts, overprivileged keys, expiring credentials) from a UI
and from an external REST API (scanners, CI/CD). Includes a TypeScript/Fastify
backend and a minimal React frontend. See `DECISIONS.md` for the reasoning
behind every major architectural and security choice.
The API contract (`src/contract/`) is also published live as OpenAPI at `/docs`
once the server is running.

## Prerequisites

- **Node.js 20+** — check with `node --version`
- A free [Jira Cloud](https://www.atlassian.com/) account (for the OAuth integration)

## Stack

TypeScript end-to-end, **Fastify** + **zod** (via `fastify-type-provider-zod`),
**SQLite** (`better-sqlite3`) behind a repository layer, **argon2id**
passwords, **AES-256-GCM** at rest for Jira OAuth tokens. No Docker, no Redis,
no external service accounts — just Node and a `.env` file.

## Setup

1. **Clone and install:**

   ```bash
   git clone https://github.com/Benshtein-pf/identity-hub.git
   cd identity-hub
   npm install
   ```

2. **Create a Jira OAuth 2.0 (3LO) app** (free):
   - Sign up for a free Jira Cloud site at [atlassian.com](https://www.atlassian.com/) if you don't have one.
   - Go to [developer.atlassian.com/console/myapps](https://developer.atlassian.com/console/myapps/) → **Create app** → **OAuth 2.0 integration**.
   - Under **Permissions**, add the **Jira API** and grant scopes
     `read:jira-work`, `write:jira-work`.
   - Under **Authorization**, set the callback URL to
     `http://localhost:3000/api/jira/callback`.
   - Copy the **Client ID** and **Secret** from **Settings**.

3. **Configure `.env`:**

   ```bash
   cp .env.example .env
   npm run gen:key   # prints a base64 32-byte key; paste it as APP_ENCRYPTION_KEY
   ```

   Then open `.env` and fill in the three required values:

   | Variable | Where to get it |
   |---|---|
   | `APP_ENCRYPTION_KEY` | Output of `npm run gen:key` above |
   | `ATLASSIAN_CLIENT_ID` | Jira app **Settings** page (step 2) |
   | `ATLASSIAN_CLIENT_SECRET` | Jira app **Settings** page (step 2) |

   Everything else (`PORT`, `DATABASE_PATH`, `ATLASSIAN_REDIRECT_URI`, etc.) is
   pre-filled with local-dev defaults and does not need to change.

4. **Run the backend:**

   ```bash
   npm run dev
   ```

   The API listens on `http://localhost:3000`. Live API docs are at
   `http://localhost:3000/docs`.

5. **Run the frontend** (separate terminal, from the repo root):

   ```bash
   cd frontend && npm install && npm run dev
   ```

   Open **`http://localhost:5173`** in your browser. Both servers must be
   running — the frontend proxies nothing; it talks directly to the backend
   via CORS.

### A note on the session cookie and `localhost`

The session cookie is `httpOnly` + `Secure` + `SameSite=Lax` — including the
`Secure` flag in development. Modern browsers
treat `http://localhost` as a secure context, so `Secure` cookies still work
there. This **only** works for the literal hostname `localhost`, not
`127.0.0.1` or a LAN IP — access the app via `http://localhost:3000` /
`http://localhost:5173` during local development.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Run the API with hot reload (`tsx watch`) |
| `npm run build` | Type-check and compile to `dist/` |
| `npm start` | Run the compiled build (`node dist/server.js`) |
| `npm test` | Run the test suite (vitest) |
| `npm run typecheck` | Type-check `src/` only |
| `npm run typecheck:tests` | Type-check `src/` + `tests/` together |
| `npm run test:watch` | Run the test suite in watch mode |
| `npm run gen:key` | Print a fresh base64 32-byte `APP_ENCRYPTION_KEY` |
| `npm run digest` | Run the NHI Blog Digest (see below) |
| `cd frontend && npm test` | Run the frontend test suite (Vitest + RTL, 58 tests) |

## Trying it out

The quickest way is the UI: start both servers (steps 4 and 5 above), open
**`http://localhost:5173`**, register an account, connect Jira, then create
tickets from the dashboard. The curl examples below cover the same flows via
the API directly.

```bash
# Register (also signs you in: the response sets the session cookie)
curl -i -c cookies.txt -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"a-real-password"}'

# Connect Jira: open this URL in a browser where you're already logged in
# (it needs the session cookie, so curl alone won't complete the OAuth dance)
echo "http://localhost:3000/api/jira/connect"

# Once connected, list your Jira projects
curl -b cookies.txt http://localhost:3000/api/jira/projects

# Create a ticket from the UI's perspective
curl -X POST http://localhost:3000/api/tickets -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"projectKey":"PROJ","title":"Stale Service Account: svc-deploy-prod","description":"Unused for 90 days."}'

# Mint an API key for the external REST API
curl -X POST http://localhost:3000/api/api-keys -b cookies.txt \
  -H "Content-Type: application/json" -d '{"name":"ci"}'
# -> {"apiKey": {...}, "secret": "ih_..."}  (the secret is shown exactly once)

# Use it from a "scanner" (no session, just the key)
curl -X POST http://localhost:3000/api/v1/findings \
  -H "X-API-Key: ih_..." -H "Content-Type: application/json" \
  -d '{"projectKey":"PROJ","title":"Overprivileged key: ci-deploy-bot"}'
```

## NHI Blog Digest

A bonus automation (`scripts/blog-digest.ts`) that fetches the most recent post
from [oasis.security/blog](https://oasis.security/blog), generates an AI summary
with `claude-haiku-4-5-20251001`, and files a Jira ticket via `POST /api/v1/findings`.
Re-running when no new post has been published exits cleanly — no duplicate ticket.

### Extra setup

Add these to `.env` (the backend must be running first):

```
ANTHROPIC_API_KEY=       # Anthropic API key
DIGEST_API_KEY=          # IdentityHub API key — generate one:
                         # curl -X POST http://localhost:3000/api/api-keys \
                         #   -b cookies.txt -H "Content-Type: application/json" \
                         #   -d '{"name":"digest"}'
DIGEST_PROJECT_KEY=      # Jira project key to file tickets into (e.g. SCRUM)
DIGEST_APP_URL=http://localhost:3000  # default; only set if running on a different port
```

### Run

```bash
npm run digest
```

### Cron (every Monday at 9am)

```
0 9 * * 1 cd /path/to/repo && npm run digest
```

## Project layout

```
frontend/               React SPA (Vite + TypeScript); runs on port 5173
  src/
    api/            typed fetch client + endpoint wrappers (consumes src/contract/)
    auth/           AuthContext — session state shared across the app
    components/     TicketsSection, JiraStatus, shared UI primitives
    pages/          LoginPage, DashboardPage, JiraConnectedPage
    theme/          DarkModeContext
src/                Fastify backend; runs on port 3000
  config/           env validation (fails fast at boot on misconfiguration)
  contract/         frozen API contract -- zod schemas + z.infer types for
                    every route's request/response, plus the structured error shape
  crypto/           AES-256-GCM, argon2id, opaque token generation
  db/               SQLite connection + schema
  repositories/     the only code that touches the DB; every tenant-owned method is tenant-scoped
  integrations/     the Jira HTTP client (OAuth, projects, issue creation)
  services/         domain logic, unit-testable with no HTTP server and no real DB
  plugins/          Fastify cross-cutting concerns: session/API-key auth, error handling, OpenAPI
  routes/           HTTP only -- wraps services in zod-validated Fastify routes
tests/
  fakes/            in-memory repository + Jira client fakes for unit tests
  services/         service-layer unit tests (no server, no real DB)
  routes/           REST endpoint tests (auth, validation, status codes, tenant isolation)
```

## Known limitations

See "Known limitations & production path" in `DECISIONS.md` for the full,
deliberate list (idempotency, multi-site Jira, horizontal scale, KMS, audit
trail).

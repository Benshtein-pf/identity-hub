# IdentityHub Frontend

React SPA for the IdentityHub Jira integration POC. Talks to the Fastify backend
over CORS (both must be running — see the root `README.md`).

## Prerequisites

- Node >= 20
- Backend running on `http://localhost:3000` (root `npm run dev`)

## Setup

```bash
# From this directory (frontend/)
npm install
npm run dev        # starts Vite on http://localhost:5173
```

Open **`http://localhost:5173`** in your browser.

## Available scripts

| Command           | Does                                        |
|-------------------|---------------------------------------------|
| `npm run dev`     | Vite dev server on port 5173 (hot reload)   |
| `npm run build`   | Typecheck + production bundle into `dist/`  |
| `npm run preview` | Serve the production build locally          |
| `npm run typecheck` | Run `tsc --noEmit` without building      |

## Config

Copy `.env.example` to `.env` if you need to point the frontend at a non-default
API URL:

```bash
cp .env.example .env
# Edit VITE_API_BASE_URL if the backend is not on http://localhost:3000
```

## Architecture notes

- All request/response types are inferred from the frozen zod schemas in
  `../src/contract/` — never hand-written in parallel.
- The session cookie is `httpOnly` + `Secure` + `SameSite=Lax`. No token
  storage in the browser; the cookie is handled automatically.
- The Jira OAuth connect flow is a full browser navigation
  (`window.location.href`) to `{API_BASE}/api/jira/connect`, not a `fetch`,
  so the backend 302 chain to Atlassian and back works normally.

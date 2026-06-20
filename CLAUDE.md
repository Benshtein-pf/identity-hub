# CLAUDE.md — IdentityHub Jira Integration

Invariants for every change. The *why* behind these lives in `DECISIONS.md` — read
it once; don't restate it here. If a rule here conflicts with a one-off
instruction, stop and surface it.

## Project

POC: file IdentityHub NHI findings as Jira tickets, from a UI and an external REST
endpoint. Single TypeScript process (Fastify), SQLite, minimal React frontend.
Must run with clone → `npm install` → `.env` → run. No Docker, no Redis, no
external service accounts.

## Stack (fixed)

- TypeScript end-to-end. Backend **Fastify**, DB **SQLite** behind a repository
  layer. Frontend minimal React, built separately against the frozen API contract.
- **No Docker, no Redis, no external service accounts.** Clone → `npm install` →
  configure `.env` → run. "Frictionless to run" is an explicit eval criterion.

## Architecture (must hold on every edit)
- Layered, dependencies inward only: **routes → services → repositories →
  integration clients**. Routes do HTTP only. Services hold logic, know nothing of
  HTTP or SQL. Repositories are the only code touching the DB. One Jira client
  wraps all Jira calls.
- Services must be unit-testable with no HTTP server and no real DB.

## Security (non-negotiable)
- **Tenant isolation at the repository layer.** Every tenant-owned repo method
  requires a `tenant_id` and scopes every query by it. No path — including the
  REST API — touches tenant data without a tenant scope. No tenant context → no
  data.
- **OAuth tokens encrypted at rest** with authenticated encryption; key from
  `APP_ENCRYPTION_KEY`. Never log, return, or URL-encode any secret (tokens, API
  keys, passwords, key). Scrub secrets from errors and logs.
- **Passwords** argon2id. **Sessions** stateful, server-side (opaque ID, row in
  tenant-scoped table), `httpOnly`+`Secure`+`SameSite=Lax`; logout deletes the
  row; sliding ~7-day expiry.
- **API keys** store only the hash; show raw once; inbound key → tenant → that
  tenant's Jira creds. Revocable; optional user-set expiry; no forced expiry.
- **OAuth refresh token rotates** — persist the new one over the old every refresh;
  serialize concurrent refreshes per credential.
- Never commit `.env`. Ship `.env.example` with placeholders only.

## Jira specifics (verified)

- Authorize at `https://auth.atlassian.com/authorize` (`audience=api.atlassian.com`,
  `response_type=code`), scopes `read:jira-work write:jira-work offline_access`,
  single-use `state` verified on callback.
- After token exchange, call `GET https://api.atlassian.com/oauth/token/accessible-resources`
  for the `cloudId`. **Default to the first site**, document the assumption.
- All Jira calls go through `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/...`.

## TypeScript (type-first, no escape hatches)
- `tsconfig` `strict: true`.
- **No `any`.** Use `unknown` + narrowing at boundaries. **No type assertions
  (`as`)** — model the types so they hold; if an `as` feels unavoidable, that's a
  design smell to fix, not assert past. (Exception: `as const`.)
- **`interface`** for object shapes that may be extended, contracts a class
  implements, OO-style patterns, and public/extendable types. **`type`** for
  unions, intersections, function types, mapped types, tuples, and complex type
  manipulation.
- **zod is the single source of truth for every API boundary.** Define request
  and response shapes as zod schemas; derive the TS type with `z.infer`. Never
  hand-write a TS type that parallels a schema — infer it, so runtime validation
  and the compile-time type cannot drift.
- Wire zod into Fastify via `fastify-type-provider-zod`: set `validatorCompiler`
  and `serializerCompiler` once, use `.withTypeProvider<ZodTypeProvider>()`, put
  zod schemas in each route's `schema`. Reject unknown fields.

## Conventions
- All external input is validated by its zod route schema (see above).
- Error messages clear and actionable, never raw stack traces; distinguish client
  errors (`4xx`) from upstream Jira failures (`502`).
- No em dashes in generated user-facing copy (UI strings, error messages). Internal
  docs are unrestricted.

## Workflow
- Run the **`verify-against-spec`** skill against `DECISIONS.md` and the assignment
  brief before calling a phase done.
- Any deviation from `DECISIONS.md` gets written back into it — never drift
  silently.
- The API contract is frozen once defined; the frontend is built against it.

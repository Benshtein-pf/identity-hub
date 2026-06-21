# IdentityHub — Jira Integration POC: Design Decisions

What was decided, what was rejected, and why. Implementation mechanics (OAuth
handshake steps, endpoint URLs, table schemas) live in the code and `CLAUDE.md`,
not here.

The driving constraint from the brief is *"runnable in the easiest, most
frictionless way possible"* — read here as **clone, install, run, with no
external service accounts or background processes.**

---

## Stack

- **TypeScript end-to-end** — one language, type safety across the API contract.
- **Fastify + zod** (via `fastify-type-provider-zod`). I wanted everything type based and
  Fastify's type provider wires that schema into each route so handlers are typed automatically.
  - *Rejected Express:* zod still works, but it is not wired into the framework, so
    each handler validates and types by hand. More per-route glue for the same
    result.
  - *Rejected NestJS:* over-structures a POC this size.
- **SQLite** — zero external dependency, satisfies "frictionless to run.", no external docker.
  Accessed behind a repository layer, so tenant-isolation guarantees are engine-independent.
  - *Rejected Postgres:* external docker, makes it harder for the user to run.
    does not satisfy the "frictionless to run." For production, I would use it.
- **Frontend built separately against a frozen API contract** — the backend
  carries the eval weight (security, multi-tenancy, REST, credentials), so it is
  built and frozen first to prevent contract drift.

---

## Jira authentication — OAuth 2.0 (3LO)

**Decided: OAuth 2.0 (3LO). Rejected: long-lived API tokens.**

IdentityHub's premise is that long-lived machine credentials are a liability.
Asking a user to paste and store a long-lived Jira API token would be the exact
anti-pattern the product exists to eliminate. OAuth 3LO gives scoped,
user-consented, revocable access with no long-lived user secret, only a refresh
token we control.

---
## App authentication — stateful sessions, not JWT

**Decided: email+password (argon2id) + stateful server-side sessions. Rejected:
JWT, and stateless signed cookies.**

App login gates access to stored third-party Jira credentials, which makes
**immediate revocation** a requirement. immediate logout must take effect now, not at token
expiry.

- *Rejected JWT:* a self-contained JWT cannot be revoked before expiry without a
  server-side denylist, which reintroduces the very state JWT exists to avoid.
  Its only real benefit, stateless horizontal scale, does not apply at
  single-instance POC scale.
- *Rejected stateless signed cookies:* lightweight, easy, common but it has the same
  flaw, nothing to delete. server-side means no revocation before expiry. Same problem as JWT, for the same
  reason.

Stateful sessions give instant revocation for free (logout deletes the session
row) and are naturally tenant-scoped.

---

## Multi-tenancy

**Decided: tenant isolation enforced at the data-access (repository) layer, not in
route handlers.**

Every repository method requires a tenant_id and scopes its query by it, so a
handler can't ask for "all tickets," only "this tenant's." This way when new features are added,
there's no need to remember a "WHERE tenant_id filter."
No path, including the REST API, reaches the DB except through these repositories.

The same layer also abstracts persistence: routes and services never see SQL, so
the SQLite→Postgres swap only touches repository implementations, and services
stay unit-testable against a fake repository. Security is the headline, the
abstraction and testability are bonuses.
---

## Credential storage

**Decided: OAuth tokens encrypted at rest (AES-256-GCM), key from env; never
logged or returned to the client.**

Table stakes for an identity product. The env-provided key is a deliberate POC
simplification. production would use a managed KMS (AWS KMS / Vault) with
envelope encryption and rotation. No live credentials are ever committed, the repo
ships `.env.example` with placeholders only.

---

## REST API key model

**Decided: keys generated in-app, only the hash stored (raw shown once), each key
bound to one tenant and using that tenant's Jira credentials.**

an inbound key resolves to exactly one tenant, and all work happens in that tenant's scope.
Storing only the hash means a DB compromise does not leak usable keys.

**Expiry:** keys are revocable with an optional user-set TTL, but do not
force-expire by default. The consumers are machines (scanners, CI), which cannot
do interactive re-auth, so revocation is the practical security control.
In production, we would surface key age so stale keys become
visible. (Sessions, whose consumers are humans, do expire — see App
authentication.)

---

## "Recent Tickets" semantics

**Decided: read from a local record of tickets this app created; link out to Jira.**

The brief asks for the 10 most recent tickets *created from this app* — not the 10
most recent in Jira. So every created ticket is recorded locally and the view
reads from that record (fast, exact), linking out to the live Jira issue. A JQL
query for "created by this app" would be fragile by comparison.

---

## Considered and rejected

- **Redis / Upstash.** The only cache-shaped state is the short-lived OAuth
  `state` value (an in-process TTL map covers it); sessions are a SQLite table and
  rate limiting is single-instance in-process. Redis — even serverless — adds an
  externally-credentialed dependency: either real credentials get committed (to a
  credential-security company, unacceptable) or the reviewer must create their own
  cloud account (breaks clone-and-run). It buys nothing at single-instance scale.
- **JWT** — see "App authentication" above.

---

## Decisions made during backend implementation

The decisions above were agreed before writing code. These were resolved
while building deliverables 1–7, per "any deviation from DECISIONS.md gets
written back into it."

- **Bad project on ticket creation → `422 PROJECT_NOT_FOUND`.** The request
  body is syntactically valid (not `400`) and the route exists (not `404`);
  the *value* of one field is semantically unprocessable against the
  connected workspace. Implementation follows from this: `tickets.service`
  validates the project against Jira's live project list (`GET
  /project/search`) *before* calling create-issue, rather than trying to
  parse Jira's create-issue error body to detect "no such project" — that
  shape isn't something we want this app's correctness to depend on. Cost:
  one extra Jira read per ticket creation; acceptable at POC scale.
- **Issue type defaults to `Task`**, with an optional `issueType` override
  accepted by both the UI route and the REST API (the create-ticket form only
  asks for summary + description, per the brief).
- **API contract artifact: zod schemas (source of truth) + generated
  OpenAPI.** `@fastify/swagger` + `@fastify/swagger-ui` generate `/docs` (and
  `/docs/json`) directly from the route zod schemas via
  `fastify-type-provider-zod`'s `jsonSchemaTransform` — no hand-maintained
  spec that can drift from the code.
- **Project key casing is normalized, case-insensitively, against Jira's
  canonical key.** A ticket is always recorded with Jira's own casing for
  `projectKey` (not whatever casing the caller typed), so "recent tickets for
  project X" stays a simple exact-match query even though Jira keys are
  conventionally uppercase and a human or scanner might type lowercase.
- **Register auto-signs-in.** `POST /api/auth/register` creates the
  tenant+user+session in one step and sets the session cookie immediately,
  rather than requiring a separate login call. One less round trip, same
  security properties.
- **Sessions store the raw opaque id as the row's primary key; API keys store
  only a hash.** This is a deliberate asymmetry, not an inconsistency: API
  keys are long-lived bearer credentials repeatedly handed to and stored by
  external systems (CI secrets, scanner configs) where leakage risk is
  highest, so only a hash is ever persisted. Sessions are short-cycle,
  `httpOnly`, and sent only to this app's own origin by the browser, so the
  hashing has materially less benefit at POC scale. Documented here rather
  than left implicit.
- **Two repository methods are deliberately not tenant-scoped:**
  `UsersRepository.findByEmail` (login + registration-uniqueness) and
  `SessionsRepository.findById` (cookie → session → tenant). These mirror the
  API-key model CLAUDE.md already describes ("inbound key → tenant → that
  tenant's Jira creds") — resolving an opaque credential *into* a tenant
  can't itself be scoped by the tenant it's about to produce. Every other
  repository call in a request uses the tenant id one of these three
  resolution steps already produced. See `src/repositories/types.ts`.
- **Stack specifics pinned during the build** (none mandated a specific
  version in `CLAUDE.md`, so recorded here): Fastify 5 + `zod` 3.x +
  `fastify-type-provider-zod` 4.x (the latest major of the provider requires
  `zod` 4, which is a larger ecosystem jump than this POC needs).
  `better-sqlite3` over Node's built-in `node:sqlite` (still experimental).
  `@node-rs/argon2` for argon2id (prebuilt native binaries, no `node-gyp`
  compile on install — keeps `npm install` frictionless). Native `fetch` for
  the Jira HTTP client, no HTTP library dependency. `vitest` for tests.
  `@fastify/rate-limit`, per-API-key, in-process (per the Redis rejection
  above).
- **CORS (`@fastify/cors`) enabled, scoped to `FRONTEND_URL` with credentials.**
  The frontend SPA (`:5173`) and the API (`:3000`) are different origins, so
  credentialed `fetch` calls need `Access-Control-Allow-Origin` +
  `Access-Control-Allow-Credentials`. `@fastify/cors` is registered before all
  routes with `origin: env.FRONTEND_URL` (the already-validated env var) and
  `credentials: true`. Using a specific origin rather than `"*"` is mandatory
  (browsers refuse credentialed requests to `"*"`), and it ensures only the
  configured frontend can read API responses. The frozen request/response
  contract (`src/contract/`) is not touched by this change.

- **`exactOptionalPropertyTypes` tried and rejected.** Beyond `tsconfig`'s
  required `strict: true`, this stricter flag was tried and reverted: zod's
  own inferred type for an optional field is `key?: T | undefined`, which
  this flag treats as incompatible with the plainer `key?: T` used in our
  service input types — friction between two strictness conventions, not a
  real bug, and it fought directly against zod being the contract's source of
  truth. `noUncheckedIndexedAccess` was kept.
- **Three routes intentionally omit a `response:` schema block.** `POST
  /api/auth/logout` and `DELETE /api/api-keys/:id` return HTTP 204 with no body;
  there is nothing for zod or the serializer to act on. `GET /api/jira/connect`
  returns a 302 redirect, not a JSON response. Adding a `schema.response` entry
  for these routes would force a zod schema on a path that has no serializable
  payload, producing dead validation code. Accepted as a narrow, deliberate
  exception to the "every route has a schema" invariant.

## Known limitations & production path (deliberate scope cuts)

Named rather than silently omitted; each is a conscious POC boundary.

- **Idempotency.** A retrying scanner could create duplicate tickets. Production
  would accept an `Idempotency-Key` and dedupe within a window. First hardening
  step.
- **Multi-site Jira.** If an Atlassian account has multiple sites, the POC defaults
  to the first and documents it; production would offer a site picker.
- **Horizontal scale.** The OAuth `state` store, per-credential refresh lock, and
  rate-limit counters are in-process. A second instance is the point at which these
  move to a shared store (Redis) — the only place Redis is warranted, and not at
  POC scale.
- **KMS.** Encryption key is env-provided; production uses managed KMS + rotation.
- **Orphaned tenant row on a registration race.** If two near-simultaneous
  registrations for the same email interleave around the uniqueness check,
  the losing request's already-created tenant row is left with no user
  attached (the user-creation insert fails on the UNIQUE constraint and is
  correctly reported as `EMAIL_TAKEN`, but the tenant row isn't rolled back).
  Harmless: an orphaned tenant has no login path back to it. Production would
  wrap tenant+user creation in a single DB transaction to eliminate this
  entirely; not worth the cross-repository transaction plumbing at POC scope.
- **Audit trail.** A production identity product would keep an immutable audit log
  of every ticket creation (tenant, actor, timestamp, source). Natural next add.

---

## How to run

(See `README.md`. Summary: clone → `npm install` → copy `.env.example` to `.env`
and fill Atlassian app credentials + a generated `APP_ENCRYPTION_KEY` →
`npm run dev`. No Docker, no external datastore, no background services.)

---

## NHI Blog Digest — bonus automation

**Decided: standalone `tsx` script, native `fetch` for HTTP, HTML scraping for
the blog, `claude-haiku-4-5-20251001` for summarization, `blog_digest_state` table
in the app SQLite DB for dedup. Rejected: RSS feed, flat-file state.**

The digest script (`scripts/blog-digest.ts`) fetches the most recent Oasis
Security blog post, generates an AI summary, and files a Jira ticket through
the existing `POST /api/v1/findings` REST endpoint. Runnable one-shot — manually
or via cron (`0 9 * * 1`, Mondays at 9am).

**Blog source — HTML scraping, not RSS.** `https://oasis.security/blog` is a
Webflow-hosted site. No RSS or Atom feed exists: `/blog/rss.xml`, `/rss.xml`,
and `/feed` all return 404; no `<link rel="alternate" type="application/rss+xml">`
tag and no feed references appear anywhere in the blog HTML. HTML scraping is the
only option. "Most recent post" is defined as the post in Webflow's featured
`blog_main-post` block, which renders first in document order and is updated when
a new post is published.

**Title source.** The editorial headline shown on the listing card, not the SEO
title on the post page (which appends `| Oasis + Zscaler`-style suffixes). The
editorial title is more readable as a Jira ticket title.

**AI model.** `claude-haiku-4-5-20251001` — fast and inexpensive for a
single-call summarization with low output token requirements (~300 tokens).
Summary style: concise 2-4 sentence paragraph, no em dashes. Description contains
the summary only (no URL footer).

**Dedup via `blog_digest_state` table.** The `/api/v1/findings` endpoint performs
no server-side dedup (by design; see "Idempotency" under Known limitations). To
avoid filing a duplicate ticket on repeated cron runs when no new post has been
published, the script maintains a `blog_digest_state` table in the app's SQLite
DB (`DATABASE_PATH`), keyed by post URL. It checks this table before making any
Anthropic or Jira API call — a found row triggers an immediate exit 0.

*Rejected flat-file state:* a `.digest-state.json` file under `scripts/` was
considered. SQLite was preferred because the infrastructure already exists, the
data is durable, and keeping it in the same DB makes dedup state visible alongside
the ticketing data.

**Deliberate architecture deviation.** The script opens the SQLite DB directly
via `better-sqlite3` (already a project dependency), bypassing the application's
repository layer. CLAUDE.md mandates that repositories are the only code touching
the DB. This is a conscious, documented exception for a standalone ops-script that
runs outside the Fastify process and has no access to the repository layer. The
deviation is limited to the `blog_digest_state` table only — the script never
reads or writes any other table. Production would expose a `/api/internal/digest`
endpoint and keep DB access behind the service boundary.

**Assistant prefill to suppress markdown headers.** The Anthropic API call
prefills the assistant turn with `"This"`, forcing the model to continue from
that token rather than opening with a header or label (e.g. `# Executive Summary`).
The SDK returns only the tokens generated after the prefill, so the script
prepends `"This"` to reconstruct the full summary. `max_tokens` is set to 400
rather than the initial 300 to give comfortable headroom after the prefill token
is spent.

*Rejected system-prompt instruction alone:* telling the model "do not use
headers" is advisory and unreliable — models ignore it inconsistently, especially
when the prompt uses words like "executive summary" that prime a header response.
Prefilling is structural: the model physically cannot emit anything before `"This"`.

**Error policy.** If the blog is unreachable or markup has changed such that title
or URL extraction fails, the script logs a clear human-readable error and exits 1.
No Anthropic call is made and no ticket is filed. If the backend is unreachable or
returns a non-201, the script exits 1 before writing the dedup row, so the next
run retries. A missed filing is preferable to a silent success.
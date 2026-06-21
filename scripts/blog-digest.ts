// cron: 0 9 * * 1 cd /path/to/repo && npm run digest   (every Monday at 9am)

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import Database from "better-sqlite3";
import { z } from "zod";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import {
  decodeEntities,
  extractText,
  extractFeaturedPostSlug,
  extractFeaturedPostTitle,
} from "./blog-digest.utils.js";

// ── Env ───────────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Error: required environment variable ${name} is not set`);
    process.exit(1);
  }
  return val;
}

const ANTHROPIC_API_KEY = requireEnv("ANTHROPIC_API_KEY");
const DIGEST_API_KEY = requireEnv("DIGEST_API_KEY");
const DIGEST_PROJECT_KEY = requireEnv("DIGEST_PROJECT_KEY");
const DIGEST_APP_URL = process.env["DIGEST_APP_URL"] ?? "http://localhost:3000";
const _scriptDir = dirname(fileURLToPath(import.meta.url));
const DATABASE_PATH =
  process.env["DATABASE_PATH"] ??
  resolve(_scriptDir, "../data/identity-hub.sqlite");

const BLOG_BASE = "https://oasis.security";

// ── SQLite ────────────────────────────────────────────────────────────────────

// Deliberate architecture exception: this script opens the app DB directly via
// better-sqlite3 rather than going through the repository layer. See DECISIONS.md
// ("NHI Blog Digest") for the reasoning and the production path.

const db = new Database(DATABASE_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS blog_digest_state (
    post_url       TEXT PRIMARY KEY,
    title          TEXT NOT NULL,
    jira_issue_key TEXT NOT NULL,
    filed_at       TEXT NOT NULL
  )
`);

// ── Zod schemas for external boundaries ──────────────────────────────────────

const DigestRowSchema = z.object({ jira_issue_key: z.string() });

const FindingResponseSchema = z.object({
  id: z.string(),
  projectKey: z.string(),
  jiraIssueKey: z.string(),
  title: z.string(),
  source: z.string(),
  createdAt: z.string(),
  jiraIssueUrl: z.string(),
});
type FindingResponse = z.infer<typeof FindingResponseSchema>;

// ── Blog scraping ─────────────────────────────────────────────────────────────

interface LatestPost {
  postUrl: string;
  title: string;
}

async function fetchLatestPost(): Promise<LatestPost> {
  let html: string;
  try {
    const res = await fetch(`${BLOG_BASE}/blog`, {
      headers: { "User-Agent": "IdentityHub-Blog-Digest/1.0" },
    });
    if (!res.ok) {
      console.error(`Error: blog listing page returned HTTP ${res.status}`);
      process.exit(1);
    }
    html = await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: failed to fetch blog listing page: ${msg}`);
    process.exit(1);
  }

  const slug = extractFeaturedPostSlug(html);
  if (!slug) {
    console.error(
      "Error: could not find a blog post link on the listing page (markup may have changed)",
    );
    process.exit(1);
  }
  const postUrl = `${BLOG_BASE}${slug}`;

  const title = extractFeaturedPostTitle(html);
  if (!title) {
    console.error(
      "Error: could not extract the post title from the featured block (markup may have changed)",
    );
    process.exit(1);
  }

  return { postUrl, title };
}

async function fetchPostBody(postUrl: string): Promise<string> {
  let html: string;
  try {
    const res = await fetch(postUrl, {
      headers: { "User-Agent": "IdentityHub-Blog-Digest/1.0" },
    });
    if (!res.ok) {
      console.error(`Error: post page returned HTTP ${res.status}`);
      process.exit(1);
    }
    html = await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: failed to fetch post page: ${msg}`);
    process.exit(1);
  }
  return extractText(html).slice(0, 12_000);
}

// ── AI summary ────────────────────────────────────────────────────────────────

async function summarise(title: string, body: string): Promise<string> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  let message: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system:
        "You are a security analyst summarizing blog posts for a non-human identity (NHI) " +
        "security team. Write a concise 2-4 sentence executive summary of the provided blog " +
        "post. Focus on the key security insight, the problem being addressed, and the " +
        "practical takeaway. Use plain, direct prose. Do not use em dashes.",
      messages: [
        { role: "user", content: `Title: ${title}\n\n${body}` },
        { role: "assistant", content: "This" },
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: Anthropic API call failed: ${msg}`);
    process.exit(1);
  }

  const firstBlock = message.content[0];
  if (firstBlock === undefined || firstBlock.type !== "text") {
    console.error("Error: unexpected response format from Anthropic API");
    process.exit(1);
  }
  return ("This" + firstBlock.text).trim();
}

// ── File ticket ───────────────────────────────────────────────────────────────

async function fileTicket(
  title: string,
  description: string,
): Promise<FindingResponse> {
  let res: Response;
  try {
    res = await fetch(`${DIGEST_APP_URL}/api/v1/findings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": DIGEST_API_KEY,
      },
      body: JSON.stringify({
        projectKey: DIGEST_PROJECT_KEY,
        title,
        description,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: could not reach IdentityHub backend (${DIGEST_APP_URL}): ${msg}`);
    process.exit(1);
  }

  if (res.status !== 201) {
    const body = await res.text().catch(() => "(unreadable)");
    console.error(`Error: /api/v1/findings returned HTTP ${res.status}: ${body}`);
    process.exit(1);
  }

  const json: unknown = await res.json();
  const parsed = FindingResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error(
      `Error: unexpected response shape from /api/v1/findings: ${parsed.error.message}`,
    );
    process.exit(1);
  }
  return parsed.data;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const { postUrl, title } = await fetchLatestPost();
console.log(`Latest post: "${title}"`);
console.log(`URL: ${postUrl}`);

// Dedup check — before any Anthropic spend, check if already filed.
const existingRow = db
  .prepare("SELECT jira_issue_key FROM blog_digest_state WHERE post_url = ?")
  .get(postUrl);
const existingParsed = DigestRowSchema.safeParse(existingRow);
if (existingParsed.success) {
  console.log(`Already filed as ${existingParsed.data.jira_issue_key} — nothing to do.`);
  process.exit(0);
}

console.log("Fetching post body...");
const body = await fetchPostBody(postUrl);

console.log("Summarizing with claude-haiku...");
const summary = await summarise(title, body);
console.log(`Summary: ${summary}`);

console.log("Filing Jira ticket...");
const finding = await fileTicket(title, summary);

db.prepare(
  "INSERT INTO blog_digest_state (post_url, title, jira_issue_key, filed_at) VALUES (?, ?, ?, ?)",
).run(postUrl, title, finding.jiraIssueKey, new Date().toISOString());

console.log(`\nDone. Jira issue created: ${finding.jiraIssueKey}`);
console.log(`View at: ${finding.jiraIssueUrl}`);

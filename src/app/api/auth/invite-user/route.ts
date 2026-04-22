/**
 * POST /api/auth/invite-user
 *
 * Creates a Supabase auth user via admin API and sends them the
 * standard Supabase invite email with a set-password link. Called
 * by Takeover when a CEO clicks "Create employee record" — closes
 * the gap where an app_users row existed but no actual auth.users
 * row did, so the new hire couldn't log in.
 *
 * Auth: HMAC-SHA256 signature on (timestamp + body_hash), same
 * machinery as /api/email/offer-letter. Requires the service-role
 * key to call admin APIs, which is why this can't run client-side
 * in the Tauri bundle.
 *
 * Env required:
 *   EMAIL_HMAC_SECRET        — same shared secret used for email sends
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE    — never exposed to clients
 *
 * Optional:
 *   AUTH_REDIRECT_URL        — default:
 *     `${PUBLIC_SITE_URL || VITE_TAKEOVER_SITE_URL}/auth/set-password`
 *     landing page where the user sets their initial password.
 */

import { Hono } from "hono";
import { handle } from "hono/vercel";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import { createClient } from "@supabase/supabase-js";
import { createHmac, createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Body ───────────────────────────────────────────────────────────
interface InviteUserParams {
  email: string;
  /** Optional candidate name — stored as user metadata for later
   *  profile reconstruction. */
  candidateName?: string;
  /** Override the default landing URL — useful for testing. */
  redirectTo?: string;
}

// ── Config ─────────────────────────────────────────────────────────
const TIMESTAMP_WINDOW_SECONDS = Number(
  process.env.EMAIL_TIMESTAMP_WINDOW_SECONDS ?? 300,
);

function getHmacSecret(): string {
  const secret = process.env.EMAIL_HMAC_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "EMAIL_HMAC_SECRET is missing or too short (need >= 32 chars).",
    );
  }
  return secret;
}

function getSiteUrl(): string {
  const raw =
    process.env.PUBLIC_SITE_URL ??
    process.env.VITE_TAKEOVER_SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) {
    throw new Error(
      "PUBLIC_SITE_URL / VITE_TAKEOVER_SITE_URL not set — can't build invite landing URL.",
    );
  }
  return raw.replace(/\/+$/, "");
}

function getAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL + SUPABASE_SERVICE_ROLE are required. SERVICE_ROLE bypasses RLS and must never reach the client.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Crypto helpers (duplicated locally to keep routes self-
// contained — same implementations as /api/email/offer-letter) ────
function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}
function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Hono app ───────────────────────────────────────────────────────
const app = new Hono().basePath("/api/auth");

app.use("/*", logger());
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "timestamp"],
    allowMethods: ["POST", "OPTIONS"],
    maxAge: 600,
  }),
);

app.post("/invite-user", async (c) => {
  // ── 1. Auth headers ────────────────────────────────────────────
  const authHeader = c.req.header("authorization") ?? "";
  const m = /^Bearer\s+([a-f0-9]{64})$/i.exec(authHeader.trim());
  if (!m) {
    throw new HTTPException(401, {
      message: "Missing or malformed Authorization header (expected Bearer <64-char hex sig>).",
    });
  }
  const incomingSig = m[1].toLowerCase();
  const timestamp = c.req.header("timestamp");
  if (!timestamp) {
    throw new HTTPException(401, { message: "Missing `timestamp` header." });
  }

  // ── 2. Freshness ──────────────────────────────────────────────
  const tsMs = Date.parse(timestamp);
  if (Number.isNaN(tsMs)) {
    throw new HTTPException(401, { message: "`timestamp` is not valid ISO-8601." });
  }
  const ageSeconds = Math.abs((Date.now() - tsMs) / 1000);
  if (ageSeconds > TIMESTAMP_WINDOW_SECONDS) {
    throw new HTTPException(401, {
      message: `\`timestamp\` outside ±${TIMESTAMP_WINDOW_SECONDS}s window.`,
    });
  }

  // ── 3. Read raw body + verify signature ───────────────────────
  const rawBody = await c.req.text();
  if (!rawBody) {
    throw new HTTPException(400, { message: "Body is empty." });
  }
  let secret: string;
  try {
    secret = getHmacSecret();
  } catch (e) {
    throw new HTTPException(500, {
      message: e instanceof Error ? e.message : "HMAC config invalid",
    });
  }
  const bodyHash = sha256Hex(rawBody);
  const expectedSig = hmacHex(secret, `${timestamp}:${bodyHash}`);
  if (!safeEqualHex(expectedSig, incomingSig)) {
    throw new HTTPException(401, {
      message: "Invalid signature (body or timestamp tampered, or wrong secret).",
    });
  }

  // ── 4. Parse body + validate ──────────────────────────────────
  let body: InviteUserParams;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Body is not valid JSON." }, 400);
  }
  if (!body.email || !body.email.includes("@")) {
    return c.json({ error: "`email` is required and must look like an email." }, 400);
  }

  // ── 5. Call the admin invite API ──────────────────────────────
  let supa;
  try {
    supa = getAdminClient();
  } catch (e) {
    throw new HTTPException(500, {
      message: e instanceof Error ? e.message : "Admin client init failed",
    });
  }

  const redirectTo =
    body.redirectTo?.trim() || `${getSiteUrl()}/auth/set-password`;

  const { data, error } = await supa.auth.admin.inviteUserByEmail(body.email, {
    data: body.candidateName ? { candidate_name: body.candidateName } : undefined,
    redirectTo,
  });

  if (error) {
    // Common case: user already has an auth account (e.g. they were
    // invited once already, or someone re-converted the same offer).
    // We surface a specific status so the client can handle it.
    const msg = error.message.toLowerCase();
    if (msg.includes("already been registered") || msg.includes("already exists")) {
      return c.json(
        {
          error: "User already has an auth account.",
          providerCode: error.message,
          alreadyRegistered: true,
        },
        409,
      );
    }
    return c.json(
      { error: "Supabase admin invite failed.", providerCode: error.message },
      502,
    );
  }

  if (!data.user) {
    return c.json({ error: "Invite succeeded but no user returned." }, 502);
  }

  return c.json({
    status: "invited",
    userId: data.user.id,
    email: data.user.email,
    redirectTo,
  });
});

export const POST = handle(app);
export const OPTIONS = handle(app);

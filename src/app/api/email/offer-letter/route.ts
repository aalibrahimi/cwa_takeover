/**
 * POST /api/email/offer-letter
 *
 * Receives an OfferLetterParams payload from Takeover (desktop) and
 * forwards it to Resend. Email body is rendered server-side via the
 * React Email component at `emails/offer-letter.tsx`.
 *
 * Auth: HMAC-SHA256 over (timestamp + body_hash). No storage.
 *
 *   1. Client + server share `EMAIL_HMAC_SECRET` (env var only,
 *      never shipped in JS bundles other than the Tauri build).
 *   2. Client computes:
 *        bodyHash = sha256_hex(rawJsonBodyString)
 *        sig      = hmac_sha256_hex(secret, timestamp + ":" + bodyHash)
 *   3. Client sends:
 *        Authorization: Bearer <sig>
 *        timestamp:     <ISO-8601 UTC>
 *   4. Server reads the raw body bytes, recomputes sig, constant-
 *      time compares. Rejects if (a) timestamp is outside the
 *      ±5 minute window, (b) sig doesn't match, or (c) body was
 *      tampered between sign and send.
 *
 * Why HMAC instead of Redis bearer:
 *   - No storage round-trip → faster.
 *   - Browser-compatible (Web Crypto API works in Tauri + Node).
 *   - Single shared secret on Vercel + in Takeover's bundle, no
 *     Upstash/Railway dep.
 *   - Replay protection from the timestamp window.
 *   - Tampering protection from including bodyHash in the sig.
 *
 * Env required:
 *   EMAIL_HMAC_SECRET    — long random string (use `openssl rand -hex 32`)
 *   RESEND_API_KEY       — Resend API key
 *
 * Optional:
 *   EMAIL_TIMESTAMP_WINDOW_SECONDS  (default 300 = 5 minutes)
 */

import { Hono } from "hono";
import { handle } from "hono/vercel";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import { Resend } from "resend";
import { createHmac, createHash } from "node:crypto";
import OfferLetter, { type Brand } from "../../../../../emails/offer-letter";
import { DEV_CORS_ORIGINS, PROD_CORS_ORIGINS } from "../corsConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Interface the CLIENT sends ─────────────────────────────────────
interface OfferLetterParams {
  from: { name: string; email: string };
  to: string;
  subject: string;
  body: string;
  candidateName: string;
  positionTitle: string;
  employerLegalName: string;
  brand: Brand;
  acceptUrl: string;
  attachment?: {
    filename: string;
    contentBase64: string;
    contentType?: string;
  };
}

// ── Config ─────────────────────────────────────────────────────────
const TIMESTAMP_WINDOW_SECONDS = Number(
  process.env.EMAIL_TIMESTAMP_WINDOW_SECONDS ?? 300,
);

function getHmacSecret(): string {
  const secret = process.env.EMAIL_HMAC_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "EMAIL_HMAC_SECRET is missing or too short (need >= 32 chars). " +
      "Generate one with `openssl rand -hex 32`.",
    );
  }
  return secret;
}

function getResend(): Resend {
  // Accept either naming convention — the backender's original env
  // used RESEND_EMAIL_KEY, my code uses RESEND_API_KEY. Either works
  // so we don't have to force a rename in Vercel.
  const key = process.env.RESEND_API_KEY ?? process.env.RESEND_EMAIL_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY (or RESEND_EMAIL_KEY) required in env.",
    );
  }
  return new Resend(key);
}

// ── Crypto helpers ─────────────────────────────────────────────────
function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Constant-time hex string compare. Both must be same length;
 *  Buffer.from(hex, 'hex') gives a length-N buffer where the hex
 *  string is 2N chars, so we equality-check lengths first. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Hono app ───────────────────────────────────────────────────────
const app = new Hono().basePath("/api/email");

app.use("/*", logger());

// CORS — wide open. Auth is HMAC-signature in headers, NOT cookies,
// so CORS doesn't gate access. Allowing "*" lets the Tauri webview
// (which has origin http://localhost:1420 in dev, tauri://localhost
// in production) hit the endpoint without origin gymnastics. The
// signature requirement is the actual security boundary.
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "timestamp"],
    allowMethods: ["POST", "OPTIONS"],
    maxAge: 600,
  }),
);

app.post("/offer-letter", async (c) => {
  // ── 1. Extract auth headers ────────────────────────────────────
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

  // ── 2. Timestamp freshness ─────────────────────────────────────
  const tsMs = Date.parse(timestamp);
  if (Number.isNaN(tsMs)) {
    throw new HTTPException(401, {
      message: "`timestamp` is not valid ISO-8601.",
    });
  }
  const ageSeconds = Math.abs((Date.now() - tsMs) / 1000);
  if (ageSeconds > TIMESTAMP_WINDOW_SECONDS) {
    throw new HTTPException(401, {
      message: `\`timestamp\` is outside the ±${TIMESTAMP_WINDOW_SECONDS}s window (off by ${Math.round(ageSeconds)}s). Check your system clock.`,
    });
  }

  // ── 3. Read raw body bytes for hashing ────────────────────────
  // c.req.text() consumes the stream; we re-parse JSON from the
  // string later. This guarantees the bytes we hash are the same
  // bytes the client signed.
  const rawBody = await c.req.text();
  if (!rawBody) {
    throw new HTTPException(400, { message: "Body is empty." });
  }

  // ── 4. Recompute sig + constant-time compare ──────────────────
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

  // ── 5. Parse JSON + validate fields ───────────────────────────
  let body: OfferLetterParams;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Body is not valid JSON." }, 400);
  }

  const required: (keyof OfferLetterParams)[] = [
    "from", "to", "subject", "body",
    "candidateName", "positionTitle", "employerLegalName",
    "brand", "acceptUrl",
  ];
  for (const field of required) {
    if (body[field] == null || body[field] === "") {
      return c.json({ error: `Missing required field: ${field}` }, 400);
    }
  }
  if (!body.from?.name || !body.from?.email) {
    return c.json({ error: "`from.name` + `from.email` are required." }, 400);
  }
  if (!["codeWithAli", "simplicityFunds"].includes(body.brand)) {
    return c.json(
      { error: "`brand` must be 'codeWithAli' or 'simplicityFunds'." },
      400,
    );
  }

  // ── 6. Build Resend payload ───────────────────────────────────
  const recipients = body.to
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    return c.json({ error: "`to` must contain at least one address." }, 400);
  }

  const attachments = body.attachment
    ? [
        {
          filename: body.attachment.filename,
          content: Buffer.from(body.attachment.contentBase64, "base64"),
          contentType: body.attachment.contentType,
        },
      ]
    : undefined;

  // ── 7. Send via Resend ────────────────────────────────────────
  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: `${body.from.name} <${body.from.email}>`,
      to: recipients,
      subject: body.subject,
      react: OfferLetter({
        candidateName: body.candidateName,
        positionTitle: body.positionTitle,
        employerLegalName: body.employerLegalName,
        brand: body.brand,
        body: body.body,
        acceptUrl: body.acceptUrl,
      }),
      attachments,
    });

    if (error) {
      return c.json(
        {
          error: "Resend rejected the request.",
          providerCode: error.message,
        },
        502,
      );
    }
    if (!data?.id) {
      return c.json({ error: "Resend returned no message id." }, 502);
    }

    return c.json({ status: "sent", messageId: data.id });
  } catch (e) {
    return c.json(
      {
        error: "Resend send failed.",
        providerCode: e instanceof Error ? e.message : String(e),
      },
      502,
    );
  }
});

export const POST = handle(app);
export const OPTIONS = handle(app);

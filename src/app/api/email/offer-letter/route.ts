/**
 * POST /api/email/offer-letter
 *
 * Receives an OfferLetterParams payload from Takeover (desktop) and
 * forwards it to Resend. The email body is rendered server-side via
 * the React Email component at `emails/offer-letter.tsx` — Resend's
 * `react:` field does the CSS inlining dance.
 *
 * Auth: Redis bearer + timestamp pattern.
 *   · Client (Takeover) generates a random token + ISO-8601 ts,
 *     writes `bearer:<ts>` = <token> to Upstash with 24h TTL, sends
 *     both in headers.
 *   · This route looks up the key, constant-time compares, deletes
 *     on match (single-use), then sends.
 *
 * Key design changes vs the initial backender draft:
 *   1. `@upstash/redis` (REST-based, serverless-native) replaces
 *      `redis` (node-redis, TCP-based). TCP connections from
 *      Vercel serverless cold-start in weird ways; REST is
 *      stateless and purpose-built for this shape.
 *   2. `attachment.contentBase64` replaces `attachment.textContent`.
 *      The server now decodes base64 → Buffer exactly once instead
 *      of re-encoding UTF-8 text to base64 (which would corrupt any
 *      non-ASCII byte — fatal for PDFs).
 *   3. Interface extended with candidateName, positionTitle,
 *      employerLegalName, brand, acceptUrl so the React Email
 *      template can render real content instead of a stub button.
 *
 * Env required:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *   RESEND_API_KEY
 *
 * Optional:
 *   EMAIL_TOKEN_MAX_AGE_SECONDS  (default 86400 = 24h)
 */

import { Hono } from "hono";
import { handle } from "hono/vercel";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { validator } from "hono/validator";
import { HTTPException } from "hono/http-exception";
import { Resend } from "resend";
import { Redis } from "@upstash/redis";
import OfferLetter, { type Brand } from "../../../../../emails/offer-letter";
import { DEV_CORS_ORIGINS, PROD_CORS_ORIGINS } from "../corsConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Interface the CLIENT sends ─────────────────────────────────────
// Mirror of the `OfferLetterParams` type exported to Takeover.
interface OfferLetterParams {
  from: { name: string; email: string };
  to: string;                    // comma-separated = multiple recipients
  subject: string;
  body: string;                  // prose body for the React Email template
  /** Required — the React Email template needs these to render. */
  candidateName: string;
  positionTitle: string;
  employerLegalName: string;
  brand: Brand;
  acceptUrl: string;
  /** Attachment — base64-encoded, any binary type. */
  attachment?: {
    filename: string;
    contentBase64: string;
    contentType?: string;
  };
}

// ── Lazy singletons ────────────────────────────────────────────────
function getRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN required in env.",
    );
  }
  return new Redis({ url, token });
}

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY required in env.");
  return new Resend(key);
}

const MAX_TOKEN_AGE_SECONDS = Number(
  process.env.EMAIL_TOKEN_MAX_AGE_SECONDS ?? 24 * 60 * 60,
);

// Constant-time compare — prevents timing attacks on bearer validation.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Hono app ───────────────────────────────────────────────────────
const app = new Hono().basePath("/api/email");

app.use("/*", logger());

// CORS — the Tauri webview has origin `tauri://localhost` or
// `https://tauri.localhost` depending on platform; both are in
// DEV_CORS_ORIGINS. PROD_CORS_ORIGINS includes the deployed site.
app.use(
  "/*",
  cors({
    origin:
      process.env.NODE_ENV === "development"
        ? DEV_CORS_ORIGINS
        : PROD_CORS_ORIGINS,
    allowHeaders: ["Content-Type", "Authorization", "timestamp"],
    allowMethods: ["POST", "OPTIONS"],
    maxAge: 600,
  }),
);

app.post(
  "/offer-letter",
  // Header validator — fails fast before body parsing.
  validator("header", async (value) => {
    const authHeader = (value["authorization"] as string) ?? "";
    const m = /^Bearer\s+([A-Za-z0-9+/=_-]+)$/.exec(authHeader.trim());
    if (!m) {
      throw new HTTPException(401, {
        message: "Missing or malformed Authorization header.",
      });
    }
    const bearerToken = m[1];

    const timestamp = value["timestamp"] as string | undefined;
    if (!timestamp || Array.isArray(timestamp)) {
      throw new HTTPException(401, { message: "Missing `timestamp` header." });
    }

    // Defensive freshness check — belt-and-suspenders over the
    // Redis TTL.
    const tsMs = Date.parse(timestamp);
    if (Number.isNaN(tsMs)) {
      throw new HTTPException(401, {
        message: "`timestamp` is not valid ISO-8601.",
      });
    }
    const ageSeconds = (Date.now() - tsMs) / 1000;
    if (ageSeconds < -60 || ageSeconds > MAX_TOKEN_AGE_SECONDS) {
      throw new HTTPException(401, {
        message: "`timestamp` is out of the allowed window.",
      });
    }

    // Look up + validate.
    let stored: string | null;
    try {
      stored = await getRedis().get<string>(`bearer:${timestamp}`);
    } catch (e) {
      throw new HTTPException(500, {
        message: `Redis unreachable: ${e instanceof Error ? e.message : "unknown"}`,
      });
    }

    if (!stored || !safeEqual(stored, bearerToken)) {
      throw new HTTPException(401, {
        message: "Invalid or already-used bearer.",
      });
    }

    // Consume — single-use. Fire-and-forget; TTL catches leaks.
    try { await getRedis().del(`bearer:${timestamp}`); } catch { /* noop */ }

    return { bearerToken, timestamp };
  }),
  async (c) => {
    // ── Parse + validate body ─────────────────────────────────────
    let body: OfferLetterParams;
    try {
      body = await c.req.json();
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

    // ── Assemble Resend payload ───────────────────────────────────
    const recipients = body.to
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (recipients.length === 0) {
      return c.json({ error: "`to` must contain at least one address." }, 400);
    }

    // Decode attachment base64 → Buffer. Single decode, no double-
    // encoding. Resend accepts Buffer directly.
    const attachments = body.attachment
      ? [
          {
            filename: body.attachment.filename,
            content: Buffer.from(body.attachment.contentBase64, "base64"),
            contentType: body.attachment.contentType,
          },
        ]
      : undefined;

    // ── Send via Resend ───────────────────────────────────────────
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
  },
);

// Next.js App Router handler bindings.
export const POST = handle(app);
export const OPTIONS = handle(app);

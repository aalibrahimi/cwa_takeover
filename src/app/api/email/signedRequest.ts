/**
 * Shared checks for the signed email routes under /api/email.
 *
 * A request from the Takeover desktop app carries:
 *   Authorization: Bearer <sig>     sig = hmac_sha256_hex(secret, timestamp + ":" + sha256_hex(body))
 *   timestamp:     <ISO-8601 UTC>
 *
 * `readSignedBody` checks the signature and the timestamp window and returns
 * the exact body text that was signed. It is the same check the
 * offer-letter route does inline; new routes should call this instead of
 * copying it.
 *
 * Env:
 *   EMAIL_HMAC_SECRET                long random string, 32+ chars
 *   RESEND_API_KEY (or RESEND_EMAIL_KEY)
 *   EMAIL_TIMESTAMP_WINDOW_SECONDS   optional, default 300
 */

import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { Resend } from "resend";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

const TIMESTAMP_WINDOW_SECONDS = Number(process.env.EMAIL_TIMESTAMP_WINDOW_SECONDS ?? 300);

/**
 * The Resend client, from the key in env.
 * @throws If no key is set.
 */
export function getResend(): Resend {
  const key = process.env.RESEND_API_KEY ?? process.env.RESEND_EMAIL_KEY;
  if (!key) throw new Error("RESEND_API_KEY (or RESEND_EMAIL_KEY) required in env.");
  return new Resend(key);
}

/**
 * Checks a signed request and returns its body text.
 * @param c The Hono context of the request.
 * @returns The raw body, byte for byte what the client signed.
 * @throws HTTPException 401 when the signature or timestamp is missing, stale or wrong; 400 when the body is empty; 500 when the server has no secret.
 */
export async function readSignedBody(c: Context): Promise<string> {
  const m = /^Bearer\s+([a-f0-9]{64})$/i.exec((c.req.header("authorization") ?? "").trim());
  if (!m) {
    throw new HTTPException(401, { message: "Missing or malformed Authorization header (expected Bearer <64-char hex sig>)." });
  }
  const incoming = m[1].toLowerCase();

  const timestamp = c.req.header("timestamp");
  if (!timestamp) throw new HTTPException(401, { message: "Missing `timestamp` header." });
  const tsMs = Date.parse(timestamp);
  if (Number.isNaN(tsMs)) throw new HTTPException(401, { message: "`timestamp` is not valid ISO-8601." });
  const age = Math.abs((Date.now() - tsMs) / 1000);
  if (age > TIMESTAMP_WINDOW_SECONDS) {
    throw new HTTPException(401, { message: `\`timestamp\` is outside the ±${TIMESTAMP_WINDOW_SECONDS}s window (off by ${Math.round(age)}s). Check your system clock.` });
  }

  const rawBody = await c.req.text();
  if (!rawBody) throw new HTTPException(400, { message: "Body is empty." });

  const secret = process.env.EMAIL_HMAC_SECRET;
  if (!secret || secret.length < 32) {
    throw new HTTPException(500, { message: "EMAIL_HMAC_SECRET is missing or too short (need >= 32 chars)." });
  }
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const expected = createHmac("sha256", secret).update(`${timestamp}:${bodyHash}`).digest("hex");
  // Both are 64 hex chars here, so the buffers are the same length and the compare takes the same time either way.
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(incoming, "hex"))) {
    throw new HTTPException(401, { message: "Invalid signature (body or timestamp tampered, or wrong secret)." });
  }
  return rawBody;
}

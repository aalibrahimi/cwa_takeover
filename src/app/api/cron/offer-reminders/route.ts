/**
 * GET /api/cron/offer-reminders
 *
 * Vercel Cron target. Runs daily (see ../../../../vercel.json).
 * Finds offers that were emailed to candidates >= N days ago and
 * haven't been responded to — sends a single friendly nudge, then
 * stamps `reminder_sent_at` so we never double-send.
 *
 * Selection criteria:
 *   status = 'sent'
 *   emailed_at  < now() - REMINDER_DELAY_DAYS days
 *   reminder_sent_at IS NULL
 *   declined_at IS NULL
 *   (offer_expires_at IS NULL OR offer_expires_at > now())
 *   acceptance_token IS NOT NULL
 *
 * Auth: Vercel Cron automatically includes
 *       `Authorization: Bearer $CRON_SECRET` on every scheduled
 *       invocation. We verify constant-time against env.
 *
 * Env required:
 *   CRON_SECRET             — shared secret for Vercel Cron auth
 *   SUPABASE_URL            — Takeover Supabase URL
 *   SUPABASE_SERVICE_ROLE   — service-role key (bypasses RLS;
 *                             required because the cron isn't
 *                             anon-authenticated against a token)
 *   RESEND_API_KEY          — Resend API key
 *   VITE_TAKEOVER_SITE_URL or PUBLIC_SITE_URL  — base for accept URL
 *
 * Optional:
 *   REMINDER_DELAY_DAYS     — days before nudging (default 2)
 *   REMINDER_MAX_PER_RUN    — safety cap on sends per invocation
 *                             (default 25, avoids a bad query
 *                             blasting out hundreds of emails)
 */

import { Resend } from "resend";
import { render } from "@react-email/render";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import OfferReminder, { type Brand } from "../../../../../emails/offer-reminder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Config ─────────────────────────────────────────────────────────
const REMINDER_DELAY_DAYS = Number(process.env.REMINDER_DELAY_DAYS ?? 2);
const REMINDER_MAX_PER_RUN = Number(process.env.REMINDER_MAX_PER_RUN ?? 25);

// Map the DB brand value to the email template's brand union.
// DB has `codeWithAli` | `simplicityFunds` per the offer-letter
// schema; anything unexpected falls back to CWA branding.
function normalizeBrand(raw: unknown): Brand {
  return raw === "simplicityFunds" ? "simplicityFunds" : "codeWithAli";
}

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required in env.`);
  return v;
}

function getSiteUrl(): string {
  // Matches the same fallback order used by the Takeover client so
  // the accept URL in reminders matches the one in the original
  // offer email. Trailing-slash safe.
  const raw =
    process.env.PUBLIC_SITE_URL ??
    process.env.VITE_TAKEOVER_SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) {
    throw new Error(
      "PUBLIC_SITE_URL / VITE_TAKEOVER_SITE_URL not set — can't build accept URLs.",
    );
  }
  return raw.replace(/\/+$/, "");
}

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const incoming = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(incoming);
  if (!m) return false;
  const got = m[1].trim();
  if (got.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Handler ────────────────────────────────────────────────────────
export async function GET(req: Request): Promise<Response> {
  // Vercel Cron sends GET by default.
  if (!authorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supaUrl: string;
  let supaKey: string;
  let resend: Resend;
  let siteUrl: string;
  try {
    supaUrl = getEnv("SUPABASE_URL");
    supaKey = getEnv("SUPABASE_SERVICE_ROLE");
    resend = new Resend(
      process.env.RESEND_API_KEY ?? process.env.RESEND_EMAIL_KEY ?? "",
    );
    if (!process.env.RESEND_API_KEY && !process.env.RESEND_EMAIL_KEY) {
      throw new Error("RESEND_API_KEY (or RESEND_EMAIL_KEY) is required.");
    }
    siteUrl = getSiteUrl();
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  const supa = createClient(supaUrl, supaKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Compute the "older than" cutoff. `emailed_at < cutoff` means
  // the candidate has had at least REMINDER_DELAY_DAYS to respond.
  const cutoff = new Date(
    Date.now() - REMINDER_DELAY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const nowIso = new Date().toISOString();

  const { data: stale, error } = await supa
    .from("offer_letters")
    .select(
      "id, candidate_name, candidate_email, position_title, employer_legal_name, employer_signer_name, brand, acceptance_token, emailed_at, offer_expires_at, reminder_sent_at, status, declined_at",
    )
    .eq("status", "sent")
    .is("reminder_sent_at", null)
    .is("declined_at", null)
    .lt("emailed_at", cutoff)
    .not("acceptance_token", "is", null)
    .not("candidate_email", "is", null)
    .limit(REMINDER_MAX_PER_RUN);

  if (error) {
    return Response.json(
      { error: "DB query failed", detail: error.message },
      { status: 500 },
    );
  }

  if (!stale || stale.length === 0) {
    return Response.json({
      status: "ok",
      scanned: 0,
      sent: 0,
      cutoff,
    });
  }

  // Filter out any with expired offers — the DB column might be
  // null (no expiry) or a timestamp. We skip if it's in the past.
  const candidates = stale.filter((row: any) => {
    if (!row.offer_expires_at) return true;
    return Date.parse(row.offer_expires_at) > Date.now();
  });

  let sentCount = 0;
  const errors: Array<{ id: string; message: string }> = [];

  // Sequential — keeps the code simple, avoids hammering Resend,
  // and a daily cron of ~25 max sends doesn't need parallelism.
  for (const row of candidates as any[]) {
    try {
      const brand = normalizeBrand(row.brand);
      const acceptUrl = `${siteUrl}/offer/accept/${encodeURIComponent(
        row.acceptance_token,
      )}`;

      const html = await render(
        OfferReminder({
          candidateName: row.candidate_name,
          positionTitle: row.position_title,
          employerLegalName: row.employer_legal_name,
          brand,
          acceptUrl,
          sentAt: row.emailed_at,
        }),
      );

      const plainText = [
        `Hi ${row.candidate_name},`,
        "",
        `Just a friendly nudge — we sent you an offer for the ${row.position_title} role at ${row.employer_legal_name} on ${new Date(row.emailed_at).toLocaleDateString()}, and we haven't heard back yet.`,
        "",
        "No pressure. Whenever you're ready, your accept link is below:",
        "",
        acceptUrl,
        "",
        "This link is unique to you — please don't forward it.",
        "",
        `Looking forward to hearing from you,`,
        row.employer_legal_name,
      ].join("\n");

      const fromName =
        brand === "simplicityFunds" ? "Simplicity Funds" : "CodeWithAli";
      const fromEmail =
        brand === "simplicityFunds"
          ? "hire@simplicityfunds.com"
          : "hire@codewithali.com";

      const { error: sendError } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [row.candidate_email],
        subject: `Reminder: your offer from ${row.employer_legal_name}`,
        html,
        text: plainText,
      });

      if (sendError) {
        errors.push({ id: row.id, message: sendError.message });
        continue; // Don't stamp reminder_sent_at — let next run retry.
      }

      // Mark the row so we never double-send.
      const { error: updError } = await supa
        .from("offer_letters")
        .update({ reminder_sent_at: nowIso })
        .eq("id", row.id);
      if (updError) {
        errors.push({
          id: row.id,
          message: `Email sent but failed to stamp reminder_sent_at: ${updError.message}`,
        });
      } else {
        sentCount += 1;
      }
    } catch (e) {
      errors.push({
        id: (row as any).id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return Response.json({
    status: "ok",
    scanned: candidates.length,
    sent: sentCount,
    cutoff,
    errors: errors.length > 0 ? errors : undefined,
  });
}

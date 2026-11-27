/**
 * Shared pieces for the Stripe routes under /api/stripe.
 *
 * Two outside systems are talked to from here, both with plain fetch so the
 * site needs no new package:
 *   · Stripe's REST API, with the secret key (form-encoded bodies, as Stripe expects).
 *   · The Takeover Supabase project's REST API, with the service-role key,
 *     which is how these routes read and update the `invoices` table.
 *
 * Env:
 *   STRIPE_SECRET_KEY        sk_live_... or sk_test_...   (never NEXT_PUBLIC_)
 *   STRIPE_WEBHOOK_SECRET    whsec_...   from the webhook endpoint in the Stripe dashboard
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE    service-role key (never NEXT_PUBLIC_)
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** The one currency invoices are charged in. */
export const CURRENCY = "usd";
/** How far a webhook's timestamp may be from now, in seconds, before it is refused as a replay. */
const WEBHOOK_TOLERANCE_SECONDS = 300;

/** An error from Stripe or Supabase, with the HTTP status the outside system answered with. */
export class UpstreamError extends Error {
  /**
   * @param system Which system failed: "stripe" or "supabase".
   * @param status The HTTP status it answered with.
   * @param message What it said.
   */
  constructor(
    public system: "stripe" | "supabase",
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Reads a required env var.
 * @param name The variable's name.
 * @throws If it is not set.
 */
function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set in the site's environment.`);
  return v;
}

/**
 * Calls Stripe's REST API.
 * @param method "GET" or "POST".
 * @param path The path after /v1, starting with a slash ("/payment_links").
 * @param form The fields, already flattened to Stripe's bracket names ("line_items[0][quantity]"). Ignored for GET.
 * @param idempotencyKey For POST: a key that makes a repeated request return the first result, so a retry never creates a second object.
 * @returns The parsed JSON object Stripe answered with.
 * @throws UpstreamError when Stripe answers with an error.
 */
export async function stripe<T = Record<string, unknown>>(method: "GET" | "POST", path: string, form?: Record<string, string>, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: method === "POST" ? new URLSearchParams(form ?? {}).toString() : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) throw new UpstreamError("stripe", res.status, json.error?.message ?? `Stripe answered ${res.status}.`);
  return json as T;
}

/**
 * Calls the Supabase REST API as the service role (row-level security does not apply).
 * @param method The HTTP method.
 * @param query The table and filters, e.g. "invoices?invoice_id=eq.12&select=*".
 * @param body For POST and PATCH: the row or the fields to set.
 * @returns The rows the call returned (PATCH and POST return the rows they touched).
 * @throws UpstreamError when Supabase answers with an error.
 */
export async function db<T = Record<string, unknown>>(method: "GET" | "POST" | "PATCH", query: string, body?: Record<string, unknown>): Promise<T[]> {
  const base = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not set in the site's environment.");
  const key = env("SUPABASE_SERVICE_ROLE");
  const res = await fetch(`${base.replace(/\/$/, "")}/rest/v1/${query}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? text;
    } catch {
      /* not JSON: keep the text */
    }
    throw new UpstreamError("supabase", res.status, message || `Supabase answered ${res.status}.`);
  }
  return text ? (JSON.parse(text) as T[]) : [];
}

/** The fields of an invoice these routes read. */
export interface InvoiceRow {
  invoice_id: number;
  invoice_title: string | null;
  client_name: string | null;
  client_email: string | null;
  client_account_id: string | null;
  status: string;
  subtotal: number | string | null;
  outcome: number | string | null;
  payment_ref: string | null;
  payment_link_id: string | null;
  payment_link_url: string | null;
  payment_link_amount_cents: number | null;
}
export const INVOICE_COLUMNS = "invoice_id,invoice_title,client_name,client_email,client_account_id,status,subtotal,outcome,payment_ref,payment_link_id,payment_link_url,payment_link_amount_cents";

/**
 * What an invoice is for, in cents: the total after adjustment and discount, or the subtotal on an old row without one.
 * @param invoice The invoice row.
 */
export function amountCents(invoice: Pick<InvoiceRow, "outcome" | "subtotal">): number {
  return Math.round(Number(invoice.outcome ?? invoice.subtotal ?? 0) * 100);
}

/**
 * Checks that a webhook really came from Stripe.
 * Stripe signs `${timestamp}.${body}` with the endpoint's secret and sends "t=<timestamp>,v1=<signature>[,v1=...]".
 * @param rawBody The request body, byte for byte as it arrived.
 * @param header The Stripe-Signature header.
 * @returns null when the signature is good, otherwise why it was refused.
 */
export function webhookProblem(rawBody: string, header: string | undefined): string | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return "STRIPE_WEBHOOK_SECRET is not set in the site's environment.";
  if (!header) return "Missing Stripe-Signature header.";
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sent = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || sent.length === 0) return "Malformed Stripe-Signature header.";
  if (Math.abs(Date.now() / 1000 - Number(t)) > WEBHOOK_TOLERANCE_SECONDS) return "The webhook's timestamp is too old or too far ahead.";
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"), "hex");
  const ok = sent.some((s) => {
    if (!/^[a-f0-9]{64}$/i.test(s)) return false;
    return timingSafeEqual(expected, Buffer.from(s, "hex"));
  });
  return ok ? null : "The signature does not match.";
}

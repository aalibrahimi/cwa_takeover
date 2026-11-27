/**
 * POST /api/stripe/payment-link
 *
 * Makes (or returns) the Stripe payment link for one invoice, on behalf of
 * the Takeover desktop app. The Stripe secret key lives here, not in the app.
 *
 * Auth: the same signed request as the email routes (see ../../email/signedRequest.ts).
 *
 * The signing secret is built into the desktop app, so a signature only
 * proves "this came from a Takeover build". The route is therefore kept
 * narrow: the body carries an invoice number and nothing else. The amount,
 * the description and where the link is stored all come from the invoice
 * row in the database. The worst a forged request can do is create the
 * correct payment link for a real unpaid invoice.
 *
 * Body:      { "invoiceId": 12 }
 *
 * What it does:
 *   1. Reads the invoice. Refuses a paid invoice (409) and one for less than 50 cents (400, Stripe's minimum).
 *   2. If the invoice already has a link for the same amount, returns it ("reused": true). Nothing new is made.
 *   3. Otherwise creates a one-off Stripe price for the amount and a payment link for it that can be paid once,
 *      tagged with the invoice number so the webhook can find the invoice. Any older link for a different amount is switched off.
 *   4. Saves the link's id, address and amount on the invoice row.
 *
 * Responses:
 *   200 { "status": "ok", "url": "https://buy.stripe.com/...", "id": "plink_...", "amountCents": 35000, "reused": false }
 *   400 { "error": "..." }      bad body, or amount too small
 *   401 { "message": "..." }    signature or timestamp
 *   404 { "error": "..." }      no such invoice
 *   409 { "error": "..." }      the invoice is already paid
 *   502 { "error": "...", "providerCode": "..." }   Stripe or the database refused
 */

import { Hono } from "hono";
import { handle } from "hono/vercel";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { readSignedBody } from "../../email/signedRequest";
import { CURRENCY, INVOICE_COLUMNS, UpstreamError, amountCents, db, stripe, type InvoiceRow } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe will not charge less than this in USD. */
const MIN_CENTS = 50;

const app = new Hono().basePath("/api/stripe");

app.use("/*", logger());
// Access is gated by the signature, not by origin: the Tauri webview's origin differs between dev and an installed build.
app.use("/*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization", "timestamp"], allowMethods: ["POST", "OPTIONS"], maxAge: 600 }));

app.post("/payment-link", async (c) => {
  const rawBody = await readSignedBody(c);

  let invoiceId: number;
  try {
    invoiceId = Number((JSON.parse(rawBody) as { invoiceId?: unknown }).invoiceId);
  } catch {
    return c.json({ error: "Body is not valid JSON." }, 400);
  }
  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) return c.json({ error: "`invoiceId` must be a positive whole number." }, 400);

  try {
    const [invoice] = await db<InvoiceRow>("GET", `invoices?invoice_id=eq.${invoiceId}&select=${INVOICE_COLUMNS}`);
    if (!invoice) return c.json({ error: `There is no invoice #${invoiceId}.` }, 404);
    if (invoice.status === "paid") return c.json({ error: `Invoice #${invoiceId} is already paid.` }, 409);

    const cents = amountCents(invoice);
    if (cents < MIN_CENTS) return c.json({ error: `Invoice #${invoiceId} is for less than $0.50, which Stripe cannot charge.` }, 400);

    // Same amount as the link it already has: hand that one back.
    if (invoice.payment_link_url && invoice.payment_link_id && invoice.payment_link_amount_cents === cents) {
      return c.json({ status: "ok", url: invoice.payment_link_url, id: invoice.payment_link_id, amountCents: cents, reused: true });
    }

    const label = `Invoice #${invoiceId}${invoice.invoice_title ? `: ${invoice.invoice_title}` : ""}`.slice(0, 240);
    // The keys carry the invoice and the amount, so a retried request gets the same price and link back instead of a second pair.
    const price = await stripe<{ id: string }>("POST", "/prices", { currency: CURRENCY, unit_amount: String(cents), "product_data[name]": label }, `takeover-invoice-${invoiceId}-${cents}-price`);
    const link = await stripe<{ id: string; url: string }>(
      "POST",
      "/payment_links",
      {
        "line_items[0][price]": price.id,
        "line_items[0][quantity]": "1",
        // Copied by Stripe onto the checkout session, which is what the webhook receives.
        "metadata[invoice_id]": String(invoiceId),
        "metadata[source]": "takeover",
        "payment_intent_data[metadata][invoice_id]": String(invoiceId),
        "payment_intent_data[description]": label,
        // An invoice is paid once.
        "restrictions[completed_sessions][limit]": "1",
        "after_completion[type]": "hosted_confirmation",
        "after_completion[hosted_confirmation][custom_message]": `Thank you. Invoice #${invoiceId} is paid.`,
      },
      `takeover-invoice-${invoiceId}-${cents}-link`,
    );

    // The amount changed since the old link was made: nobody should be able to pay the old amount.
    if (invoice.payment_link_id && invoice.payment_link_id !== link.id) {
      await stripe("POST", `/payment_links/${invoice.payment_link_id}`, { active: "false" }).catch((e) => console.error("[payment-link] could not switch off the old link", invoice.payment_link_id, e));
    }

    const saved = await db("PATCH", `invoices?invoice_id=eq.${invoiceId}`, { payment_link_id: link.id, payment_link_url: link.url, payment_link_amount_cents: cents });
    if (!saved.length) return c.json({ error: "The link was made but could not be saved on the invoice.", providerCode: "no row updated" }, 502);

    return c.json({ status: "ok", url: link.url, id: link.id, amountCents: cents, reused: false });
  } catch (e) {
    if (e instanceof UpstreamError) {
      // A missing column means the migration has not been run. Say which one.
      const hint = e.system === "supabase" && /payment_link/.test(e.message) ? " Run migrations/invoices_payment_link.sql in Supabase." : "";
      return c.json({ error: `${e.system === "stripe" ? "Stripe" : "The database"} refused the request.${hint}`, providerCode: e.message }, 502);
    }
    return c.json({ error: e instanceof Error ? e.message : "The payment link could not be made." }, 500);
  }
});

export const POST = handle(app);
export const OPTIONS = handle(app);

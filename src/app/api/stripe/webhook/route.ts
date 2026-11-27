/**
 * POST /api/stripe/webhook
 *
 * Stripe calls this when a payment link made by /api/stripe/payment-link is
 * paid. The invoice is marked as paid in the Takeover database, so nobody
 * has to do it by hand.
 *
 * Auth: Stripe's own signature on the request (Stripe-Signature header,
 * checked against STRIPE_WEBHOOK_SECRET). There is no other way in.
 *
 * Events handled (add both when creating the endpoint in the Stripe dashboard):
 *   checkout.session.completed                 paid at once (cards)
 *   checkout.session.async_payment_succeeded   paid later (bank debits)
 * Every other event is acknowledged and ignored.
 *
 * What it does for a paid session that carries metadata.invoice_id:
 *   1. Checks the currency and that the amount paid is the amount the link was made for.
 *      A mismatch is written on the client's timeline for a person to look at; the invoice is not marked.
 *   2. Looks up the charge behind the payment (the id the Takeover Money page lists payments by).
 *   3. Sets the invoice to paid, with the date, "stripe" and the charge id, only if it is still pending.
 *      Stripe may send the same event more than once; the second time changes nothing.
 *   4. Adds a line to the client's timeline and switches the payment link off.
 *
 * Responses:
 *   200 { "received": true, ... }   handled, ignored, or already recorded. Stripe stops retrying.
 *   400 { "error": "..." }          bad signature or body. Stripe stops retrying.
 *   500 { "error": "..." }          Stripe or the database could not be reached. Stripe retries later, which is what is wanted.
 */

import { Hono } from "hono";
import { handle } from "hono/vercel";
import { logger } from "hono/logger";
import { CURRENCY, INVOICE_COLUMNS, UpstreamError, db, stripe, webhookProblem, type InvoiceRow } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CheckoutSession {
  id: string;
  payment_status: string;
  amount_total: number | null;
  currency: string | null;
  payment_intent: string | null;
  payment_link: string | null;
  metadata: Record<string, string> | null;
}
interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: { object: CheckoutSession };
}

const HANDLED = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

/**
 * Dollars as text, for a timeline line.
 * @param cents The amount in cents.
 */
const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Adds a line to a client's timeline. Never throws: the payment is recorded whether or not this line is.
 * @param invoice The invoice the line is about. Nothing is written if it has no client account.
 * @param title The line.
 * @param metadata Facts stored with it.
 */
async function note(invoice: InvoiceRow, title: string, metadata: Record<string, unknown>): Promise<void> {
  if (!invoice.client_account_id) return;
  await db("POST", "client_activity", { client_id: invoice.client_account_id, type: "invoice", title, actor_name: "Stripe", metadata: { invoice_id: invoice.invoice_id, ...metadata } }).catch((e) =>
    console.error("[stripe webhook] could not write the timeline line", e),
  );
}

const app = new Hono().basePath("/api/stripe");
app.use("/*", logger());

app.post("/webhook", async (c) => {
  // The signature is over the exact bytes, so the body is read as text and parsed only after it checks out.
  const rawBody = await c.req.text();
  const problem = webhookProblem(rawBody, c.req.header("stripe-signature"));
  if (problem) return c.json({ error: problem }, problem.includes("not set") ? 500 : 400);

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return c.json({ error: "Body is not valid JSON." }, 400);
  }
  if (!HANDLED.has(event.type)) return c.json({ received: true, ignored: event.type });

  const session = event.data.object;
  const invoiceId = Number(session.metadata?.invoice_id);
  // Not one of ours (a checkout made some other way), or not paid yet (a bank debit still clearing).
  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) return c.json({ received: true, ignored: "no invoice_id on the session" });
  if (session.payment_status !== "paid") return c.json({ received: true, ignored: `payment_status is ${session.payment_status}` });

  try {
    const [invoice] = await db<InvoiceRow>("GET", `invoices?invoice_id=eq.${invoiceId}&select=${INVOICE_COLUMNS}`);
    if (!invoice) return c.json({ received: true, ignored: `no invoice #${invoiceId}` });
    if (invoice.status === "paid") return c.json({ received: true, already: true });

    const paidCents = session.amount_total ?? 0;
    if ((session.currency ?? "").toLowerCase() !== CURRENCY || invoice.payment_link_amount_cents == null || paidCents !== invoice.payment_link_amount_cents) {
      await note(invoice, `Stripe payment of ${usd(paidCents)} for invoice #${invoiceId} does not match the amount its link was made for. Check it and mark the invoice by hand.`, { stripe_session: session.id, mismatch: true });
      return c.json({ received: true, mismatch: true });
    }

    // The Money page lists Stripe payments by charge id, so that is the reference stored.
    let reference = session.payment_intent ?? session.id;
    if (session.payment_intent) {
      const intent = await stripe<{ latest_charge: string | { id: string } | null }>("GET", `/payment_intents/${session.payment_intent}`);
      const charge = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
      if (charge) reference = charge;
    }

    // "status=eq.pending" makes this safe to receive twice: the second time matches no row.
    const updated = await db("PATCH", `invoices?invoice_id=eq.${invoiceId}&status=eq.pending`, { status: "paid", paid_at: new Date(event.created * 1000).toISOString(), paid_via: "stripe", payment_ref: reference });
    if (!updated.length) return c.json({ received: true, already: true });

    await note(invoice, `Invoice #${invoiceId} paid through Stripe (${usd(paidCents)})`, { paid: true, via: "stripe", payment_ref: reference });
    if (session.payment_link) {
      await stripe("POST", `/payment_links/${session.payment_link}`, { active: "false" }).catch((e) => console.error("[stripe webhook] could not switch the link off", session.payment_link, e));
    }
    return c.json({ received: true, invoiceId, paid: true });
  } catch (e) {
    // This payment's charge is already on another invoice (someone marked it by hand): nothing more to do.
    if (e instanceof UpstreamError && e.system === "supabase" && e.status === 409) return c.json({ received: true, already: true });
    console.error("[stripe webhook] failed", event.id, e);
    // A 500 asks Stripe to send the event again later.
    return c.json({ error: e instanceof Error ? e.message : "Could not record the payment." }, 500);
  }
});

export const POST = handle(app);

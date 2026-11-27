/**
 * POST /api/email/preview
 *
 * Returns the emails a client would get for one invoice, as HTML, so the
 * Takeover desktop app can show them before anything is sent. Nothing is
 * sent from here and nothing is changed.
 *
 * Auth: the same signed request as the other email routes (see ../signedRequest.ts).
 *
 * The emails are rendered from the same components and the same invoice row
 * the real sends use, so the preview is what the client will see:
 *   · "invoice"   the email that carries the invoice PDF, with the Pay online button if the invoice has a payment link.
 *   · "receipt"   the "payment received" email sent when the invoice is paid online. Its date is today's unless the invoice is already paid.
 *
 * Body:      { "invoiceId": 12 }
 * Responses:
 *   200 { "status": "ok", "to": "client@example.com" | null, "previews": [{ "kind": "invoice" | "receipt", "label": "...", "subject": "...", "html": "..." }] }
 *   400 { "error": "..." }    bad body
 *   401 { "message": "..." }  signature or timestamp
 *   404 { "error": "..." }    no such invoice
 *   502 { "error": "...", "providerCode": "..." }   the database refused
 */

import { Hono } from "hono";
import { handle } from "hono/vercel";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { render } from "@react-email/render";
import InvoiceEmail from "../../../../../emails/invoice";
import PaymentReceivedEmail from "../../../../../emails/payment-received";
import { readSignedBody } from "../signedRequest";
import { INVOICE_COLUMNS, UpstreamError, amountCents, db, type InvoiceRow } from "../../stripe/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const app = new Hono().basePath("/api/email");
app.use("/*", logger());
// Access is gated by the signature, not by origin: the Tauri webview's origin differs between dev and an installed build.
app.use("/*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization", "timestamp"], allowMethods: ["POST", "OPTIONS"], maxAge: 600 }));

app.post("/preview", async (c) => {
  const rawBody = await readSignedBody(c);
  let invoiceId: number;
  try {
    invoiceId = Number((JSON.parse(rawBody) as { invoiceId?: unknown }).invoiceId);
  } catch {
    return c.json({ error: "Body is not valid JSON." }, 400);
  }
  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) return c.json({ error: "`invoiceId` must be a positive whole number." }, 400);

  try {
    const [invoice] = await db<InvoiceRow & { paid_at?: string | null }>("GET", `invoices?invoice_id=eq.${invoiceId}&select=${INVOICE_COLUMNS},paid_at`);
    if (!invoice) return c.json({ error: `There is no invoice #${invoiceId}.` }, 404);

    const clientName = invoice.client_name?.replace(/[\r\n]+/g, " ").trim() || "Client";
    const invoiceTitle = invoice.invoice_title?.replace(/[\r\n]+/g, " ").trim() || undefined;
    const amount = `$${(amountCents(invoice) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const id = String(invoice.invoice_id);
    const paidOn = new Date(invoice.paid_at ?? Date.now()).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
    // The button only shows on an unpaid invoice that has a link, exactly as in a real send.
    const payUrl = invoice.status !== "paid" && invoice.payment_link_url ? invoice.payment_link_url : undefined;

    return c.json({
      status: "ok",
      to: invoice.client_email || null,
      previews: [
        { kind: "invoice", label: "Invoice email", subject: `Invoice #${id} from CodeWithAli`, html: await render(InvoiceEmail({ clientName, invoiceId: id, invoiceTitle, amount, payUrl })) },
        { kind: "receipt", label: "Payment receipt", subject: `Payment received for invoice #${id}`, html: await render(PaymentReceivedEmail({ clientName, invoiceId: id, invoiceTitle, amount, paidOn })) },
      ],
    });
  } catch (e) {
    if (e instanceof UpstreamError) return c.json({ error: "The database refused the request.", providerCode: e.message }, 502);
    return c.json({ error: e instanceof Error ? e.message : "The preview could not be made." }, 500);
  }
});

export const POST = handle(app);
export const OPTIONS = handle(app);

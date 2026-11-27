/**
 * POST /api/email/invoice
 *
 * Sends a client their invoice, with the PDF attached, on behalf of the
 * Takeover desktop app. The app used to send this itself with a Resend key
 * read from a local .env file, which does not exist in an installed build,
 * so it only worked on a developer's machine. The key stays here instead.
 *
 * Auth: the same signed request as /api/email/offer-letter (see ../signedRequest.ts).
 *
 * The signing secret is built into the desktop app, so a signature only
 * proves "this came from a Takeover build", not who sent it. What this route
 * will send is therefore kept narrow:
 *   · the email is built here, from emails/invoice.tsx. The body carries fields, never HTML.
 *   · the sender is fixed here. It is not taken from the body.
 *   · one recipient.
 *   · the attachment must be a real PDF, at most MAX_PDF_BYTES.
 *
 * Body:
 *   {
 *     "to": "client@example.com",
 *     "subject": "New Invoice",              optional, defaults to "Invoice #<id> from CodeWithAli"
 *     "clientName": "Edward Palm",
 *     "invoiceId": 1042,
 *     "invoiceTitle": "Website hosting",     optional
 *     "amount": "$45.00",                    optional
 *     "attachment": { "contentBase64": "<the PDF>" }
 *   }
 *
 * Responses:
 *   200 { "status": "sent", "messageId": "..." }
 *   400 { "error": "..." }                   a field failed a check
 *   401 { "message": "..." }                 signature or timestamp
 *   502 { "error": "...", "providerCode": "..." }   Resend refused
 */

import { Hono } from "hono";
import { handle } from "hono/vercel";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { render } from "@react-email/render";
import InvoiceEmail from "../../../../../emails/invoice";
import { getResend, readSignedBody } from "../signedRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The only address invoices are sent from. */
const FROM = "CodeWithAli <mailer@codewithali.com>";
/** Largest PDF accepted. Vercel caps a request body at 4.5 MB and base64 adds a third, so 3 MB is what fits. */
const MAX_PDF_BYTES = 3 * 1024 * 1024;

interface InvoiceEmailParams {
  to: string;
  subject?: string;
  clientName: string;
  invoiceId: number | string;
  invoiceTitle?: string;
  amount?: string;
  attachment: { contentBase64: string };
}

/**
 * A short single-line text field, or null if it is not one.
 * @param v The value from the body.
 * @param max The most characters allowed.
 */
function line(v: unknown, max: number): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  return s && s.length <= max && !/[\r\n]/.test(s) ? s : null;
}

const app = new Hono().basePath("/api/email");

app.use("/*", logger());
// Same as the offer-letter route: access is gated by the signature, not by origin, and the Tauri webview's origin differs between dev and an installed build.
app.use("/*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization", "timestamp"], allowMethods: ["POST", "OPTIONS"], maxAge: 600 }));

app.post("/invoice", async (c) => {
  const rawBody = await readSignedBody(c);

  let body: Partial<InvoiceEmailParams>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Body is not valid JSON." }, 400);
  }

  // ── Fields ──
  const to = line(body.to, 254);
  if (!to || !/^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(to)) {
    return c.json({ error: "`to` must be one email address." }, 400);
  }
  const clientName = line(body.clientName, 120);
  if (!clientName) return c.json({ error: "`clientName` is required (one line, up to 120 characters)." }, 400);
  const invoiceId = line(body.invoiceId, 40);
  if (!invoiceId || !/^[\w-]+$/.test(invoiceId)) return c.json({ error: "`invoiceId` is required (letters, digits, dash)." }, 400);
  const invoiceTitle = body.invoiceTitle == null || body.invoiceTitle === "" ? undefined : line(body.invoiceTitle, 200);
  if (invoiceTitle === null) return c.json({ error: "`invoiceTitle` must be one line, up to 200 characters." }, 400);
  const amount = body.amount == null || body.amount === "" ? undefined : line(body.amount, 40);
  if (amount === null) return c.json({ error: "`amount` must be one line, up to 40 characters." }, 400);
  const subject = body.subject == null || body.subject === "" ? `Invoice #${invoiceId} from CodeWithAli` : line(body.subject, 200);
  if (subject === null) return c.json({ error: "`subject` must be one line, up to 200 characters." }, 400);

  // ── The PDF ──
  const b64 = body.attachment?.contentBase64;
  if (typeof b64 !== "string" || !b64) return c.json({ error: "`attachment.contentBase64` is required." }, 400);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return c.json({ error: "`attachment.contentBase64` is not base64." }, 400);
  const pdf = Buffer.from(b64, "base64");
  if (pdf.length > MAX_PDF_BYTES) return c.json({ error: `The PDF is larger than ${MAX_PDF_BYTES / 1024 / 1024} MB.` }, 400);
  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") return c.json({ error: "The attachment is not a PDF." }, 400);

  // ── Build the email here ──
  const text = [
    `Dear ${clientName},`,
    "",
    "Attached you will find your invoice as a PDF.",
    "",
    `Invoice: #${invoiceId}`,
    ...(invoiceTitle ? [`For: ${invoiceTitle}`] : []),
    ...(amount ? [`Amount: ${amount}`] : []),
    "",
    "Questions about this invoice? Reach us at unfold@codewithali.com or +1 (408) 690 4009.",
    "This email is auto-generated. Please do not reply directly.",
  ].join("\n");

  let html = "";
  try {
    html = await render(InvoiceEmail({ clientName, invoiceId, invoiceTitle, amount }));
  } catch (e) {
    // The plain-text body still goes out if rendering fails.
    console.error("[invoice] react-email render failed:", e);
  }

  try {
    const { data, error } = await getResend().emails.send({
      from: FROM,
      to: [to],
      subject,
      html: html || undefined,
      text,
      attachments: [{ filename: `Invoice-${invoiceId}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
    if (error) return c.json({ error: "Resend rejected the request.", providerCode: error.message }, 502);
    if (!data?.id) return c.json({ error: "Resend returned no message id." }, 502);
    return c.json({ status: "sent", messageId: data.id });
  } catch (e) {
    return c.json({ error: "Resend send failed.", providerCode: e instanceof Error ? e.message : String(e) }, 502);
  }
});

export const POST = handle(app);
export const OPTIONS = handle(app);

/**
 * Payment received: the email a client gets when their invoice has been paid online.
 *
 * Rendered on the server by the /api/stripe/webhook route, once, the first
 * time Stripe reports the payment. It reads as a receipt: the amount, a
 * thank you, and the facts in rows.
 *
 * This component is stateless and only presentational. Who it goes to and
 * the sender are decided at the route.
 */

import { Link } from "react-email";
import * as React from "react";
import { Amount, COLORS, Facts, Frame, Para, Small } from "./_parts";

export interface PaymentReceivedEmailProps {
  /** The client's name, for the greeting. */
  clientName: string;
  /** The invoice number shown to the client. */
  invoiceId: string;
  /** What the invoice was for. Optional. */
  invoiceTitle?: string;
  /** The amount paid as text, already formatted ("$350.00"). */
  amount: string;
  /** The day it was paid, already formatted ("November 26, 2026"). */
  paidOn: string;
}

const CONTACT_EMAIL = "unfold@codewithali.com";
const CONTACT_PHONE = "+1 (408) 690 4009";

export default function PaymentReceivedEmail({ clientName, invoiceId, invoiceTitle, amount, paidOn }: PaymentReceivedEmailProps) {
  const rows: [string, string][] = [["Invoice", `#${invoiceId}`]];
  if (invoiceTitle) rows.push(["For", invoiceTitle]);
  rows.push(["Amount paid", amount], ["Date", paidOn], ["Method", "Card, through Stripe"], ["Balance due", "$0.00"]);

  return (
    <Frame preview={`We received your payment of ${amount} for invoice #${invoiceId}. Thank you.`} brand="CodeWithAli" footer="CodeWithAli · codewithali.com · This email was sent automatically.">
      <Amount status="Payment received" amount={amount} />
      <Para>{`Thank you, ${clientName}. Your payment for invoice #${invoiceId} has gone through and nothing more is owed on it. Keep this email as your receipt.`}</Para>
      <Facts rows={rows} />
      <Small>
        Questions about this payment? Write to{" "}
        <Link href={`mailto:${CONTACT_EMAIL}`} style={{ color: COLORS.brand, textDecoration: "none" }}>
          {CONTACT_EMAIL}
        </Link>
        {` or call ${CONTACT_PHONE}.`}
      </Small>
    </Frame>
  );
}

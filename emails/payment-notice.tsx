/**
 * Payment notice: the email the founders get when a client pays an invoice online.
 *
 * Rendered on the server by the /api/stripe/webhook route, once, the first
 * time Stripe reports the payment. Short on purpose: how much, who, for what,
 * and a way straight to the payment in Stripe.
 *
 * This component is stateless and only presentational.
 */

import * as React from "react";
import { Action, Amount, Facts, Frame, Para, Small } from "./_parts";

export interface PaymentNoticeEmailProps {
  /** Who paid: the client's name on the invoice. */
  clientName: string;
  /** The invoice number. */
  invoiceId: string;
  /** What the invoice was for. Optional. */
  invoiceTitle?: string;
  /** The amount paid as text, already formatted ("$350.00"). */
  amount: string;
  /** The day it was paid, already formatted. */
  paidOn: string;
  /** Stripe's id for the charge. */
  reference: string;
  /** Where the client's confirmation went, or undefined if none could be sent. */
  clientEmail?: string;
  /** False for a payment made in Stripe's sandbox, which is said plainly so test money is never mistaken for real money. */
  live: boolean;
}

export default function PaymentNoticeEmail({ clientName, invoiceId, invoiceTitle, amount, paidOn, reference, clientEmail, live }: PaymentNoticeEmailProps) {
  const rows: [string, string][] = [["Client", clientName], ["Invoice", `#${invoiceId}`]];
  if (invoiceTitle) rows.push(["For", invoiceTitle]);
  rows.push(["Paid on", paidOn], ["Receipt sent to", clientEmail ?? "Not sent: no valid address on the invoice"]);

  return (
    <Frame preview={`${clientName} paid invoice #${invoiceId}: ${amount}`} brand="Takeover" footer={`Sent by Takeover when Stripe reports a payment. Reference ${reference}.`}>
      <Amount status={live ? "Invoice paid" : "Invoice paid (sandbox, no real money)"} amount={amount} />
      <Para>{`${clientName} paid invoice #${invoiceId} through Stripe. It is marked as paid in Takeover and on the client's timeline.`}</Para>
      <Facts rows={rows} />
      <Action href={`https://dashboard.stripe.com/${live ? "" : "test/"}payments/${reference}`}>View the payment in Stripe</Action>
      <Small>The money reaches your bank on Stripe&apos;s usual payout schedule.</Small>
    </Frame>
  );
}

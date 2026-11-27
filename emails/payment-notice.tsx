/**
 * Payment notice: the email the founders get when a client pays an invoice online.
 *
 * Rendered on the server by the /api/stripe/webhook route, once, the first
 * time Stripe reports the payment. Short on purpose: who paid, how much, for what.
 *
 * This component is stateless and only presentational.
 */

import { Html, Head, Body, Container, Section, Text, Preview } from "react-email";
import * as React from "react";

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
  /** Stripe's id for the charge, to find it in the Stripe dashboard. */
  reference: string;
}

const BRAND = { label: "Takeover", primary: "#b91c1c", paid: "#047857" };

export default function PaymentNoticeEmail({ clientName, invoiceId, invoiceTitle, amount, paidOn, reference }: PaymentNoticeEmailProps) {
  const facts: [string, string][] = [["Client", clientName], ["Invoice", `#${invoiceId}`]];
  if (invoiceTitle) facts.push(["For", invoiceTitle]);
  facts.push(["Paid on", paidOn], ["Stripe", reference]);

  return (
    <Html lang="en">
      <Head />
      <Preview>{`${clientName} paid invoice #${invoiceId}: ${amount}`}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={{ ...styles.accentBar, background: BRAND.primary }} />
          <Section style={styles.content}>
            <Text style={{ ...styles.brandLabel, color: BRAND.primary }}>{BRAND.label}</Text>
            <Text style={{ ...styles.amount, color: BRAND.paid }}>{amount}</Text>
            <Text style={styles.paragraph}>
              {clientName} paid invoice #{invoiceId} through Stripe. It is marked as paid in Takeover and on the client&apos;s timeline.
            </Text>
            <Section style={styles.facts}>
              {facts.map(([k, v]) => (
                <Text key={k} style={styles.fact}>
                  <span style={styles.factLabel}>{k}</span>
                  {v}
                </Text>
              ))}
            </Section>
            <Text style={styles.small}>The client was sent a payment confirmation at the same time.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    margin: 0,
    padding: "32px 16px",
    background: "#f4f4f5",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    color: "#171717",
  },
  container: { maxWidth: "520px", margin: "0 auto", background: "#ffffff", borderRadius: "12px", overflow: "hidden" },
  accentBar: { height: "4px", lineHeight: "4px", fontSize: "0", padding: 0 },
  content: { padding: "24px 32px 24px 32px" },
  brandLabel: { fontSize: "13px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: 0 },
  amount: { fontSize: "32px", fontWeight: 700, lineHeight: 1.2, margin: "12px 0 8px 0" },
  paragraph: { fontSize: "15px", lineHeight: 1.55, margin: "0 0 14px 0", color: "#171717" },
  facts: { margin: "6px 0 14px 0", padding: "12px 16px", background: "#fafafa", borderLeft: "3px solid #047857" },
  fact: { fontSize: "14px", lineHeight: 1.5, margin: "0 0 4px 0", color: "#171717" },
  factLabel: { display: "inline-block", width: "72px", color: "#737373", fontSize: "12px" },
  small: { fontSize: "13px", lineHeight: 1.5, margin: 0, color: "#525252" },
};

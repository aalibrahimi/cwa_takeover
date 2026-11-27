/**
 * Payment received: the email a client gets when their invoice has been paid online.
 *
 * Rendered on the server by the /api/stripe/webhook route, once, the first
 * time Stripe reports the payment. Same look as emails/invoice.tsx.
 *
 * This component is stateless and only presentational. Who it goes to and
 * the sender are decided at the route.
 */

import { Html, Head, Body, Container, Section, Text, Hr, Preview, Link } from "react-email";
import * as React from "react";

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

const BRAND = {
  label: "CodeWithAli",
  primary: "#b91c1c",
  paid: "#047857",
  contactEmail: "unfold@codewithali.com",
  contactPhone: "+1 (408) 690 4009",
  footerNote: "Sent from CodeWithAli · codewithali.com",
};

export default function PaymentReceivedEmail({ clientName, invoiceId, invoiceTitle, amount, paidOn }: PaymentReceivedEmailProps) {
  const facts: [string, string][] = [["Invoice", `#${invoiceId}`]];
  if (invoiceTitle) facts.push(["For", invoiceTitle]);
  facts.push(["Paid", amount], ["On", paidOn], ["By", "Card, through Stripe"]);

  return (
    <Html lang="en">
      <Head />
      <Preview>{`Payment received for invoice #${invoiceId}. Thank you.`}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={{ ...styles.accentBar, background: BRAND.primary }} />

          <Section style={styles.header}>
            <Text style={{ ...styles.brandLabel, color: BRAND.primary }}>{BRAND.label}</Text>
          </Section>

          <Section style={styles.content}>
            <Text style={{ ...styles.status, color: BRAND.paid }}>Payment received</Text>
            <Text style={styles.paragraph}>Dear {clientName},</Text>
            <Text style={styles.paragraph}>
              We have received your payment of {amount} for invoice #{invoiceId}. Thank you. Nothing more is owed on this invoice.
            </Text>

            <Section style={{ ...styles.facts, borderLeft: `3px solid ${BRAND.paid}` }}>
              {facts.map(([k, v]) => (
                <Text key={k} style={styles.fact}>
                  <span style={styles.factLabel}>{k}</span>
                  {v}
                </Text>
              ))}
            </Section>

            <Hr style={styles.rule} />

            <Text style={styles.small}>
              Questions about this payment? Reach us at{" "}
              <Link href={`mailto:${BRAND.contactEmail}`} style={{ color: BRAND.primary }}>
                {BRAND.contactEmail}
              </Link>{" "}
              or {BRAND.contactPhone}.
            </Text>
            <Text style={styles.small}>This email is auto-generated. Please do not reply directly.</Text>
          </Section>

          <Section style={styles.footer}>
            <Text style={styles.footerText}>{BRAND.footerNote}</Text>
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
  container: { maxWidth: "600px", margin: "0 auto", background: "#ffffff", borderRadius: "12px", overflow: "hidden" },
  accentBar: { height: "4px", lineHeight: "4px", fontSize: "0", padding: 0 },
  header: { padding: "24px 32px 8px 32px" },
  brandLabel: { fontSize: "13px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: 0 },
  content: { padding: "8px 32px 24px 32px" },
  status: { fontSize: "22px", fontWeight: 700, lineHeight: 1.3, margin: "4px 0 16px 0" },
  paragraph: { fontSize: "15px", lineHeight: 1.55, margin: "0 0 14px 0", color: "#171717" },
  facts: { margin: "6px 0 4px 0", padding: "12px 16px", background: "#fafafa" },
  fact: { fontSize: "14px", lineHeight: 1.5, margin: "0 0 4px 0", color: "#171717" },
  factLabel: { display: "inline-block", width: "72px", color: "#737373", fontSize: "12px" },
  rule: { border: "none", borderTop: "1px solid #e5e5e5", margin: "20px 0 16px 0" },
  small: { fontSize: "13px", lineHeight: 1.5, margin: "0 0 8px 0", color: "#525252" },
  footer: { padding: "16px 32px 24px 32px", background: "#fafafa" },
  footerText: { fontSize: "12px", color: "#737373", margin: 0 },
};

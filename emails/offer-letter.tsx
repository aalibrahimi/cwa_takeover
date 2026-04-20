/**
 * OfferLetter — React Email component rendered by Resend.
 *
 * Resend's `react:` field takes a React element, renders it server-
 * side with proper email-client CSS inlining, and delivers clean HTML
 * (Outlook tested, thanks Resend). Fallback plain-text is auto-
 * generated if not passed explicitly.
 *
 * Brand variants:
 *   · codeWithAli     → red accent
 *   · simplicityFunds → emerald accent
 *
 * This component is stateless + purely presentational. Business
 * decisions (what subject, who the sender is, attachments) live at
 * the route layer.
 */

import {
  Html, Head, Body, Container, Section, Text, Button, Hr, Preview,
} from "react-email";
import * as React from "react";

export type Brand = "codeWithAli" | "simplicityFunds";

export interface OfferLetterProps {
  candidateName: string;
  positionTitle: string;
  employerLegalName: string;
  brand: Brand;
  /** The prose body of the email. Free text, will be split into
   *  paragraphs (blank-line separated). Write naturally in first
   *  person — "we're excited to offer you…". */
  body: string;
  /** The candidate's unique accept-offer URL. Renders as a button. */
  acceptUrl: string;
}

const BRAND_CONFIG: Record<Brand, {
  label: string;
  primary: string;
  accent: string;
  footerNote: string;
}> = {
  codeWithAli: {
    label: "CodeWithAli LLC",
    primary: "#b91c1c",
    accent: "#dc2626",
    footerNote: "Sent from CodeWithAli · codewithali.com",
  },
  simplicityFunds: {
    label: "Simplicity Funds",
    primary: "#047857",
    accent: "#10b981",
    footerNote: "Sent from Simplicity Funds",
  },
};

export default function OfferLetter({
  candidateName,
  positionTitle,
  employerLegalName,
  brand,
  body,
  acceptUrl,
}: OfferLetterProps) {
  const config = BRAND_CONFIG[brand] ?? BRAND_CONFIG.codeWithAli;
  const paragraphs = (body || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <Html lang="en">
      <Head />
      <Preview>{`Your offer from ${employerLegalName}`}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={{ ...styles.accentBar, background: config.primary }} />

          <Section style={styles.header}>
            <Text style={{ ...styles.brandLabel, color: config.primary }}>
              {config.label}
            </Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.paragraph}>
              Hi <strong>{candidateName}</strong>,
            </Text>

            <Text style={styles.paragraph}>
              We're excited to offer you the{" "}
              <strong>{positionTitle}</strong> role at{" "}
              <strong>{employerLegalName}</strong>.
            </Text>

            {paragraphs.map((p, i) => (
              <Text key={i} style={styles.paragraph}>
                {p}
              </Text>
            ))}

            <Text style={styles.paragraph}>
              The full offer letter is attached as a PDF. When you're ready,
              review and respond using the secure link below:
            </Text>

            <Section style={styles.buttonRow}>
              <Button
                href={acceptUrl}
                style={{ ...styles.button, background: config.accent }}
              >
                Review &amp; Respond
              </Button>
            </Section>

            <Text style={styles.fineprint}>
              This link is unique to you — please don't forward it.
            </Text>

            <Text style={styles.paragraph}>
              Any questions, just reply to this email.
            </Text>

            <Text style={styles.paragraph}>
              Welcome aboard,
              <br />
              {employerLegalName}
            </Text>
          </Section>

          <Hr style={styles.divider} />

          <Section style={styles.footer}>
            <Text style={styles.footerText}>{config.footerNote}</Text>
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
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    color: "#171717",
  },
  container: {
    maxWidth: "600px",
    margin: "0 auto",
    background: "#ffffff",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  accentBar: {
    height: "4px",
    lineHeight: "4px",
    fontSize: "0",
    padding: 0,
  },
  header: {
    padding: "24px 32px 8px 32px",
  },
  brandLabel: {
    fontSize: "13px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    margin: 0,
  },
  content: {
    padding: "8px 32px 24px 32px",
  },
  paragraph: {
    fontSize: "15px",
    lineHeight: 1.55,
    margin: "0 0 14px 0",
    color: "#171717",
  },
  buttonRow: {
    margin: "18px 0",
  },
  button: {
    display: "inline-block",
    padding: "10px 20px",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 600,
    textDecoration: "none",
    borderRadius: "8px",
  },
  fineprint: {
    fontSize: "12px",
    color: "#737373",
    margin: "0 0 14px 0",
  },
  divider: {
    borderColor: "#e5e5e5",
    margin: 0,
  },
  footer: {
    padding: "16px 32px",
  },
  footerText: {
    fontSize: "12px",
    color: "#737373",
    margin: 0,
  },
} as const;

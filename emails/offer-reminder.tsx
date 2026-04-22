/**
 * OfferReminder — friendly nudge for candidates who haven't
 * responded to their offer within the configured window (default:
 * 2 days after `emailed_at`).
 *
 * Sent by the Vercel cron at /api/cron/offer-reminders. Uses the
 * same brand-aware styling as the main offer email so the candidate
 * recognizes it as "from the same place", just shorter.
 *
 * Deliberately does NOT re-attach the offer PDF — the original
 * email still has it. A second attachment would look like a mistake
 * and might trigger spam filters. Body just points them back at
 * the accept URL.
 */

import {
  Html, Head, Body, Container, Section, Text, Button, Hr, Preview, Link,
} from "react-email";
import * as React from "react";

export type Brand = "codeWithAli" | "simplicityFunds";

export interface OfferReminderProps {
  candidateName: string;
  positionTitle: string;
  employerLegalName: string;
  brand: Brand;
  acceptUrl: string;
  /** ISO string of when the original offer email was sent. Used in
   *  the body copy so the candidate has a concrete reference point. */
  sentAt: string;
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

export default function OfferReminder({
  candidateName,
  positionTitle,
  employerLegalName,
  brand,
  acceptUrl,
  sentAt,
}: OfferReminderProps) {
  const config = BRAND_CONFIG[brand] ?? BRAND_CONFIG.codeWithAli;

  // Humanize the "we sent it X ago" phrasing — we don't have a
  // date library in this template and don't want to pull one in
  // just for a single sentence.
  const sentWhen = (() => {
    const ms = Date.now() - Date.parse(sentAt);
    if (!Number.isFinite(ms) || ms < 0) return "recently";
    const days = Math.round(ms / (1000 * 60 * 60 * 24));
    if (days <= 0) return "earlier today";
    if (days === 1) return "yesterday";
    return `${days} days ago`;
  })();

  return (
    <Html lang="en">
      <Head />
      <Preview>{`Friendly reminder — your offer from ${employerLegalName}`}</Preview>
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
              Just a friendly nudge — we sent you an offer for the{" "}
              <strong>{positionTitle}</strong> role at{" "}
              <strong>{employerLegalName}</strong> {sentWhen}, and we
              haven't heard back yet.
            </Text>

            <Text style={styles.paragraph}>
              No pressure. If you need more time to think it over,
              take it. If you have questions, just reply to this
              email and we'll jump on a call.
            </Text>

            <Text style={styles.paragraph}>
              Whenever you're ready, your accept link is below:
            </Text>

            <Section style={styles.buttonRow}>
              <Button
                href={acceptUrl}
                style={{ ...styles.button, background: config.accent }}
              >
                Review &amp; Respond
              </Button>
            </Section>

            <Text style={styles.fallbackLabel}>
              Or copy &amp; paste this link into your browser:
            </Text>
            <Text style={styles.fallbackUrl}>
              <Link href={acceptUrl} style={{ ...styles.fallbackLink, color: config.primary }}>
                {acceptUrl}
              </Link>
            </Text>

            <Text style={styles.fineprint}>
              This link is unique to you — please don't forward it.
            </Text>

            <Text style={styles.paragraph}>
              Looking forward to hearing from you,
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
    margin: "22px 0 10px 0",
    textAlign: "center" as const,
  },
  button: {
    display: "inline-block",
    padding: "14px 28px",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: 700,
    textDecoration: "none",
    borderRadius: "10px",
    letterSpacing: "0.01em",
  },
  fallbackLabel: {
    fontSize: "12px",
    color: "#737373",
    margin: "12px 0 4px 0",
  },
  fallbackUrl: {
    fontSize: "12px",
    lineHeight: 1.4,
    wordBreak: "break-all" as const,
    margin: "0 0 16px 0",
    padding: "8px 10px",
    background: "#f4f4f5",
    borderRadius: "6px",
  },
  fallbackLink: {
    textDecoration: "underline",
    wordBreak: "break-all" as const,
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

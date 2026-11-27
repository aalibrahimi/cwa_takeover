/**
 * Shared pieces for the money emails (payment received, payment notice), so
 * they look like one family: a quiet page, one white card, a small brand
 * line, and facts set out as rows with hairlines between them.
 *
 * Everything is inline-styled tables and text, because that is what email
 * clients render reliably.
 */

import { Html, Head, Body, Container, Section, Text, Preview, Link } from "react-email";
import * as React from "react";

export const COLORS = {
  brand: "#b91c1c",
  paid: "#047857",
  ink: "#111113",
  ink2: "#52525b",
  ink3: "#8a8a93",
  line: "#ececef",
  page: "#f6f6f7",
  card: "#ffffff",
};

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * The page and the card every money email sits in.
 * @param preview The line shown next to the subject in an inbox.
 * @param brand The small brand line at the top of the card.
 * @param footer One quiet line under the card.
 * @param children The email's content.
 */
export function Frame({ preview, brand, footer, children }: { preview: string; brand: string; footer: string; children: React.ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: "40px 16px", background: COLORS.page, fontFamily: FONT, color: COLORS.ink }}>
        <Container style={{ maxWidth: "520px", margin: "0 auto" }}>
          <Section style={{ background: COLORS.card, border: `1px solid ${COLORS.line}`, borderTop: `3px solid ${COLORS.brand}`, borderRadius: "10px", padding: "32px 36px 30px 36px" }}>
            <Text style={{ margin: 0, fontSize: "12px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.brand }}>{brand}</Text>
            {children}
          </Section>
          <Text style={{ margin: "18px 0 0 0", fontSize: "12px", lineHeight: 1.5, color: COLORS.ink3, textAlign: "center" }}>{footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}

/**
 * The headline of a money email: a small status word, then the amount, large.
 * @param status The word above the amount ("Payment received").
 * @param amount The amount, already formatted ("$850.00").
 */
export function Amount({ status, amount }: { status: string; amount: string }) {
  return (
    <>
      <Text style={{ margin: "26px 0 0 0", fontSize: "13px", fontWeight: 600, color: COLORS.paid }}>{`✓  ${status}`}</Text>
      <Text style={{ margin: "4px 0 0 0", fontSize: "40px", fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.02em", color: COLORS.ink }}>{amount}</Text>
    </>
  );
}

/**
 * A paragraph of body text.
 * @param children One string. Build it as a single string so no space is lost between the words and a value.
 */
export function Para({ children }: { children: string }) {
  return <Text style={{ margin: "14px 0 0 0", fontSize: "15px", lineHeight: 1.6, color: COLORS.ink2 }}>{children}</Text>;
}

/**
 * Facts as rows: a quiet label on the left, the value on the right, a hairline between rows.
 * @param rows Label and value pairs, in the order to show them.
 */
export function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: "100%", margin: "24px 0 0 0", borderCollapse: "collapse", borderTop: `1px solid ${COLORS.line}` }}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td style={{ padding: "11px 0", borderBottom: `1px solid ${COLORS.line}`, fontSize: "13px", color: COLORS.ink3, width: "38%", verticalAlign: "top" }}>{label}</td>
            <td style={{ padding: "11px 0", borderBottom: `1px solid ${COLORS.line}`, fontSize: "14px", fontWeight: 500, color: COLORS.ink, textAlign: "right", verticalAlign: "top" }}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * One button.
 * @param href Where it goes.
 * @param children Its label.
 */
export function Action({ href, children }: { href: string; children: string }) {
  return (
    <Section style={{ margin: "24px 0 0 0" }}>
      <Link href={href} style={{ display: "inline-block", padding: "11px 20px", background: COLORS.ink, color: "#ffffff", fontSize: "14px", fontWeight: 600, textDecoration: "none", borderRadius: "6px" }}>
        {children}
      </Link>
    </Section>
  );
}

/**
 * Small print at the bottom of the card.
 * @param children The text, with any links.
 */
export function Small({ children }: { children: React.ReactNode }) {
  return <Text style={{ margin: "22px 0 0 0", fontSize: "13px", lineHeight: 1.55, color: COLORS.ink3 }}>{children}</Text>;
}

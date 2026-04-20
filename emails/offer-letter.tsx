// emails/offer-letter.tsx
import { Button, Html, Head, Body } from "react-email";
import * as React from "react";

export default function OfferLetter(body: string) {
  return (
    <Html>
      <Head />
      <Body>
        <Button
          href="https://example.com"
          style={{ background: "#000", color: "#fff", padding: "12px 20px" }}
        >
          Click me
        </Button>
      </Body>
    </Html>
  );
}
# Invoice email route

Added 2026-11-26. Not committed and not deployed yet.

## What this adds

`POST /api/email/invoice` lets the Takeover desktop app email a client their
invoice with the PDF attached. The Resend key stays on this website.

## Why

The desktop app used to send invoice email itself, with a Resend key read from
`src-tauri/.env`. That file is not part of an installed build, so sending
worked in `tauri dev` and failed silently everywhere else. Offer letters
already go through this website; invoices now do the same.

The full background and the app-side change are in the app repo:
`CWA-Manager/docs/INVOICE_EMAIL_VIA_WEBSITE.md`.

## Files

| File | What it is |
|---|---|
| `src/app/api/email/invoice/route.ts` | The route. |
| `src/app/api/email/signedRequest.ts` | The signature and timestamp check, plus the Resend client, as shared functions. |
| `emails/invoice.tsx` | The email, as a React Email component. |

Nothing existing was changed. `offer-letter/route.ts` still does its own copy
of the signature check; it can call `readSignedBody` from `signedRequest.ts`
later, but I left a working route alone.

## Request

Headers are the same as the offer-letter route: `Authorization: Bearer <sig>`,
`timestamp`, `content-type: application/json`.

```json
{
  "to": "client@example.com",
  "subject": "New Invoice",
  "clientName": "Edward Palm",
  "invoiceId": 1042,
  "invoiceTitle": "Website hosting, November",
  "amount": "$45.00",
  "attachment": { "contentBase64": "<the PDF>" }
}
```

`subject`, `invoiceTitle` and `amount` are optional.

## Responses

- `200 {"status":"sent","messageId":"..."}`
- `400 {"error":"..."}` a field failed a check
- `401 {"message":"..."}` bad or missing signature, or a timestamp more than 5 minutes off
- `502 {"error":"...","providerCode":"..."}` Resend refused

## What the route will and will not send

The signing secret is built into the desktop app, so anyone with the installer
can read it. A valid signature only proves the request came from a Takeover
build. The route is kept narrow so it cannot be used to send arbitrary mail
from the domain:

- The email is built here from `emails/invoice.tsx`. The body carries fields,
  never HTML. Extra fields such as `html` or `from` are ignored.
- The sender is fixed: `CodeWithAli <mailer@codewithali.com>`.
- One recipient. Commas, semicolons and a second address are rejected.
- Text fields are one line each, with length limits, so a header cannot be
  smuggled in through the subject.
- The attachment must start with `%PDF-` and be at most 3 MB. Vercel caps a
  request body at 4.5 MB and base64 adds a third, so 3 MB is what fits.

The offer-letter route does not have these limits: it takes the sender and any
number of recipients from the body. It is worth tightening the same way.

## Env

No new variables. It uses `EMAIL_HMAC_SECRET` and `RESEND_API_KEY`
(or `RESEND_EMAIL_KEY`), which the offer-letter route already needs.

## Tested

Run locally against the route's handler with a made-up secret and a fake
Resend key:

| Case | Result |
|---|---|
| Wrong signature | 401 |
| Signature made with a different secret | 401 |
| Timestamp 10 minutes old | 401 |
| Two recipients | 400 |
| Newline in the subject | 400 |
| Attachment that is not a PDF | 400 |
| PDF over 3 MB | 400 |
| Missing client name | 400 |
| Valid request with extra `html` and `from` fields | passed every check and reached Resend, which refused the fake key (502) |

`tsc --noEmit` on this repo: 0 errors.

Not tested: a real send. That needs the real key, so it has to be done on a
Vercel preview or production deploy.

## To ship

1. Commit the three files and push. Vercel builds a preview.
2. On the preview: `curl -i -X POST <preview>/api/email/invoice -H "Authorization: Bearer <64 zeros>" -H "timestamp: <now, ISO>" -d "{}"` should give 401. That shows the route is live and the check runs.
3. Promote to production.
4. In the desktop app, send an invoice to yourself. The app already tries this
   route first and falls back to its old way only when the route answers 404.

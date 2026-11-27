# Stripe routes for the Takeover desktop app

Written 2026-11-26. Two routes that let an invoice raised in the Takeover
desktop app be paid by card and marked as paid without anyone doing it by
hand.

## The whole path, in order

```
Takeover desktop app                 this site (Vercel)                 Stripe                Supabase (company project)
────────────────────                 ──────────────────                 ──────                ──────────────────────────
1. "Send invoice" or
   "Payment link" on an invoice
        │  POST /api/stripe/payment-link   { invoiceId }
        │  signed with EMAIL_HMAC_SECRET
        ├────────────────────────────────►│ 2. read invoice #N ─────────────────────────────────────────►│ invoices
        │                                 │ 3. POST /v1/prices, /v1/payment_links ──►│
        │                                 │ 4. save link id, url, amount ────────────────────────────────►│ invoices
        │◄────────────── { url } ─────────┤
5. link goes in the invoice email
   (POST /api/email/invoice, payUrl)
   or is copied to the clipboard
                                                                        6. client pays
                                          │◄── POST /api/stripe/webhook ─┤ checkout.session.completed
                                          │    signed with STRIPE_WEBHOOK_SECRET
                                          │ 7. check amount, look up the charge ─►│
                                          │ 8. invoice → paid, paid_at, "stripe", charge id ─────────────►│ invoices
                                          │ 9. line on the client's timeline ────────────────────────────►│ client_activity
                                          │ 10. switch the link off ─────────────►│
                                          │ 11. two emails through Resend: "payment received" to the client,
                                          │     and a notice to the founders
12. the desktop app shows the invoice as paid
    the next time it reads the database
```

## Why it is built this way

- **The Stripe secret key stays on the server.** The desktop app is an
  installer anyone on the team can unpack, so no key that can move money is
  put in it.
- **The desktop app sends an invoice number and nothing else.** The amount
  and description are read from the invoice row here. The signing secret is
  built into the app, so a signature only proves "a Takeover build sent
  this". The worst a forged request can do is create the correct payment
  link for a real unpaid invoice.
- **A payment link, not a checkout session.** A session expires within a day.
  An invoice may be paid weeks later. The link is limited to one completed
  payment and is switched off once paid.
- **One link per amount.** If the invoice's amount changes, the next request
  makes a new link and switches the old one off. The webhook only accepts a
  payment of exactly the amount the stored link was made for. Anything else
  is written on the client's timeline for a person to look at.
- **Safe to receive twice.** Stripe retries webhooks. The update only
  matches an invoice that is still pending, so a repeat changes nothing.
- **The charge id is the reference.** The desktop app's Money page lists
  Stripe payments by charge id (`ch_...`) and uses it to show a paid invoice
  and its Stripe payment as one row, not two.
- **Emails go out once.** They are sent only after the update that marked
  the invoice as paid actually changed a row, so a repeated webhook sends
  nothing. The client's address comes from the invoice. The founders are
  everyone in the `employee` table at COO rank or above. If an email cannot
  be sent the payment still stands and the failure is logged; Stripe is not
  asked to retry, since that would not send the email either.
- **No new package.** Stripe and Supabase are both called with `fetch`, and
  the webhook signature is checked with Node's own `crypto`.

## Files

| File | What it is |
| --- | --- |
| `src/app/api/stripe/shared.ts` | Stripe and Supabase calls, the webhook signature check, the invoice fields read |
| `src/app/api/stripe/payment-link/route.ts` | `POST /api/stripe/payment-link` |
| `src/app/api/stripe/webhook/route.ts` | `POST /api/stripe/webhook` |
| `src/app/api/email/invoice/route.ts` | now accepts an optional `payUrl` (Stripe addresses only) |
| `emails/invoice.tsx` | shows a "Pay online" button when `payUrl` is given |
| `emails/payment-received.tsx` | the confirmation the client gets when the invoice is paid |
| `emails/payment-notice.tsx` | the notice the founders get |

## Setting it up (once)

1. **Database.** Run `migrations/invoices_payment_link.sql` from the
   CWA-Manager repo in the Supabase SQL editor. It adds three columns to
   `invoices`.
2. **Vercel, Environment Variables** for this project:
   - `STRIPE_SECRET_KEY`: Stripe dashboard, Developers, API keys. Use a
     restricted key if you can: write on Prices and Payment Links, read on
     PaymentIntents. Nothing else is needed.
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE`: already set for the
     offer-reminder cron. They must point at the project that has the
     `invoices` table.
   - `EMAIL_HMAC_SECRET`: already set for the email routes.
   - `RESEND_API_KEY`: already set for the email routes. The payment emails use it too.
3. **Deploy** (push to `main`).
4. **Stripe, Developers, Webhooks, Add endpoint.**
   - URL: `https://<this site>/api/stripe/webhook`
   - Events: `checkout.session.completed` and
     `checkout.session.async_payment_succeeded`
   - Copy the endpoint's signing secret (`whsec_...`) into Vercel as
     `STRIPE_WEBHOOK_SECRET`, then redeploy so the route can read it.
5. **Try it in test mode first.** With a `sk_test_` key and a test-mode
   webhook endpoint: make a link for a real unpaid invoice, pay it with card
   `4242 4242 4242 4242`, and check the invoice turns to paid in the app.
   Then mark it unpaid again and switch the two Stripe values to live ones.

## Checked before shipping

32 cases were run against the two routes with Stripe and Supabase replaced
by stand-ins: wrong and missing signatures, a stale webhook, an unknown
invoice, a paid invoice, an amount under 50 cents, a reused link, a changed
amount, a missing migration, an unrelated event, a payment that is not paid
yet, the paid path, a repeated event, a wrong amount, a wrong currency, a
lost race, the database being down, both emails going out once, a repeat
sending none, mail being refused, and a bad client address. Nothing has been run against real
Stripe yet: that is step 5 above.

## Not done here

- Refunds. A refund in Stripe does not un-mark the invoice.
- Partial payments.
- Currencies other than USD.

# nishTees — commerce backend starter

Server-authoritative checkout for a Cloudflare Pages site, using Supabase (Postgres)
and Razorpay. No Node-only APIs, so it runs on Workers.

```
nishtees-web/
├─ functions/api/
│  ├─ create-order.js         POST /api/create-order
│  └─ razorpay-webhook.js     POST /api/razorpay-webhook
├─ src/
│  ├─ lib/commerce.js         pricing, validation, HMAC, Supabase client
│  └─ components/CheckoutButton.jsx
├─ supabase/schema.sql
└─ .env.example
```

## The two rules everything else follows from

1. **The browser never sends a price.** It sends `{ sku, quantity }`. The server
   looks the price up in Postgres. Anyone can edit a JavaScript variable; nobody
   can edit your database.
2. **The webhook is the source of truth, not the browser callback.** Razorpay's
   `handler` fires in the customer's browser and can be faked with a few lines in
   the console. An order becomes `confirmed` only after the HMAC signature on the
   webhook verifies.

## Setup

### 1. Install

```bash
npm install @supabase/supabase-js
npm install -D wrangler
```

### 2. Supabase

1. Create a free project at supabase.com. Pick the Mumbai region.
2. SQL Editor → New query → paste `supabase/schema.sql` → Run.
3. Settings → API → copy the Project URL and the **service_role** key into `.dev.vars`.

The free tier pauses a project after about 7 days of inactivity. Add a Cloudflare
Cron Trigger that hits any endpoint weekly to keep it awake.

### 3. Razorpay

1. Sign up, complete KYC (PAN, GSTIN, bank proof, a live website with policy pages).
   Until KYC clears you are in **test mode** — which is exactly where you want to
   build. Test keys start `rzp_test_`.
2. Settings → API Keys → generate. Key ID and Key Secret go in `.dev.vars`.
3. Settings → Webhooks → Add:
   - URL: `https://nishtees.in/api/razorpay-webhook`
   - Secret: generate a long random string, put the same value in `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `payment.failed`, `refund.processed`

### 4. Run locally

```bash
cp .env.example .dev.vars   # then fill it in
npx wrangler pages dev .    # serves the site and /functions/api/*
```

Razorpay can't reach `localhost`, so tunnel it:

```bash
npx cloudflared tunnel --url http://localhost:8788
```

Point the webhook at the tunnel URL while developing.

### 5. Deploy

Push to GitHub, connect the repo in Cloudflare Pages, and add every variable from
`.env.example` under Settings → Environment variables. Mark all of them **Encrypted**
except `RAZORPAY_KEY_ID`.

## Test matrix

Do all of these before you take real money. Test cards are in Razorpay's docs
(`4111 1111 1111 1111` succeeds; they publish a failure card too).

| # | Scenario | Expected |
|---|---|---|
| 1 | Prepaid, card succeeds | order `confirmed`, stock down, email sent |
| 2 | Prepaid, card declined | order `payment_failed`, stock unchanged |
| 3 | Customer closes the modal | order stays `awaiting_payment`, stock unchanged |
| 4 | **Tamper with the price** in the request body | server ignores it and charges the DB price |
| 5 | Order the last piece from two browsers at once | one confirms, the other gets `OUT_OF_STOCK` |
| 6 | Replay the same webhook payload twice | second returns `already_processed`, stock down once |
| 7 | POST the webhook with a wrong signature | 401, nothing written |
| 8 | Kill the browser right after paying | webhook still confirms the order |
| 9 | COD order | `cod_unconfirmed`, stock **not** yet decremented |
| 10 | Refund from the dashboard | order `refunded`, stock restored |

Tests 4, 6 and 8 are the ones that separate a store that works from a store that
loses money quietly. Test 5 is worth automating with k6 before any drop.

## Deliberate omissions

- **No admin panel.** Use the Supabase table editor. Build one when manual editing
  actually hurts, not before.
- **COD does not reserve stock.** It decrements when you confirm the order by
  phone. Call `decrement_stock(order_id)` and set status to `confirmed` then.
  This is intentional: unconfirmed COD orders are how people accidentally sell out
  to buyers who never pay.
- **No cart on the server.** Cart lives in `localStorage`. Nothing there is trusted.

## Operational notes

- `RAZORPAY_KEY_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` must never appear in
  client-side code or in the repo. Add `.dev.vars` and `.env` to `.gitignore` now.
- Reconcile weekly: any order stuck in `awaiting_payment` for over an hour that
  Razorpay shows as captured means a webhook was missed. Handle it manually and
  find out why.
- The `webhook_events` table is your audit trail when a customer disputes a charge.
  Do not prune it.
- GST is inclusive in the displayed price: 5% up to Rs 2,500 per piece, 18% above.
  `gstRateForUnitPricePaise()` in `commerce.js` is where that threshold lives.

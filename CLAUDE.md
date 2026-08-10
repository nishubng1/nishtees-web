# nishTees — project context

Read this before making any change. It is the contract for this repo.

## What this is

A D2C storefront for nishTees, a Bangalore streetwear brand selling 240 GSM
oversized t-shirts. Single-founder business, ~4 SKUs at launch, ~₹999 price point,
Indian customers only. The founder is a performance test engineer learning
frontend development — explain unfamiliar frontend concepts briefly as you go,
but do not explain testing, HTTP, or systems concepts.

## Stack (do not substitute)

| Layer | Choice | Why it is fixed |
|---|---|---|
| Framework | Astro with React islands | Near-zero JS shipped; speed is a business requirement |
| Hosting | Cloudflare Pages + Pages Functions | Free tier permits commercial use; Vercel Hobby does not |
| Styling | Tailwind CSS | No hand-written CSS files |
| Database | Supabase (Postgres) | Free tier, Mumbai region |
| Payments | Razorpay | Orders API + Checkout + webhooks |
| Email | Resend | Free tier |
| Runtime | Cloudflare Workers | **No Node built-ins.** Use Web Crypto, `fetch`, `btoa` |

## Hard rules

1. **The browser never sends a price.** Client posts `{ sku, quantity }` only.
   Prices are read from Postgres server-side. Any code path that trusts a
   client-supplied amount is a bug, not a shortcut.
2. **The Razorpay webhook is the source of truth for payment.** The client-side
   `handler` callback is a UI hint and is forgeable. Orders reach `confirmed`
   only after HMAC-SHA256 signature verification.
3. **Never put secrets in client code.** `RAZORPAY_KEY_SECRET`,
   `RAZORPAY_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` stay in Worker env.
   `RAZORPAY_KEY_ID` is public by design.
4. **Money is integer paise everywhere.** No floats, no rupee strings in logic.
5. **No Node-only APIs** (`crypto`, `fs`, `Buffer`, `process`). They fail on Workers.
6. **No `localStorage` for anything trusted.** Cart contents only.
7. Do not add dependencies without asking. Every package is a supply-chain risk
   and a bundle-size cost on a mobile-first store.

## Existing code — extend, do not rewrite

- `supabase/schema.sql` — products, variants, orders, order_items, webhook_events,
  `decrement_stock()`, `restore_stock()`. Migrations go in new files.
- `src/lib/commerce.js` — validation, `priceCart()`, Razorpay REST, HMAC helpers.
- `functions/api/create-order.js` — prices the cart, creates Razorpay or COD order.
- `functions/api/razorpay-webhook.js` — signature check, idempotency, stock.
- `src/components/CheckoutButton.jsx` — calls the API, opens the modal.

These are reviewed and working. If you believe one is wrong, say so and wait —
do not silently refactor.

## Indian commerce specifics

- GST is **inclusive** in displayed prices: 5% up to ₹2,500/piece, 18% above.
- HSN code for knitted t-shirts is 6109.
- Phone numbers: 10 digits, first digit 6–9. PIN codes: 6 digits, no leading zero.
- COD is expected by a large share of Indian shoppers and carries RTO risk.
  COD orders do not decrement stock until confirmed by phone.
- Every product page needs country of origin (Consumer Protection E-Commerce
  Rules, 2020). The footer needs a named grievance officer with contact details.
- Target device is a mid-range Android on 4G. Budget accordingly.

## Quality floor (non-negotiable)

- Lighthouse mobile performance ≥ 90; LCP under 2.0s on simulated 4G.
- Every image WebP, correctly sized, `loading="lazy"` below the fold, under 200KB.
- Responsive from 360px up. Visible keyboard focus. `prefers-reduced-motion` respected.
- All interactive elements reachable by keyboard; form fields have real `<label>`s.
- Error messages say what to fix in plain language, never "an error occurred".

## Commands

```bash
npx wrangler pages dev .        # local dev, serves /functions
npx cloudflared tunnel --url http://localhost:8788   # expose for webhooks
npm run build
```

## How to work with me

- Show a short plan before multi-file changes. Wait for a yes.
- One concern per commit.
- Never commit `.dev.vars`, `.env`, or real keys.
- When you make a security-relevant decision, state it in one line and why.

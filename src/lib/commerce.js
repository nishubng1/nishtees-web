/**
 * nishTees — shared server-side helpers.
 * Imported by the Cloudflare Pages Functions in /functions/api.
 * Never import this from browser code: it uses the service role key.
 */

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------
// Business rules. Change these in one place.
// ---------------------------------------------------------------

export const SHIPPING_FLAT_PAISE = 7900;      // Rs 79
export const FREE_SHIPPING_ABOVE_PAISE = 99900; // free at Rs 999+
export const COD_MAX_PAISE = 300000;          // no COD above Rs 3,000
export const MAX_QTY_PER_VARIANT = 5;

// GST is INCLUSIVE in the displayed price.
// 5% applies to garments up to Rs 2,500 per piece; 18% above that.
export function gstRateForUnitPricePaise(unitPricePaise) {
  return unitPricePaise <= 250000 ? 0.05 : 0.18;
}

/** Extract the GST already contained inside a tax-inclusive amount. */
export function gstComponentPaise(inclusiveAmountPaise, rate) {
  return Math.round((inclusiveAmountPaise * rate) / (1 + rate));
}

// ---------------------------------------------------------------
// Supabase (service role — bypasses RLS, server only)
// ---------------------------------------------------------------

export function supabaseAdmin(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------
// Validation
// ---------------------------------------------------------------

const PHONE_RE = /^[6-9]\d{9}$/;
const PINCODE_RE = /^[1-9]\d{5}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Returns { ok: true, value } or { ok: false, errors: {field: message} }.
 * Error strings are customer-facing: say what to fix, not what failed.
 */
export function validateCheckout(body) {
  const errors = {};
  const c = body?.customer ?? {};
  const a = body?.address ?? {};

  const name = String(c.name ?? '').trim();
  if (name.length < 2) errors.name = 'Enter your full name.';

  const email = String(c.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';

  const phone = String(c.phone ?? '').replace(/\D/g, '').slice(-10);
  if (!PHONE_RE.test(phone)) errors.phone = 'Enter a 10-digit mobile number.';

  const line1 = String(a.line1 ?? '').trim();
  if (line1.length < 5) errors.line1 = 'Enter your street address.';

  const city = String(a.city ?? '').trim();
  if (!city) errors.city = 'Enter your city.';

  const state = String(a.state ?? '').trim();
  if (!state) errors.state = 'Select your state.';

  const pincode = String(a.pincode ?? '').trim();
  if (!PINCODE_RE.test(pincode)) errors.pincode = 'Enter a 6-digit PIN code.';

  const method = body?.paymentMethod;
  if (method !== 'prepaid' && method !== 'cod') {
    errors.paymentMethod = 'Choose a payment method.';
  }

  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) errors.items = 'Your cart is empty.';
  if (items.length > 20) errors.items = 'Too many items in one order.';

  const cleanItems = [];
  for (const it of items) {
    const sku = String(it?.sku ?? '').trim();
    const qty = Number.parseInt(it?.quantity, 10);
    if (!sku || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_VARIANT) {
      errors.items = 'One of the items in your cart is invalid.';
      break;
    }
    cleanItems.push({ sku, quantity: qty });
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      customer: { name, email, phone },
      address: {
        line1,
        line2: String(a.line2 ?? '').trim() || null,
        city,
        state,
        pincode,
      },
      paymentMethod: method,
      items: cleanItems,
    },
  };
}

// ---------------------------------------------------------------
// Pricing — the client never gets a say in this
// ---------------------------------------------------------------

/**
 * Look up every SKU in the database, check stock, and compute the total.
 * The browser sends only { sku, quantity }. Prices come from Postgres.
 */
export async function priceCart(supabase, items) {
  const skus = items.map((i) => i.sku);

  const { data: rows, error } = await supabase
    .from('variants')
    .select('id, sku, size, stock, products!inner(id, name, price_paise, is_active)')
    .in('sku', skus);

  if (error) throw new Error(`Catalogue lookup failed: ${error.message}`);

  const bySku = new Map(rows.map((r) => [r.sku, r]));
  const lines = [];
  let subtotal = 0;
  let gst = 0;

  for (const item of items) {
    const row = bySku.get(item.sku);
    if (!row || !row.products.is_active) {
      return { ok: false, reason: 'UNAVAILABLE', sku: item.sku };
    }
    if (row.stock < item.quantity) {
      return { ok: false, reason: 'OUT_OF_STOCK', sku: item.sku, available: row.stock };
    }

    const unit = row.products.price_paise;
    const lineTotal = unit * item.quantity;
    subtotal += lineTotal;
    gst += gstComponentPaise(lineTotal, gstRateForUnitPricePaise(unit));

    lines.push({
      variant_id: row.id,
      sku: row.sku,
      product_name: row.products.name,
      size: row.size,
      unit_price_paise: unit,
      quantity: item.quantity,
      line_total_paise: lineTotal,
    });
  }

  const shipping = subtotal >= FREE_SHIPPING_ABOVE_PAISE ? 0 : SHIPPING_FLAT_PAISE;
  const total = subtotal + shipping;

  return { ok: true, lines, subtotal, shipping, gst, total };
}

// ---------------------------------------------------------------
// Razorpay REST (no SDK — works on Cloudflare Workers)
// ---------------------------------------------------------------

export async function createRazorpayOrder(env, { amountPaise, receipt, notes }) {
  const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes,
      payment_capture: 1,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Razorpay order creation failed (${res.status}): ${detail}`);
  }
  return res.json();
}

// ---------------------------------------------------------------
// HMAC-SHA256 via Web Crypto (Node's crypto is not available here)
// ---------------------------------------------------------------

export async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time string compare. Never use === on a signature. */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------
// Response helper
// ---------------------------------------------------------------

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

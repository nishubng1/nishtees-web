/**
 * The cart — the only thing this site keeps in localStorage, and nothing
 * in it is trusted. It stores SKUs, sizes and a *display* price so the
 * bag can render without a round-trip; the server re-prices every line
 * from Postgres at checkout and ignores whatever the browser claims.
 *
 * Astro renders each interactive component as its own React root, so they
 * can't share React state directly. This module is that shared source of
 * truth: read/write localStorage, then fire a `cart:change` event every
 * island subscribes to. Cross-tab updates ride the native `storage` event.
 */

const KEY = 'nishtees_cart';
const EVENT = 'cart:change';

// Mirrors MAX_QTY_PER_VARIANT in commerce.js. Duplicated (not imported)
// because commerce.js pulls in the service-role Supabase client and must
// never reach the browser. The server enforces this limit for real.
export const MAX_QTY_PER_VARIANT = 5;

function isValidItem(it) {
  return (
    it &&
    typeof it.sku === 'string' &&
    Number.isInteger(it.quantity) &&
    it.quantity > 0
  );
}

function read() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isValidItem) : [];
  } catch {
    return [];
  }
}

function write(cart) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(cart));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

export function getCart() {
  return read();
}

export function count() {
  return read().reduce((n, it) => n + it.quantity, 0);
}

/** Add one of a variant, or bump an existing line up to the cap. */
export function addItem({ sku, size, slug, name, pricePaise }) {
  const cart = read();
  const existing = cart.find((it) => it.sku === sku);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + 1, MAX_QTY_PER_VARIANT);
  } else {
    cart.push({ sku, size, slug, name, pricePaise, quantity: 1 });
  }
  write(cart);
}

/** Set an exact quantity; 0 (or less) removes the line. */
export function setQuantity(sku, quantity) {
  const q = Math.max(0, Math.min(Number(quantity) || 0, MAX_QTY_PER_VARIANT));
  let cart = read();
  if (q === 0) {
    cart = cart.filter((it) => it.sku !== sku);
  } else {
    const it = cart.find((i) => i.sku === sku);
    if (it) it.quantity = q;
  }
  write(cart);
}

export function removeItem(sku) {
  write(read().filter((it) => it.sku !== sku));
}

export function clearCart() {
  write([]);
}

/** Call `fn(cart)` on every change, in this tab or another. Returns an unsubscribe. */
export function subscribe(fn) {
  if (typeof window === 'undefined') return () => {};
  const onLocal = () => fn(read());
  const onStorage = (e) => {
    if (e.key === KEY) fn(read());
  };
  window.addEventListener(EVENT, onLocal);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onLocal);
    window.removeEventListener('storage', onStorage);
  };
}

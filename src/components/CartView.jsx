import { useCart } from '../lib/useCart.js';
import { setQuantity, removeItem, MAX_QTY_PER_VARIANT } from '../lib/cart.js';
import { formatPaise } from '../lib/format.js';

export default function CartView() {
  const cart = useCart();
  const subtotal = cart.reduce((s, it) => s + it.pricePaise * it.quantity, 0);

  if (cart.length === 0) {
    return (
      <div className="mt-8">
        <p className="text-ink/70">Your bag is empty.</p>
        <a
          href="/#collection"
          className="mt-6 inline-block bg-accent px-8 py-4 text-sm font-semibold uppercase tracking-wide text-ink transition hover:opacity-90"
        >
          Shop the Collection
        </a>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <ul className="divide-y divide-ink/10 border-y border-ink/10">
        {cart.map((it) => (
          <li key={it.sku} className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <a
                href={`/products/${it.slug}`}
                className="font-medium hover:text-accent"
              >
                {it.name}
              </a>
              <p className="mt-0.5 text-sm text-ink/60">
                Size {it.size} · {formatPaise(it.pricePaise)}
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">Quantity for {it.name}, size {it.size}</span>
              <select
                value={it.quantity}
                onChange={(e) => setQuantity(it.sku, e.target.value)}
                className="rounded-none border border-ink/20 bg-paper px-2 py-1.5 focus-visible:border-ink"
              >
                {Array.from({ length: MAX_QTY_PER_VARIANT }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>

            <p className="w-20 text-right font-medium tabular-nums">
              {formatPaise(it.pricePaise * it.quantity)}
            </p>

            <button
              type="button"
              onClick={() => removeItem(it.sku)}
              className="text-sm text-ink/50 underline underline-offset-2 hover:text-ink"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-wide text-ink/60">
          Subtotal
        </span>
        <span className="text-lg font-medium tabular-nums">{formatPaise(subtotal)}</span>
      </div>
      <p className="mt-1 text-right text-xs text-ink/50">
        Shipping calculated at checkout · Free over ₹999
      </p>

      <a
        href="/checkout"
        className="mt-6 block bg-accent px-6 py-4 text-center text-sm font-semibold uppercase tracking-wide text-ink transition hover:opacity-90"
      >
        Proceed to Checkout
      </a>
    </div>
  );
}

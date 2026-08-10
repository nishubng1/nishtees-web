import { useCart } from '../lib/useCart.js';

/** Small accent badge in the header. Renders nothing when the bag is empty. */
export default function CartCount() {
  const cart = useCart();
  const n = cart.reduce((sum, it) => sum + it.quantity, 0);
  if (n === 0) return null;
  return (
    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold leading-5 text-ink">
      {n}
    </span>
  );
}

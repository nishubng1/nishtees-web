import { useState } from 'react';
import { useCart } from '../lib/useCart.js';
import { clearCart } from '../lib/cart.js';
import { formatPaise } from '../lib/format.js';
import CheckoutButton from './CheckoutButton.jsx';

// Static list — a plain select is friendlier (and more accurate for
// shipping) than a free-text state field. The server only checks it's
// non-empty; this keeps the customer from mistyping it.
const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

const field =
  'mt-1 w-full rounded-none border border-ink/20 bg-paper px-3 py-2.5 text-sm focus-visible:border-ink';
const label = 'block text-xs font-semibold uppercase tracking-wide text-ink/60';

export default function CheckoutForm() {
  const cart = useCart();
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '' });
  const [address, setAddress] = useState({
    line1: '', line2: '', city: '', state: '', pincode: '',
  });
  const [paymentMethod, setPaymentMethod] = useState('prepaid');
  const [placed, setPlaced] = useState(null);

  const subtotal = cart.reduce((s, it) => s + it.pricePaise * it.quantity, 0);
  const items = cart.map((it) => ({ sku: it.sku, quantity: it.quantity }));

  function setC(key) {
    return (e) => setCustomer((c) => ({ ...c, [key]: e.target.value }));
  }
  function setA(key) {
    return (e) => setAddress((a) => ({ ...a, [key]: e.target.value }));
  }

  function handlePlaced(orderNumber) {
    clearCart();
    setPlaced({ orderNumber, method: paymentMethod });
  }

  if (placed) {
    return (
      <div className="mt-8 border border-ink/10 p-6">
        <h2 className="font-display text-2xl tracking-tight">Order placed</h2>
        <p className="mt-2 text-ink/80">
          Your order number is <strong>{placed.orderNumber}</strong>.
        </p>
        <p className="mt-2 text-sm text-ink/70">
          {placed.method === 'cod'
            ? "We'll call to confirm your order before we ship it."
            : "We've emailed your confirmation. Your order ships once payment is verified."}
        </p>
        <a
          href="/#collection"
          className="mt-6 inline-block bg-accent px-8 py-4 text-sm font-semibold uppercase tracking-wide text-ink transition hover:opacity-90"
        >
          Continue Shopping
        </a>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="mt-8">
        <p className="text-ink/70">Your bag is empty, so there's nothing to check out.</p>
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
    <form
      className="mt-8 grid gap-10 lg:grid-cols-[1.3fr_1fr]"
      onSubmit={(e) => e.preventDefault()}
    >
      <div>
        <fieldset>
          <legend className="font-display text-xl tracking-tight">Contact</legend>
          <div className="mt-4 grid gap-4">
            <label className={label}>
              Full name
              <input className={field} type="text" autoComplete="name" value={customer.name} onChange={setC('name')} />
            </label>
            <label className={label}>
              Email
              <input className={field} type="email" autoComplete="email" value={customer.email} onChange={setC('email')} />
            </label>
            <label className={label}>
              Mobile number
              <input className={field} type="tel" inputMode="numeric" autoComplete="tel" placeholder="10-digit number" value={customer.phone} onChange={setC('phone')} />
            </label>
          </div>
        </fieldset>

        <fieldset className="mt-8">
          <legend className="font-display text-xl tracking-tight">Shipping address</legend>
          <div className="mt-4 grid gap-4">
            <label className={label}>
              Address line 1
              <input className={field} type="text" autoComplete="address-line1" value={address.line1} onChange={setA('line1')} />
            </label>
            <label className={label}>
              Address line 2 <span className="font-normal normal-case text-ink/40">(optional)</span>
              <input className={field} type="text" autoComplete="address-line2" value={address.line2} onChange={setA('line2')} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={label}>
                City
                <input className={field} type="text" autoComplete="address-level2" value={address.city} onChange={setA('city')} />
              </label>
              <label className={label}>
                PIN code
                <input className={field} type="text" inputMode="numeric" autoComplete="postal-code" placeholder="6 digits" value={address.pincode} onChange={setA('pincode')} />
              </label>
            </div>
            <label className={label}>
              State
              <select className={field} value={address.state} onChange={setA('state')}>
                <option value="">Select your state</option>
                {STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="mt-8">
          <legend className="font-display text-xl tracking-tight">Payment</legend>
          <div className="mt-4 grid gap-3">
            <label className="flex items-center gap-3 border border-ink/20 px-4 py-3 text-sm">
              <input type="radio" name="payment" value="prepaid" checked={paymentMethod === 'prepaid'} onChange={() => setPaymentMethod('prepaid')} />
              Pay online (UPI / card / netbanking)
            </label>
            <label className="flex items-center gap-3 border border-ink/20 px-4 py-3 text-sm">
              <input type="radio" name="payment" value="cod" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} />
              Cash on delivery
            </label>
          </div>
        </fieldset>
      </div>

      <aside className="lg:sticky lg:top-10 lg:self-start">
        <h2 className="font-display text-xl tracking-tight">Order summary</h2>
        <ul className="mt-4 divide-y divide-ink/10 border-y border-ink/10 text-sm">
          {cart.map((it) => (
            <li key={it.sku} className="flex justify-between gap-4 py-3">
              <span className="min-w-0">
                {it.name}
                <span className="text-ink/50"> · {it.size} × {it.quantity}</span>
              </span>
              <span className="tabular-nums">{formatPaise(it.pricePaise * it.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between text-sm">
          <span className="text-ink/60">Subtotal</span>
          <span className="font-medium tabular-nums">{formatPaise(subtotal)}</span>
        </div>
        <p className="mt-1 text-xs text-ink/50">
          Shipping and taxes are confirmed on the next step. Prices are GST-inclusive.
        </p>

        <div className="mt-6">
          <CheckoutButton
            items={items}
            customer={customer}
            address={address}
            paymentMethod={paymentMethod}
            onPlaced={handlePlaced}
          />
        </div>
      </aside>
    </form>
  );
}

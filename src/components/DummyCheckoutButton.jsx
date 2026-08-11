import { useState } from 'react';

/**
 * Demo-only stand-in for CheckoutButton, used when no backend is
 * configured. It validates the form the same way the server would, then
 * fakes a placed order entirely in the browser — no network, no payment.
 * Same props and look as CheckoutButton so the swap is invisible.
 */
const PHONE_RE = /^[6-9]\d{9}$/;
const PINCODE_RE = /^[1-9]\d{5}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(customer, address) {
  const errors = {};
  if ((customer.name ?? '').trim().length < 2) errors.name = 'Enter your full name.';
  if (!EMAIL_RE.test((customer.email ?? '').trim())) errors.email = 'Enter a valid email address.';
  const phone = (customer.phone ?? '').replace(/\D/g, '').slice(-10);
  if (!PHONE_RE.test(phone)) errors.phone = 'Enter a 10-digit mobile number.';
  if ((address.line1 ?? '').trim().length < 5) errors.line1 = 'Enter your street address.';
  if (!(address.city ?? '').trim()) errors.city = 'Enter your city.';
  if (!(address.state ?? '').trim()) errors.state = 'Select your state.';
  if (!PINCODE_RE.test((address.pincode ?? '').trim())) errors.pincode = 'Enter a 6-digit PIN code.';
  return errors;
}

export default function DummyCheckoutButton({ customer, address, paymentMethod, onPlaced }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  function placeOrder() {
    const errors = validate(customer, address);
    if (Object.keys(errors).length > 0) {
      setError('Check the highlighted fields.');
      setFieldErrors(errors);
      return;
    }
    setError(null);
    setFieldErrors({});
    setBusy(true);
    // Demo store: no server, no payment. Fake a placed order after a beat.
    setTimeout(() => {
      onPlaced(`NT-${1000 + Math.floor(Math.random() * 9000)}`);
    }, 600);
  }

  const label = paymentMethod === 'cod' ? 'Place order' : 'Pay now';

  return (
    <div>
      <button
        type="button"
        onClick={placeOrder}
        disabled={busy}
        className="w-full rounded-md bg-neutral-900 px-6 py-4 text-sm font-medium uppercase tracking-wide text-white transition hover:bg-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Working…' : label}
      </button>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {Object.entries(fieldErrors).map(([field, message]) => (
        <p key={field} className="mt-1 text-sm text-red-600">
          {message}
        </p>
      ))}
    </div>
  );
}

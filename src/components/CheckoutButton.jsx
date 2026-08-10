import { useState, useEffect } from 'react';

/**
 * The client's job: collect the address, call the API, open the modal.
 * It never sends a price. It never decides whether payment succeeded.
 *
 * Props:
 *   items         [{ sku, quantity }]
 *   customer      { name, email, phone }
 *   address       { line1, line2, city, state, pincode }
 *   paymentMethod 'prepaid' | 'cod'
 *   onPlaced      (orderNumber) => void
 */
export default function CheckoutButton({
  items,
  customer,
  address,
  paymentMethod,
  onPlaced,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Load Razorpay's script once, ahead of time, so the modal opens instantly.
  useEffect(() => {
    if (document.getElementById('razorpay-sdk')) return;
    const s = document.createElement('script');
    s.id = 'razorpay-sdk';
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    document.body.appendChild(s);
  }, []);

  async function placeOrder() {
    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, customer, address, paymentMethod }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Try again.');
        setFieldErrors(data.fields ?? {});
        return;
      }

      if (data.mode === 'cod') {
        onPlaced(data.orderNumber);
        return;
      }

      if (!window.Razorpay) {
        setError('Payment is still loading. Give it a moment and try again.');
        return;
      }

      const rzp = new window.Razorpay({
        key: data.keyId,
        order_id: data.razorpayOrderId,
        amount: data.amountPaise,
        currency: 'INR',
        name: 'nishTees',
        description: `Order ${data.orderNumber}`,
        prefill: data.prefill,
        theme: { color: '#111111' },
        // This fires in the browser and can be forged. It only moves the
        // customer to the thank-you page. The webhook is what confirms
        // the order server-side.
        handler: () => onPlaced(data.orderNumber),
        modal: {
          ondismiss: () => {
            setBusy(false);
            setError('Payment cancelled. Your cart is still here.');
          },
        },
      });

      rzp.on('payment.failed', (resp) => {
        setBusy(false);
        setError(resp.error?.description ?? 'Payment failed. Try another method.');
      });

      rzp.open();
    } catch {
      setError('Network problem. Check your connection and try again.');
    } finally {
      if (paymentMethod === 'cod') setBusy(false);
    }
  }

  const label = paymentMethod === 'cod' ? 'Place order' : 'Pay now';

  return (
    <div>
      <button
        type="button"
        onClick={placeOrder}
        disabled={busy || items.length === 0}
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

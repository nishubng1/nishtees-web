/**
 * POST /api/razorpay-webhook
 *
 * This is the ONLY place an order becomes 'confirmed'.
 * The browser's success callback is a UI hint and nothing more —
 * it can be forged; this cannot.
 *
 * Configure in Razorpay Dashboard -> Settings -> Webhooks:
 *   URL:    https://nishtees.in/api/razorpay-webhook
 *   Events: payment.captured, payment.failed, refund.processed
 *   Secret: any long random string -> store as RAZORPAY_WEBHOOK_SECRET
 */

import {
  supabaseAdmin,
  hmacSha256Hex,
  timingSafeEqual,
  json,
} from '../../src/lib/commerce.js';

export async function onRequestPost({ request, env }) {
  // 1. Read the RAW body. Parsing first and re-stringifying will
  //    change the bytes and the signature will never match.
  const raw = await request.text();
  const signature = request.headers.get('x-razorpay-signature');
  const eventId = request.headers.get('x-razorpay-event-id');

  if (!signature || !eventId) {
    return json({ error: 'Missing signature headers.' }, 400);
  }

  // 2. Verify
  const expected = await hmacSha256Hex(env.RAZORPAY_WEBHOOK_SECRET, raw);
  if (!timingSafeEqual(expected, signature)) {
    console.warn('Rejected webhook: bad signature', { eventId });
    return json({ error: 'Invalid signature.' }, 401);
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: 'Malformed payload.' }, 400);
  }

  const supabase = supabaseAdmin(env);

  // 3. Idempotency. Razorpay retries; the unique index on event_id
  //    means the second delivery loses the race and exits here.
  const { error: dupeErr } = await supabase
    .from('webhook_events')
    .insert({ event_id: eventId, event_type: event.event, payload: event });

  if (dupeErr) {
    if (dupeErr.code === '23505') {
      return json({ status: 'already_processed' }, 200);
    }
    console.error('webhook_events insert failed', dupeErr);
    return json({ error: 'Storage error.' }, 500);
  }

  // 4. Handle. Always return 200 past this point unless we genuinely
  //    want Razorpay to retry — a non-2xx triggers redelivery.
  try {
    switch (event.event) {
      case 'payment.captured':
        await handlePaymentCaptured(supabase, env, event);
        break;
      case 'payment.failed':
        await handlePaymentFailed(supabase, event);
        break;
      case 'refund.processed':
        await handleRefund(supabase, event);
        break;
      default:
        // Logged in webhook_events, no action needed.
        break;
    }
  } catch (err) {
    console.error('Webhook handler error', event.event, err);
    // Recorded and logged. Reconcile from the dashboard rather than
    // asking Razorpay to hammer this endpoint.
  }

  return json({ status: 'ok' }, 200);
}

async function handlePaymentCaptured(supabase, env, event) {
  const payment = event.payload.payment.entity;

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, status, total_paise, order_number, customer_email, customer_name')
    .eq('razorpay_order_id', payment.order_id)
    .single();

  if (error || !order) {
    console.error('No order for razorpay_order_id', payment.order_id);
    return;
  }

  if (order.status === 'confirmed') return; // belt and braces

  // Amount check: if these disagree, something is wrong. Do not ship.
  if (payment.amount !== order.total_paise) {
    console.error('AMOUNT MISMATCH', {
      order: order.order_number,
      expected: order.total_paise,
      received: payment.amount,
    });
    await supabase
      .from('orders')
      .update({ notes: `Amount mismatch: expected ${order.total_paise}, got ${payment.amount}` })
      .eq('id', order.id);
    return;
  }

  // Atomic decrement. Throws if someone else took the last piece.
  const { error: stockErr } = await supabase.rpc('decrement_stock', {
    p_order_id: order.id,
  });

  if (stockErr) {
    console.error('OVERSOLD — refund required', order.order_number, stockErr);
    await supabase
      .from('orders')
      .update({
        status: 'confirmed',
        razorpay_payment_id: payment.id,
        notes: 'PAID BUT OVERSOLD — issue a refund from the Razorpay dashboard.',
      })
      .eq('id', order.id);
    return;
  }

  await supabase
    .from('orders')
    .update({ status: 'confirmed', razorpay_payment_id: payment.id })
    .eq('id', order.id);

  await sendOrderConfirmation(env, order);
}

async function handlePaymentFailed(supabase, event) {
  const payment = event.payload.payment.entity;
  await supabase
    .from('orders')
    .update({ status: 'payment_failed' })
    .eq('razorpay_order_id', payment.order_id)
    .eq('status', 'awaiting_payment');
}

async function handleRefund(supabase, event) {
  const refund = event.payload.refund.entity;
  const { data: order } = await supabase
    .from('orders')
    .select('id')
    .eq('razorpay_payment_id', refund.payment_id)
    .single();

  if (!order) return;

  await supabase.from('orders').update({ status: 'refunded' }).eq('id', order.id);
  await supabase.rpc('restore_stock', { p_order_id: order.id });
}

/** Transactional email via Resend. Free tier covers 3,000/month. */
async function sendOrderConfirmation(env, order) {
  if (!env.RESEND_API_KEY) return;

  const rupees = (order.total_paise / 100).toFixed(2);

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'nishTees <orders@nishtees.in>',
      to: [order.customer_email],
      subject: `Order ${order.order_number} confirmed`,
      text:
        `Hi ${order.customer_name},\n\n` +
        `Your order ${order.order_number} is confirmed. Total paid: Rs ${rupees}.\n` +
        `We pack and dispatch within 2 working days and will email your tracking link.\n\n` +
        `Questions: support@nishtees.in\n\nnishTees`,
    }),
  }).catch((err) => console.error('Confirmation email failed', err));
}

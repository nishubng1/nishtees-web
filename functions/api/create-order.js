/**
 * POST /api/create-order
 *
 * The browser sends only SKUs, quantities and the address.
 * Everything to do with money is decided here.
 *
 * Prepaid -> creates a Razorpay order, returns its id for Checkout.
 * COD     -> writes the order straight to the database.
 */

import {
  supabaseAdmin,
  validateCheckout,
  priceCart,
  createRazorpayOrder,
  json,
  COD_MAX_PAISE,
} from '../../src/lib/commerce.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  // 1. Validate shape and customer details
  const parsed = validateCheckout(body);
  if (!parsed.ok) {
    return json({ error: 'Check the highlighted fields.', fields: parsed.errors }, 400);
  }
  const { customer, address, paymentMethod, items } = parsed.value;

  const supabase = supabaseAdmin(env);

  // 2. Price the cart from the database. Ignore anything the client claimed.
  let quote;
  try {
    quote = await priceCart(supabase, items);
  } catch (err) {
    console.error('priceCart failed', err);
    return json({ error: 'Could not price your cart. Try again.' }, 500);
  }

  if (!quote.ok) {
    if (quote.reason === 'OUT_OF_STOCK') {
      return json(
        {
          error: `Only ${quote.available} left in that size.`,
          sku: quote.sku,
          available: quote.available,
        },
        409
      );
    }
    return json({ error: 'That item is no longer available.', sku: quote.sku }, 409);
  }

  if (paymentMethod === 'cod' && quote.total > COD_MAX_PAISE) {
    return json({ error: 'Cash on delivery is available up to Rs 3,000. Pay online to continue.' }, 400);
  }

  // 3. Insert the order
  const orderRow = {
    status: paymentMethod === 'cod' ? 'cod_unconfirmed' : 'awaiting_payment',
    payment_method: paymentMethod,
    subtotal_paise: quote.subtotal,
    shipping_paise: quote.shipping,
    total_paise: quote.total,
    gst_paise: quote.gst,
    customer_name: customer.name,
    customer_email: customer.email,
    customer_phone: customer.phone,
    address_line1: address.line1,
    address_line2: address.line2,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
  };

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert(orderRow)
    .select('id, order_number, total_paise')
    .single();

  if (orderErr) {
    console.error('order insert failed', orderErr);
    return json({ error: 'Could not place your order. Try again.' }, 500);
  }

  const { error: itemsErr } = await supabase
    .from('order_items')
    .insert(quote.lines.map((l) => ({ ...l, order_id: order.id })));

  if (itemsErr) {
    console.error('order_items insert failed', itemsErr);
    await supabase.from('orders').delete().eq('id', order.id);
    return json({ error: 'Could not place your order. Try again.' }, 500);
  }

  // 4a. COD — done. Stock is decremented when you confirm the order by phone.
  if (paymentMethod === 'cod') {
    return json({
      mode: 'cod',
      orderNumber: order.order_number,
      totalPaise: order.total_paise,
    });
  }

  // 4b. Prepaid — create the Razorpay order
  let rzpOrder;
  try {
    rzpOrder = await createRazorpayOrder(env, {
      amountPaise: quote.total,
      receipt: order.order_number,
      notes: { order_id: order.id, order_number: order.order_number },
    });
  } catch (err) {
    console.error('razorpay order failed', err);
    await supabase.from('orders').update({ status: 'payment_failed' }).eq('id', order.id);
    return json({ error: 'Payment could not be started. Try again.' }, 502);
  }

  await supabase
    .from('orders')
    .update({ razorpay_order_id: rzpOrder.id })
    .eq('id', order.id);

  // RAZORPAY_KEY_ID is public by design — it is safe to send to the browser.
  // RAZORPAY_KEY_SECRET must never leave the Worker.
  return json({
    mode: 'prepaid',
    orderNumber: order.order_number,
    razorpayOrderId: rzpOrder.id,
    amountPaise: quote.total,
    keyId: env.RAZORPAY_KEY_ID,
    prefill: {
      name: customer.name,
      email: customer.email,
      contact: customer.phone,
    },
  });
}

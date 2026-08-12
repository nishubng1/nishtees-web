import { createClient } from '@supabase/supabase-js';
import { FACTS, ESCALATION, findFacts, findGap } from '../lib/knowledge.js';

// POST /api/chat  { message, history? }
//
// Answer ladder, in order. Each rung is cheaper and safer than the next:
//
//   1. Order status      -> real database lookup. No model involved.
//   2. Known gap         -> a written "we don't know yet" line.
//   3. Knowledge match   -> LLM rephrases FACTS, and may use nothing else.
//   4. Nothing matched   -> hand over to email.
//
// The model never speaks unprompted about policy. It is a rewriting layer
// over text you wrote, not a source of answers.

const ORDER_RE = /\b(NT[-\s]?\d{4}[-\s]?\d{3,6}|NT[A-Z0-9-]{6,})\b/i;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Bad request' }, 400); }

  const message = String(body?.message ?? '').trim().slice(0, 500);
  if (!message) return json({ error: 'Say something first' }, 400);

  // --- 1. Order status ------------------------------------------------------
  const orderMatch = message.match(ORDER_RE);
  const emailMatch = message.match(EMAIL_RE);

  if (orderMatch) {
    if (!emailMatch) {
      return json({
        reply: `I can look that up — what's the email address you used to order? I need both, so nobody else can see your order.`,
        source: 'order-lookup',
      });
    }
    return json(await lookupOrder(env, orderMatch[0], emailMatch[0]));
  }

  if (/where.*(order|package|parcel)|track|order status|shipped yet|dispatched/i.test(message)) {
    return json({
      reply: `Happy to check. Send me your order number (it looks like NT-2026-0001) and the email you ordered with.`,
      source: 'order-lookup',
    });
  }

  // --- 2. Known gaps --------------------------------------------------------
  const gap = findGap(message);
  if (gap) return json({ reply: gap, source: 'known-gap' });

  // --- 3. Knowledge base ----------------------------------------------------
  const facts = findFacts(message);
  if (!facts.length) {
    return json({ reply: ESCALATION, source: 'escalation' });
  }

  // Without an AI binding the raw fact is still a correct answer, just blunter.
  // Degrading to that beats failing, and beats letting a model improvise.
  if (!env.AI) {
    return json({ reply: facts[0].answer, source: 'facts-direct' });
  }

  try {
    const grounding = facts.map((f) => f.answer).join('\n\n---\n\n');
    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        {
          role: 'system',
          content:
`You answer customer questions for nishTees, a small streetwear brand in Bangalore.

You may ONLY use the reference text below. It is the complete set of things you are permitted to state.

Rules, in order of importance:
1. Never state a fact that is not in the reference text. No delivery times, no prices, no policies, no stock counts, no dates.
2. If the reference text does not answer the question, reply with exactly: ${ESCALATION}
3. Never invent order details, discounts, or offers.
4. Two or three sentences. Plain, warm, no marketing language, no exclamation marks.
5. Write like a person who works there, not a chatbot. No "I'd be happy to assist you".

REFERENCE TEXT:
${grounding}`,
        },
        { role: 'user', content: message },
      ],
      max_tokens: 220,
      temperature: 0.2, // low: this is rephrasing, not creativity
    });

    const reply = (result?.response ?? '').trim();

    // Guard against an empty or runaway answer — fall back to the raw fact.
    if (!reply || reply.length > 900) {
      return json({ reply: facts[0].answer, source: 'facts-fallback' });
    }

    return json({ reply, source: 'assisted' });
  } catch (err) {
    console.error('chat model failed', err);
    return json({ reply: facts[0].answer, source: 'facts-fallback' });
  }
}

/**
 * Real order lookup. Requires order number AND matching email — order numbers
 * are sequential and guessable, so the email is what stops this being a way to
 * enumerate customer addresses.
 */
async function lookupOrder(env, orderNo, email) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { reply: ESCALATION, source: 'escalation' };
  }

  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const clean = orderNo.replace(/\s/g, '').toUpperCase();

  const { data, error } = await db
    .from('orders')
    .select('order_no, status, created_at, total_paise, email, order_items(name, size, quantity)')
    .eq('order_no', clean)
    .ilike('email', email.trim())
    .maybeSingle();

  // Same message whether the order doesn't exist or the email is wrong, so
  // this can't be used to test which emails are customers.
  if (error || !data) {
    return {
      reply: `I couldn't find an order with those details. Double-check the order number and the email you used — or email support@nishtees.in and someone will dig it out.`,
      source: 'order-lookup',
    };
  }

  const plain = {
    awaiting_payment: `we're still waiting on payment, so it hasn't been packed yet`,
    payment_failed: `the payment didn't go through, so it hasn't been packed`,
    cod_unconfirmed: `we need to confirm your phone number before we pack it`,
    confirmed: `it's confirmed and we're packing it`,
    shipped: `it's on its way to you`,
    delivered: `it's been delivered`,
    cancelled: `it was cancelled`,
    returned: `it came back to us and your refund is being processed`,
    refunded: `it's been refunded`,
  };

  const items = (data.order_items ?? [])
    .map((i) => `${i.name} (${i.size}) × ${i.quantity}`)
    .join(', ');

  return {
    reply: `Found it — ${data.order_no}, ${plain[data.status] ?? 'in progress'}.

${items ? items + '\n' : ''}Total ₹${(data.total_paise / 100).toLocaleString('en-IN')}.`,
    source: 'order-lookup',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

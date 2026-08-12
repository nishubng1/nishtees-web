import { createClient } from '@supabase/supabase-js';
import { FACTS, ESCALATION, findFacts, findGap } from '../lib/knowledge.js';

// POST /api/chat  { message, thread_id?, contact? }
//
// Answer ladder, in order. Each rung is cheaper and safer than the next:
//
//   1. Order status      -> real database lookup. No model involved.
//   2. Known gap         -> a written "we don't know yet" line.
//   3. Knowledge match   -> LLM rephrases FACTS, and may use nothing else.
//   4. Nothing matched   -> escalate, and capture it so it isn't lost.
//
// Every exchange is logged. The point is not surveillance — it is that an
// escalation with nobody watching is just a customer being turned away.

const ORDER_RE = /\b(NT[-\s]?\d{4}[-\s]?\d{3,6}|NT[A-Z0-9-]{6,})\b/i;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE_RE = /\b[6-9]\d{9}\b/;

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Bad request' }, 400); }

  const message = String(body?.message ?? '').trim().slice(0, 500);
  const threadId = body?.thread_id ?? null;
  const contact = body?.contact ?? null;

  const db = supabase(env);

  // --- Handoff: the visitor left contact details ---------------------------
  // No message needed — this is the "have a person reply to me" path.
  if (contact && threadId) {
    return json(await captureHandoff(db, env, threadId, contact));
  }

  if (!message) return json({ error: 'Say something first' }, 400);

  const thread = await ensureThread(db, threadId);
  await log(db, thread, 'customer', message);

  const answer = await answerFor(env, db, message);

  await log(db, thread, 'bot', answer.reply, answer.source);

  if (answer.source === 'escalation' && thread) {
    await db?.from('support_threads')
      .update({ escalated: true })
      .eq('id', thread);
  }

  return json({
    reply: answer.reply,
    source: answer.source,
    thread_id: thread,
    // Tells the widget to offer the "leave your details" form
    offer_handoff: answer.source === 'escalation' || answer.source === 'known-gap',
  });
}

// ---------------------------------------------------------------------------
// The answer ladder
// ---------------------------------------------------------------------------
async function answerFor(env, db, message) {
  const orderMatch = message.match(ORDER_RE);
  const emailMatch = message.match(EMAIL_RE);

  if (orderMatch) {
    if (!emailMatch) {
      return {
        reply: `I can look that up — what's the email address you used to order? I need both, so nobody else can see your order.`,
        source: 'order-lookup',
      };
    }
    return await lookupOrder(db, orderMatch[0], emailMatch[0]);
  }

  if (/where.*(order|package|parcel)|track|order status|shipped yet|dispatched/i.test(message)) {
    return {
      reply: `Happy to check. Send me your order number (it looks like NT-2026-0001) and the email you ordered with.`,
      source: 'order-lookup',
    };
  }

  const gap = findGap(message);
  if (gap) return { reply: gap, source: 'known-gap' };

  const facts = findFacts(message);
  if (!facts.length) return { reply: ESCALATION, source: 'escalation' };

  // Without an AI binding the raw fact is still a correct answer, just blunter.
  if (!env.AI) return { reply: facts[0].answer, source: 'facts-direct' };

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
      temperature: 0.2,
    });

    const reply = (result?.response ?? '').trim();
    if (!reply || reply.length > 900) {
      return { reply: facts[0].answer, source: 'facts-fallback' };
    }
    return { reply, source: 'assisted' };
  } catch (err) {
    console.error('chat model failed', err);
    return { reply: facts[0].answer, source: 'facts-fallback' };
  }
}

// ---------------------------------------------------------------------------
// Handoff
// ---------------------------------------------------------------------------
async function captureHandoff(db, env, threadId, contact) {
  const email = String(contact.email ?? '').trim().slice(0, 200);
  const phone = String(contact.phone ?? '').replace(/\D/g, '').slice(-10);

  if (!EMAIL_RE.test(email) && !PHONE_RE.test(phone)) {
    return { reply: `That doesn't look like a working email or mobile number — mind checking it?`, ok: false };
  }

  if (!db) {
    return {
      reply: `Our system isn't reachable right now. Email support@nishtees.in directly and we'll pick it up.`,
      ok: false,
    };
  }

  await db.from('support_threads').update({
    contact_email: email || null,
    contact_phone: phone || null,
    status: 'waiting',
    escalated: true,
  }).eq('id', threadId);

  await notify(env, db, threadId);

  return {
    reply: `Got it. Someone will get back to you within one working day.\n\nIf it's urgent, email support@nishtees.in and it'll reach the same place.`,
    ok: true,
    handed_off: true,
  };
}

/**
 * Email you when someone is waiting. Without this the inbox only works if you
 * remember to look at it, which — being honest about how this goes — you won't.
 * Degrades silently when RESEND_API_KEY is unset.
 */
async function notify(env, db, threadId) {
  if (!env.RESEND_API_KEY || !env.SUPPORT_EMAIL) return;

  try {
    const { data: thread } = await db
      .from('support_threads')
      .select('contact_email, contact_phone, first_message, message_count')
      .eq('id', threadId)
      .maybeSingle();

    if (!thread) return;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'nishTees support <support@nishtees.in>',
        to: env.SUPPORT_EMAIL,
        subject: `Someone is waiting for a reply`,
        html: `<p style="font-family:system-ui">
          <strong>${escapeHtml(thread.contact_email || thread.contact_phone || 'no contact')}</strong> asked:</p>
          <blockquote style="font-family:system-ui;border-left:3px solid #ff5a1f;padding-left:12px;color:#333">
            ${escapeHtml(thread.first_message ?? '(no message)')}
          </blockquote>
          <p style="font-family:system-ui;font-size:13px;color:#666">
            ${thread.message_count} messages. Open your support inbox to read the whole thread.</p>`,
      }),
    });
  } catch (err) {
    console.error('notify failed', err);
  }
}

// ---------------------------------------------------------------------------
// Order lookup
// ---------------------------------------------------------------------------
async function lookupOrder(db, orderNo, email) {
  if (!db) return { reply: ESCALATION, source: 'escalation' };

  const clean = orderNo.replace(/\s/g, '').toUpperCase();

  const { data, error } = await db
    .from('orders')
    .select('order_no, status, total_paise, order_items(name, size, quantity)')
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

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------
function supabase(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/** Reuse the thread if the widget sent one, otherwise start a new one. */
async function ensureThread(db, threadId) {
  if (!db) return null;
  if (threadId) return threadId;

  const { data, error } = await db
    .from('support_threads')
    .insert({})
    .select('id')
    .single();

  if (error) { console.error('thread create failed', error); return null; }
  return data.id;
}

/** Logging must never break the conversation — swallow failures. */
async function log(db, threadId, role, bodyText, source = null) {
  if (!db || !threadId) return;
  try {
    await db.from('support_messages').insert({
      thread_id: threadId, role, body: bodyText, source,
    });
  } catch (err) {
    console.error('log failed', err);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

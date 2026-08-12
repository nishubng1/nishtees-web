// The ONLY things the chatbot is allowed to state as fact.
//
// Why a file and not a prompt: a language model asked about refunds will
// invent a plausible-sounding policy if it does not have one. Invented policy
// is a promise a customer can hold you to. So the bot answers from this file
// or it escalates — there is no third option.
//
// Rule for editing: if it is not true and written here, the bot must not say
// it. When you publish real policy pages, copy the facts here too.

export const FACTS = {
  // --- Confirmed on the live site -----------------------------------------
  shipping: {
    q: ['shipping', 'delivery charge', 'free shipping', 'courier', 'how long', 'dispatch'],
    a: `Shipping is free on orders over ₹999. Below that it's a flat ₹79.

We ship across India. Once your order is packed we'll email a tracking link.`,
    verified: true,
  },

  returns: {
    q: ['return', 'refund', 'exchange', 'wrong size', 'send it back', 'money back'],
    a: `We accept returns within 7 days of delivery, as long as the tee is unworn, unwashed and has its tags on.

Email support@nishtees.in with your order number and we'll set it up.`,
    verified: true,
  },

  fabric: {
    q: ['gsm', 'fabric', 'material', 'cotton', 'quality', 'thick', 'weight', 'shrink'],
    a: `Every tee is 240 GSM heavyweight cotton — properly thick, not mall-brand thin.

They're bio-washed and pre-shrunk, so they hold their shape and won't shrink on you after a couple of washes.`,
    verified: true,
  },

  fit: {
    q: ['fit', 'oversized', 'drop shoulder', 'boxy', 'baggy', 'true to size'],
    a: `The cut is oversized with a drop shoulder — deliberately boxy rather than fitted.

If you want the intended look, take your usual size. Size up only if you want it noticeably roomier.`,
    verified: true,
  },

  care: {
    q: ['wash', 'care', 'bleach', 'iron', 'dry', 'tumble'],
    a: `Machine wash cold, inside out. No bleach. Tumble dry low or line dry in shade, and iron inside out.

Washing inside out is the main thing — it protects the print.`,
    verified: true,
  },

  payment: {
    q: ['payment', 'pay', 'upi', 'card', 'cod', 'cash on delivery', 'netbanking'],
    a: `Cash on delivery is available right now.

Online payment (UPI, cards, netbanking) is being set up and will be live shortly.`,
    verified: true,
  },

  stock: {
    q: ['sold out', 'out of stock', 'restock', 'when available', 'back in stock', 'unavailable'],
    a: `We're between production runs, so everything is showing sold out at the moment — we'd rather say that than take money for a tee we can't ship.

Email support@nishtees.in and we'll tell you the moment the next batch lands.`,
    verified: true,
  },

  brand: {
    q: ['who are you', 'about', 'where are you', 'made in', 'brand', 'nishtees'],
    a: `nishTees is a small streetwear label based in Bangalore, making 240 GSM oversized tees in India.`,
    verified: true,
  },

  // --- Deliberately unanswered --------------------------------------------
  // Each of these is a real customer question the site does not yet answer.
  // Rather than guess, the bot says so plainly and hands over to email.
  // Delete an entry from here and add a FACTS entry once the policy exists.
  gaps: {
    sizeChart: `We're still measuring the garments properly before publishing a size chart — we didn't want to guess and send you the wrong fit.

Email support@nishtees.in with your usual size and chest measurement, and we'll tell you which to take.`,

    deliveryTime: `I don't want to give you a delivery estimate I can't stand behind — we're still finalising our courier. Email support@nishtees.in and we'll give you a real answer for your pincode.`,

    international: `We only ship within India at the moment.`,
  },
};

/** How the bot hands over when it doesn't know. */
export const ESCALATION =
  `I don't want to guess at that and get it wrong. Email support@nishtees.in and a person will get back to you — usually within a day.`;

/**
 * The retrieval step. Cheap keyword scoring, no model involved.
 *
 * Runs BEFORE the LLM, and the top match is passed in as the only material
 * the model may use. If nothing scores, the model is never called at all.
 */
export function findFacts(question) {
  const text = question.toLowerCase();
  const hits = [];

  for (const [key, entry] of Object.entries(FACTS)) {
    if (key === 'gaps') continue;
    let score = 0;
    for (const term of entry.q) {
      // Whole words only. A plain substring test matches "cod" inside
      // "discount code", which sent people asking about discounts an answer
      // about cash on delivery.
      if (matchesWord(text, term)) score += term.split(' ').length; // phrases beat single words
    }
    if (score > 0) hits.push({ key, score, answer: entry.a });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, 3);
}

/** Word-boundary match, with the term's own regex characters escaped. */
function matchesWord(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

/** Questions we know we can't answer, matched before anything else. */
export function findGap(question) {
  const t = question.toLowerCase();
  if (/size chart|size guide|measurement|chest|what size|which size|sizing/.test(t)) {
    return FACTS.gaps.sizeChart;
  }
  if (/how many days|how long.*(deliver|arrive|take)|delivery time|when will.*(arrive|reach)/.test(t)) {
    return FACTS.gaps.deliveryTime;
  }
  if (/international|abroad|outside india|overseas|worldwide|ship to (the )?(us|uk|usa|uae|canada|australia|singapore)\b/.test(t)) {
    return FACTS.gaps.international;
  }
  return null;
}

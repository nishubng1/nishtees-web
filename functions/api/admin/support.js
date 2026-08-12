import { createClient } from '@supabase/supabase-js';

// /api/admin/support
//
// GET  ?status=waiting        -> thread list
// GET  ?id=<uuid>             -> one thread with its full transcript
// POST { id, status?, note? } -> update a thread
//
// Guarded by a shared secret. Put Cloudflare Access in front of /admin* as
// well — Access handles real login, this is the layer underneath so a
// misconfigured Access policy doesn't leave customer transcripts open.

export async function onRequest({ request, env }) {
  const denied = guard(request, env);
  if (denied) return denied;

  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  if (request.method === 'GET') return handleGet(request, db);
  if (request.method === 'POST') return handlePost(request, db);
  return json({ error: 'Method not allowed' }, 405);
}

async function handleGet(request, db) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  // --- one thread, with transcript ---
  if (id) {
    const { data: thread, error } = await db
      .from('support_threads').select('*').eq('id', id).maybeSingle();
    if (error || !thread) return json({ error: 'Not found' }, 404);

    const { data: messages } = await db
      .from('support_messages')
      .select('role, body, source, created_at')
      .eq('thread_id', id)
      .order('created_at', { ascending: true });

    return json({ thread, messages: messages ?? [] });
  }

  // --- list ---
  const status = url.searchParams.get('status');
  let query = db
    .from('support_threads')
    .select('id, contact_email, contact_phone, status, escalated, message_count, first_message, note, created_at, last_message_at')
    .order('last_message_at', { ascending: false })
    .limit(100);

  if (status && status !== 'all') query = query.eq('status', status);

  const { data: threads, error } = await query;
  if (error) return json({ error: error.message }, 500);

  // Counts for the tab badges. Cheap enough at this volume to do honestly.
  const { data: all } = await db.from('support_threads').select('status, escalated');
  const counts = { waiting: 0, open: 0, answered: 0, closed: 0, escalated: 0 };
  for (const t of all ?? []) {
    counts[t.status] = (counts[t.status] ?? 0) + 1;
    if (t.escalated) counts.escalated++;
  }

  return json({ threads: threads ?? [], counts });
}

async function handlePost(request, db) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Bad request' }, 400); }

  const { id, status, note } = body;
  if (!id) return json({ error: 'Which thread?' }, 400);

  const patch = {};
  if (status) {
    if (!['open', 'waiting', 'answered', 'closed'].includes(status)) {
      return json({ error: 'Unknown status' }, 400);
    }
    patch.status = status;
  }
  if (typeof note === 'string') patch.note = note.slice(0, 2000);

  if (!Object.keys(patch).length) return json({ error: 'Nothing to change' }, 400);

  const { error } = await db.from('support_threads').update(patch).eq('id', id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
}

function guard(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Supabase is not configured.' }, 503);
  }
  if (!env.ADMIN_KEY) {
    // Refuse rather than serve customer data with no lock on the door.
    return json({ error: 'ADMIN_KEY is not set. Refusing to serve support data.' }, 503);
  }
  const supplied = request.headers.get('x-admin-key');
  if (!supplied || !timingSafeEqual(supplied, env.ADMIN_KEY)) {
    return json({ error: 'Not authorised' }, 401);
  }
  return null;
}

/** Constant-time compare, so the key can't be guessed one byte at a time. */
function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

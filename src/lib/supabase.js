/**
 * Build-time only. Astro frontmatter runs in Node/CI during `astro build`,
 * never in the browser, so the anon key here does not reach client code.
 * Reads are scoped by the RLS policies in supabase/schema.sql regardless.
 */
import { createClient } from '@supabase/supabase-js';

export function supabasePublic() {
  const url = import.meta.env.SUPABASE_URL;
  const key = import.meta.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env for the build. See .env.example.'
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

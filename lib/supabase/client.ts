/** Supabase clients. Owner: Ved. */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

type Client = SupabaseClient<Database>;

let cached: Client | null = null;

/**
 * Created on first use, not at import time, so mock mode runs with no
 * Supabase env vars set.
 */
function getClient(): Client {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Copy .env.example to .env.local, or set NEXT_PUBLIC_RALLY_USE_MOCKS=true.',
    );
  }

  cached = createClient<Database>(url, anonKey);
  return cached;
}

/** Proxy so `supabase.from(...)` still reads naturally at call sites. */
export const supabase = new Proxy({} as Client, {
  get(_target, prop) {
    return Reflect.get(getClient(), prop);
  },
});

/**
 * Service-role client. Server and scripts only — this key bypasses RLS and
 * must never reach the browser.
 */
export function createServiceClient(): Client {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL.');
  if (!serviceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (server-only).');

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Supabase clients. Owner: Ved. */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local, or set NEXT_PUBLIC_RALLY_USE_MOCKS=true.',
  );
}

export const supabase = createClient<Database>(url, anonKey);

/**
 * Service-role client. Server and scripts only — this key bypasses RLS and
 * must never reach the browser.
 */
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (server-only).');
  }
  return createClient<Database>(url!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

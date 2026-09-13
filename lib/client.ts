/**
 * The only import the UI needs. Owner: Ved + Suri (announce before editing).
 *
 *   import { api } from '@/lib/client';
 *
 * Swaps mock and real implementations behind the frozen RallyApi interface.
 */

import { USE_MOCKS, type RallyApi } from '@/lib/api';
import { mockApi } from '@/lib/mock';
import { supabaseApi } from '@/lib/supabase/actions';

export const api: RallyApi = USE_MOCKS ? mockApi : supabaseApi;

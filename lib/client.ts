/**
 * The only import the UI needs. Owner: Ved + Suri (announce before editing).
 *
 *   import { api } from '@/lib/client';
 *
 * Swaps mock and real implementations behind the frozen RallyApi interface.
 */

import { USE_MOCKS, type RallyApi } from '@/lib/api';
import { fastifyApi } from '@/lib/fastify/actions';
import { mockApi } from '@/lib/mock';
import { supabaseApi } from '@/lib/supabase/actions';

const dataSource = process.env.NEXT_PUBLIC_RALLY_DATA_SOURCE;

export const api: RallyApi =
  dataSource === 'fastify' ? fastifyApi : USE_MOCKS ? mockApi : supabaseApi;

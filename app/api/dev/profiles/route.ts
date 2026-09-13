/** Dev harness only — lists every profile so the picker has something. Ved. */

import { NextResponse } from 'next/server';
import { api } from '@/lib/client';
import { USE_MOCKS } from '@/lib/api';
import { supabase } from '@/lib/supabase/client';
import type { UserProfile } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (USE_MOCKS) {
      const res = await api.getCandidates('*');
      if (!res.ok) return NextResponse.json(res);
      return NextResponse.json({ ok: true, data: res.data.map((c) => c.user) });
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .order('first_name');

    if (error) {
      return NextResponse.json({ ok: false, error: error.message });
    }

    const profiles: UserProfile[] = [];
    for (const row of data ?? []) {
      const res = await api.getProfile(row.id);
      if (res.ok) profiles.push(res.data);
    }
    return NextResponse.json({ ok: true, data: profiles });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

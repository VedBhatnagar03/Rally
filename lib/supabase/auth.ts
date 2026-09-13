/**
 * Auth. Owner: Ved.
 *
 * Demo mode is the path the hackathon demo uses: pick a seeded profile, no
 * password, no confirmation email, nothing to fail on stage. Real signup is
 * implemented below but only wired in if there's time at the polish gate.
 */

import type { ActionResult, UserProfile } from '@/types';
import { supabase } from './client';

const SESSION_KEY = 'rally.demo.profileId';
const UIUC_EMAIL = /^[^@\s]+@illinois\.edu$/i;

export function isUiucEmail(email: string): boolean {
  return UIUC_EMAIL.test(email.trim());
}

/** Profiles offered on the demo login screen. */
export async function listDemoProfiles(): Promise<
  ActionResult<Array<Pick<UserProfile, 'id' | 'firstName' | 'age' | 'photoUrl'>>>
> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,first_name,age,photo_url')
    .order('first_name');

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: (data ?? []).map((p) => ({
      id: p.id,
      firstName: p.first_name,
      age: p.age,
      photoUrl: p.photo_url,
    })),
  };
}

export function setCurrentProfileId(profileId: string): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SESSION_KEY, profileId);
  }
}

export function getCurrentProfileId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(SESSION_KEY);
}

export function signOut(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(SESSION_KEY);
  }
}

/**
 * Real email+password signup, gated to @illinois.edu.
 * Stretch goal — only wire this up once the golden path is green.
 */
export async function signUpWithUiucEmail(
  email: string,
  password: string,
): Promise<ActionResult<{ authUserId: string }>> {
  if (!isUiucEmail(email)) {
    return { ok: false, error: 'Rally is UIUC-only. Use your @illinois.edu email.' };
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? 'Could not create account.' };
  }
  return { ok: true, data: { authUserId: data.user.id } };
}

export async function signIn(
  email: string,
  password: string,
): Promise<ActionResult<{ authUserId: string }>> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? 'Could not sign in.' };
  }
  return { ok: true, data: { authUserId: data.user.id } };
}

/** Links an auth user to their profile row after real signup. */
export async function linkAuthUserToProfile(
  authUserId: string,
  profileId: string,
): Promise<ActionResult<null>> {
  const { error } = await supabase
    .from('profiles')
    .update({ auth_user_id: authUserId })
    .eq('id', profileId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

/**
 * Real implementation of RallyApi. Owner: Ved.
 *
 * Signatures are frozen in lib/api.ts — Suri's components already call these.
 * Never change one without telling him.
 */

import { passesHardFilters } from '@/matching/filters';
import { rankCandidates } from '@/matching/score';
import { intersectAvailability, nextDateForDay, slotQuality } from '@/scheduling/overlap';
import { recommendVenue, venuesForSport } from '@/scheduling/venues';
import type {
  ActionResult,
  CandidateMatch,
  Feedback,
  OnboardingInput,
  Rally,
  RallyAgainResponse,
  RallyOutcome,
  RallyRequest,
  RallyRequestStatus,
  ScheduleOption,
  SportId,
  UserProfile,
  Venue,
} from '@/types';
import type { RallyApi } from '@/lib/api';
import { supabase } from './client';
import type { AvailabilityRow, UserSportRow } from './database.types';
import {
  toFeedback,
  toRally,
  toRallyRequest,
  toUserProfile,
  toVenue,
} from './mappers';

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

function fail<T>(error: string): ActionResult<T> {
  return { ok: false, error };
}

async function loadProfile(profileId: string): Promise<UserProfile | null> {
  const [profile, prefs, sports, availability] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', profileId).maybeSingle(),
    supabase
      .from('dating_preferences')
      .select('*')
      .eq('profile_id', profileId)
      .maybeSingle(),
    supabase.from('user_sports').select('*').eq('profile_id', profileId),
    supabase.from('availability').select('*').eq('profile_id', profileId),
  ]);

  if (!profile.data || !prefs.data) return null;

  return toUserProfile(
    profile.data,
    prefs.data,
    sports.data ?? [],
    availability.data ?? [],
  );
}

/** One query per table, then group in memory — avoids N+1 across ~30 profiles. */
async function loadAllProfiles(): Promise<UserProfile[]> {
  const [profiles, prefs, sports, availability] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('dating_preferences').select('*'),
    supabase.from('user_sports').select('*'),
    supabase.from('availability').select('*'),
  ]);

  if (!profiles.data || !prefs.data) return [];

  const prefsById = new Map(prefs.data.map((p) => [p.profile_id, p]));
  const sportsById = new Map<string, UserSportRow[]>();
  const availabilityById = new Map<string, AvailabilityRow[]>();

  for (const row of sports.data ?? []) {
    const list = sportsById.get(row.profile_id) ?? [];
    list.push(row);
    sportsById.set(row.profile_id, list);
  }
  for (const row of availability.data ?? []) {
    const list = availabilityById.get(row.profile_id) ?? [];
    list.push(row);
    availabilityById.set(row.profile_id, list);
  }

  const result: UserProfile[] = [];
  for (const profile of profiles.data) {
    const profilePrefs = prefsById.get(profile.id);
    if (!profilePrefs) continue;
    result.push(
      toUserProfile(
        profile,
        profilePrefs,
        sportsById.get(profile.id) ?? [],
        availabilityById.get(profile.id) ?? [],
      ),
    );
  }
  return result;
}

async function loadRallyWithVenue(rallyId: string) {
  const { data: rally } = await supabase
    .from('rallies')
    .select('*')
    .eq('id', rallyId)
    .maybeSingle();
  if (!rally) return null;

  let venue: Venue | null = null;
  if (rally.venue_id) {
    const { data } = await supabase
      .from('venues')
      .select('*')
      .eq('id', rally.venue_id)
      .maybeSingle();
    venue = data ? toVenue(data) : null;
  }
  return { rally, venue };
}

async function logEvent(
  profileId: string | null,
  eventName: string,
  payload: Record<string, unknown> = {},
) {
  await supabase
    .from('analytics_events')
    .insert({ profile_id: profileId, event_name: eventName, payload });
}

export const supabaseApi: RallyApi = {
  async saveOnboarding(input: OnboardingInput) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .insert({
        first_name: input.firstName,
        age: input.age,
        year: input.year,
        major: input.major,
        bio: input.bio,
        photo_url: input.photoUrl,
        is_uiuc_verified: true,
      })
      .select()
      .single();

    if (error || !profile) {
      return fail(error?.message ?? 'Could not create profile.');
    }

    const [prefsResult, sportsResult, availabilityResult] = await Promise.all([
      supabase.from('dating_preferences').insert({
        profile_id: profile.id,
        gender: input.preferences.gender,
        interested_in: input.preferences.interestedIn,
        intent: input.preferences.intent,
        age_min: input.preferences.ageMin,
        age_max: input.preferences.ageMax,
      }),
      supabase.from('user_sports').insert(
        input.sports.map((s) => ({
          profile_id: profile.id,
          sport: s.sport,
          skill: s.skill,
        })),
      ),
      supabase.from('availability').insert(
        input.availability.map((a) => ({
          profile_id: profile.id,
          day: a.day,
          block: a.block,
        })),
      ),
    ]);

    const writeError =
      prefsResult.error ?? sportsResult.error ?? availabilityResult.error;
    if (writeError) {
      // Roll back the partial profile so a retry can't hit the unique constraint.
      await supabase.from('profiles').delete().eq('id', profile.id);
      return fail(writeError.message);
    }

    await logEvent(profile.id, 'onboarding_completed');

    const full = await loadProfile(profile.id);
    return full ? ok(full) : fail('Profile saved but could not be loaded.');
  },

  async getProfile(userId: string) {
    const profile = await loadProfile(userId);
    return profile ? ok(profile) : fail('Profile not found.');
  },

  async getCandidates(userId: string) {
    const viewer = await loadProfile(userId);
    if (!viewer) return fail('Profile not found.');

    const { data: blocks } = await supabase
      .from('blocks')
      .select('*')
      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

    const blockedIds = new Set<string>();
    for (const block of blocks ?? []) {
      blockedIds.add(block.blocker_id === userId ? block.blocked_id : block.blocker_id);
    }

    // Anyone already in a request with the viewer shouldn't resurface.
    const { data: existing } = await supabase
      .from('rally_requests')
      .select('sender_id,receiver_id')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
    for (const req of existing ?? []) {
      blockedIds.add(req.sender_id === userId ? req.receiver_id : req.sender_id);
    }

    const all = await loadAllProfiles();
    const eligible = all.filter((c) => passesHardFilters(c, viewer, blockedIds));
    const ranked: CandidateMatch[] = rankCandidates(eligible, viewer);

    await logEvent(userId, 'candidates_viewed', { count: ranked.length });
    return ok(ranked);
  },

  async sendRally(senderId: string, receiverId: string, sport: SportId) {
    const { data, error } = await supabase
      .from('rally_requests')
      .insert({ sender_id: senderId, receiver_id: receiverId, sport })
      .select()
      .single();

    if (error || !data) {
      return fail(error?.message ?? 'Could not send Rally.');
    }

    await logEvent(senderId, 'rally_sent', { receiverId, sport });
    return ok(toRallyRequest(data));
  },

  async getIncomingRallies(userId: string) {
    const { data, error } = await supabase
      .from('rally_requests')
      .select('*')
      .eq('receiver_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) return fail(error.message);
    return ok((data ?? []).map(toRallyRequest));
  },

  async respondToRally(requestId: string, status: RallyRequestStatus) {
    const { data: request, error } = await supabase
      .from('rally_requests')
      .update({ status })
      .eq('id', requestId)
      .select()
      .single();

    if (error || !request) {
      return fail(error?.message ?? 'Could not respond to Rally.');
    }

    if (status !== 'accepted') {
      await logEvent(request.receiver_id, 'rally_declined', { requestId });
      return ok(null);
    }

    const venue = recommendVenue(request.sport);
    const { data: rally, error: rallyError } = await supabase
      .from('rallies')
      .insert({
        request_id: request.id,
        participant_a: request.sender_id,
        participant_b: request.receiver_id,
        sport: request.sport,
        status: 'accepted',
        booking_status: venue?.requiresReservation ? 'pending' : 'not_required',
      })
      .select()
      .single();

    if (rallyError || !rally) {
      return fail(rallyError?.message ?? 'Could not create Rally.');
    }

    await logEvent(request.receiver_id, 'rally_accepted', { requestId });
    return ok(toRally(rally, null));
  },

  async getScheduleOptions(rallyId: string) {
    const loaded = await loadRallyWithVenue(rallyId);
    if (!loaded) return fail('Rally not found.');

    const [a, b] = await Promise.all([
      loadProfile(loaded.rally.participant_a),
      loadProfile(loaded.rally.participant_b),
    ]);
    if (!a || !b) return fail('Could not load both participants.');

    const shared = intersectAvailability(a, b);
    const venue = recommendVenue(loaded.rally.sport);
    if (!venue) return fail('No venue available for this sport.');

    const options: ScheduleOption[] = shared.slice(0, 3).map((slot) => ({
      slot,
      date: nextDateForDay(slot.day),
      overlapQuality: slotQuality(slot),
      venue,
    }));

    return ok(options);
  },

  async selectSchedule(rallyId: string, option: ScheduleOption) {
    const { data, error } = await supabase
      .from('rallies')
      .update({
        scheduled_date: option.date,
        scheduled_block: option.slot.block,
        venue_id: option.venue.id,
        status: 'scheduled',
        booking_status: option.venue.requiresReservation
          ? 'pending'
          : 'not_required',
      })
      .eq('id', rallyId)
      .select()
      .single();

    if (error || !data) {
      return fail(error?.message ?? 'Could not save schedule.');
    }

    await logEvent(null, 'rally_scheduled', { rallyId, date: option.date });
    return ok(toRally(data, option.venue));
  },

  async getVenueRecommendations(rallyId: string) {
    const loaded = await loadRallyWithVenue(rallyId);
    if (!loaded) return fail('Rally not found.');
    return ok(venuesForSport(loaded.rally.sport));
  },

  async confirmBooking(rallyId: string, ownerId: string) {
    const { data, error } = await supabase
      .from('rallies')
      .update({ booking_status: 'booked', booking_owner_id: ownerId })
      .eq('id', rallyId)
      .select()
      .single();

    if (error || !data) {
      return fail(error?.message ?? 'Could not confirm booking.');
    }

    await logEvent(ownerId, 'court_booked', { rallyId });

    const venue = data.venue_id
      ? (await supabase.from('venues').select('*').eq('id', data.venue_id).maybeSingle())
          .data
      : null;

    return ok(toRally(data, venue ? toVenue(venue) : null));
  },

  async getUpcomingRallies(userId: string) {
    const { data, error } = await supabase
      .from('rallies')
      .select('*')
      .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
      .in('status', ['accepted', 'scheduled'])
      .order('scheduled_date', { ascending: true });

    if (error) return fail(error.message);

    const venues = new Map(
      ((await supabase.from('venues').select('*')).data ?? []).map((v) => [
        v.id,
        toVenue(v),
      ]),
    );

    return ok(
      (data ?? []).map((row) =>
        toRally(row, row.venue_id ? (venues.get(row.venue_id) ?? null) : null),
      ),
    );
  },

  async completeRally(rallyId: string) {
    const { data, error } = await supabase
      .from('rallies')
      .update({ status: 'completed' })
      .eq('id', rallyId)
      .select()
      .single();

    if (error || !data) {
      return fail(error?.message ?? 'Could not complete Rally.');
    }

    await logEvent(null, 'rally_completed', { rallyId });
    return ok(toRally(data, null));
  },

  async submitFeedback(
    rallyId: string,
    userId: string,
    showedUp: boolean,
    rallyAgain: RallyAgainResponse,
  ) {
    const { data, error } = await supabase
      .from('feedback')
      .upsert(
        {
          rally_id: rallyId,
          profile_id: userId,
          showed_up: showedUp,
          rally_again: rallyAgain,
        },
        { onConflict: 'rally_id,profile_id' },
      )
      .select()
      .single();

    if (error || !data) {
      return fail(error?.message ?? 'Could not submit feedback.');
    }

    await logEvent(userId, 'feedback_submitted', { rallyId, rallyAgain });
    return ok(toFeedback(data));
  },

  async getRallyOutcome(rallyId: string) {
    const { data, error } = await supabase
      .from('feedback')
      .select('*')
      .eq('rally_id', rallyId);

    if (error) return fail(error.message);

    const responses = data ?? [];
    const bothResponded = responses.length === 2;
    const outcome: RallyOutcome = {
      rallyId,
      bothResponded,
      isMutualMatch:
        bothResponded && responses.every((f) => f.rally_again === 'yes'),
    };

    if (outcome.isMutualMatch) {
      await logEvent(null, 'mutual_match', { rallyId });
    }

    return ok(outcome);
  },
};

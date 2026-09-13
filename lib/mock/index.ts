/**
 * PLACEHOLDER — Suri owns this file, replace it freely.
 *
 * Ved wrote this only so the app boots and /dev works before Supabase is
 * configured. It reuses the seed profiles and the real matching/scheduling
 * code, keeping state in memory.
 */

import { passesHardFilters } from '@/matching/filters';
import { rankCandidates } from '@/matching/score';
import {
  intersectAvailability,
  nextDateForDay,
  slotQuality,
} from '@/scheduling/overlap';
import { recommendVenue, venuesForSport } from '@/scheduling/venues';
import type { RallyApi } from '@/lib/api';
import type {
  ActionResult,
  Feedback,
  Rally,
  RallyRequest,
  ScheduleOption,
  UserProfile,
} from '@/types';
import { SEED_PROFILES, photoFor } from '@/database/seed/profiles';

const profiles: UserProfile[] = SEED_PROFILES.map((seed, i) => ({
  id: `mock-${String(i).padStart(2, '0')}-${seed.key}`,
  firstName: seed.firstName,
  age: seed.age,
  year: seed.year,
  major: seed.major,
  bio: seed.bio,
  photoUrl: photoFor(seed.key),
  isUiucVerified: true,
  preferences: seed.preferences,
  sports: seed.sports,
  availability: seed.availability,
}));

const requests = new Map<string, RallyRequest>();
const rallies = new Map<string, Rally>();
const feedback = new Map<string, Feedback[]>();
let counter = 0;

const id = (prefix: string) => `${prefix}-${String(++counter).padStart(4, '0')}`;
const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = <T,>(error: string): ActionResult<T> => ({ ok: false, error });

const find = (userId: string) => profiles.find((p) => p.id === userId) ?? null;

export const mockApi: RallyApi = {
  async saveOnboarding(input) {
    const profile: UserProfile = {
      id: id('mock-new'),
      firstName: input.firstName,
      age: input.age,
      year: input.year,
      major: input.major,
      bio: input.bio,
      photoUrl: input.photoUrl,
      isUiucVerified: true,
      preferences: input.preferences,
      sports: input.sports,
      availability: input.availability,
    };
    profiles.push(profile);
    return ok(profile);
  },

  async getProfile(userId) {
    const profile = find(userId);
    return profile ? ok(profile) : fail('Profile not found.');
  },

  async getCandidates(userId) {
    // The dev harness passes '*' to list everyone.
    if (userId === '*') {
      return ok(
        profiles.map((user) => ({
          user,
          score: 0,
          reasons: [],
          sharedSports: [],
        })),
      );
    }

    const viewer = find(userId);
    if (!viewer) return fail('Profile not found.');

    const seen = new Set<string>();
    for (const req of requests.values()) {
      if (req.senderId === userId) seen.add(req.receiverId);
      if (req.receiverId === userId) seen.add(req.senderId);
    }

    const eligible = profiles.filter((c) => passesHardFilters(c, viewer, seen));
    return ok(rankCandidates(eligible, viewer));
  },

  async sendRally(senderId, receiverId, sport) {
    const request: RallyRequest = {
      id: id('req'),
      senderId,
      receiverId,
      sport,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    requests.set(request.id, request);
    return ok(request);
  },

  async getIncomingRallies(userId) {
    return ok(
      [...requests.values()].filter(
        (r) => r.receiverId === userId && r.status === 'pending',
      ),
    );
  },

  async respondToRally(requestId, status) {
    const request = requests.get(requestId);
    if (!request) return fail('Request not found.');

    request.status = status;
    if (status !== 'accepted') return ok(null);

    const venue = recommendVenue(request.sport);
    const rally: Rally = {
      id: id('rally'),
      requestId: request.id,
      participantIds: [request.senderId, request.receiverId],
      sport: request.sport,
      status: 'accepted',
      selectedSlot: null,
      venue: null,
      bookingStatus: venue?.requiresReservation ? 'pending' : 'not_required',
      bookingOwnerId: null,
      createdAt: new Date().toISOString(),
    };
    rallies.set(rally.id, rally);
    return ok(rally);
  },

  async getScheduleOptions(rallyId) {
    const rally = rallies.get(rallyId);
    if (!rally) return fail('Rally not found.');

    const a = find(rally.participantIds[0]);
    const b = find(rally.participantIds[1]);
    if (!a || !b) return fail('Could not load participants.');

    const venue = recommendVenue(rally.sport);
    if (!venue) return fail('No venue for this sport.');

    const options: ScheduleOption[] = intersectAvailability(a, b)
      .slice(0, 3)
      .map((slot) => ({
        slot,
        date: nextDateForDay(slot.day),
        overlapQuality: slotQuality(slot),
        venue,
      }));
    return ok(options);
  },

  async selectSchedule(rallyId, option) {
    const rally = rallies.get(rallyId);
    if (!rally) return fail('Rally not found.');
    rally.selectedSlot = option;
    rally.venue = option.venue;
    rally.status = 'scheduled';
    rally.bookingStatus = option.venue.requiresReservation
      ? 'pending'
      : 'not_required';
    return ok(rally);
  },

  async getVenueRecommendations(rallyId) {
    const rally = rallies.get(rallyId);
    if (!rally) return fail('Rally not found.');
    return ok(venuesForSport(rally.sport));
  },

  async confirmBooking(rallyId, ownerId) {
    const rally = rallies.get(rallyId);
    if (!rally) return fail('Rally not found.');
    rally.bookingStatus = 'booked';
    rally.bookingOwnerId = ownerId;
    return ok(rally);
  },

  async getUpcomingRallies(userId) {
    return ok(
      [...rallies.values()].filter(
        (r) =>
          r.participantIds.includes(userId) &&
          (r.status === 'accepted' || r.status === 'scheduled'),
      ),
    );
  },

  async completeRally(rallyId) {
    const rally = rallies.get(rallyId);
    if (!rally) return fail('Rally not found.');
    rally.status = 'completed';
    return ok(rally);
  },

  async submitFeedback(rallyId, userId, showedUp, rallyAgain) {
    const entry: Feedback = {
      id: id('fb'),
      rallyId,
      userId,
      showedUp,
      rallyAgain,
      createdAt: new Date().toISOString(),
    };
    const existing = (feedback.get(rallyId) ?? []).filter(
      (f) => f.userId !== userId,
    );
    feedback.set(rallyId, [...existing, entry]);
    return ok(entry);
  },

  async getRallyOutcome(rallyId) {
    const responses = feedback.get(rallyId) ?? [];
    const bothResponded = responses.length === 2;
    return ok({
      rallyId,
      bothResponded,
      isMutualMatch:
        bothResponded && responses.every((f) => f.rallyAgain === 'yes'),
    });
  },
};

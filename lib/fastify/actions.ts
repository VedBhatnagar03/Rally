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
import {
  type ApiProfileEnvelope,
  type ApiRallyEnvelope,
  type ApiSport,
  toApiSport,
  toCandidateMatch,
  toRally,
  toRallyRequest,
  toScheduleOption,
  toUserProfile,
} from './mappers';

const baseUrl = process.env.NEXT_PUBLIC_RALLY_API_URL ?? 'http://localhost:4000';

const sessionCache = new Map<string, string>();
const rallyCache = new Map<string, Rally>();

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

function fail<T>(error: string): ActionResult<T> {
  return { ok: false, error };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error ?? `Rally API request failed (${response.status})`);
  }
  return body as T;
}

async function tokenFor(userId: string) {
  const cached = sessionCache.get(userId);
  if (cached) return cached;

  const session = await request<{ token: string }>('/v1/dev/sessions', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  sessionCache.set(userId, session.token);
  return session.token;
}

async function authed<T>(userId: string, path: string, options: RequestInit = {}) {
  const token = await tokenFor(userId);
  return request<T>(path, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
}

async function loadRallies(userId: string) {
  const body = await authed<{ rallies: ApiRallyEnvelope[] }>(userId, '/v1/rallies');
  const rallies = body.rallies.map((rally) => toRally(rally));
  for (const rally of rallies) rallyCache.set(rally.id, rally);
  return rallies;
}

export async function listFastifyProfiles(): Promise<ActionResult<UserProfile[]>> {
  try {
    const body = await request<{ profiles: ApiProfileEnvelope[] }>('/v1/dev/profiles');
    return ok(body.profiles.map(toUserProfile));
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Could not list profiles.');
  }
}

export const fastifyApi: RallyApi = {
  async saveOnboarding(_input: OnboardingInput) {
    return fail(
      'Fastify onboarding uses secure email/password registration. Use /v1/auth/register for real onboarding.',
    );
  },

  async getProfile(userId: string) {
    try {
      const body = await request<{ profile: ApiProfileEnvelope }>(`/v1/dev/profiles/${userId}`);
      return ok(toUserProfile(body.profile));
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Profile not found.');
    }
  },

  async getCandidates(userId: string) {
    try {
      const body = await authed<{
        recommendations: Array<{
          userId: string;
          displayName: string;
          recommendedSport: ApiSport;
          score: number;
        }>;
      }>(userId, '/v1/recommendations');

      const matches: CandidateMatch[] = [];
      for (const rec of body.recommendations) {
        const profile = await this.getProfile(rec.userId);
        if (profile.ok) matches.push(toCandidateMatch(rec, profile.data));
      }
      return ok(matches);
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not load candidates.');
    }
  },

  async sendRally(senderId: string, receiverId: string, sport: SportId) {
    try {
      const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
      start.setHours(18, 0, 0, 0);
      const end = new Date(start);
      end.setHours(19, 0, 0, 0);

      const body = await authed<{ rally: ApiRallyEnvelope }>(senderId, '/v1/rallies', {
        method: 'POST',
        body: JSON.stringify({
          receiverId,
          sport: toApiSport(sport),
          proposedStartAt: start.toISOString(),
          proposedEndAt: end.toISOString(),
        }),
      });
      const rally = toRally(body.rally);
      rallyCache.set(rally.id, rally);
      return ok(toRallyRequest(body.rally));
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not send Rally.');
    }
  },

  async getIncomingRallies(userId: string) {
    try {
      const body = await authed<{ rallies: ApiRallyEnvelope[] }>(userId, '/v1/rallies');
      for (const rally of body.rallies) rallyCache.set(rally.id, toRally(rally));

      return ok(
        body.rallies
          .filter((rally) => rally.receiverId === userId && rally.status === 'PENDING')
          .map((rally): RallyRequest => ({
            id: rally.id,
            senderId: rally.senderId,
            receiverId: rally.receiverId,
            sport: toRallyRequest(rally).sport,
            status: 'pending',
            createdAt: rally.createdAt,
          })),
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not load incoming Rallies.');
    }
  },

  async respondToRally(requestId: string, status: RallyRequestStatus) {
    try {
      const cached = rallyCache.get(requestId);
      if (!cached) return fail('Rally was not created in this browser session.');

      const receiverId = cached.participantIds[1];
      const body = await authed<{ rally: ApiRallyEnvelope }>(
        receiverId,
        `/v1/rallies/${requestId}/respond`,
        {
          method: 'POST',
          body: JSON.stringify({ status: status === 'accepted' ? 'ACCEPTED' : 'DECLINED' }),
        },
      );

      if (status !== 'accepted') return ok(null);

      const rally = toRally(body.rally);
      rallyCache.set(rally.id, rally);
      return ok(rally);
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not respond to Rally.');
    }
  },

  async getScheduleOptions(rallyId: string) {
    try {
      const rally = rallyCache.get(rallyId);
      if (!rally) return fail('Rally was not created in this browser session.');

      const senderId = rally.participantIds[0];
      const receiverId = rally.participantIds[1];
      const body = await authed<{
        suggestions: Array<{
          sport: ApiSport;
          dayOfWeek: number;
          startTime: string;
          endTime: string;
          venue: Parameters<typeof toScheduleOption>[0]['venue'];
        }>;
      }>(senderId, `/v1/rallies/suggestions/${receiverId}`);

      return ok(
        body.suggestions.flatMap((suggestion) => {
          const option = toScheduleOption(suggestion);
          return option ? [option] : [];
        }),
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not load schedule options.');
    }
  },

  async selectSchedule(rallyId: string, option: ScheduleOption) {
    try {
      const rally = rallyCache.get(rallyId);
      if (!rally) return fail('Rally was not loaded in this browser session.');

      const body = await authed<{ rally: ApiRallyEnvelope }>(
        rally.participantIds[0],
        `/v1/rallies/${rallyId}/schedule`,
        {
          method: 'POST',
          body: JSON.stringify({
            proposedStartAt: slotStart(option).toISOString(),
            proposedEndAt: slotEnd(option).toISOString(),
            venueId: option.venue.id,
          }),
        },
      );

      const updated = toRally(body.rally, option);
      rallyCache.set(rallyId, updated);
      return ok(updated);
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not save schedule.');
    }
  },

  async getVenueRecommendations(_rallyId: string) {
    return ok([] satisfies Venue[]);
  },

  async confirmBooking(rallyId: string, ownerId: string) {
    try {
      const rally = rallyCache.get(rallyId);
      if (!rally) return fail('Rally was not created in this browser session.');

      const body = await authed<{ rally: ApiRallyEnvelope }>(
        ownerId,
        `/v1/rallies/${rallyId}/court-booking`,
        {
          method: 'POST',
          body: JSON.stringify({ courtStatus: 'BOOKED' }),
        },
      );
      const updated = toRally(body.rally, rally.selectedSlot);
      rallyCache.set(rallyId, updated);
      return ok(updated);
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not confirm booking.');
    }
  },

  async getUpcomingRallies(userId: string) {
    try {
      const rallies = await loadRallies(userId);
      return ok(
        rallies.filter(
          (rally) =>
            rally.participantIds.includes(userId) &&
            (rally.status === 'accepted' || rally.status === 'scheduled'),
        ),
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not load upcoming Rallies.');
    }
  },

  async completeRally(rallyId: string) {
    try {
      const rally = rallyCache.get(rallyId);
      if (!rally) return fail('Rally was not loaded in this browser session.');

      const body = await authed<{ rally: ApiRallyEnvelope }>(
        rally.participantIds[0],
        `/v1/rallies/${rallyId}/complete`,
        { method: 'POST' },
      );
      const updated = toRally(body.rally, rally.selectedSlot);
      rallyCache.set(rallyId, updated);
      return ok(updated);
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not complete Rally.');
    }
  },

  async submitFeedback(
    rallyId: string,
    userId: string,
    showedUp: boolean,
    rallyAgain: RallyAgainResponse,
  ) {
    try {
      const entry: Feedback = {
        id: `${rallyId}-${userId}`,
        rallyId,
        userId,
        showedUp,
        rallyAgain,
        createdAt: new Date().toISOString(),
      };

      await authed(userId, `/v1/feedback/rallies/${rallyId}`, {
        method: 'POST',
        body: JSON.stringify({
          played: showedUp,
          feltSafe: true,
          rallyAgain: rallyAgain === 'yes',
          experienceScore: 5,
        }),
      });

      return ok(entry);
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not submit feedback.');
    }
  },

  async getRallyOutcome(rallyId: string) {
    try {
      const rally = rallyCache.get(rallyId);
      if (!rally) return fail('Rally was not loaded in this browser session.');

      const body = await authed<{ outcome: RallyOutcome }>(
        rally.participantIds[0],
        `/v1/feedback/rallies/${rallyId}/outcome`,
      );
      return ok(body.outcome);
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not load Rally outcome.');
    }
  },
};

function slotStart(option: ScheduleOption) {
  return new Date(`${option.date}T${blockStart(option.slot.block)}:00`);
}

function slotEnd(option: ScheduleOption) {
  return new Date(`${option.date}T${blockEnd(option.slot.block)}:00`);
}

function blockStart(block: ScheduleOption['slot']['block']) {
  if (block === 'morning') return '09:00';
  if (block === 'afternoon') return '14:00';
  return '18:00';
}

function blockEnd(block: ScheduleOption['slot']['block']) {
  if (block === 'morning') return '10:00';
  if (block === 'afternoon') return '15:00';
  return '19:00';
}

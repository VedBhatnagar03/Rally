/**
 * FROZEN CONTRACT — the surface Suri calls, Ved implements.
 *
 * Suri: import from here, never from lib/supabase or lib/mock directly.
 * Ved: implement these in lib/supabase/actions.ts.
 *
 * Flip RALLY_USE_MOCKS to swap the whole app between mock and real data.
 */

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

export interface RallyApi {
  saveOnboarding(input: OnboardingInput): Promise<ActionResult<UserProfile>>;
  getProfile(userId: string): Promise<ActionResult<UserProfile>>;
  getCandidates(userId: string): Promise<ActionResult<CandidateMatch[]>>;
  sendRally(
    senderId: string,
    receiverId: string,
    sport: SportId,
  ): Promise<ActionResult<RallyRequest>>;
  getIncomingRallies(userId: string): Promise<ActionResult<RallyRequest[]>>;
  respondToRally(
    requestId: string,
    status: RallyRequestStatus,
  ): Promise<ActionResult<Rally | null>>;
  getScheduleOptions(rallyId: string): Promise<ActionResult<ScheduleOption[]>>;
  selectSchedule(
    rallyId: string,
    option: ScheduleOption,
  ): Promise<ActionResult<Rally>>;
  getVenueRecommendations(rallyId: string): Promise<ActionResult<Venue[]>>;
  confirmBooking(rallyId: string, ownerId: string): Promise<ActionResult<Rally>>;
  getUpcomingRallies(userId: string): Promise<ActionResult<Rally[]>>;
  completeRally(rallyId: string): Promise<ActionResult<Rally>>;
  submitFeedback(
    rallyId: string,
    userId: string,
    showedUp: boolean,
    rallyAgain: RallyAgainResponse,
  ): Promise<ActionResult<Feedback>>;
  getRallyOutcome(rallyId: string): Promise<ActionResult<RallyOutcome>>;
}

export const USE_MOCKS = process.env.NEXT_PUBLIC_RALLY_USE_MOCKS !== 'false';

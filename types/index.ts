/**
 * FROZEN CONTRACT — owned jointly by Ved + Suri.
 * Changing anything here breaks the other person's build.
 * Rule: announce in team chat before editing, and both must agree.
 */

export type SportId =
  | 'tennis'
  | 'pickleball'
  | 'badminton'
  | 'squash'
  | 'racquetball';

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export type Gender = 'man' | 'woman' | 'nonbinary' | 'other';

export type InterestedIn = 'men' | 'women' | 'everyone';

export type DatingIntent = 'casual' | 'serious' | 'open';

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type TimeBlock = 'morning' | 'afternoon' | 'evening';

export interface AvailabilitySlot {
  day: DayOfWeek;
  block: TimeBlock;
}

export interface SportPreference {
  sport: SportId;
  skill: SkillLevel;
}

export interface DatingPreferences {
  gender: Gender;
  interestedIn: InterestedIn;
  intent: DatingIntent;
  ageMin: number;
  ageMax: number;
}

export interface UserProfile {
  id: string;
  firstName: string;
  age: number;
  year: string;
  major: string;
  bio: string;
  photoUrl: string;
  isUiucVerified: boolean;
  preferences: DatingPreferences;
  sports: SportPreference[];
  availability: AvailabilitySlot[];
}

export interface MatchReason {
  kind: 'sport' | 'skill' | 'schedule' | 'intent' | 'interests';
  text: string;
}

export interface CandidateMatch {
  user: UserProfile;
  score: number;
  reasons: MatchReason[];
  sharedSports: SportId[];
}

export type RallyRequestStatus = 'pending' | 'accepted' | 'declined';

export interface RallyRequest {
  id: string;
  senderId: string;
  receiverId: string;
  sport: SportId;
  status: RallyRequestStatus;
  createdAt: string;
}

export type RallyStatus =
  | 'accepted'
  | 'scheduled'
  | 'completed'
  | 'closed';

export type BookingStatus = 'not_required' | 'pending' | 'booked';

export interface Venue {
  id: string;
  name: string;
  sports: SportId[];
  location: string;
  bookingUrl: string | null;
  requiresReservation: boolean;
}

export interface ScheduleOption {
  slot: AvailabilitySlot;
  date: string;
  overlapQuality: number;
  venue: Venue;
}

export interface Rally {
  id: string;
  requestId: string;
  participantIds: [string, string];
  sport: SportId;
  status: RallyStatus;
  selectedSlot: ScheduleOption | null;
  venue: Venue | null;
  bookingStatus: BookingStatus;
  bookingOwnerId: string | null;
  createdAt: string;
}

export type RallyAgainResponse = 'yes' | 'no';

export interface Feedback {
  id: string;
  rallyId: string;
  userId: string;
  showedUp: boolean;
  rallyAgain: RallyAgainResponse;
  createdAt: string;
}

export interface RallyOutcome {
  rallyId: string;
  bothResponded: boolean;
  isMutualMatch: boolean;
}

export interface OnboardingInput {
  firstName: string;
  age: number;
  year: string;
  major: string;
  bio: string;
  photoUrl: string;
  preferences: DatingPreferences;
  sports: SportPreference[];
  availability: AvailabilitySlot[];
}

/** Every backend action returns this shape so the UI handles errors uniformly. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

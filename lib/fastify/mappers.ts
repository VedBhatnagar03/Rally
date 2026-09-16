import type {
  AvailabilitySlot,
  BookingStatus,
  CandidateMatch,
  DatingIntent,
  Gender,
  InterestedIn,
  Rally,
  RallyRequest,
  RallyRequestStatus,
  RallyStatus,
  ScheduleOption,
  SkillLevel,
  SportId,
  TimeBlock,
  UserProfile,
  Venue,
} from '@/types';

export type ApiSport =
  | 'TENNIS'
  | 'PICKLEBALL'
  | 'BADMINTON'
  | 'SQUASH'
  | 'RACQUETBALL'
  | 'TABLE_TENNIS';

type ApiSkill = 'BEGINNER' | 'CASUAL' | 'INTERMEDIATE' | 'ADVANCED' | 'COMPETITIVE';
type ApiGender = 'WOMAN' | 'MAN' | 'NON_BINARY' | 'SELF_DESCRIBE' | 'PREFER_NOT_TO_SAY';
type ApiDatingIntent = 'DATING' | 'FRIENDS' | 'CASUAL_PLAY' | 'COMPETITIVE';
type ApiRallyStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'COMPLETED';
type ApiCourtStatus = 'NOT_STARTED' | 'NEEDS_USER_ACTION' | 'BOOKED' | 'UNAVAILABLE';

export interface ApiProfileEnvelope {
  id: string;
  email: string;
  status: string;
  profile: {
    displayName: string;
    major: string | null;
    classYear: string | null;
    bio: string | null;
    age: number | null;
    preferredAgeMin: number;
    preferredAgeMax: number;
    gender: ApiGender | null;
    datingIntent: ApiDatingIntent;
    interestedIn: ApiGender[];
    trustScore: number;
  } | null;
  sportProfiles: Array<{
    sport: ApiSport;
    skillLevel: ApiSkill;
    intensity: number;
    favorite: boolean;
  }>;
  availability: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;
  photos?: Array<{ url: string; sortOrder: number }>;
}

export interface ApiVenueEnvelope {
  id: string;
  name: string;
  campusArea: string;
  bookingUrl: string | null;
  sports: ApiSport[];
}

export interface ApiRallyEnvelope {
  id: string;
  senderId: string;
  receiverId: string;
  sport: ApiSport;
  status: ApiRallyStatus;
  courtStatus: ApiCourtStatus;
  bookingOwnerId: string | null;
  proposedStartAt: string;
  proposedEndAt: string;
  createdAt: string;
  venue?: ApiVenueEnvelope | null;
}

const sportMap: Record<ApiSport, SportId | null> = {
  TENNIS: 'tennis',
  PICKLEBALL: 'pickleball',
  BADMINTON: 'badminton',
  SQUASH: 'squash',
  RACQUETBALL: 'racquetball',
  TABLE_TENNIS: null,
};

const reverseSportMap: Record<SportId, ApiSport> = {
  tennis: 'TENNIS',
  pickleball: 'PICKLEBALL',
  badminton: 'BADMINTON',
  squash: 'SQUASH',
  racquetball: 'RACQUETBALL',
};

const skillMap: Record<ApiSkill, SkillLevel> = {
  BEGINNER: 'beginner',
  CASUAL: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
  COMPETITIVE: 'advanced',
};

const genderMap: Record<ApiGender, Gender> = {
  WOMAN: 'woman',
  MAN: 'man',
  NON_BINARY: 'nonbinary',
  SELF_DESCRIBE: 'other',
  PREFER_NOT_TO_SAY: 'other',
};

const interestedInMap: Record<ApiGender, InterestedIn> = {
  WOMAN: 'women',
  MAN: 'men',
  NON_BINARY: 'everyone',
  SELF_DESCRIBE: 'everyone',
  PREFER_NOT_TO_SAY: 'everyone',
};

const intentMap: Record<ApiDatingIntent, DatingIntent> = {
  DATING: 'serious',
  FRIENDS: 'open',
  CASUAL_PLAY: 'casual',
  COMPETITIVE: 'open',
};

const statusMap: Record<ApiRallyStatus, RallyStatus> = {
  PENDING: 'accepted',
  ACCEPTED: 'accepted',
  DECLINED: 'closed',
  CANCELLED: 'closed',
  COMPLETED: 'completed',
};

const bookingStatusMap: Record<ApiCourtStatus, BookingStatus> = {
  NOT_STARTED: 'not_required',
  NEEDS_USER_ACTION: 'pending',
  BOOKED: 'booked',
  UNAVAILABLE: 'pending',
};

export function toApiSport(sport: SportId): ApiSport {
  return reverseSportMap[sport];
}

export function fromApiSport(sport: ApiSport): SportId | null {
  return sportMap[sport];
}

export function toUserProfile(user: ApiProfileEnvelope): UserProfile {
  const profile = user.profile;
  const displayName = profile?.displayName ?? user.email.split('@')[0];
  const sports = user.sportProfiles.flatMap((sport) => {
    const mapped = fromApiSport(sport.sport);
    return mapped ? [{ sport: mapped, skill: skillMap[sport.skillLevel] }] : [];
  });

  return {
    id: user.id,
    firstName: displayName.split(/\s+/)[0] || displayName,
    age: profile?.age ?? 18,
    year: profile?.classYear ?? 'UIUC',
    major: profile?.major ?? 'Undeclared',
    bio: profile?.bio ?? '',
    photoUrl: user.photos?.[0]?.url ?? '',
    isUiucVerified: user.status === 'ACTIVE',
    preferences: {
      gender: profile?.gender ? genderMap[profile.gender] : 'other',
      interestedIn: profile?.interestedIn?.[0]
        ? interestedInMap[profile.interestedIn[0]]
        : 'everyone',
      intent: profile?.datingIntent ? intentMap[profile.datingIntent] : 'open',
      ageMin: profile?.preferredAgeMin ?? 18,
      ageMax: profile?.preferredAgeMax ?? 30,
    },
    sports,
    availability: user.availability.map(toAvailabilitySlot),
  };
}

export function toVenue(venue: ApiVenueEnvelope): Venue {
  return {
    id: venue.id,
    name: venue.name,
    sports: venue.sports.flatMap((sport) => {
      const mapped = fromApiSport(sport);
      return mapped ? [mapped] : [];
    }),
    location: venue.campusArea,
    bookingUrl: venue.bookingUrl,
    requiresReservation: true,
  };
}

export function toRallyRequest(rally: ApiRallyEnvelope): RallyRequest {
  return {
    id: rally.id,
    senderId: rally.senderId,
    receiverId: rally.receiverId,
    sport: fromApiSport(rally.sport) ?? 'tennis',
    status: toRequestStatus(rally.status),
    createdAt: rally.createdAt,
  };
}

export function toRally(
  rally: ApiRallyEnvelope,
  selectedSlot: ScheduleOption | null = null,
): Rally {
  const venue = rally.venue ? toVenue(rally.venue) : (selectedSlot?.venue ?? null);
  const persistedSlot =
    selectedSlot ?? (venue ? toScheduleOptionFromRally(rally, venue) : null);

  return {
    id: rally.id,
    requestId: rally.id,
    participantIds: [rally.senderId, rally.receiverId],
    sport: fromApiSport(rally.sport) ?? 'tennis',
    status: persistedSlot && rally.status === 'ACCEPTED' ? 'scheduled' : statusMap[rally.status],
    selectedSlot: persistedSlot,
    venue,
    bookingStatus: bookingStatusMap[rally.courtStatus],
    bookingOwnerId: rally.bookingOwnerId,
    createdAt: rally.createdAt,
  };
}

export function toCandidateMatch(
  rec: { userId: string; displayName: string; recommendedSport: ApiSport; score: number },
  user: UserProfile,
): CandidateMatch {
  const sport = fromApiSport(rec.recommendedSport);
  return {
    user,
    score: rec.score / 100,
    reasons: sport ? [{ kind: 'sport', text: `Recommended for ${sport}` }] : [],
    sharedSports: sport ? [sport] : [],
  };
}

export function toScheduleOption(input: {
  sport: ApiSport;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  venue: ApiVenueEnvelope | null;
}): ScheduleOption | null {
  if (!input.venue) return null;
  const slot = toAvailabilitySlot(input);
  return {
    slot,
    date: nextDateForDayNumber(input.dayOfWeek),
    overlapQuality: slot.block === 'evening' ? 1 : slot.block === 'afternoon' ? 0.8 : 0.6,
    venue: toVenue(input.venue),
  };
}

function toRequestStatus(status: ApiRallyStatus): RallyRequestStatus {
  if (status === 'DECLINED') return 'declined';
  if (status === 'ACCEPTED' || status === 'COMPLETED') return 'accepted';
  return 'pending';
}

function toAvailabilitySlot(window: { dayOfWeek: number; startTime: string }): AvailabilitySlot {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  return {
    day: days[window.dayOfWeek] ?? 'mon',
    block: timeBlock(window.startTime),
  };
}

function toScheduleOptionFromRally(rally: ApiRallyEnvelope, venue: Venue): ScheduleOption {
  const start = new Date(rally.proposedStartAt);
  const slot = {
    day: (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[start.getDay()],
    block: timeBlock(start.toISOString().slice(11, 16)),
  };

  return {
    slot,
    date: start.toISOString().slice(0, 10),
    overlapQuality: slot.block === 'evening' ? 1 : slot.block === 'afternoon' ? 0.8 : 0.6,
    venue,
  };
}

function timeBlock(time: string): TimeBlock {
  const hour = Number(time.split(':')[0]);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function nextDateForDayNumber(dayOfWeek: number) {
  const from = new Date();
  const delta = (dayOfWeek - from.getDay() + 7) % 7 || 7;
  const result = new Date(from);
  result.setDate(from.getDate() + delta);
  return result.toISOString().slice(0, 10);
}

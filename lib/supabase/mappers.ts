/** DB row -> app type conversion. Owner: Ved. */

import type {
  AvailabilitySlot,
  Feedback,
  Rally,
  RallyRequest,
  ScheduleOption,
  SportPreference,
  UserProfile,
  Venue,
} from '@/types';
import type {
  AvailabilityRow,
  DatingPreferencesRow,
  FeedbackRow,
  ProfileRow,
  RallyRequestRow,
  RallyRow,
  UserSportRow,
  VenueRow,
} from './database.types';

export function toUserProfile(
  profile: ProfileRow,
  prefs: DatingPreferencesRow,
  sports: UserSportRow[],
  availability: AvailabilityRow[],
): UserProfile {
  return {
    id: profile.id,
    firstName: profile.first_name,
    age: profile.age,
    year: profile.year,
    major: profile.major,
    bio: profile.bio,
    photoUrl: profile.photo_url,
    isUiucVerified: profile.is_uiuc_verified,
    preferences: {
      gender: prefs.gender,
      interestedIn: prefs.interested_in,
      intent: prefs.intent,
      ageMin: prefs.age_min,
      ageMax: prefs.age_max,
    },
    sports: sports.map(
      (s): SportPreference => ({ sport: s.sport, skill: s.skill }),
    ),
    availability: availability.map(
      (a): AvailabilitySlot => ({ day: a.day, block: a.block }),
    ),
  };
}

export function toVenue(row: VenueRow): Venue {
  return {
    id: row.id,
    name: row.name,
    sports: row.sports,
    location: row.location,
    bookingUrl: row.booking_url,
    requiresReservation: row.requires_reservation,
  };
}

export function toRallyRequest(row: RallyRequestRow): RallyRequest {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    sport: row.sport,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function toRally(row: RallyRow, venue: Venue | null): Rally {
  const selectedSlot: ScheduleOption | null =
    row.scheduled_date && row.scheduled_block && venue
      ? {
          slot: { day: dayFromDate(row.scheduled_date), block: row.scheduled_block },
          date: row.scheduled_date,
          overlapQuality: 1,
          venue,
        }
      : null;

  return {
    id: row.id,
    requestId: row.request_id,
    participantIds: [row.participant_a, row.participant_b],
    sport: row.sport,
    status: row.status,
    selectedSlot,
    venue,
    bookingStatus: row.booking_status,
    bookingOwnerId: row.booking_owner_id,
    createdAt: row.created_at,
  };
}

export function toFeedback(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    rallyId: row.rally_id,
    userId: row.profile_id,
    showedUp: row.showed_up,
    rallyAgain: row.rally_again,
    createdAt: row.created_at,
  };
}

function dayFromDate(date: string) {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  return days[new Date(`${date}T12:00:00`).getDay()];
}

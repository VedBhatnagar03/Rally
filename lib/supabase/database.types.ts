/**
 * Database row shapes. Owner: Ved.
 * Mirrors database/migrations/*.sql — update together.
 *
 * These are snake_case DB rows. The camelCase app types in @/types are the
 * contract with Suri; mappers.ts converts between them.
 */

import type {
  BookingStatus,
  DatingIntent,
  DayOfWeek,
  Gender,
  InterestedIn,
  RallyAgainResponse,
  RallyRequestStatus,
  RallyStatus,
  SkillLevel,
  SportId,
  TimeBlock,
} from '@/types';

export type ProfileRow = {
  id: string;
  auth_user_id: string | null;
  first_name: string;
  age: number;
  year: string;
  major: string;
  bio: string;
  photo_url: string;
  is_uiuc_verified: boolean;
  created_at: string;
}

export type DatingPreferencesRow = {
  profile_id: string;
  gender: Gender;
  interested_in: InterestedIn;
  intent: DatingIntent;
  age_min: number;
  age_max: number;
}

export type UserSportRow = {
  profile_id: string;
  sport: SportId;
  skill: SkillLevel;
}

export type AvailabilityRow = {
  profile_id: string;
  day: DayOfWeek;
  block: TimeBlock;
}

export type VenueRow = {
  id: string;
  name: string;
  sports: SportId[];
  location: string;
  booking_url: string | null;
  requires_reservation: boolean;
}

export type RallyRequestRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  sport: SportId;
  status: RallyRequestStatus;
  created_at: string;
}

export type RallyRow = {
  id: string;
  request_id: string;
  participant_a: string;
  participant_b: string;
  sport: SportId;
  status: RallyStatus;
  scheduled_date: string | null;
  scheduled_block: TimeBlock | null;
  venue_id: string | null;
  booking_status: BookingStatus;
  booking_owner_id: string | null;
  created_at: string;
}

export type FeedbackRow = {
  id: string;
  rally_id: string;
  profile_id: string;
  showed_up: boolean;
  rally_again: RallyAgainResponse;
  created_at: string;
}

export type BlockRow = {
  blocker_id: string;
  blocked_id: string;
}

export type AnalyticsEventRow = {
  id: string;
  profile_id: string | null;
  event_name: string;
  payload: Record<string, unknown>;
  created_at: string;
}

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type Table<Row, Insert = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: Relationship[];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      dating_preferences: Table<DatingPreferencesRow>;
      user_sports: Table<UserSportRow>;
      availability: Table<AvailabilityRow>;
      venues: Table<VenueRow>;
      rally_requests: Table<RallyRequestRow>;
      rallies: Table<RallyRow>;
      feedback: Table<FeedbackRow>;
      blocks: Table<BlockRow>;
      analytics_events: Table<AnalyticsEventRow>;
    };
    Views: Record<
      string,
      { Row: Record<string, unknown>; Relationships: Relationship[] }
    >;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, Record<string, unknown>>;
  };
}

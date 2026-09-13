-- Rally initial schema
-- Owner: Ved

create type sport_id as enum ('tennis','pickleball','badminton','squash','racquetball');
create type skill_level as enum ('beginner','intermediate','advanced');
create type gender as enum ('man','woman','nonbinary','other');
create type interested_in as enum ('men','women','everyone');
create type dating_intent as enum ('casual','serious','open');
create type day_of_week as enum ('mon','tue','wed','thu','fri','sat','sun');
create type time_block as enum ('morning','afternoon','evening');
create type rally_request_status as enum ('pending','accepted','declined');
create type rally_status as enum ('accepted','scheduled','completed','closed');
create type booking_status as enum ('not_required','pending','booked');
create type rally_again_response as enum ('yes','no');

create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  first_name text not null,
  age int not null check (age >= 18),
  year text not null,
  major text not null,
  bio text not null default '',
  photo_url text not null default '',
  is_uiuc_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table dating_preferences (
  profile_id uuid primary key references profiles(id) on delete cascade,
  gender gender not null,
  interested_in interested_in not null,
  intent dating_intent not null,
  age_min int not null default 18,
  age_max int not null default 30
);

create table user_sports (
  profile_id uuid references profiles(id) on delete cascade,
  sport sport_id not null,
  skill skill_level not null,
  primary key (profile_id, sport)
);

create table availability (
  profile_id uuid references profiles(id) on delete cascade,
  day day_of_week not null,
  block time_block not null,
  primary key (profile_id, day, block)
);

create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sports sport_id[] not null,
  location text not null,
  booking_url text,
  requires_reservation boolean not null default true
);

create table rally_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  receiver_id uuid not null references profiles(id) on delete cascade,
  sport sport_id not null,
  status rally_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id),
  unique (sender_id, receiver_id, sport)
);

create table rallies (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references rally_requests(id) on delete cascade,
  participant_a uuid not null references profiles(id) on delete cascade,
  participant_b uuid not null references profiles(id) on delete cascade,
  sport sport_id not null,
  status rally_status not null default 'accepted',
  scheduled_date date,
  scheduled_block time_block,
  venue_id uuid references venues(id),
  booking_status booking_status not null default 'pending',
  booking_owner_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table feedback (
  id uuid primary key default gen_random_uuid(),
  rally_id uuid not null references rallies(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  showed_up boolean not null,
  rally_again rally_again_response not null,
  created_at timestamptz not null default now(),
  unique (rally_id, profile_id)
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  reported_id uuid not null references profiles(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

create table blocks (
  blocker_id uuid references profiles(id) on delete cascade,
  blocked_id uuid references profiles(id) on delete cascade,
  primary key (blocker_id, blocked_id)
);

create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  event_name text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index on rally_requests (receiver_id, status);
create index on rallies (participant_a);
create index on rallies (participant_b);
create index on availability (profile_id);
create index on user_sports (profile_id);

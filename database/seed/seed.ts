/**
 * Seeds venues and demo profiles. Owner: Ved.
 *
 *   npm run seed
 *
 * Idempotent: wipes Rally's own tables first, so re-running is safe.
 * Uses the service-role key and must never run in the browser.
 */

import { config } from 'dotenv';
import { createServiceClient } from '@/lib/supabase/client';
import { UIUC_VENUES } from '@/scheduling/venues';
import { SEED_PROFILES, photoFor } from './profiles';

config({ path: '.env.local' });

async function main() {
  const db = createServiceClient();

  // Everything else cascades from these two.
  console.log('Clearing existing data...');
  for (const table of ['profiles', 'venues'] as const) {
    const { error } = await db
      .from(table)
      .delete()
      .not('id', 'is', null);
    if (error) throw new Error(`clearing ${table}: ${error.message}`);
  }

  console.log(`Seeding ${UIUC_VENUES.length} venues...`);
  const { error: venueError } = await db.from('venues').insert(
    UIUC_VENUES.map((v) => ({
      id: v.id,
      name: v.name,
      sports: v.sports,
      location: v.location,
      booking_url: v.bookingUrl,
      requires_reservation: v.requiresReservation,
    })),
  );
  if (venueError) throw new Error(`venues: ${venueError.message}`);

  console.log(`Seeding ${SEED_PROFILES.length} profiles...`);
  for (const seed of SEED_PROFILES) {
    const { data: profile, error } = await db
      .from('profiles')
      .insert({
        first_name: seed.firstName,
        age: seed.age,
        year: seed.year,
        major: seed.major,
        bio: seed.bio,
        photo_url: photoFor(seed.key),
        is_uiuc_verified: true,
      })
      .select()
      .single();

    if (error || !profile) {
      throw new Error(`profile ${seed.key}: ${error?.message}`);
    }

    const [prefs, sports, availability] = await Promise.all([
      db.from('dating_preferences').insert({
        profile_id: profile.id,
        gender: seed.preferences.gender,
        interested_in: seed.preferences.interestedIn,
        intent: seed.preferences.intent,
        age_min: seed.preferences.ageMin,
        age_max: seed.preferences.ageMax,
      }),
      db.from('user_sports').insert(
        seed.sports.map((s) => ({
          profile_id: profile.id,
          sport: s.sport,
          skill: s.skill,
        })),
      ),
      db.from('availability').insert(
        seed.availability.map((a) => ({
          profile_id: profile.id,
          day: a.day,
          block: a.block,
        })),
      ),
    ]);

    const writeError = prefs.error ?? sports.error ?? availability.error;
    if (writeError) {
      throw new Error(`profile ${seed.key} details: ${writeError.message}`);
    }

    console.log(`  ${seed.firstName} (${profile.id.slice(0, 8)})`);
  }

  console.log('\nSeed complete.');
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});

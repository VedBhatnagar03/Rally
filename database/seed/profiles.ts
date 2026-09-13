/**
 * Demo profile data. Owner: Ved.
 *
 * Engineered so the demo pair (Maya + Dev) scores high with visible reasons,
 * and so every sport has enough people that discovery never looks empty.
 *
 * Photos are deterministic placeholders; swap for real images before demo.
 */

import type {
  AvailabilitySlot,
  DatingPreferences,
  SportPreference,
} from '@/types';

export interface SeedProfile {
  key: string;
  firstName: string;
  age: number;
  year: string;
  major: string;
  bio: string;
  preferences: DatingPreferences;
  sports: SportPreference[];
  availability: AvailabilitySlot[];
}

const photo = (key: string) =>
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${key}`;

export function photoFor(key: string): string {
  return photo(key);
}

export const SEED_PROFILES: SeedProfile[] = [
  // --- The demo pair. Keep these two first and keep them compatible. ---
  {
    key: 'maya',
    firstName: 'Maya',
    age: 20,
    year: 'Junior',
    major: 'Computer Science',
    bio: 'Tennis since middle school. Looking for someone to hit with who will actually keep score.',
    preferences: {
      gender: 'woman',
      interestedIn: 'men',
      intent: 'serious',
      ageMin: 19,
      ageMax: 24,
    },
    sports: [
      { sport: 'tennis', skill: 'intermediate' },
      { sport: 'pickleball', skill: 'beginner' },
    ],
    availability: [
      { day: 'tue', block: 'evening' },
      { day: 'thu', block: 'evening' },
      { day: 'sat', block: 'morning' },
      { day: 'sun', block: 'afternoon' },
    ],
  },
  {
    key: 'dev',
    firstName: 'Dev',
    age: 21,
    year: 'Junior',
    major: 'Computer Science',
    bio: 'Grew up on clay courts. Will absolutely get competitive about pickleball.',
    preferences: {
      gender: 'man',
      interestedIn: 'women',
      intent: 'serious',
      ageMin: 19,
      ageMax: 23,
    },
    sports: [
      { sport: 'tennis', skill: 'intermediate' },
      { sport: 'pickleball', skill: 'beginner' },
    ],
    availability: [
      { day: 'tue', block: 'evening' },
      { day: 'thu', block: 'evening' },
      { day: 'sat', block: 'morning' },
      { day: 'fri', block: 'evening' },
    ],
  },

  // --- Supporting cast ---
  {
    key: 'priya',
    firstName: 'Priya',
    age: 20,
    year: 'Sophomore',
    major: 'Bioengineering',
    bio: 'Badminton player. Chemistry labs by day, smashes by night.',
    preferences: {
      gender: 'woman',
      interestedIn: 'men',
      intent: 'casual',
      ageMin: 18,
      ageMax: 24,
    },
    sports: [
      { sport: 'badminton', skill: 'advanced' },
      { sport: 'tennis', skill: 'beginner' },
    ],
    availability: [
      { day: 'mon', block: 'evening' },
      { day: 'wed', block: 'evening' },
      { day: 'sat', block: 'afternoon' },
    ],
  },
  {
    key: 'jordan',
    firstName: 'Jordan',
    age: 22,
    year: 'Senior',
    major: 'Economics',
    bio: 'Squash four times a week. Looking for someone who does not mind losing.',
    preferences: {
      gender: 'man',
      interestedIn: 'everyone',
      intent: 'open',
      ageMin: 19,
      ageMax: 25,
    },
    sports: [
      { sport: 'squash', skill: 'advanced' },
      { sport: 'racquetball', skill: 'intermediate' },
    ],
    availability: [
      { day: 'mon', block: 'morning' },
      { day: 'wed', block: 'morning' },
      { day: 'fri', block: 'evening' },
    ],
  },
  {
    key: 'sofia',
    firstName: 'Sofia',
    age: 19,
    year: 'Sophomore',
    major: 'Architecture',
    bio: 'Picked up pickleball last summer and now it is my whole personality.',
    preferences: {
      gender: 'woman',
      interestedIn: 'everyone',
      intent: 'casual',
      ageMin: 18,
      ageMax: 23,
    },
    sports: [
      { sport: 'pickleball', skill: 'intermediate' },
      { sport: 'tennis', skill: 'beginner' },
    ],
    availability: [
      { day: 'tue', block: 'afternoon' },
      { day: 'thu', block: 'evening' },
      { day: 'sun', block: 'afternoon' },
    ],
  },
  {
    key: 'marcus',
    firstName: 'Marcus',
    age: 21,
    year: 'Junior',
    major: 'Mechanical Engineering',
    bio: 'Tennis and long debates about whether pickleball counts as a real sport.',
    preferences: {
      gender: 'man',
      interestedIn: 'women',
      intent: 'casual',
      ageMin: 18,
      ageMax: 24,
    },
    sports: [
      { sport: 'tennis', skill: 'advanced' },
      { sport: 'racquetball', skill: 'beginner' },
    ],
    availability: [
      { day: 'wed', block: 'evening' },
      { day: 'sat', block: 'morning' },
      { day: 'sun', block: 'morning' },
    ],
  },
  {
    key: 'aisha',
    firstName: 'Aisha',
    age: 20,
    year: 'Junior',
    major: 'Psychology',
    bio: 'Badminton doubles specialist. Great at apologizing after winning.',
    preferences: {
      gender: 'woman',
      interestedIn: 'men',
      intent: 'serious',
      ageMin: 19,
      ageMax: 25,
    },
    sports: [
      { sport: 'badminton', skill: 'intermediate' },
      { sport: 'pickleball', skill: 'intermediate' },
    ],
    availability: [
      { day: 'mon', block: 'evening' },
      { day: 'thu', block: 'evening' },
      { day: 'sat', block: 'afternoon' },
    ],
  },
  {
    key: 'tyler',
    firstName: 'Tyler',
    age: 23,
    year: 'Grad',
    major: 'Computer Science',
    bio: 'Racquetball is underrated and I will die on this hill.',
    preferences: {
      gender: 'man',
      interestedIn: 'women',
      intent: 'open',
      ageMin: 20,
      ageMax: 26,
    },
    sports: [
      { sport: 'racquetball', skill: 'advanced' },
      { sport: 'squash', skill: 'intermediate' },
    ],
    availability: [
      { day: 'tue', block: 'morning' },
      { day: 'thu', block: 'afternoon' },
      { day: 'fri', block: 'evening' },
    ],
  },
  {
    key: 'elena',
    firstName: 'Elena',
    age: 21,
    year: 'Senior',
    major: 'Statistics',
    bio: 'Tennis on weekends, spreadsheets on weekdays.',
    preferences: {
      gender: 'woman',
      interestedIn: 'men',
      intent: 'serious',
      ageMin: 20,
      ageMax: 25,
    },
    sports: [
      { sport: 'tennis', skill: 'intermediate' },
      { sport: 'squash', skill: 'beginner' },
    ],
    availability: [
      { day: 'sat', block: 'morning' },
      { day: 'sun', block: 'morning' },
      { day: 'wed', block: 'evening' },
    ],
  },
  {
    key: 'omar',
    firstName: 'Omar',
    age: 20,
    year: 'Sophomore',
    major: 'Physics',
    bio: 'Badminton since I was six. Also happy to just rally without keeping score.',
    preferences: {
      gender: 'man',
      interestedIn: 'women',
      intent: 'casual',
      ageMin: 18,
      ageMax: 23,
    },
    sports: [
      { sport: 'badminton', skill: 'advanced' },
      { sport: 'tennis', skill: 'beginner' },
    ],
    availability: [
      { day: 'mon', block: 'evening' },
      { day: 'wed', block: 'evening' },
      { day: 'sun', block: 'afternoon' },
    ],
  },
  {
    key: 'grace',
    firstName: 'Grace',
    age: 19,
    year: 'Freshman',
    major: 'Information Sciences',
    bio: 'New to pickleball, very enthusiastic, very bad. Improving though.',
    preferences: {
      gender: 'woman',
      interestedIn: 'everyone',
      intent: 'casual',
      ageMin: 18,
      ageMax: 22,
    },
    sports: [{ sport: 'pickleball', skill: 'beginner' }],
    availability: [
      { day: 'tue', block: 'afternoon' },
      { day: 'thu', block: 'afternoon' },
      { day: 'sat', block: 'afternoon' },
    ],
  },
  {
    key: 'nathan',
    firstName: 'Nathan',
    age: 22,
    year: 'Senior',
    major: 'Architecture',
    bio: 'Squash, coffee, and complaining about studio deadlines.',
    preferences: {
      gender: 'man',
      interestedIn: 'everyone',
      intent: 'serious',
      ageMin: 19,
      ageMax: 25,
    },
    sports: [
      { sport: 'squash', skill: 'intermediate' },
      { sport: 'badminton', skill: 'beginner' },
    ],
    availability: [
      { day: 'mon', block: 'afternoon' },
      { day: 'thu', block: 'evening' },
      { day: 'fri', block: 'afternoon' },
    ],
  },
  {
    key: 'zoe',
    firstName: 'Zoe',
    age: 20,
    year: 'Junior',
    major: 'Economics',
    bio: 'Tennis player, terrible loser, working on it.',
    preferences: {
      gender: 'woman',
      interestedIn: 'men',
      intent: 'casual',
      ageMin: 19,
      ageMax: 24,
    },
    sports: [
      { sport: 'tennis', skill: 'advanced' },
      { sport: 'pickleball', skill: 'intermediate' },
    ],
    availability: [
      { day: 'tue', block: 'evening' },
      { day: 'fri', block: 'evening' },
      { day: 'sun', block: 'morning' },
    ],
  },
  {
    key: 'raj',
    firstName: 'Raj',
    age: 21,
    year: 'Junior',
    major: 'Bioengineering',
    bio: 'Badminton and biology. Will explain both at length if you let me.',
    preferences: {
      gender: 'man',
      interestedIn: 'women',
      intent: 'serious',
      ageMin: 19,
      ageMax: 24,
    },
    sports: [
      { sport: 'badminton', skill: 'intermediate' },
      { sport: 'squash', skill: 'beginner' },
    ],
    availability: [
      { day: 'mon', block: 'evening' },
      { day: 'wed', block: 'afternoon' },
      { day: 'sat', block: 'afternoon' },
    ],
  },
  {
    key: 'chloe',
    firstName: 'Chloe',
    age: 22,
    year: 'Grad',
    major: 'Psychology',
    bio: 'Racquetball to decompress from research. Surprisingly aggressive on court.',
    preferences: {
      gender: 'woman',
      interestedIn: 'everyone',
      intent: 'open',
      ageMin: 20,
      ageMax: 26,
    },
    sports: [
      { sport: 'racquetball', skill: 'intermediate' },
      { sport: 'tennis', skill: 'beginner' },
    ],
    availability: [
      { day: 'tue', block: 'morning' },
      { day: 'thu', block: 'morning' },
      { day: 'fri', block: 'afternoon' },
    ],
  },
  {
    key: 'liam',
    firstName: 'Liam',
    age: 20,
    year: 'Sophomore',
    major: 'Mechanical Engineering',
    bio: 'Pickleball convert. Tennis was too much running.',
    preferences: {
      gender: 'man',
      interestedIn: 'women',
      intent: 'casual',
      ageMin: 18,
      ageMax: 23,
    },
    sports: [
      { sport: 'pickleball', skill: 'advanced' },
      { sport: 'badminton', skill: 'beginner' },
    ],
    availability: [
      { day: 'wed', block: 'evening' },
      { day: 'sat', block: 'morning' },
      { day: 'sun', block: 'afternoon' },
    ],
  },
  {
    key: 'nina',
    firstName: 'Nina',
    age: 19,
    year: 'Freshman',
    major: 'Statistics',
    bio: 'Played badminton in high school, trying to find people here.',
    preferences: {
      gender: 'woman',
      interestedIn: 'men',
      intent: 'casual',
      ageMin: 18,
      ageMax: 22,
    },
    sports: [
      { sport: 'badminton', skill: 'intermediate' },
      { sport: 'pickleball', skill: 'beginner' },
    ],
    availability: [
      { day: 'mon', block: 'afternoon' },
      { day: 'wed', block: 'evening' },
      { day: 'thu', block: 'evening' },
    ],
  },
  {
    key: 'caleb',
    firstName: 'Caleb',
    age: 23,
    year: 'Grad',
    major: 'Physics',
    bio: 'Tennis, mostly badly, but with enormous enthusiasm.',
    preferences: {
      gender: 'man',
      interestedIn: 'everyone',
      intent: 'open',
      ageMin: 20,
      ageMax: 26,
    },
    sports: [
      { sport: 'tennis', skill: 'beginner' },
      { sport: 'racquetball', skill: 'beginner' },
    ],
    availability: [
      { day: 'tue', block: 'afternoon' },
      { day: 'fri', block: 'evening' },
      { day: 'sat', block: 'afternoon' },
    ],
  },
  {
    key: 'hana',
    firstName: 'Hana',
    age: 21,
    year: 'Senior',
    major: 'Computer Science',
    bio: 'Squash player. I promise I am nicer off the court.',
    preferences: {
      gender: 'woman',
      interestedIn: 'men',
      intent: 'serious',
      ageMin: 20,
      ageMax: 25,
    },
    sports: [
      { sport: 'squash', skill: 'advanced' },
      { sport: 'tennis', skill: 'intermediate' },
    ],
    availability: [
      { day: 'mon', block: 'morning' },
      { day: 'thu', block: 'afternoon' },
      { day: 'sun', block: 'morning' },
    ],
  },
  {
    key: 'diego',
    firstName: 'Diego',
    age: 20,
    year: 'Junior',
    major: 'Information Sciences',
    bio: 'Pickleball doubles. Looking for a partner in both senses.',
    preferences: {
      gender: 'man',
      interestedIn: 'women',
      intent: 'serious',
      ageMin: 18,
      ageMax: 24,
    },
    sports: [
      { sport: 'pickleball', skill: 'intermediate' },
      { sport: 'tennis', skill: 'intermediate' },
    ],
    availability: [
      { day: 'tue', block: 'evening' },
      { day: 'thu', block: 'evening' },
      { day: 'sat', block: 'morning' },
    ],
  },
  {
    key: 'yuki',
    firstName: 'Yuki',
    age: 22,
    year: 'Grad',
    major: 'Architecture',
    bio: 'Badminton and building models. Both require patience.',
    preferences: {
      gender: 'woman',
      interestedIn: 'everyone',
      intent: 'open',
      ageMin: 20,
      ageMax: 26,
    },
    sports: [
      { sport: 'badminton', skill: 'advanced' },
      { sport: 'squash', skill: 'intermediate' },
    ],
    availability: [
      { day: 'wed', block: 'afternoon' },
      { day: 'fri', block: 'evening' },
      { day: 'sun', block: 'afternoon' },
    ],
  },
  {
    key: 'ethan',
    firstName: 'Ethan',
    age: 19,
    year: 'Sophomore',
    major: 'Economics',
    bio: 'Tennis in the mornings before anyone else is awake.',
    preferences: {
      gender: 'man',
      interestedIn: 'women',
      intent: 'casual',
      ageMin: 18,
      ageMax: 22,
    },
    sports: [
      { sport: 'tennis', skill: 'intermediate' },
      { sport: 'pickleball', skill: 'beginner' },
    ],
    availability: [
      { day: 'mon', block: 'morning' },
      { day: 'wed', block: 'morning' },
      { day: 'sat', block: 'morning' },
    ],
  },
  {
    key: 'amara',
    firstName: 'Amara',
    age: 20,
    year: 'Junior',
    major: 'Psychology',
    bio: 'Racquetball, podcasts, and aggressively planning my week.',
    preferences: {
      gender: 'woman',
      interestedIn: 'men',
      intent: 'casual',
      ageMin: 19,
      ageMax: 24,
    },
    sports: [
      { sport: 'racquetball', skill: 'intermediate' },
      { sport: 'badminton', skill: 'beginner' },
    ],
    availability: [
      { day: 'tue', block: 'evening' },
      { day: 'thu', block: 'afternoon' },
      { day: 'fri', block: 'evening' },
    ],
  },
  {
    key: 'sam',
    firstName: 'Sam',
    age: 21,
    year: 'Senior',
    major: 'Bioengineering',
    bio: 'Squash and very strong opinions about campus coffee.',
    preferences: {
      gender: 'nonbinary',
      interestedIn: 'everyone',
      intent: 'open',
      ageMin: 19,
      ageMax: 25,
    },
    sports: [
      { sport: 'squash', skill: 'intermediate' },
      { sport: 'pickleball', skill: 'intermediate' },
    ],
    availability: [
      { day: 'mon', block: 'evening' },
      { day: 'wed', block: 'evening' },
      { day: 'sat', block: 'afternoon' },
    ],
  },
];

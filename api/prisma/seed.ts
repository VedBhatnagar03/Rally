import "dotenv/config";
import {
  DatingIntent,
  Gender,
  PrismaClient,
  SkillLevel,
  Sport
} from "@prisma/client";
import { SEED_PROFILES, photoFor } from "../../database/seed/profiles.js";
import { hashPassword } from "../src/utils/password.js";

const prisma = new PrismaClient();
const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const adminPassword = process.env.RALLY_SEED_ADMIN_PASSWORD ?? "correct-horse-battery-staple";
const demoPassword = process.env.RALLY_SEED_DEMO_PASSWORD ?? "local-demo-password-change-me";

const genders = {
  woman: Gender.WOMAN,
  man: Gender.MAN,
  nonbinary: Gender.NON_BINARY,
  other: Gender.SELF_DESCRIBE
} as const;

const interests = {
  women: [Gender.WOMAN],
  men: [Gender.MAN],
  everyone: [Gender.WOMAN, Gender.MAN, Gender.NON_BINARY]
} as const;

const intents = {
  serious: DatingIntent.DATING,
  casual: DatingIntent.CASUAL_PLAY,
  open: DatingIntent.FRIENDS
} as const;

const sports = {
  tennis: Sport.TENNIS,
  pickleball: Sport.PICKLEBALL,
  badminton: Sport.BADMINTON,
  squash: Sport.SQUASH,
  racquetball: Sport.RACQUETBALL
} as const;

const skills = {
  beginner: SkillLevel.BEGINNER,
  intermediate: SkillLevel.INTERMEDIATE,
  advanced: SkillLevel.ADVANCED
} as const;

const days = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 } as const;
const blocks = {
  morning: { startTime: "09:00", endTime: "12:00" },
  afternoon: { startTime: "13:00", endTime: "17:00" },
  evening: { startTime: "18:00", endTime: "21:00" }
} as const;

const venues = [
  {
    name: "Illini Grove Tennis Courts",
    campusArea: "South Campus",
    sports: ["TENNIS", "PICKLEBALL"] as const,
    bookingUrl: "https://campusrec.illinois.edu/",
    bookingLeadTime: 72,
    notes: "Outdoor lighted tennis courts. Rally should guide users to the official reservation flow."
  },
  {
    name: "ARC Courts",
    campusArea: "Ikenberry / ARC",
    sports: ["BADMINTON", "RACQUETBALL", "SQUASH"] as const,
    bookingUrl: "https://campusrec.illinois.edu/",
    bookingLeadTime: 72,
    notes: "Indoor court option for badminton, racquetball, and squash depending on Campus Rec availability."
  },
  {
    name: "CRCE Courts",
    campusArea: "East Campus",
    sports: ["BADMINTON", "RACQUETBALL", "SQUASH"] as const,
    bookingUrl: "https://campusrec.illinois.edu/",
    bookingLeadTime: 72,
    notes: "Secondary indoor court option for East Campus users."
  }
];

async function main() {
  for (const venue of venues) {
    await prisma.venue.upsert({
      where: { name: venue.name },
      create: venue,
      update: venue
    });
  }

  const demoPasswordHash = await hashPassword(demoPassword);

  for (const seed of SEED_PROFILES) {
    const email = `${seed.key}@illinois.edu`;
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash: demoPasswordHash,
        status: "ACTIVE"
      },
      update: {
        passwordHash: demoPasswordHash,
        status: "ACTIVE"
      }
    });

    await prisma.$transaction([
      prisma.profile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          displayName: seed.firstName,
          age: seed.age,
          major: seed.major,
          classYear: seed.year,
          bio: seed.bio,
          gender: genders[seed.preferences.gender],
          datingIntent: intents[seed.preferences.intent],
          interestedIn: [...interests[seed.preferences.interestedIn]],
          preferredAgeMin: seed.preferences.ageMin,
          preferredAgeMax: seed.preferences.ageMax,
          campusZone: "UIUC",
          trustScore: 75,
          profileComplete: true
        },
        update: {
          displayName: seed.firstName,
          age: seed.age,
          major: seed.major,
          classYear: seed.year,
          bio: seed.bio,
          gender: genders[seed.preferences.gender],
          datingIntent: intents[seed.preferences.intent],
          interestedIn: [...interests[seed.preferences.interestedIn]],
          preferredAgeMin: seed.preferences.ageMin,
          preferredAgeMax: seed.preferences.ageMax,
          campusZone: "UIUC",
          trustScore: 75,
          profileComplete: true
        }
      }),
      prisma.sportProfile.deleteMany({ where: { userId: user.id } }),
      prisma.availabilityWindow.deleteMany({ where: { userId: user.id } }),
      prisma.photo.deleteMany({ where: { userId: user.id } }),
      prisma.sportProfile.createMany({
        data: seed.sports.map((entry, index) => ({
          userId: user.id,
          sport: sports[entry.sport],
          skillLevel: skills[entry.skill],
          intensity: 3,
          favorite: index === 0
        }))
      }),
      prisma.availabilityWindow.createMany({
        data: seed.availability.map((entry) => ({
          userId: user.id,
          dayOfWeek: days[entry.day],
          ...blocks[entry.block]
        }))
      }),
      prisma.photo.create({
        data: { userId: user.id, url: photoFor(seed.key), sortOrder: 0 }
      })
    ]);
  }

  if (adminEmails.length > 0) {
    const passwordHash = await hashPassword(adminPassword);

    for (const email of adminEmails) {
      await prisma.user.upsert({
        where: { email },
        create: {
          email,
          passwordHash,
          status: "ACTIVE",
          role: "ADMIN"
        },
        update: {
          status: "ACTIVE",
          role: "ADMIN"
        }
      });
    }
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

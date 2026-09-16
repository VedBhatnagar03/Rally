import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/utils/password.js";

const prisma = new PrismaClient();
const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const adminPassword = process.env.RALLY_SEED_ADMIN_PASSWORD ?? "correct-horse-battery-staple";

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

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

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
    await prisma.user.updateMany({
      where: { email: { in: adminEmails } },
      data: { role: "ADMIN" }
    });
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

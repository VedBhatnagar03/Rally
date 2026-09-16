import { DatingIntent, Gender, SkillLevel, Sport } from "@prisma/client";
import { z } from "zod";

const availabilityWindowSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
});

const sportProfileSchema = z.object({
  sport: z.nativeEnum(Sport),
  skillLevel: z.nativeEnum(SkillLevel),
  intensity: z.number().int().min(1).max(5).default(3),
  favorite: z.boolean().default(false)
});

export const upsertProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  major: z.string().trim().max(120).optional(),
  classYear: z.string().trim().max(40).optional(),
  bio: z.string().trim().max(280).optional(),
  age: z.number().int().min(18).max(100).optional(),
  preferredAgeMin: z.number().int().min(18).max(100).default(18),
  preferredAgeMax: z.number().int().min(18).max(100).default(30),
  gender: z.nativeEnum(Gender).optional(),
  datingIntent: z.nativeEnum(DatingIntent).default(DatingIntent.DATING),
  interestedIn: z.array(z.nativeEnum(Gender)).max(5).default([]),
  campusZone: z.string().trim().max(80).optional(),
  sports: z.array(sportProfileSchema).min(1).max(6),
  availability: z.array(availabilityWindowSchema).min(1).max(21)
}).refine((profile) => profile.preferredAgeMin <= profile.preferredAgeMax, {
  message: "preferredAgeMin must be less than or equal to preferredAgeMax",
  path: ["preferredAgeMax"]
});

import { DatingIntent, Gender, SkillLevel, Sport } from "@prisma/client";
import { z } from "zod";
import { profilePromptKeys } from "./prompts.js";

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

const profilePromptSchema = z.object({
  promptKey: z.enum(profilePromptKeys),
  answer: z.string().trim().min(1).max(180)
});

export const upsertProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  major: z.string().trim().max(120).optional(),
  classYear: z.string().trim().max(40).optional(),
  bio: z.string().trim().max(280).optional(),
  age: z.number().int().min(18).max(100),
  preferredAgeMin: z.number().int().min(18).max(100).default(18),
  preferredAgeMax: z.number().int().min(18).max(100).default(30),
  gender: z.nativeEnum(Gender),
  datingIntent: z.nativeEnum(DatingIntent).default(DatingIntent.DATING),
  interestedIn: z.array(z.nativeEnum(Gender)).max(5).default([]),
  campusZone: z.string().trim().max(80).optional(),
  interests: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  prompts: z.array(profilePromptSchema).max(3).default([]),
  sports: z.array(sportProfileSchema).min(1).max(6),
  availability: z.array(availabilityWindowSchema).min(1).max(21)
}).refine((profile) => profile.preferredAgeMin <= profile.preferredAgeMax, {
  message: "preferredAgeMin must be less than or equal to preferredAgeMax",
  path: ["preferredAgeMax"]
}).superRefine((profile, context) => {
  if (new Set(profile.interests.map((interest) => interest.toLowerCase())).size !== profile.interests.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "interests must be unique",
      path: ["interests"]
    });
  }
  if (new Set(profile.prompts.map(({ promptKey }) => promptKey)).size !== profile.prompts.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "promptKey values must be unique",
      path: ["prompts"]
    });
  }
});

export const photoUploadIntentSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().min(1).max(10 * 1024 * 1024)
});

export const photoUploadParamsSchema = z.object({ uploadId: z.string().cuid() });
export const photoParamsSchema = z.object({ photoId: z.string().cuid() });

export const photoOrderSchema = z.object({
  photoIds: z.array(z.string().cuid()).min(1).max(6)
}).refine(({ photoIds }) => new Set(photoIds).size === photoIds.length, {
  message: "photoIds must be unique",
  path: ["photoIds"]
});

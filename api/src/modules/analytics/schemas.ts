import { Sport } from "@prisma/client";
import { z } from "zod";

const emptyMetadataSchema = z.object({}).strict().default({});

export const analyticsEventSchema = z.discriminatedUnion("name", [
  z
    .object({
      name: z.literal("ONBOARDING_STARTED"),
      metadata: emptyMetadataSchema
    })
    .strict(),
  z
    .object({
      name: z.literal("DISCOVERY_VIEWED"),
      metadata: z.object({ candidateCount: z.number().int().min(0).max(100) }).strict()
    })
    .strict(),
  z
    .object({
      name: z.literal("CANDIDATE_PROFILE_VIEWED"),
      metadata: z.object({ source: z.enum(["DISCOVERY", "RALLY"]) }).strict()
    })
    .strict(),
  z
    .object({
      name: z.literal("SCHEDULING_OPTIONS_VIEWED"),
      metadata: z.object({ optionCount: z.number().int().min(0).max(3) }).strict()
    })
    .strict(),
  z
    .object({
      name: z.literal("BOOKING_HANDOFF_OPENED"),
      metadata: z.object({ sport: z.nativeEnum(Sport) }).strict()
    })
    .strict()
]);

export type AnalyticsEventInput = z.infer<typeof analyticsEventSchema>;

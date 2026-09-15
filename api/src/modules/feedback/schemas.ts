import { z } from "zod";

export const rallyFeedbackSchema = z.object({
  played: z.boolean(),
  feltSafe: z.boolean(),
  rallyAgain: z.boolean(),
  experienceScore: z.number().int().min(1).max(5).optional(),
  notes: z.string().trim().max(1000).optional()
});

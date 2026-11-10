import { z } from "zod";

export const policyConsentSchema = z.object({
  isAtLeast18: z.literal(true, {
    error: "You must confirm that you are at least 18"
  }),
  policyVersion: z.string().trim().min(1).max(80)
});

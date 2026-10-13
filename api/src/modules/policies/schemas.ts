import { z } from "zod";

export const policyConsentSchema = z.object({
  isAtLeast18: z.literal(true, {
    errorMap: () => ({ message: "You must confirm that you are at least 18" })
  }),
  policyVersion: z.string().trim().min(1).max(80)
});

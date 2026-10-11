import { z } from "zod";

export const deactivateAccountSchema = z.object({
  password: z.string().min(1).max(128),
  reason: z.string().trim().max(280).optional()
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
  confirmation: z.literal("DELETE")
});

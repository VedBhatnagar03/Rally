import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(1).max(80)
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128)
});

export const verifyEmailSchema = z.object({
  token: z.string().min(32).max(256)
});

export const refreshSessionSchema = z.object({
  refreshToken: z.string().min(32).max(256)
});

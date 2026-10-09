import "dotenv/config";
import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional()
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  RESEND_API_KEY: optionalSecret,
  EMAIL_FROM: z.string().min(3).default("Rally <onboarding@resend.dev>"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  ADMIN_EMAILS: z.string().default(""),
  DEV_TOOLS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true")
}).superRefine((value, context) => {
  if (value.NODE_ENV === "production" && !value.RESEND_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "RESEND_API_KEY is required in production",
      path: ["RESEND_API_KEY"]
    });
  }
});

export const env = envSchema.parse(process.env);

export function adminEmails() {
  return new Set(
    env.ADMIN_EMAILS.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

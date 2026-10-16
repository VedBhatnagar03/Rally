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
  POLICY_VERSION: z.string().trim().min(1).max(80).default("2026-10-12-beta"),
  RESEND_API_KEY: optionalSecret,
  EMAIL_FROM: z.string().min(3).default("Rally <onboarding@resend.dev>"),
  PHOTO_STORAGE_BUCKET: z.string().trim().min(1).default("rally-photos"),
  PHOTO_STORAGE_UPLOAD_BUCKET: z.string().trim().min(1).default("rally-photo-uploads"),
  PHOTO_STORAGE_REGION: z.string().trim().min(1).default("us-east-1"),
  PHOTO_STORAGE_ENDPOINT: z.string().url().optional(),
  PHOTO_STORAGE_PUBLIC_BASE_URL: z.string().url().optional(),
  PHOTO_STORAGE_ACCESS_KEY: optionalSecret,
  PHOTO_STORAGE_SECRET_KEY: optionalSecret,
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
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
  if (value.NODE_ENV === "production") {
    if (value.DEV_TOOLS_ENABLED) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DEV_TOOLS_ENABLED must be false in production",
        path: ["DEV_TOOLS_ENABLED"]
      });
    }
    if (value.TRUST_PROXY_HOPS < 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TRUST_PROXY_HOPS must identify the trusted production proxy chain",
        path: ["TRUST_PROXY_HOPS"]
      });
    }
    if (value.JWT_SECRET === "replace-with-at-least-32-random-characters") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "JWT_SECRET must not use the example value in production",
        path: ["JWT_SECRET"]
      });
    }
    if (value.EMAIL_FROM.toLowerCase().includes("@resend.dev")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "EMAIL_FROM must use a verified Rally sender in production",
        path: ["EMAIL_FROM"]
      });
    }

    const admins = value.ADMIN_EMAILS.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (admins.length === 0 || admins.some((email) => !isUiucEmail(email))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ADMIN_EMAILS must contain at least one UIUC founder account",
        path: ["ADMIN_EMAILS"]
      });
    }

    requireSecureOrigin(value.PUBLIC_APP_URL, "PUBLIC_APP_URL", context);
    const corsOrigins = value.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
    if (corsOrigins.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CORS_ORIGIN must contain at least one exact HTTPS origin",
        path: ["CORS_ORIGIN"]
      });
    } else {
      for (const origin of corsOrigins) requireSecureOrigin(origin, "CORS_ORIGIN", context);
    }

    for (const key of [
      "PHOTO_STORAGE_ENDPOINT",
      "PHOTO_STORAGE_PUBLIC_BASE_URL",
      "PHOTO_STORAGE_ACCESS_KEY",
      "PHOTO_STORAGE_SECRET_KEY"
    ] as const) {
      if (!value[key]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} is required in production`,
          path: [key]
        });
      }
    }
    for (const key of ["PHOTO_STORAGE_ENDPOINT", "PHOTO_STORAGE_PUBLIC_BASE_URL"] as const) {
      if (value[key] && new URL(value[key]).protocol !== "https:") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} must use HTTPS in production`,
          path: [key]
        });
      }
    }
  }
});

function requireSecureOrigin(
  value: string,
  key: "PUBLIC_APP_URL" | "CORS_ORIGIN",
  context: z.RefinementCtx
) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || value !== url.origin) {
      throw new Error("not an exact HTTPS origin");
    }
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${key} must use an exact HTTPS origin in production`,
      path: [key]
    });
  }
}

function isUiucEmail(value: string) {
  return z.string().email().safeParse(value).success && value.endsWith("@illinois.edu");
}

export function parseEnv(source: NodeJS.ProcessEnv) {
  return envSchema.parse(source);
}

export const env = parseEnv(process.env);

export function adminEmails() {
  return new Set(
    env.ADMIN_EMAILS.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";

const productionEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://rally:password@db.example.com:5432/rally",
  REDIS_URL: "rediss://cache.example.com:6380",
  JWT_SECRET: "a-production-only-secret-that-is-long-enough",
  PUBLIC_APP_URL: "https://rally.example.com",
  RESEND_API_KEY: "re_production_key",
  EMAIL_FROM: "Rally <hello@rally.example.com>",
  PHOTO_STORAGE_ENDPOINT: "https://storage.example.com",
  PHOTO_STORAGE_PUBLIC_BASE_URL: "https://assets.rally.example.com",
  PHOTO_STORAGE_ACCESS_KEY: "production-access-key",
  PHOTO_STORAGE_SECRET_KEY: "production-secret-key",
  CORS_ORIGIN: "https://rally.example.com",
  TRUST_PROXY_HOPS: "1",
  ADMIN_EMAILS: "founder@illinois.edu",
  DEV_TOOLS_ENABLED: "false"
};

describe("environment validation", () => {
  it("accepts an explicit secure production configuration", () => {
    const parsed = parseEnv(productionEnv);
    expect(parsed.NODE_ENV).toBe("production");
    expect(parsed.TRUST_PROXY_HOPS).toBe(1);
    expect(parsed.DEV_TOOLS_ENABLED).toBe(false);
  });

  it.each([
    ["enabled development tools", { DEV_TOOLS_ENABLED: "true" }],
    ["missing founder admin", { ADMIN_EMAILS: "" }],
    ["non-UIUC founder admin", { ADMIN_EMAILS: "founder@example.com" }],
    ["malformed UIUC founder admin", { ADMIN_EMAILS: "@illinois.edu" }],
    ["insecure public URL", { PUBLIC_APP_URL: "http://rally.example.com" }],
    ["public URL with a path", { PUBLIC_APP_URL: "https://rally.example.com/app" }],
    ["insecure CORS origin", { CORS_ORIGIN: "http://rally.example.com" }],
    ["CORS origin with a path", { CORS_ORIGIN: "https://rally.example.com/app" }],
    ["missing trusted proxy boundary", { TRUST_PROXY_HOPS: "0" }],
    ["missing shared rate-limit store", { REDIS_URL: "" }],
    ["unencrypted rate-limit store", { REDIS_URL: "redis://cache.example.com:6379" }],
    ["example JWT secret", { JWT_SECRET: "replace-with-at-least-32-random-characters" }],
    ["example email sender", { EMAIL_FROM: "Rally <onboarding@resend.dev>" }]
  ])("rejects production with %s", (_name, override) => {
    expect(() => parseEnv({ ...productionEnv, ...override })).toThrow();
  });

  it("keeps local development defaults usable", () => {
    const parsed = parseEnv({
      DATABASE_URL: "postgresql://rally:password@localhost:5432/rally",
      JWT_SECRET: "replace-with-at-least-32-random-characters"
    });
    expect(parsed.NODE_ENV).toBe("development");
    expect(parsed.RATE_LIMIT_MAX).toBe(120);
    expect(parsed.TRUST_PROXY_HOPS).toBe(0);
    expect(parsed.REDIS_URL).toBeUndefined();
  });

  it("accepts a bounded smoke-test rate ceiling", () => {
    const parsed = parseEnv({
      DATABASE_URL: "postgresql://rally:password@localhost:5432/rally",
      JWT_SECRET: "replace-with-at-least-32-random-characters",
      RATE_LIMIT_MAX: "1000"
    });
    expect(parsed.RATE_LIMIT_MAX).toBe(1000);
  });

  it.each(["9", "10001"])("rejects an unsafe global rate ceiling of %s", (value) => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "postgresql://rally:password@localhost:5432/rally",
        JWT_SECRET: "replace-with-at-least-32-random-characters",
        RATE_LIMIT_MAX: value
      })
    ).toThrow();
  });
});

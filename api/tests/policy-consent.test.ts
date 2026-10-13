import { describe, expect, it } from "vitest";
import { registerSchema } from "../src/modules/auth/schemas.js";
import { policyConsentSchema } from "../src/modules/policies/schemas.js";

describe("policy consent", () => {
  it("requires an affirmative 18+ attestation", () => {
    expect(
      policyConsentSchema.safeParse({ isAtLeast18: false, policyVersion: "2026-10-12-beta" }).success
    ).toBe(false);
  });

  it("requires consent fields during registration", () => {
    const result = registerSchema.safeParse({
      email: "student@illinois.edu",
      password: "correct-horse-battery-staple",
      displayName: "Student"
    });
    expect(result.success).toBe(false);
  });

  it("accepts a complete registration attestation", () => {
    const result = registerSchema.safeParse({
      email: "student@illinois.edu",
      password: "correct-horse-battery-staple",
      displayName: "Student",
      isAtLeast18: true,
      policyVersion: "2026-10-12-beta"
    });
    expect(result.success).toBe(true);
  });
});

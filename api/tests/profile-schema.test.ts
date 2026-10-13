import { DatingIntent, Gender, SkillLevel, Sport } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  photoOrderSchema,
  photoUploadIntentSchema,
  upsertProfileSchema
} from "../src/modules/profile/schemas.js";

const validProfile = {
  displayName: "Maya",
  age: 20,
  preferredAgeMin: 19,
  preferredAgeMax: 24,
  gender: Gender.WOMAN,
  datingIntent: DatingIntent.DATING,
  interestedIn: [Gender.MAN],
  sports: [{ sport: Sport.TENNIS, skillLevel: SkillLevel.INTERMEDIATE }],
  availability: [{ dayOfWeek: 2, startTime: "18:00", endTime: "21:00" }]
};

describe("upsertProfileSchema", () => {
  it("accepts a valid age and preferred age range", () => {
    expect(upsertProfileSchema.parse(validProfile)).toMatchObject({
      age: 20,
      preferredAgeMin: 19,
      preferredAgeMax: 24
    });
  });

  it("rejects an inverted preferred age range", () => {
    const result = upsertProfileSchema.safeParse({
      ...validProfile,
      preferredAgeMin: 25,
      preferredAgeMax: 21
    });

    expect(result.success).toBe(false);
  });
});

describe("profile photo schemas", () => {
  it("accepts supported images within the 10 MB limit", () => {
    expect(photoUploadIntentSchema.parse({ contentType: "image/webp", sizeBytes: 1024 })).toEqual({
      contentType: "image/webp",
      sizeBytes: 1024
    });
  });

  it("rejects unsupported media and duplicate ordering IDs", () => {
    expect(
      photoUploadIntentSchema.safeParse({ contentType: "image/svg+xml", sizeBytes: 1024 }).success
    ).toBe(false);
    expect(photoOrderSchema.safeParse({ photoIds: ["cm12345678901234567890123", "cm12345678901234567890123"] }).success).toBe(false);
  });
});

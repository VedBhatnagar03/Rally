import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../src/modules/matching/matcher.js";

describe("scoreCandidate", () => {
  it("returns null when users share no racket sport", () => {
    const result = scoreCandidate(
      {
        userId: "a",
        displayName: "A",
        sports: [{ sport: "TENNIS", skillLevel: "INTERMEDIATE", intensity: 3, favorite: true }],
        availability: [{ dayOfWeek: 2, startTime: "18:00", endTime: "20:00" }],
        trustScore: 80
      },
      {
        userId: "b",
        displayName: "B",
        sports: [{ sport: "BADMINTON", skillLevel: "INTERMEDIATE", intensity: 3, favorite: true }],
        availability: [{ dayOfWeek: 2, startTime: "18:30", endTime: "20:00" }],
        trustScore: 80
      }
    );

    expect(result).toBeNull();
  });

  it("scores a strong recommendation when sport and availability overlap", () => {
    const result = scoreCandidate(
      {
        userId: "a",
        displayName: "A",
        sports: [{ sport: "TENNIS", skillLevel: "INTERMEDIATE", intensity: 3, favorite: true }],
        availability: [{ dayOfWeek: 2, startTime: "18:00", endTime: "20:00" }],
        trustScore: 90
      },
      {
        userId: "b",
        displayName: "B",
        sports: [{ sport: "TENNIS", skillLevel: "INTERMEDIATE", intensity: 3, favorite: false }],
        availability: [{ dayOfWeek: 2, startTime: "18:30", endTime: "20:00" }],
        trustScore: 85
      }
    );

    expect(result).toMatchObject({
      userId: "b",
      recommendedSport: "TENNIS"
    });
    expect(result?.score).toBeGreaterThan(60);
  });
});

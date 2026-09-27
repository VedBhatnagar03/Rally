import { describe, expect, it } from "vitest";
import { passesHardFilters, scoreCandidate, type MatchCandidate } from "../src/modules/matching/matcher.js";

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    userId: "a",
    displayName: "A",
    profile: {
      age: 21,
      preferredAgeMin: 18,
      preferredAgeMax: 26,
      gender: "WOMAN",
      interestedIn: ["MAN"],
      datingIntent: "DATING",
      major: "Computer Science",
      classYear: "Junior"
    },
    sports: [{ sport: "TENNIS", skillLevel: "INTERMEDIATE", intensity: 3, favorite: true }],
    availability: [{ dayOfWeek: 2, startTime: "18:00", endTime: "20:00" }],
    ...overrides
  };
}

const compatibleMan = candidate({
  userId: "b",
  displayName: "B",
  profile: {
    age: 22,
    preferredAgeMin: 19,
    preferredAgeMax: 24,
    gender: "MAN",
    interestedIn: ["WOMAN"],
    datingIntent: "DATING",
    major: "Computer Science",
    classYear: "Junior"
  },
  availability: [{ dayOfWeek: 2, startTime: "18:30", endTime: "20:00" }]
});

describe("passesHardFilters", () => {
  it("accepts a mutual age, gender, sport, and schedule match", () => {
    expect(passesHardFilters(candidate(), compatibleMan)).toBe(true);
  });

  it("rejects one-sided gender interest", () => {
    const oneSided = candidate({
      ...compatibleMan,
      profile: { ...compatibleMan.profile, interestedIn: ["MAN"] }
    });
    expect(passesHardFilters(candidate(), oneSided)).toBe(false);
  });

  it("rejects a candidate outside either preferred age range", () => {
    const tooOld = candidate({
      ...compatibleMan,
      profile: { ...compatibleMan.profile, age: 30 }
    });
    expect(passesHardFilters(candidate(), tooOld)).toBe(false);
  });

  it("rejects profiles without a usable shared time", () => {
    const noSharedTime = candidate({
      ...compatibleMan,
      availability: [{ dayOfWeek: 3, startTime: "18:30", endTime: "20:00" }]
    });
    expect(passesHardFilters(candidate(), noSharedTime)).toBe(false);
  });
});

describe("scoreCandidate", () => {
  it("returns null when users share no racket sport", () => {
    const noSharedSport = candidate({
      ...compatibleMan,
      sports: [{ sport: "BADMINTON", skillLevel: "INTERMEDIATE", intensity: 3, favorite: true }]
    });
    expect(scoreCandidate(candidate(), noSharedSport)).toBeNull();
  });

  it("returns explainable weighted scoring for an eligible recommendation", () => {
    const result = scoreCandidate(candidate(), compatibleMan);

    expect(result).toMatchObject({
      userId: "b",
      recommendedSport: "TENNIS",
      sharedSports: ["TENNIS"]
    });
    expect(result?.score).toBeGreaterThan(70);
    expect(result?.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "schedule" })])
    );
    expect(result?.breakdown).toHaveLength(5);
    expect(result?.breakdown.reduce((total, term) => total + term.weight, 0)).toBe(1);
  });
});

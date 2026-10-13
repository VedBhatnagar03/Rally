import { describe, expect, it } from "vitest";
import { isSameFeedback } from "../src/modules/feedback/integrity.js";

const stored = {
  played: true,
  feltSafe: true,
  rallyAgain: true,
  experienceScore: 5,
  notes: null
};

describe("feedback integrity", () => {
  it("accepts an identical retry with normalized optional fields", () => {
    expect(
      isSameFeedback(stored, {
        played: true,
        feltSafe: true,
        rallyAgain: true,
        experienceScore: 5
      })
    ).toBe(true);
  });

  it.each([
    ["played", { played: false }],
    ["felt safe", { feltSafe: false }],
    ["Rally Again", { rallyAgain: false }],
    ["score", { experienceScore: 4 }],
    ["notes", { notes: "Changed later" }]
  ])("rejects a changed %s decision", (_label, change) => {
    expect(isSameFeedback(stored, { ...stored, ...change, notes: change.notes })).toBe(false);
  });
});

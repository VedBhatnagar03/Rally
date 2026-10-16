import { describe, expect, it } from "vitest";
import { analyticsEventSchema } from "../src/modules/analytics/schemas.js";

describe("analytics event schema", () => {
  it.each([
    { name: "ONBOARDING_STARTED" },
    { name: "DISCOVERY_VIEWED", metadata: { candidateCount: 12 } },
    { name: "CANDIDATE_PROFILE_VIEWED", metadata: { source: "DISCOVERY" } },
    { name: "SCHEDULING_OPTIONS_VIEWED", metadata: { optionCount: 3 } },
    { name: "BOOKING_HANDOFF_OPENED", metadata: { sport: "TENNIS" } }
  ])("accepts catalog event $name", (event) => {
    expect(analyticsEventSchema.safeParse(event).success).toBe(true);
  });

  it.each([
    { name: "ARBITRARY_EVENT", metadata: {} },
    { name: "DISCOVERY_VIEWED", metadata: { candidateCount: 101 } },
    { name: "SCHEDULING_OPTIONS_VIEWED", metadata: { optionCount: 4 } },
    { name: "CANDIDATE_PROFILE_VIEWED", metadata: { source: "HOME" } },
    { name: "BOOKING_HANDOFF_OPENED", metadata: { sport: "FOOTBALL" } },
    { name: "ONBOARDING_STARTED", metadata: { email: "private@illinois.edu" } },
    { name: "DISCOVERY_VIEWED", metadata: { candidateCount: 2, notes: "free text" } }
  ])("rejects event outside the catalog contract", (event) => {
    expect(analyticsEventSchema.safeParse(event).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { buildFunnelRates, conversionRate, perActiveUser } from "../src/modules/admin/metrics.js";

describe("founder metrics", () => {
  it("calculates readable funnel percentages", () => {
    expect(buildFunnelRates({ sent: 8, accepted: 6, scheduled: 3, completed: 2 })).toEqual({
      sentToAccepted: 75,
      acceptedToScheduled: 50,
      scheduledToCompleted: 66.7
    });
  });

  it("returns stable zeroes for empty cohorts", () => {
    expect(conversionRate(0, 0)).toBe(0);
    expect(perActiveUser(0, 0)).toBe(0);
  });

  it("calculates completed Rallies per active user", () => {
    expect(perActiveUser(7, 4)).toBe(1.75);
  });
});

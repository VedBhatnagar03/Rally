import { describe, expect, it } from "vitest";
import { findAvailabilityOverlaps, suggestRallySlots } from "../src/modules/scheduling/scheduler.js";

describe("findAvailabilityOverlaps", () => {
  it("returns one-hour windows from shared availability", () => {
    const overlaps = findAvailabilityOverlaps(
      [{ dayOfWeek: 2, startTime: "17:00", endTime: "20:00" }],
      [{ dayOfWeek: 2, startTime: "18:30", endTime: "21:00" }]
    );

    expect(overlaps).toEqual([{ dayOfWeek: 2, startTime: "18:30", endTime: "19:30" }]);
  });

  it("ignores overlaps shorter than forty-five minutes", () => {
    const overlaps = findAvailabilityOverlaps(
      [{ dayOfWeek: 4, startTime: "18:00", endTime: "18:30" }],
      [{ dayOfWeek: 4, startTime: "18:10", endTime: "19:00" }]
    );

    expect(overlaps).toEqual([]);
  });
});

describe("suggestRallySlots", () => {
  it("returns top shared sport, schedule, and venue options", () => {
    const suggestions = suggestRallySlots({
      sharedSports: ["TENNIS", "BADMINTON"],
      requesterAvailability: [{ dayOfWeek: 2, startTime: "17:00", endTime: "20:00" }],
      receiverAvailability: [{ dayOfWeek: 2, startTime: "18:00", endTime: "21:00" }],
      venues: [
        {
          id: "venue_tennis",
          name: "Illini Grove Tennis Courts",
          campusArea: "South Campus",
          bookingLeadTime: 72,
          sports: ["TENNIS"]
        }
      ]
    });

    expect(suggestions[0]).toMatchObject({
      sport: "TENNIS",
      startTime: "18:00",
      endTime: "19:00",
      venue: { name: "Illini Grove Tennis Courts" }
    });
    expect(suggestions).toHaveLength(2);
  });
});

import { describe, expect, it } from "vitest";
import { isSameConfirmedBooking } from "../src/modules/rallies/booking-integrity.js";

const confirmed = {
  courtStatus: "BOOKED",
  courtNumber: "4",
  bookingReference: "reservation-123",
  bookingOwnerId: "user-a"
};

describe("court booking integrity", () => {
  it("accepts an exact retry from the booking owner", () => {
    expect(
      isSameConfirmedBooking(confirmed, "user-a", {
        courtStatus: "BOOKED",
        courtNumber: "4",
        bookingReference: "reservation-123"
      })
    ).toBe(true);
  });

  it.each([
    ["other participant", "user-b", { courtStatus: "BOOKED" as const, courtNumber: "4", bookingReference: "reservation-123" }],
    ["different court", "user-a", { courtStatus: "BOOKED" as const, courtNumber: "5", bookingReference: "reservation-123" }],
    ["different reference", "user-a", { courtStatus: "BOOKED" as const, courtNumber: "4", bookingReference: "reservation-456" }],
    ["unavailable reset", "user-a", { courtStatus: "UNAVAILABLE" as const }]
  ])("rejects a confirmed booking change by %s", (_label, userId, submission) => {
    expect(isSameConfirmedBooking(confirmed, userId, submission)).toBe(false);
  });
});

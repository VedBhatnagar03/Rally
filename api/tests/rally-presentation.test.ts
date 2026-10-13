import { describe, expect, it } from "vitest";
import {
  toRallyView,
  type RallyReadRecord
} from "../src/modules/rallies/presentation.js";

function rallyRecord(): RallyReadRecord {
  const now = new Date("2026-10-13T12:00:00.000Z");

  return {
    id: "rally-1",
    senderId: "sender-1",
    receiverId: "receiver-1",
    sport: "TENNIS",
    proposedStartAt: now,
    proposedEndAt: new Date("2026-10-13T13:00:00.000Z"),
    venueId: null,
    status: "PENDING",
    courtStatus: "NOT_STARTED",
    courtNumber: null,
    bookingOwnerId: null,
    bookingReference: null,
    cancelledAt: null,
    cancelledById: null,
    cancellationReason: null,
    acceptedAt: null,
    scheduledAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    sender: {
      id: "sender-1",
      profile: { displayName: "Alex" },
      photos: [{ id: "photo-1", url: "https://images.example/alex.webp", sortOrder: 0 }]
    },
    receiver: {
      id: "receiver-1",
      profile: { displayName: "Jordan" },
      photos: []
    },
    venue: null
  };
}

describe("Rally read presentation", () => {
  it("returns useful public participant details", () => {
    const view = toRallyView(rallyRecord());

    expect(view.sender).toEqual({
      id: "sender-1",
      displayName: "Alex",
      photo: { id: "photo-1", url: "https://images.example/alex.webp", sortOrder: 0 }
    });
    expect(view.receiver).toEqual({
      id: "receiver-1",
      displayName: "Jordan",
      photo: null
    });
  });

  it("uses an explicit response allowlist", () => {
    const serialized = JSON.stringify(toRallyView(rallyRecord()));

    for (const privateField of [
      "email",
      "passwordHash",
      "interestedIn",
      "preferredAgeMin",
      "preferredAgeMax",
      "trustScore",
      "availability",
      "storageKey"
    ]) {
      expect(serialized).not.toContain(privateField);
    }
  });
});

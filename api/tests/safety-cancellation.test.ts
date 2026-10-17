import { describe, expect, it } from "vitest";
import {
  safetyCancellationData,
  safetyCancellationReason
} from "../src/modules/safety/cancellation.js";

describe("safety cancellation privacy", () => {
  it("uses neutral system attribution for blocks and reports", () => {
    const now = new Date("2026-10-17T12:00:00.000Z");

    expect(safetyCancellationData(now)).toEqual({
      status: "CANCELLED",
      cancelledAt: now,
      cancelledById: null,
      cancellationReason: safetyCancellationReason
    });
    expect(safetyCancellationReason.toLowerCase()).not.toMatch(/block|report/);
  });
});


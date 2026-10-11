import { describe, expect, it } from "vitest";
import { rallyWindowErrorMessage, validateRallyWindow } from "../src/modules/rallies/integrity.js";

const now = new Date("2026-10-10T12:00:00.000Z");

describe("Rally window integrity", () => {
  it("accepts a future window between 30 minutes and 3 hours", () => {
    expect(
      validateRallyWindow(
        new Date("2026-10-10T13:00:00.000Z"),
        new Date("2026-10-10T14:00:00.000Z"),
        now
      )
    ).toBeNull();
  });

  it.each([
    ["PAST_START", "2026-10-10T11:00:00.000Z", "2026-10-10T12:00:00.000Z"],
    ["TOO_SHORT", "2026-10-10T13:00:00.000Z", "2026-10-10T13:29:59.000Z"],
    ["TOO_LONG", "2026-10-10T13:00:00.000Z", "2026-10-10T16:00:01.000Z"]
  ])("rejects %s windows", (expected, start, end) => {
    const result = validateRallyWindow(new Date(start), new Date(end), now);
    expect(result).toBe(expected);
    expect(rallyWindowErrorMessage(result!)).toBeTruthy();
  });
});

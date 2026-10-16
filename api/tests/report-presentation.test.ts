import { describe, expect, it } from "vitest";
import { presentReport } from "../src/modules/safety/presentation.js";

describe("report presentation", () => {
  it("removes the internal deduplication key", () => {
    expect(
      presentReport({ id: "report", dedupeKey: "internal-hash", category: "OTHER" })
    ).toEqual({ id: "report", category: "OTHER" });
  });
});

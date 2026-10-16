import { describe, expect, it } from "vitest";
import { manualReportWindowMs, reportDedupeKey } from "../src/modules/safety/report-integrity.js";

const input = {
  reporterId: "reporter",
  reportedUserId: "reported",
  rallyId: "rally",
  category: "UNSAFE_BEHAVIOR",
  details: "A specific safety concern"
};

describe("report deduplication", () => {
  it("produces a stable opaque key for an exact same-day retry", () => {
    const first = reportDedupeKey({ ...input, now: new Date("2026-10-16T01:00:00.000Z") });
    const retry = reportDedupeKey({ ...input, now: new Date("2026-10-16T23:00:00.000Z") });
    expect(retry).toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain(input.reporterId);
  });

  it("keeps separate reports distinct", () => {
    const now = new Date("2026-10-16T12:00:00.000Z");
    const base = reportDedupeKey({ ...input, now });
    expect(reportDedupeKey({ ...input, details: "A different incident", now })).not.toBe(base);
    expect(reportDedupeKey({ ...input, rallyId: "another-rally", now })).not.toBe(base);
    expect(reportDedupeKey({ ...input, category: "HARASSMENT", now })).not.toBe(base);
    expect(reportDedupeKey({ ...input, now: new Date(now.getTime() + manualReportWindowMs) })).not.toBe(base);
  });
});

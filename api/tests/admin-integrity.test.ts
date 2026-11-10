import { describe, expect, it } from "vitest";
import {
  isIncidentResolutionRetry,
  isReportUpdateRetry,
  reportUpdateData
} from "../src/modules/admin/integrity.js";

describe("admin mutation integrity", () => {
  it("keeps reviewing reports unresolved", () => {
    const now = new Date("2026-11-09T18:00:00.000Z");
    expect(
      reportUpdateData(
        { status: "REVIEWING", resolutionNote: "Founder review started" },
        "admin-1",
        now
      )
    ).toEqual({
      status: "REVIEWING",
      resolutionNote: "Founder review started",
      resolvedAt: null,
      resolvedById: null
    });
  });

  it("attributes terminal report decisions", () => {
    const now = new Date("2026-11-09T18:00:00.000Z");
    expect(
      reportUpdateData(
        { status: "RESOLVED", resolutionNote: "Account action completed" },
        "admin-1",
        now
      )
    ).toEqual({
      status: "RESOLVED",
      resolutionNote: "Account action completed",
      resolvedAt: now,
      resolvedById: "admin-1"
    });
  });

  it("recognizes exact report retries without conflating changed decisions", () => {
    const existing = { status: "DISMISSED" as const, resolutionNote: "No policy violation" };
    expect(
      isReportUpdateRetry(existing, {
        status: "DISMISSED",
        resolutionNote: "No policy violation"
      })
    ).toBe(true);
    expect(
      isReportUpdateRetry(existing, {
        status: "RESOLVED",
        resolutionNote: "No policy violation"
      })
    ).toBe(false);
  });

  it("recognizes only completed, exact incident-resolution retries", () => {
    const resolvedAt = new Date("2026-11-09T18:00:00.000Z");
    expect(
      isIncidentResolutionRetry(
        { resolvedAt, resolutionNote: "Deployment corrected" },
        "Deployment corrected"
      )
    ).toBe(true);
    expect(
      isIncidentResolutionRetry(
        { resolvedAt: null, resolutionNote: null },
        "Deployment corrected"
      )
    ).toBe(false);
    expect(
      isIncidentResolutionRetry(
        { resolvedAt, resolutionNote: "Deployment corrected" },
        "Different resolution"
      )
    ).toBe(false);
  });
});

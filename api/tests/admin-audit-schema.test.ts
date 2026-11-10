import { describe, expect, it } from "vitest";
import {
  adminListQuerySchema,
  adminSummaryQuerySchema,
  auditLogListQuerySchema
} from "../src/modules/admin/schemas.js";

describe("admin audit log query", () => {
  it("applies a bounded default page size", () => {
    expect(auditLogListQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it("accepts actor, action and cursor filters", () => {
    expect(
      auditLogListQuerySchema.parse({
        limit: "25",
        actorUserId: "cmv6gt6ag003ziyvud8bxmkd8",
        action: "admin.user_status_updated",
        cursor: "cmv6gt6ag003ziyvud8bxmkd9"
      })
    ).toEqual({
      limit: 25,
      actorUserId: "cmv6gt6ag003ziyvud8bxmkd8",
      action: "admin.user_status_updated",
      cursor: "cmv6gt6ag003ziyvud8bxmkd9"
    });
  });

  it("rejects malformed filters and oversized pages", () => {
    expect(auditLogListQuerySchema.safeParse({ actorUserId: "not-a-cuid" }).success).toBe(false);
    expect(auditLogListQuerySchema.safeParse({ cursor: "not-a-cuid" }).success).toBe(false);
    expect(auditLogListQuerySchema.safeParse({ action: "" }).success).toBe(false);
    expect(auditLogListQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });
});

describe("admin data scopes", () => {
  it("defaults founder views to real beta data", () => {
    expect(adminListQuerySchema.parse({})).toEqual({ dataScope: "REAL", limit: 50 });
    expect(adminSummaryQuerySchema.parse({})).toEqual({ dataScope: "REAL", windowDays: 7 });
  });

  it("allows explicit test and combined views", () => {
    expect(adminListQuerySchema.parse({ dataScope: "TEST" }).dataScope).toBe("TEST");
    expect(adminSummaryQuerySchema.parse({ dataScope: "ALL" }).dataScope).toBe("ALL");
  });

  it("rejects unknown data scopes", () => {
    expect(adminListQuerySchema.safeParse({ dataScope: "SEED" }).success).toBe(false);
  });
});

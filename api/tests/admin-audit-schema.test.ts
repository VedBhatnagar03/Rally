import { describe, expect, it } from "vitest";
import { auditLogListQuerySchema } from "../src/modules/admin/schemas.js";

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

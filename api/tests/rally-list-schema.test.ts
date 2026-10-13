import { describe, expect, it } from "vitest";
import { rallyListQuerySchema } from "../src/modules/rallies/schemas.js";

describe("Rally history query", () => {
  it("applies a bounded default page", () => {
    expect(rallyListQuerySchema.parse({})).toEqual({ limit: 25 });
  });

  it("coerces a valid page size and accepts a cursor", () => {
    expect(
      rallyListQuerySchema.parse({ limit: "50", cursor: "cmv6gt6ag003ziyvud8bxmkd8" })
    ).toEqual({ limit: 50, cursor: "cmv6gt6ag003ziyvud8bxmkd8" });
  });

  it.each(["0", "101", "2.5", "not-a-number"])("rejects invalid limit %s", (limit) => {
    expect(rallyListQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it("rejects a malformed cursor", () => {
    expect(rallyListQuerySchema.safeParse({ cursor: "not-a-cuid" }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { describeOperationalIncident } from "../src/utils/operational-incident.js";

describe("operational incident sanitization", () => {
  it("keeps diagnostic identifiers without storing an error message or request body", () => {
    const error = Object.assign(new Error("contains private user input"), { code: "P2024" });
    const incident = describeOperationalIncident(
      {
        id: "request-123",
        method: "POST",
        url: "/v1/rallies?debug=true",
        routeOptions: { url: "/v1/rallies" },
        user: { sub: "user-123" }
      },
      error
    );

    expect(incident).toEqual({
      requestId: "request-123",
      method: "POST",
      route: "/v1/rallies",
      statusCode: 500,
      errorName: "Error",
      errorCode: "P2024",
      userId: "user-123"
    });
    expect(incident).not.toHaveProperty("message");
    expect(incident).not.toHaveProperty("body");
  });

  it("falls back safely for non-error values and unmatched routes", () => {
    expect(
      describeOperationalIncident(
        {
          id: "request-456",
          method: "GET",
          url: "/missing?token=not-persisted",
          routeOptions: {}
        },
        "failed"
      )
    ).toMatchObject({
      route: "/missing",
      errorName: "UnknownError",
      errorCode: undefined,
      userId: undefined
    });
  });
});

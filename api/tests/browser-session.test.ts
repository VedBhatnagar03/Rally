import { describe, expect, it } from "vitest";
import {
  isAllowedBrowserOrigin,
  isAllowedSessionIssuanceOrigin,
  publicSession,
  refreshCookieName
} from "../src/modules/auth/browser-session.js";

describe("browser session security", () => {
  it("uses a dedicated refresh cookie name", () => {
    expect(refreshCookieName).toBe("rally_refresh");
  });

  it("accepts only an exact configured frontend origin", () => {
    expect(isAllowedBrowserOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedBrowserOrigin("http://localhost:3000.evil.example")).toBe(false);
    expect(isAllowedBrowserOrigin(undefined)).toBe(false);
  });

  it("keeps originless session issuance available to local automation", () => {
    expect(isAllowedSessionIssuanceOrigin(undefined)).toBe(true);
  });

  it("keeps development refresh credentials available to local automation", () => {
    expect(
      publicSession({ accessToken: "access", refreshToken: "refresh" })
    ).toEqual({ accessToken: "access", refreshToken: "refresh" });
  });

  it("omits refresh credentials from production-shaped responses", () => {
    expect(
      publicSession({ accessToken: "access", refreshToken: "refresh" }, false)
    ).toEqual({ accessToken: "access" });
  });
});

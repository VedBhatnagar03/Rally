import { describe, expect, it } from "vitest";
import { assertUiucEmail, InvalidEmailDomainError } from "../src/utils/email.js";

describe("assertUiucEmail", () => {
  it("normalizes valid UIUC emails", () => {
    expect(assertUiucEmail(" Naman.Test@Illinois.edu ")).toBe("naman.test@illinois.edu");
  });

  it("rejects non-UIUC emails with a typed error", () => {
    expect(() => assertUiucEmail("outsider@example.com")).toThrow(InvalidEmailDomainError);
  });
});

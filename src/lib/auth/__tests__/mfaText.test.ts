import { describe, expect, it } from "vitest";
import { cleanCode, isCompleteCode, mfaErrorMessage, needsMfaStep } from "../mfaText";

describe("needsMfaStep", () => {
  it("asks for a code only when an app is registered and not yet used this session", () => {
    expect(needsMfaStep({ currentLevel: "aal1", nextLevel: "aal2" })).toBe(true);
    expect(needsMfaStep({ currentLevel: "aal2", nextLevel: "aal2" })).toBe(false);
  });
  it("leaves accounts without an app alone", () => {
    expect(needsMfaStep({ currentLevel: "aal1", nextLevel: "aal1" })).toBe(false);
    expect(needsMfaStep(null)).toBe(false);
    expect(needsMfaStep({ currentLevel: null, nextLevel: null })).toBe(false);
  });
});

describe("codes", () => {
  it("accepts the code as shown or pasted with a space", () => {
    expect(cleanCode("288 649")).toBe("288649");
    expect(cleanCode(" 12a3456789")).toBe("123456");
  });
  it("needs exactly six digits", () => {
    expect(isCompleteCode("123456")).toBe(true);
    expect(isCompleteCode("12345")).toBe(false);
    expect(isCompleteCode("12345a")).toBe(false);
  });
});

describe("mfaErrorMessage", () => {
  it("explains a wrong code in both languages", () => {
    expect(mfaErrorMessage({ code: "mfa_verification_failed" }, "EN")).toMatch(/didn't match/);
    expect(mfaErrorMessage({ code: "mfa_verification_failed" }, "IS")).toMatch(/passar ekki/);
  });
  it("keeps an unknown message and never answers blank", () => {
    expect(mfaErrorMessage({ code: "x", message: "Boom" }, "EN")).toBe("Boom");
    expect(mfaErrorMessage(null, "IS").length).toBeGreaterThan(0);
  });
});

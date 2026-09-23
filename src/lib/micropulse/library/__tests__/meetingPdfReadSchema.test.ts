import { describe, it, expect } from "vitest";
import { normalizeMeetingPdfRead } from "../meetingPdfReadSchema";

describe("normalizeMeetingPdfRead", () => {
  it("maps a well-formed read", () => {
    const r = normalizeMeetingPdfRead({ title: "Pre-season staff kickoff", meetingType: "staff", agenda: "1. Goals\n2. Roles", attendees: "HC, S&C, physio", summary: "Agreed on the plan.", confidence: "high" });
    expect(r.title).toBe("Pre-season staff kickoff");
    expect(r.meetingType).toBe("staff");
    expect(r.agenda).toMatch(/Goals/);
    expect(r.confidence).toBe("high");
  });

  it("clamps an unknown meeting type to null; empty strings to null", () => {
    const r = normalizeMeetingPdfRead({ title: "  ", meetingType: "board", agenda: "" });
    expect(r.meetingType).toBeNull();
    expect(r.title).toBeNull();
    expect(r.agenda).toBeNull();
  });

  it("defaults confidence to moderate", () => {
    expect(normalizeMeetingPdfRead({ title: "x" }).confidence).toBe("moderate");
  });

  it("ignores non-string / junk fields (nothing fabricated)", () => {
    const r = normalizeMeetingPdfRead({ title: 42, agenda: ["a"], attendees: null });
    expect(r.title).toBeNull();
    expect(r.agenda).toBeNull();
    expect(r.attendees).toBeNull();
  });
});

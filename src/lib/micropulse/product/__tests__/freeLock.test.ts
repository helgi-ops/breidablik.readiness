import { describe, expect, it } from "vitest";
import { isFreeLocked, isFreeLockedHref, isFreeLockedPath } from "../freeLock";

describe("isFreeLocked (which teams)", () => {
  it("locks FREE club and national teams", () => {
    expect(isFreeLocked("FREE", "club_team")).toBe(true);
    expect(isFreeLocked("FREE", "national_team")).toBe(true);
    expect(isFreeLocked("FREE", null)).toBe(true);
    expect(isFreeLocked(null, "club_team")).toBe(true); // no plan = FREE
  });
  it("never locks a personal-trainer practice", () => {
    expect(isFreeLocked("FREE", "personal_trainer")).toBe(false);
    expect(isFreeLocked("FREE", "PERSONAL_TRAINER")).toBe(false);
  });
  it("never locks paying teams", () => {
    expect(isFreeLocked("PRO", "club_team")).toBe(false);
    expect(isFreeLocked("ELITE", "club_team")).toBe(false);
  });
});

describe("isFreeLockedPath (which pages)", () => {
  it("keeps Today and the FREE pages open", () => {
    for (const p of ["/coach", "/coach/players", "/coach/availability-board", "/coach/conversations", "/coach/messages", "/coach/notifications", "/coach/settings", "/coach/display", "/coach/players/abc"]) {
      expect(isFreeLockedPath(p)).toBe(false);
    }
    expect(isFreeLockedPath("/coach", "today")).toBe(false);
    expect(isFreeLockedPath("/coach", "")).toBe(false);
  });
  it("locks every other dashboard tab", () => {
    for (const t of ["squad", "load", "gps", "md", "library", "drills", "volatility", "vald", "strength", "trend", "rtp"]) {
      expect(isFreeLockedPath("/coach", t)).toBe(true);
    }
  });
  it("locks hubs and the pages they mount, so nothing leaks through a hub", () => {
    for (const p of ["/coach/load-intelligence-hub", "/coach/strength-hub", "/coach/programme-library", "/coach/match-hub", "/coach/lv-profile", "/coach/week-setup", "/coach/periodization-hub", "/coach/post-training", "/coach/load-plan", "/coach/strength", "/coach/injuries", "/coach/reporting-center", "/coach/integrations", "/coach/catapult-upload"]) {
      expect(isFreeLockedPath(p)).toBe(true);
    }
  });
  it("leaves admin tools to the admin role, and pages outside the coach app alone", () => {
    for (const p of ["/coach/leads", "/coach/usage-analytics", "/coach/admin/health", "/team", "/player", "/pricing"]) {
      expect(isFreeLockedPath(p)).toBe(false);
    }
  });
  it("is segment-safe and ignores a trailing slash", () => {
    expect(isFreeLockedPath("/coach/players-export")).toBe(true);
    expect(isFreeLockedPath("/coach/players/")).toBe(false);
    expect(isFreeLockedPath("/coachX")).toBe(false);
    expect(isFreeLockedPath(null)).toBe(false);
  });
});

describe("isFreeLockedHref (sidebar links with ?tab=)", () => {
  it("reads the tab from the link", () => {
    expect(isFreeLockedHref("/coach?tab=squad")).toBe(true);
    expect(isFreeLockedHref("/coach?tab=today")).toBe(false);
    expect(isFreeLockedHref("/coach/strength-hub?tab=profiles")).toBe(true);
    expect(isFreeLockedHref("/coach/players")).toBe(false);
  });
});

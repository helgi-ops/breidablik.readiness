/**
 * Tests for sessionDuration — read-time minutes derivation for Core/Lite rows.
 * Run: npx vitest src/lib/micropulse/__tests__/sessionDuration.test.ts
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { resolveSessionDuration, sessionDurationMinutes } from "../sessionDuration";

describe("resolveSessionDuration", () => {
  it("prefers the measured column", () => {
    const r = resolveSessionDuration({ session_duration_minutes: 92.4, total_player_load: 900, player_load_per_minute: 5 });
    expect(r).toEqual({ minutes: 92.4, source: "measured" });
  });

  it("derives from PL ÷ PL/min when duration is missing", () => {
    // 480 / 6 = 80 min
    const r = resolveSessionDuration({ session_duration_minutes: null, total_player_load: 480, player_load_per_minute: 6 });
    expect(r).toEqual({ minutes: 80, source: "derived" });
  });

  it("rounds to 0.1", () => {
    // 100 / 7 = 14.2857… → 14.3
    expect(sessionDurationMinutes({ total_player_load: 100, player_load_per_minute: 7 })).toBe(14.3);
  });

  it("never NULL-divides — PL/min 0 yields null, not Infinity", () => {
    const r = resolveSessionDuration({ session_duration_minutes: null, total_player_load: 500, player_load_per_minute: 0 });
    expect(r).toEqual({ minutes: null, source: null });
  });

  it("treats a non-positive measured value as missing and derives", () => {
    const r = resolveSessionDuration({ session_duration_minutes: 0, total_player_load: 300, player_load_per_minute: 5 });
    expect(r).toEqual({ minutes: 60, source: "derived" });
  });

  it("clamps to a believable range", () => {
    // 5000 / 1 = 5000 → clamp 200
    expect(sessionDurationMinutes({ total_player_load: 5000, player_load_per_minute: 1 })).toBe(200);
    // 0.5 / 1 = 0.5 → clamp 1
    expect(sessionDurationMinutes({ total_player_load: 0.5, player_load_per_minute: 1 })).toBe(1);
  });

  it("returns null when neither measured nor derivable", () => {
    expect(resolveSessionDuration({})).toEqual({ minutes: null, source: null });
    expect(resolveSessionDuration({ total_player_load: 500 })).toEqual({ minutes: null, source: null }); // no PL/min
  });
});

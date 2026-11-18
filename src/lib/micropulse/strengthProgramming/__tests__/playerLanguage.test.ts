/**
 * "D" (2026-11-18): a sent strength session is stored in one language, so it is built in the language the player
 * uses the app in (players.app_language, reported by the app). Before: the 09:00 send and the check-in rebuild
 * stored English for everyone; a hand send stored the coach's UI language.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { asAppLang, loadPlayerLanguages, sessionLangFor } from "../playerLanguage";
import { strengthSessionToTodayStructure } from "../toTodayStructure";
import { buildStrengthSession } from "../index";
import type { PlayerStrengthSnapshot } from "../types";

describe("player language", () => {
  it("only EN / IS count; the player's language wins over the fallback", () => {
    expect(asAppLang("is")).toBe("IS");
    expect(asAppLang(" EN ")).toBe("EN");
    expect(asAppLang("de")).toBeNull();
    expect(asAppLang(null)).toBeNull();
    expect(sessionLangFor("IS", "EN")).toBe("IS");
    expect(sessionLangFor(null, "EN")).toBe("EN");
    expect(sessionLangFor("xx", "IS")).toBe("IS");
  });
  it("loads known languages; a failed read means none (never blocks a send)", async () => {
    const ok = { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [{ id: "a", app_language: "IS" }, { id: "b", app_language: null }], error: null }) }) }) } as unknown as SupabaseClient;
    const m = await loadPlayerLanguages(ok, ["a", "b"]);
    expect([...m.entries()]).toEqual([["a", "IS"]]);
    const bad = { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: null, error: { message: "no column" } }) }) }) } as unknown as SupabaseClient;
    expect((await loadPlayerLanguages(bad, ["a"])).size).toBe(0);
  });
  it("the same session stored in IS has Icelandic exercise names", () => {
    const snap = {
      playerId: "p1", todayIso: "2026-11-16", mdContext: "MD-4", verdict: null,
      sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
      wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
      vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false,
      teamPalette: { isometric: ["ex_imtp_iso"], upper_body: ["ex_db_bench_press"], power_explosive: ["ex_box_jump"], bilateral_strength: ["ex_back_squat"], unilateral_strength: ["ex_reverse_lunge"] },
      seasonPhase: null,
    } as unknown as PlayerStrengthSnapshot;
    const s = buildStrengthSession(snap, [], { mode: "individualised" })!;
    const en = strengthSessionToTodayStructure(s, "EN").flatMap((b) => b.items.map((i) => i.name));
    const is = strengthSessionToTodayStructure(s, "IS").flatMap((b) => b.items.map((i) => i.name));
    expect(en.length).toBe(is.length);
    expect(is).not.toEqual(en);
  });
});

describe("wiring", () => {
  const root = join(__dirname, "../../../../..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  it("the 09:00 send and the check-in rebuild no longer hard-code English", () => {
    const auto = read("src/app/api/strength/auto-send/route.ts");
    expect(auto).not.toMatch(/lang: "EN"/);
    expect(auto).toMatch(/const lang = langs\.get\(p\.id\) \?\? teamLang;/);
    expect(auto).toMatch(/asAppLang\(team\.default_language\) \?\? "EN"/);
    const rebuild = read("src/lib/micropulse/strengthProgramming/autoSession.ts");
    expect(rebuild).not.toMatch(/lang: "EN"/);
    expect(rebuild).toMatch(/sessionLangFor\(\(player as \{ app_language/);
  });
  it("hand sends use the player's language, the coach's only as the fallback", () => {
    expect(read("src/app/api/coach/team/send-strength-sessions/route.ts")).toMatch(/const lang = langs\.get\(p\.id\) \?\? coachLang;/);
    expect(read("src/app/api/coach/player/[id]/send-strength-session/route.ts")).toMatch(/loadPlayerLanguages\(supabase, \[playerId\]\)\)\.get\(playerId\) \?\? \(body\.lang === "EN"/);
  });
  it("the app reports its language only when it changed; the route sets only the player's own row", () => {
    const pc = read("src/app/player/PlayerClient.tsx");
    expect(pc).toMatch(/mp_lang_reported:\$\{pid\}/);
    expect(pc).toMatch(/authFetch\("\/api\/player\/language", \{\s*method: "PUT"/);
    const route = read("src/app/api/player/language/route.ts");
    expect(route).toMatch(/requireAuthedPlayerId\(sb, req\)/);
    expect(route).toMatch(/\.update\(\{ app_language: lang \}\)\.eq\("id", playerId\)/);
  });
});

/** The Week setup auto grid: in season MD+2 is a day off (the coach's rule, 2026-11-23); out of season unchanged. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MD2_OFF_EVIDENCE, matchAnchoredGrid } from "../autoGrid";
import { checkThreeInARow, type WeekRuleDay } from "../weekRules";

// Week of Mon 2026-10-19 … Sun 2026-10-25.
const MON = "2026-10-19";
const SUN_BEFORE = "2026-10-18";
const SUN = "2026-10-25";
const WED = "2026-10-21";
const SAT_BEFORE = "2026-10-17";

describe("auto grid", () => {
  it("no match in the week: null (the caller seeds its no-match default)", () => {
    expect(matchAnchoredGrid(MON, [SUN_BEFORE], "inseason")).toBeNull();
  });

  it("in season, Sunday match after a Sunday match: Monday MD+1, Tuesday MD+2 off, then the taper", () => {
    const g = matchAnchoredGrid(MON, [SUN_BEFORE, SUN], "inseason")!;
    expect(g.intents).toEqual(["RECOVERY_MD1", "OFF", "FORCE", "NEURAL_VELOCITY", "POLISH_CALM", "ACTIVATION", "GAME"]);
    expect(g.notes).toHaveLength(1);
    expect(g.notes[0].en).toMatch(/^MD\+2 is a day off/);
    expect(g.notes[0].is).toMatch(/^MD\+2 er frídagur/);
    expect(MD2_OFF_EVIDENCE).toMatch(/MicroPulse rule/);
    expect(MD2_OFF_EVIDENCE).toMatch(/Buchheit et al\. 2023/);
  });

  it("in season, a Saturday match before the week: Monday is MD+2 and off", () => {
    const g = matchAnchoredGrid(MON, [SAT_BEFORE, SUN], "inseason")!;
    expect(g.intents[0]).toBe("OFF");
    expect(g.intents.slice(1)).toEqual(["NEURAL_VELOCITY", "FORCE", "NEURAL_VELOCITY", "POLISH_CALM", "ACTIVATION", "GAME"]); // Tue MD-5 … the taper as before
  });

  it("in season, midweek match: MD+1 recovery and MD+2 off win over the taper; MD-1 is never off", () => {
    const g = matchAnchoredGrid(MON, [WED, SUN], "inseason")!;
    // Mon MD-2, Tue MD-1, Wed match, Thu MD+1, Fri MD+2 (also MD-2) off, Sat MD-1, Sun match
    expect(g.intents).toEqual(["POLISH_CALM", "ACTIVATION", "GAME", "RECOVERY_MD1", "OFF", "ACTIVATION", "GAME"]);
  });

  it("in season, matches two days apart: the day between is MD+1 and MD-1, and keeps the activation", () => {
    const g = matchAnchoredGrid(MON, ["2026-10-22", "2026-10-24"], "inseason")!;
    expect(g.intents[3]).toBe("GAME");
    expect(g.intents[4]).toBe("ACTIVATION"); // Fri: MD+1 and MD-1 → activation before the match
    expect(g.intents[5]).toBe("GAME");
    expect(g.intents[6]).toBe("OFF"); // the week's Sunday stays a day off, as before
  });

  it("no phase known with a match: read as in season (same as the three-in-a-row rule)", () => {
    expect(matchAnchoredGrid(MON, [SUN_BEFORE, SUN], null)!.intents[1]).toBe("OFF");
  });

  it("pre-season and off-season: unchanged (only the week's matches, taper first, MD+2 recovery)", () => {
    for (const phase of ["preseason", "offseason"]) {
      const g = matchAnchoredGrid(MON, [SUN_BEFORE, SUN], phase)!;
      expect(g.intents).toEqual(["FORCE", "NEURAL_VELOCITY", "FORCE", "NEURAL_VELOCITY", "POLISH_CALM", "ACTIVATION", "GAME"]);
      expect(g.notes).toEqual([]);
      const mid = matchAnchoredGrid(MON, [WED], phase)!;
      expect(mid.intents).toEqual(["POLISH_CALM", "ACTIVATION", "GAME", "RECOVERY_MD1", "RECOVERY_MD2", "RECOVERY_PLUS", "OFF"]);
    }
  });

  it("in season the seeded Sunday-to-Sunday week still meets the week rule only with MD-2 off too (the rule still advises)", () => {
    const g = matchAnchoredGrid(MON, [SUN_BEFORE, SUN], "inseason")!;
    const kind = (i: string): WeekRuleDay["kind"] => (i === "GAME" ? "match" : i === "OFF" ? "off" : "session");
    const days: WeekRuleDay[] = g.intents.map((x, i) => ({ date: `2026-10-${19 + i}`, kind: kind(x) }));
    const check = checkThreeInARow({ days, matchDates: [SUN_BEFORE, SUN], phase: "inseason" });
    expect(check.ok).toBe(false);
    expect(check.fix?.off.map((r) => r.md)).toEqual(["MD-2"]);
  });

  it("never reads the readiness colour", () => {
    const src = readFileSync(join(__dirname, "..", "autoGrid.ts"), "utf8");
    expect(src).not.toMatch(/final_color|readiness_entries|supabase/);
  });
});

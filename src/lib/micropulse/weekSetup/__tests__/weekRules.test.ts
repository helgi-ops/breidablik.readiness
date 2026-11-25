/**
 * Week rules (brief §5): in season never three training days in a row (match day not a session), the nearest fix
 * (Sunday match → MD+2 and MD-2 off, MD-2 tactical work onto MD-3 and MD-1), advice only, bilingual, and wired into
 * Week setup's Apply + Build Session's week plan with a logged keep.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  THREE_IN_A_ROW_RULE, applyThreeInARowFix, checkThreeInARow, dayKindOf, runSignature, threeInARowApplies,
  type WeekRuleDay,
} from "../weekRules";

// Mon 23 Nov … Sun 29 Nov 2026; matches on Sun 22 and Sun 29.
const WEEK = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"];
const GAMES = ["2026-11-22", "2026-11-29"];
const week = (kinds: string): WeekRuleDay[] =>
  [...kinds].map((k, i) => ({ date: WEEK[i], kind: k === "S" ? "session" : k === "M" ? "match" : "off", editable: true }));

describe("the run", () => {
  it("Sunday match after a Sunday match, six sessions → MD+2 and MD-2 off; MD-2 tactical work onto MD-3 and MD-1", () => {
    const c = checkThreeInARow({ days: week("SSSSSSM"), matchDates: GAMES, phase: "inseason" });
    expect(c).toMatchObject({ ruleId: THREE_IN_A_ROW_RULE, applies: true, ok: false });
    expect(c.runs).toHaveLength(1);
    expect(c.runs[0].days.map((d) => d.md)).toEqual(["MD+1", "MD+2", "MD-4", "MD-3", "MD-2", "MD-1"]);
    expect(c.fix?.off).toEqual([{ date: "2026-11-24", md: "MD+2" }, { date: "2026-11-27", md: "MD-2" }]);
    expect(c.fix?.moves).toEqual([{ from: { date: "2026-11-27", md: "MD-2" }, to: [{ date: "2026-11-26", md: "MD-3" }, { date: "2026-11-28", md: "MD-1" }] }]);
    expect(c.headline?.en).toBe("6 training days in a row — in season the squad gets a day off after two.");
    expect(c.facts[1].en).toBe("Nearest fix: Tue 24 Nov (MD+2) and Fri 27 Nov (MD-2) off. The MD-2 tactical work splits onto Thu 26 Nov (MD-3) and Sat 28 Nov (MD-1).");
    expect(c.facts[1].is).toBe("Næsta lagfæring: frí þri 24. nóv (MD+2) og fös 27. nóv (MD-2). Taktíska vinnan á MD-2 skiptist á fim 26. nóv (MD-3) og lau 28. nóv (MD-1).");
    // The fixed week passes.
    expect(checkThreeInARow({ days: applyThreeInARowFix(week("SSSSSSM"), c.fix), matchDates: GAMES, phase: "inseason" }).ok).toBe(true);
  });

  it("a match day is not a session and ends the run; a day off ends it too", () => {
    // Sat 21 + Sun 22 match + Mon, Tue: two before, two after → fine.
    const days: WeekRuleDay[] = [
      { date: "2026-11-20", kind: "session", editable: false }, { date: "2026-11-21", kind: "session", editable: false },
      { date: "2026-11-22", kind: "match", editable: false }, ...week("SSOSSOM"),
    ];
    expect(checkThreeInARow({ days, matchDates: GAMES, phase: "inseason" }).ok).toBe(true);
    expect(checkThreeInARow({ days: week("SSOSSSM"), matchDates: GAMES, phase: "inseason" }).ok).toBe(false);
  });

  it("two sessions in a row are fine; three are not", () => {
    expect(checkThreeInARow({ days: week("SSOSSOM"), matchDates: GAMES, phase: "inseason" }).ok).toBe(true);
    const c = checkThreeInARow({ days: week("SOSSSOM"), matchDates: GAMES, phase: "inseason" });
    // Wed MD-4, Thu MD-3, Fri MD-2: one day off does it; MD-2 goes before the main days; Sat is off, so its work moves to Thu.
    expect(c.fix?.off.map((d) => d.md)).toEqual(["MD-2"]);
    expect(c.facts[1].en).toBe("Nearest fix: Fri 27 Nov (MD-2) off. The MD-2 tactical work moves to Thu 26 Nov (MD-3).");
  });
});

describe("only in season", () => {
  it("pre-season and off-season are not checked; play-offs are", () => {
    for (const p of ["preseason", "offseason"]) expect(checkThreeInARow({ days: week("SSSSSSM"), matchDates: GAMES, phase: p })).toMatchObject({ applies: false, ok: true });
    expect(checkThreeInARow({ days: week("SSSSSSM"), matchDates: GAMES, phase: "playoffs" }).ok).toBe(false);
  });

  it("no phase known: checked only when a match is in the days", () => {
    expect(threeInARowApplies(null, week("SSSSSSO"))).toBe(false);
    expect(threeInARowApplies(null, week("SSSSSSM"))).toBe(true);
  });
});

describe("the weeks around", () => {
  it("days from the week before count, but the fix only turns off days in this week", () => {
    const days: WeekRuleDay[] = [{ date: "2026-11-21", kind: "session", editable: false }, { date: "2026-11-22", kind: "session", editable: false }, ...week("SOSSOOM")];
    const c = checkThreeInARow({ days, matchDates: ["2026-11-29"], phase: "inseason" });
    expect(c.ok).toBe(false);
    expect(c.fix?.off).toEqual([{ date: "2026-11-23", md: null }]);
  });

  it("a run only in the week before is not this week's to fix", () => {
    const days: WeekRuleDay[] = ["2026-11-20", "2026-11-21", "2026-11-22"].map((date) => ({ date, kind: "session" as const, editable: false }));
    expect(checkThreeInARow({ days: [...days, ...week("OSOSOOM")], matchDates: GAMES, phase: "inseason" }).ok).toBe(true);
  });
});

describe("plain words, provenance, the keep", () => {
  it("bilingual, AppliedAdaptation with the rule and its source, advice only", () => {
    const c = checkThreeInARow({ days: week("SSSSSSM"), matchDates: GAMES, phase: "inseason" });
    for (const f of c.facts) { expect(f.en).toBeTruthy(); expect(f.is).toBeTruthy(); }
    expect(c.adaptation).toMatchObject({ ruleId: "INSEASON_THREE_IN_A_ROW" });
    expect(c.adaptation?.actionEN).toMatch(/Not applied; the coach decides/);
    expect(c.adaptation?.actionIS).toMatch(/þjálfarinn ræður/);
    expect(c.adaptation?.evidence).toMatch(/MicroPulse rule/);
    expect(c.adaptation?.evidence).toMatch(/Buchheit et al\. 2023/);
    expect(c.facts.at(-1)?.en).toMatch(/Advice only/);
  });

  it("a keep holds only for the same run", () => {
    const a = checkThreeInARow({ days: week("SSSSSSM"), matchDates: GAMES, phase: "inseason" });
    const b = checkThreeInARow({ days: week("OSSSSSM"), matchDates: GAMES, phase: "inseason" });
    expect(runSignature(a)).toBe("2026-11-23..2026-11-28");
    expect(runSignature(b)).not.toBe(runSignature(a));
  });

  it("week_plans day types", () => {
    expect([dayKindOf("TRAIN"), dayKindOf("RECOVERY"), dayKindOf("GAME"), dayKindOf("OFF"), dayKindOf(null)]).toEqual(["session", "session", "match", "off", "off"]);
  });
});

describe("wiring", () => {
  const root = join(__dirname, "..", "..", "..", "..", "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  it("Apply and Build Session's week plan return the check; neither blocks", () => {
    const apply = read("src/app/api/coach/week-setup/apply/route.ts");
    expect(apply).toMatch(/loadWeekRuleRead\(supabase, team_id, week_start\)/);
    expect(apply).toMatch(/return NextResponse\.json\(\{ ok: true, weekRule(, confirmedAt)? \}\)/);
    const plan = read("src/app/api/coach/session-builder/week-plan/route.ts");
    expect(plan).toMatch(/loadWeekRuleRead\(sb, teamId/);
  });

  it("the keep needs a reason and is logged as week_rule", () => {
    const route = read("src/app/api/coach/week-rules/route.ts");
    expect(route).toMatch(/A reason is required/);
    const server = read("src/lib/micropulse/weekSetup/weekRulesServer.ts");
    expect(server).toMatch(/model_source: WEEK_RULE_LOG_SOURCE/);
    expect(server).not.toMatch(/final_color|readiness_entries/);
  });
});

/**
 * The movement screen changes the session (screenRules.ts, brief §4c): the read (pose screen / screening form, 56
 * days, pain → nothing), the heavy slot going split stance / one leg, and the warm-up balance block.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HEAVY_TWO_LEG, SCREEN_OHS_UNILATERAL, SCREEN_SLB_WARMUP, readScreenFlags, screenWarmupBlock, type ScreenFlags, type ScreenInput,
} from "../screenRules";
import { fetchScreenFlags } from "../screenRulesLoader";
import { buildStrengthSession } from "..";
import type { MdContext, PlayerStrengthSnapshot, StrengthSession } from "../types";

const TODAY = "2026-11-23";
const ohs = (findings: ScreenInput["screens"][number]["findings"], date = "2026-11-10", extra: Partial<ScreenInput["screens"][number]> = {}) =>
  ({ testSlug: "overhead_squat_assessment", screenDate: date, findings, ...extra });
const read = (screens: ScreenInput["screens"], form: ScreenInput["form"] = null) => readScreenFlags({ todayIso: TODAY, screens, form });

const snap = (md: MdContext, over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: TODAY, mdContext: md, verdict: "FULL",
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false, ...over,
});
const ids = (s: StrengthSession | null) => (s?.blocks ?? []).flatMap((b) => b.exercises.map((e) => e.exerciseId));
const rules = (s: StrengthSession | null) => (s?.appliedAdaptations ?? []).map((a) => a.ruleId);
const IND = { mode: "individualised" as const };

describe("the read", () => {
  it("knee valgus (moderate+) and the side; heels rising / shallow squat = ankle", () => {
    expect(read([ohs([{ variableKey: "knee_valgus", severity: "moderate", leg: "L" }])])?.ohs).toEqual({ date: "2026-11-10", valgus: "L", ankle: false, via: "pose" });
    expect(read([ohs([{ variableKey: "knee_valgus", severity: "marked", leg: "L" }, { variableKey: "knee_valgus", severity: "moderate", leg: "R" }])])?.ohs?.valgus).toBe("both");
    expect(read([ohs([{ variableKey: "heel_rise", severity: "moderate" }])])?.ohs?.ankle).toBe(true);
    expect(read([ohs([{ variableKey: "squat_depth", severity: "marked" }])])?.ohs?.ankle).toBe(true);
  });

  it("mild findings, other variables, old screens → nothing", () => {
    expect(read([ohs([{ variableKey: "knee_valgus", severity: "mild" }])])).toBeNull();
    expect(read([ohs([{ variableKey: "arms_fall_forward", severity: "marked" }])])).toBeNull();
    expect(read([ohs([{ variableKey: "knee_valgus", severity: "marked" }], "2026-09-27")])).toBeNull(); // 57 d
    expect(read([ohs([{ variableKey: "knee_valgus", severity: "marked" }], "2026-09-28")])).not.toBeNull(); // 56 d
  });

  it("pain or a red flag → nothing (clinician), and the form is not used instead", () => {
    const form = { assessmentDate: "2026-11-01", fired: [{ testSlug: "overhead_squat", observationKey: "knees_inward" as const }] };
    expect(read([ohs([{ variableKey: "knee_valgus", severity: "marked" }], "2026-11-10", { painReported: true })], form)).toBeNull();
    expect(read([ohs([{ variableKey: "knee_valgus", severity: "marked" }], "2026-11-10", { redFlag: true })])).toBeNull();
  });

  it("the latest overhead squat counts: a clean newer screen clears an older finding", () => {
    expect(read([ohs([{ variableKey: "knee_valgus", severity: "marked" }], "2026-11-01"), ohs([], "2026-11-15")])).toBeNull();
  });

  it("screening form: overhead squat knees in / heels rise; balance from the Star Excursion reach or the hop-and-stick", () => {
    const f = read([], { assessmentDate: "2026-11-01", fired: [
      { testSlug: "overhead_squat", observationKey: "heel_rise" },
      { testSlug: "sebt_lower", observationKey: "anterior_asymmetry", side: "L" },
    ] })!;
    expect(f.ohs).toEqual({ date: "2026-11-01", valgus: null, ankle: true, via: "form" });
    expect(f.slb).toEqual({ date: "2026-11-01", via: "form", what: "sebt_reach" });
  });

  it("single-leg drop jump: a wobbly landing (moderate+) = poor balance", () => {
    expect(read([{ testSlug: "single_leg_drop_jump", screenDate: "2026-11-12", findings: [{ variableKey: "landing_sway", severity: "moderate", leg: "R" }] }])?.slb)
      .toEqual({ date: "2026-11-12", via: "pose", what: "landing_sway" });
  });
});

describe("SCREEN_OHS_UNILATERAL in the engine", () => {
  const flags: ScreenFlags = { ohs: { date: "2026-11-10", valgus: "L", ankle: true, via: "pose" } };
  const plain = buildStrengthSession(snap("MD-4"), [], IND);
  const screened = buildStrengthSession(snap("MD-4", { screenFlags: flags }), [], IND);

  it("the heavy two-leg lift becomes split stance / one leg, same sets", () => {
    const heavy = ids(plain).find((id) => HEAVY_TWO_LEG[id]);
    expect(heavy).toBeDefined();
    expect(ids(screened)).not.toContain(heavy);
    expect(ids(screened)).toContain(HEAVY_TWO_LEG[heavy!]);
    const sets = (s: StrengthSession | null, id: string) => s!.blocks.flatMap((b) => b.exercises).find((e) => e.exerciseId === id)!.dose.sets;
    expect(sets(screened, HEAVY_TWO_LEG[heavy!])).toBe(sets(plain, heavy!));
    const a = screened!.appliedAdaptations.find((x) => x.ruleId === SCREEN_OHS_UNILATERAL)!;
    expect(a.triggerEN).toContain("knees cave in (left)");
    expect(a.triggerEN).toContain("ankle restriction");
    expect(a.triggerIS).toContain("Hnébeygja yfir höfði");
    expect(a.evidence).toContain("Post 2017");
  });

  it("the team list's one-leg pick is used, and its two-leg pick never puts the old lift back", () => {
    const s = buildStrengthSession(snap("MD-4", { screenFlags: flags, teamPalette: { bilateral_strength: ["ex_back_squat", "ex_trap_bar_dl"], unilateral_strength: ["ex_reverse_lunge"] } }), [], IND);
    expect(ids(s)).toContain("ex_reverse_lunge");
    expect(ids(s).filter((id) => HEAVY_TWO_LEG[id])).toEqual([]);
    expect(rules(s)).toContain(SCREEN_OHS_UNILATERAL);
  });

  it("standard mode: no per-player screen rule", () => {
    const s = buildStrengthSession(snap("MD-4", { screenFlags: flags }), [], { mode: "standard" });
    expect(rules(s)).not.toContain(SCREEN_OHS_UNILATERAL);
  });
});

describe("SCREEN_SLB_WARMUP", () => {
  const flags: ScreenFlags = { slb: { date: "2026-11-12", via: "pose", what: "landing_sway" } };

  it("adds the single-leg balance block to the warm-up, logged EN + IS with Ross & Guskiewicz 2005", () => {
    const s = buildStrengthSession(snap("MD-3", { screenFlags: flags }), [], IND);
    expect(s!.correctives?.[0]?.slug).toBe("single_leg_balance");
    const a = s!.appliedAdaptations.find((x) => x.ruleId === SCREEN_SLB_WARMUP)!;
    expect(a.triggerEN).toContain("wobbly landing");
    expect(a.actionIS).toContain("upphitun");
    expect(a.evidence).toContain("Ross & Guskiewicz 2005");
  });

  it("not twice when the screen's own correctives already hold it", () => {
    const existing = [{ slug: "single_leg_balance", nameEN: "x", nameIS: "x", doseEN: "", doseIS: "", cueEN: "", cueIS: "", sourceNoteEN: "", sourceNoteIS: "" }];
    const r = screenWarmupBlock(snap("MD-3", { screenFlags: flags }), existing)!;
    expect(r.add).toBeNull();
    expect(r.audit.actionEN).toContain("already in the warm-up");
  });

  it("standard mode: nothing", () => {
    const s = buildStrengthSession(snap("MD-3", { screenFlags: flags }), [], { mode: "standard" });
    expect(s!.correctives).toBeUndefined();
  });
});

describe("fetchScreenFlags", () => {
  it("maps the rows (pain from context, red flag) into the read", async () => {
    const rows: Record<string, unknown[]> = {
      movement_screens: [
        { test_slug: "overhead_squat_assessment", screen_date: "2026-11-10", findings: [{ variableKey: "knee_valgus", severity: "moderate", leg: "R" }], context: {}, red_flag: false },
      ],
      movement_assessment_forms: [],
    };
    const chain = (table: string) => {
      const c = { select: () => c, eq: () => c, in: () => c, gte: () => c, lte: () => c, order: () => c, limit: () => Promise.resolve({ data: rows[table] }) };
      return c;
    };
    const sb = { from: chain } as unknown as SupabaseClient;
    expect((await fetchScreenFlags(sb, "p1", TODAY))?.ohs).toEqual({ date: "2026-11-10", valgus: "R", ankle: false, via: "pose" });
    rows.movement_screens = [{ ...(rows.movement_screens[0] as object), context: { painReported: true } }];
    expect(await fetchScreenFlags(sb, "p1", TODAY)).toBeNull();
  });
});

/**
 * "A" (2026-11-18): the strength engine reads today's canonical colour, and an untouched automatic session is
 * rebuilt at check-in. Before this, the verdict query read a column that never existed, so the yellow / red rules
 * never fired for any coach-sent or automatic session.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchVerdict, verdictFromColour } from "@/lib/micropulse/playerContext/domains";
import { buildStrengthSession } from "../index";
import { refreshAutoSessionAfterCheckin } from "../autoSession";
import type { PaletteSlots } from "../palette";
import { STRUCTURE_KEYS } from "../structures";
import type { MdContext, PlayerStrengthSnapshot, StrengthSession } from "../types";

type Row = Record<string, unknown>;
/** Minimal fake: every filter is ignored; maybeSingle → first row; a head count → rows.length. */
function fakeSb(tables: Record<string, Row[] | { error: string }>): SupabaseClient {
  return {
    from: (t: string) => {
      const v = tables[t] ?? [];
      const err = !Array.isArray(v) ? { message: v.error } : null;
      const rows = Array.isArray(v) ? v : [];
      let head = false;
      const q: Record<string, unknown> = {
        select: (_c: string, o?: { head?: boolean }) => { head = !!o?.head; return q; },
        eq: () => q, gte: () => q, lte: () => q, order: () => q, limit: () => q, in: () => q,
        maybeSingle: () => Promise.resolve({ data: err ? null : rows[0] ?? null, error: err }),
        then: (res: (x: unknown) => unknown) => Promise.resolve(head ? { count: rows.length, error: err } : { data: rows, error: err }).then(res),
        upsert: () => { throw new Error("must not write"); },
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

describe("today's colour is the engine's verdict", () => {
  it("green / yellow / red map to FULL / MODIFIED / RECOVERY; anything else is no check-in", () => {
    expect(verdictFromColour("green")).toBe("FULL");
    expect(verdictFromColour("GREEN_PLUS")).toBe("FULL");
    expect(verdictFromColour("yellow")).toBe("MODIFIED");
    expect(verdictFromColour("red")).toBe("RECOVERY");
    expect(verdictFromColour(null)).toBeNull();
    expect(verdictFromColour("")).toBeNull();
  });
  it("reads today's row only; an imputed check-in or a failed read counts as none", async () => {
    expect(await fetchVerdict(fakeSb({ v_coach_readiness_today_v8: [{ final_color: "red", is_imputed: false }] }), "p", "2026-11-18")).toBe("RECOVERY");
    expect(await fetchVerdict(fakeSb({ v_coach_readiness_today_v8: [{ final_color: "yellow", is_imputed: true }] }), "p", "2026-11-18")).toBeNull();
    expect(await fetchVerdict(fakeSb({ v_coach_readiness_today_v8: [] }), "p", "2026-11-18")).toBeNull();
    expect(await fetchVerdict(fakeSb({ v_coach_readiness_today_v8: { error: "boom" } }), "p", "2026-11-18")).toBeNull();
  });
});

const PALETTE: PaletteSlots = {
  isometric: ["ex_imtp_iso"],
  upper_body: ["ex_db_bench_press"],
  power_explosive: ["ex_box_jump", "ex_depth_jump"],
  bilateral_strength: ["ex_hip_thrust", "ex_back_squat"],
  unilateral_strength: ["ex_reverse_lunge"],
};
const snap = (verdict: PlayerStrengthSnapshot["verdict"], over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: "2026-11-16", mdContext: "MD-4" as MdContext, verdict,
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false,
  teamPalette: PALETTE, seasonPhase: null, ...over,
});
const build = (v: PlayerStrengthSnapshot["verdict"], over: Partial<PlayerStrengthSnapshot> = {}) => buildStrengthSession(snap(v, over), [], { mode: "individualised" });
const work = (s: StrengthSession | null) => (s?.blocks ?? []).filter((b) => b.type !== "PREP" && b.type !== "MOBILITY").flatMap((b) => b.exercises);
/** Total working reps: sets × reps (upper end of a range; a timed hold = 1 per set). */
const reps = (s: StrengthSession | null) => work(s).reduce((n, e) => {
  const r = String(e.dose.reps); const m = /^\s*(\d+)(?:\s*[-–]\s*(\d+))?/.exec(r);
  return n + e.dose.sets * (/^\s*\d+\s*s\b/.test(r) || !m ? 1 : Number(m[2] ?? m[1]));
}, 0);
const loaded = (s: StrengthSession | null) => reps({ ...(s as StrengthSession), blocks: (s?.blocks ?? []).map((b) => ({ ...b, exercises: b.exercises.filter((e) => /%|RPE/i.test(e.dose.intensity)) })) });
const rules = (s: StrengthSession | null) => (s?.appliedAdaptations ?? []).map((a) => a.ruleId);

describe("the engine's yellow / red rules now fire", () => {
  for (const md of ["MD-4", "MD-3"] as MdContext[]) {
    const normal = build(null, { mdContext: md });
    it(`${md}: no check-in builds the same session as green`, () => {
      expect(build("FULL", { mdContext: md })?.blocks).toEqual(normal?.blocks);
    });
    it(`${md}: yellow is less work than green, said in plain words`, () => {
      const y = build("MODIFIED", { mdContext: md });
      expect(reps(y)).toBeLessThan(reps(normal));
      expect(work(y).length).toBeLessThanOrEqual(work(normal).length);
      const why = y!.appliedAdaptations.map((a) => a.triggerEN).join(" | ");
      expect(why).toMatch(/Today's check-in: yellow/);
      expect(why).not.toMatch(/MODIFIED|verdict/);
    });
    it(`${md}: red is warm-up and mobility only, no upper-body lift either`, () => {
      const r = build("RECOVERY", { mdContext: md });
      expect(work(normal).length).toBeGreaterThan(0);
      expect(work(r)).toEqual([]);
      expect(rules(r)).not.toContain("UPPER_BODY_ADDED");
      expect(r!.appliedAdaptations.find((a) => a.ruleId === "VERDICT_BLOCK")?.triggerIS).toBe("Innskráning í dag: rauð");
    });
  }
});

describe("yellow step-down cap: never more work than green", () => {
  // Every method the coach can pick, on each day it is allowed: yellow is never more reps or exercises than green.
  const days: MdContext[] = ["MD-4", "MD-3", "MD-2"];
  const methods = STRUCTURE_KEYS as readonly string[];
  for (const md of days) for (const m of methods) {
    it(`${md} · ${m}`, () => {
      const over = { mdContext: md, mdStructures: { [md]: m } } as Partial<PlayerStrengthSnapshot>;
      const g = build("FULL", over), y = build("MODIFIED", over);
      if (!g || !y) return;
      expect(reps(y)).toBeLessThanOrEqual(reps(g));
      expect(loaded(y)).toBeLessThanOrEqual(loaded(g));
      expect(work(y).length).toBeLessThanOrEqual(work(g).length);
    });
  }
  it("dropping the jumps does not buy a heavier main lift (Breiðablik MD-3, 2026-11-18: contrast 3×3 @85% → cluster 2×12)", () => {
    const over = { mdContext: "MD-3", mdStructures: { "MD-3": "contrast" } } as Partial<PlayerStrengthSnapshot>;
    const y = build("MODIFIED", over), g = build("FULL", over);
    expect(loaded(y)).toBeLessThanOrEqual(loaded(g));
    expect(work(y).some((e) => /^12/.test(e.dose.reps))).toBe(false);
  });

  it("a heavier lower rung is skipped and the reason is shown", () => {
    let seen = false;
    for (const md of days) for (const m of methods) {
      const y = build("MODIFIED", { mdContext: md, mdStructures: { [md]: m } } as Partial<PlayerStrengthSnapshot>);
      if (rules(y).includes("STRUCTURE_READINESS_DOWNGRADE_SKIPPED")) {
        seen = true;
        expect(rules(y)).not.toContain("STRUCTURE_READINESS_DOWNGRADE");
        expect(y!.appliedAdaptations.find((a) => a.ruleId === "STRUCTURE_READINESS_DOWNGRADE_SKIPPED")?.actionEN).toMatch(/more work than a green day/);
      }
    }
    expect(seen).toBe(true);
  });
});

describe("rebuild at check-in: only an untouched automatic session", () => {
  const D = "2026-11-18";
  it("no session today, or one the coach sent by hand → nothing changes", async () => {
    expect(await refreshAutoSessionAfterCheckin(fakeSb({ player_today_strength_override: [] }), "p", D)).toBe("not_auto");
    for (const origin of ["session", "bulk", "block", "corrective", null]) {
      expect(await refreshAutoSessionAfterCheckin(fakeSb({ player_today_strength_override: [{ origin, team_id: "t" }] }), "p", D)).toBe("not_auto");
    }
  });
  it("started (a set logged, an exercise swapped, or marked done) → stays as it is", async () => {
    const base = { player_today_strength_override: [{ origin: "auto", team_id: "t" }], player_strength_completions: [], player_strength_set_log: [], player_exercise_swaps: [] };
    for (const t of ["player_strength_completions", "player_strength_set_log", "player_exercise_swaps"]) {
      expect(await refreshAutoSessionAfterCheckin(fakeSb({ ...base, [t]: [{ id: "x" }] }), "p", D), t).toBe("started");
    }
  });
  it("a read failure never rebuilds", async () => {
    const sb = fakeSb({ player_today_strength_override: [{ origin: "auto", team_id: "t" }], player_strength_completions: { error: "x" } });
    expect(await refreshAutoSessionAfterCheckin(sb, "p", D)).toBe("failed");
  });
});

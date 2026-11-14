import { describe, expect, it } from "vitest";
import { allowedStarts, buildGoalPlan, PLAN_WEEKS } from "../index";
import { ACCEL_METHODS, ACCEL_REFS, accelStart } from "../acceleration";
import { JUMP_METHODS, JUMP_REFS, jumpStart } from "../jump";
import { BRAKING_METHODS, BRAKING_REFS, brakingStart } from "../braking";
import { MAX_SESSION_MINUTES } from "../common";
import { MAX_FLYING_M_PER_SESSION } from "@/lib/micropulse/speedMethods";
import type { Bi, GoalPlan, GoalPlanInput, GoalQuality } from "../types";
import { GOAL_QUALITIES } from "../types";

const base = (over: Partial<GoalPlanInput> = {}): GoalPlanInput => ({
  quality: "top_speed",
  todayIso: "2026-11-13",
  sport: "football",
  isGoalkeeper: false,
  isActive: true,
  ageYears: 24,
  unavailable: false,
  inSeason: true,
  topSpeed: null,
  sprintTimes: null,
  cmj: null,
  strength: null,
  braking: null,
  weakerLeg: null,
  ...over,
});

const ts = (daysSince: number | null) => ({ level: "ok" as const, daysSince, refKmh: 32, targetKmh: 28.8, confidence: "high" as const });
const strong = { imtpRelNkg: 45, imtpBand: "good" as const, dsiTier: null, dsiBasis: null, date: "2026-10-01" };
const weak = { imtpRelNkg: 30, imtpBand: "below" as const, dsiTier: null, dsiBasis: null, date: "2026-10-01" };

/** Many inputs: every quality × data shapes × age × season. */
function allPlans(): GoalPlan[] {
  const out: GoalPlan[] = [];
  const shapes: Partial<GoalPlanInput>[] = [
    {},
    { topSpeed: ts(4), strength: strong },
    { topSpeed: ts(30), strength: weak },
    { strength: { ...strong, imtpBand: null, imtpRelNkg: null, dsiTier: "ballistic", dsiBasis: "squad" } },
    { cmj: { heightCm: 38, rsiMod: 0.4, date: "2026-10-01", heightBand: "average", rsiBand: "below" }, strength: strong },
    { braking: { overloadFlag: "red", codAsymHighPct: 22, codLean: "left" } },
    { braking: { overloadFlag: "green", codAsymHighPct: 5, codLean: "balanced" }, weakerLeg: { side: "right", asymPct: 14, test: "Single-Leg Jump", date: "2026-10-01" } },
    { sprintTimes: { s5: 1.1, s10: 1.8, s20: 3.0, date: "2026-09-01" }, strength: weak },
  ];
  for (const q of GOAL_QUALITIES) for (const s of shapes) for (const age of [24, 16, null]) for (const inSeason of [true, false]) {
    out.push(buildGoalPlan(base({ ...s, quality: q, ageYears: age, inSeason })));
  }
  return out;
}

const ok = (p: GoalPlan) => p.status === "ok";
const textOf = (b: Bi) => `${b.en} ${b.is}`;
const allText = (p: GoalPlan): Bi[] => [
  p.verdict, ...p.facts, ...(p.counterfactual ? [p.counterfactual] : []), ...(p.branch ? [p.branch.label, p.branch.why] : []),
  ...p.confidence.used, ...p.confidence.missing, p.tests.what, p.tests.change, p.supervision, ...p.safety, p.basis, ...p.limits,
  ...p.weeks.flatMap((w) => [w.label, ...w.sessions.flatMap((s) => [s.focus, s.when, ...s.blocks.flatMap((b) => [b.what, b.dose])])]),
];
const mainView = (p: GoalPlan): Bi[] => [p.verdict, ...p.facts, ...(p.counterfactual ? [p.counterfactual] : []), ...p.confidence.missing];
// \`limits\` sits behind "Show details" but is still checked for wording.

describe("blocked reasons", () => {
  it("injury beats everything and blocks every quality", () => {
    for (const q of GOAL_QUALITIES) {
      const p = buildGoalPlan(base({ quality: q, unavailable: true, isGoalkeeper: true, sport: "basketball" }));
      expect(p.status).toBe("blocked");
      expect(p.blocked?.reason).toBe("injured_or_rtt");
      expect(p.weeks).toEqual([]);
    }
  });
  it("inactive player gets no plan", () => {
    expect(buildGoalPlan(base({ isActive: false })).blocked?.reason).toBe("player_inactive");
  });
  it("goalkeepers get no top-speed plan but do get the other three", () => {
    expect(buildGoalPlan(base({ isGoalkeeper: true })).blocked?.reason).toBe("goalkeeper");
    for (const q of ["acceleration", "braking", "jump"] as GoalQuality[]) expect(buildGoalPlan(base({ quality: q, isGoalkeeper: true })).status).toBe("ok");
  });
  it("basketball: no top speed, the other three yes", () => {
    expect(buildGoalPlan(base({ sport: "basketball" })).blocked?.reason).toBe("not_for_sport");
    for (const q of ["acceleration", "braking", "jump"] as GoalQuality[]) expect(buildGoalPlan(base({ quality: q, sport: "basketball" })).status).toBe("ok");
  });
  it("other sports get nothing", () => {
    for (const q of GOAL_QUALITIES) expect(buildGoalPlan(base({ quality: q, sport: "other" })).blocked?.reason).toBe("sport_not_supported");
  });
});

describe("branches", () => {
  it("top speed: no data or >10 days since a 90% run → build up first; recent → ready", () => {
    expect(buildGoalPlan(base()).branch?.key).toMatch(/^build_first_/);
    expect(buildGoalPlan(base({ topSpeed: ts(25) })).branch?.key).toMatch(/^build_first_/);
    expect(buildGoalPlan(base({ topSpeed: ts(null) })).branch?.key).toMatch(/^build_first_/);
    expect(buildGoalPlan(base({ topSpeed: ts(5) })).branch?.key).toMatch(/^ready_/);
  });
  it("top speed: gym emphasis follows the strength read", () => {
    expect(buildGoalPlan(base({ topSpeed: ts(5), strength: weak })).branch?.key).toBe("ready_strength");
    expect(buildGoalPlan(base({ topSpeed: ts(5), strength: strong })).branch?.key).toBe("ready_power");
    expect(buildGoalPlan(base({ topSpeed: ts(5) })).branch?.key).toBe("ready_balanced");
  });
  it("acceleration: under 18 or age unknown → youth level whatever the strength test", () => {
    expect(accelStart(base({ ageYears: 16, strength: weak }))).toBe("youth");
    expect(accelStart(base({ ageYears: null, strength: strong }))).toBe("youth");
    const p = buildGoalPlan(base({ quality: "acceleration", ageYears: 16, strength: weak }));
    expect(p.branch?.key).toBe("youth");
    expect(p.counterfactual?.en).toMatch(/18 or over/);
  });
  it("acceleration: adult sled volume is 60–100 m in normal weeks, load 15–30%, never 'about half' as the default", () => {
    for (const strength of [weak, null]) {
      const p = buildGoalPlan(base({ quality: "acceleration", strength }));
      const sledWeeks = p.weeks.filter((w) => !/lighter|test/.test(w.label.en));
      for (const w of sledWeeks) for (const s of w.sessions) for (const b of s.blocks) if (b.method === "resisted_sled") {
        expect(b.sledM).toBeGreaterThanOrEqual(60);
        expect(b.sledM).toBeLessThanOrEqual(100);
        expect(b.dose.en).toMatch(/15–30%/);
      }
      expect(p.weeks.some((w) => w.sessions.some((s) => s.blocks.some((b) => b.method === "resisted_sled")))).toBe(true);
    }
  });
  it("acceleration: low strength → strength first, strong → starts first, nothing → balanced", () => {
    expect(accelStart(base({ strength: weak }))).toBe("strength_first");
    expect(accelStart(base({ strength: strong }))).toBe("starts_first");
    expect(accelStart(base())).toBe("balanced");
  });
  it("jump: youth, strength first, fast jumps, combined", () => {
    expect(jumpStart(base({ ageYears: 15 }))).toBe("youth");
    expect(jumpStart(base({ ageYears: null }))).toBe("youth");
    expect(jumpStart(base({ strength: weak }))).toBe("strength_first");
    expect(jumpStart(base({ strength: strong, cmj: { heightCm: 35, rsiMod: 0.35, date: null, heightBand: "average", rsiBand: "below" } }))).toBe("fast_jumps");
    expect(jumpStart(base())).toBe("combined");
  });
  it("braking: high hard-braking load → technique only, no full-effort stops added", () => {
    const input = base({ quality: "braking", braking: { overloadFlag: "red", codAsymHighPct: null, codLean: null } });
    expect(brakingStart(input)).toBe("technique_only");
    const p = buildGoalPlan(input);
    const stops = p.weeks.flatMap((w) => w.sessions.flatMap((s) => s.blocks.map((b) => b.hardStops ?? 0)));
    expect(Math.max(...stops)).toBe(0);
    expect(brakingStart(base({ quality: "braking" }))).toBe("standard");
  });
  it("braking: a weaker leg from a single-leg test gets an extra set; a cutting lean alone does not", () => {
    const withLeg = buildGoalPlan(base({ quality: "braking", weakerLeg: { side: "left", asymPct: 15, test: "Single-Leg Jump", date: null } }));
    expect(allText(withLeg).some((b) => /extra set on the left leg/.test(b.en))).toBe(true);
    const leanOnly = buildGoalPlan(base({ quality: "braking", braking: { overloadFlag: "green", codAsymHighPct: 25, codLean: "right" } }));
    expect(allText(leanOnly).some((b) => /extra set on the/.test(b.en))).toBe(false);
    expect(leanOnly.facts.some((f) => /not which leg is weaker/.test(f.en))).toBe(true);
  });
  it("braking says out loud that the data cannot measure braking quality", () => {
    const p = buildGoalPlan(base({ quality: "braking" }));
    expect(p.facts.some((f) => /nothing in the data measures how well/.test(f.en))).toBe(true);
  });
  it("every ok plan has a counterfactual", () => {
    for (const p of allPlans().filter(ok)) expect(p.counterfactual).not.toBeNull();
  });
});

describe("no-data cases", () => {
  it("each quality still gives a plan with no data, low confidence and the missing data named", () => {
    for (const q of GOAL_QUALITIES) {
      const p = buildGoalPlan(base({ quality: q }));
      expect(p.status).toBe("ok");
      expect(p.confidence.level).toBe("low");
      expect(p.confidence.missing.length).toBeGreaterThan(0);
    }
  });
});

describe("shape and limits", () => {
  const plans = allPlans().filter(ok);
  it("exactly 8 numbered weeks", () => {
    for (const p of plans) expect(p.weeks.map((w) => w.week)).toEqual(Array.from({ length: PLAN_WEEKS }, (_, i) => i + 1));
  });
  it("sessions a week: ≤2 in season, ≤3 out of season", () => {
    for (const p of plans) for (const w of p.weeks) expect(w.sessions.length).toBeLessThanOrEqual(p.sessionsPerWeek);
    expect(plans.some((p) => p.sessionsPerWeek === 2)).toBe(true);
  });
  it(`no session over ${MAX_SESSION_MINUTES} minutes`, () => {
    for (const p of plans) for (const w of p.weeks) for (const s of w.sessions) expect(s.minutes).toBeLessThanOrEqual(MAX_SESSION_MINUTES);
  });
  it(`never more than ${MAX_FLYING_M_PER_SESSION} m flat out in one session`, () => {
    for (const p of plans) for (const w of p.weeks) for (const s of w.sessions) {
      expect(s.blocks.reduce((t, b) => t + (b.flatOutM ?? 0), 0)).toBeLessThanOrEqual(MAX_FLYING_M_PER_SESSION);
    }
  });
  it("top-speed days at least 2 days apart: in season one a week; C (off season) is a separate day 2+ days from the others", () => {
    for (const p of plans) for (const w of p.weeks) {
      const tsSessions = w.sessions.filter((s) => s.blocks.some((b) => b.topSpeed));
      if (p.sessionsPerWeek === 2) expect(tsSessions.length).toBeLessThanOrEqual(1);
      for (const s of tsSessions) expect(s.slot === "A" || /at least 2 days/.test(s.when.en)).toBe(true);
    }
  });
  it("every flat-out sprint, hard stop and drop jump is supervised", () => {
    for (const p of plans) for (const w of p.weeks) for (const s of w.sessions) for (const b of s.blocks) {
      if ((b.flatOutM ?? 0) > 0 || (b.hardStops ?? 0) > 0 || b.dropJumps) expect(b.supervised).toBe(true);
    }
  });
});

describe("age gate", () => {
  const youth = allPlans().filter((p) => ok(p) && p.youthLevel);
  it("unknown age is treated as under 18", () => {
    expect(buildGoalPlan(base({ ageYears: null })).youthLevel).toBe(true);
    expect(buildGoalPlan(base({ ageYears: 18 })).youthLevel).toBe(false);
  });
  it("youth: every block supervised, no sled, ≤120 contacts a session, drop jumps only in week 7 of the jump plan", () => {
    expect(youth.length).toBeGreaterThan(0);
    for (const p of youth) for (const w of p.weeks) for (const s of w.sessions) {
      for (const b of s.blocks) {
        expect(b.supervised).toBe(true);
        expect(b.method).not.toBe("resisted_sled");
        if (b.dropJumps) expect(p.quality === "jump" && w.week === 7).toBe(true);
      }
      expect(s.blocks.reduce((t, b) => t + (b.contacts ?? 0), 0)).toBeLessThanOrEqual(120);
    }
  });
  it("youth facts say why the easier level is used", () => {
    expect(buildGoalPlan(base({ ageYears: null, quality: "jump" })).facts.some((f) => /date of birth/.test(f.en))).toBe(true);
    expect(buildGoalPlan(base({ ageYears: 16, quality: "jump" })).facts.some((f) => /Under 18/.test(f.en))).toBe(true);
  });
});

describe("wording", () => {
  const plans = allPlans();
  it("never claims to prevent, predict or cause injury", () => {
    const bad = /\b(prevents?|preventing|predicts?|predicting|causes injur|reduces? (the )?(injury|risk))\b|kemur í veg fyrir|spáir fyrir|veldur meiðsl/i;
    for (const p of plans) for (const b of allText(p)) expect(textOf(b)).not.toMatch(bad);
    for (const m of [...ACCEL_METHODS, ...JUMP_METHODS, ...BRAKING_METHODS]) {
      for (const b of [m.summary, m.dose, ...m.findings.map((f) => f.text), ...(m.caution ? [m.caution] : [])]) expect(textOf(b)).not.toMatch(bad);
    }
  });
  it("no sport-science jargon in the main view (verdict, facts, what would change it, missing data)", () => {
    const jargon = /\b(ACWR|IMTP|DSI|RSI|RSI-mod|CMJ|composite|neural|PAP|HIR|IMA|FMP|eccentric|plyometric|potentiation)\b/i;
    for (const p of plans) for (const b of mainView(p)) expect(textOf(b)).not.toMatch(jargon);
  });
  it("no gendered pronouns in the English copy", () => {
    const g = /\b(he|his|him|she|her|hers)\b/i;
    for (const p of plans) for (const b of allText(p)) expect(b.en).not.toMatch(g);
  });
  it("test-change thresholds are labelled as MicroPulse rules or tied to a study", () => {
    for (const p of plans.filter(ok)) expect(p.tests.change.en).toMatch(/MicroPulse rule|in the trial|trials used/);
  });
});

describe("honest limits", () => {
  it("every ok plan lists what the research does not show; blocked plans list none", () => {
    for (const p of allPlans()) {
      if (ok(p)) expect(p.limits.length).toBeGreaterThan(0);
      else expect(p.limits).toEqual([]);
    }
  });
  it("no copy says a sled beats normal sprinting", () => {
    const bad = /sled[^.]*\b(beat|better than|more effective than)\b[^.]*normal/i;
    const texts: string[] = [];
    for (const p of allPlans()) for (const b of allText(p)) texts.push(b.en);
    for (const m of ACCEL_METHODS) texts.push(m.summary.en, ...m.findings.map((f) => f.text.en));
    // A sentence may say a sled is NOT better ("no more effective than"); only an unnegated claim fails.
    for (const t of texts) for (const sentence of t.split(/(?<=\.)\s+/)) {
      if (bad.test(sentence)) expect(sentence).toMatch(/\b(no|not|n't|about as much)\b/i);
    }
  });
  it("braking says a review found no clear gain in braking itself", () => {
    expect(buildGoalPlan(base({ quality: "braking" })).facts.some((f) => /12 adult trials found no clear gain/.test(f.en))).toBe(true);
  });
});

describe("sources", () => {
  it("every method finding cites a ref that exists in its library", () => {
    for (const [methods, refs] of [[ACCEL_METHODS, ACCEL_REFS], [JUMP_METHODS, JUMP_REFS], [BRAKING_METHODS, BRAKING_REFS]] as const) {
      for (const m of methods) {
        if (m.basis !== "rule") expect(m.findings.length).toBeGreaterThan(0);
        for (const f of m.findings) expect(Object.keys(refs)).toContain(f.ref);
      }
    }
  });
  it("every block in a plan uses a method from its library (top speed uses the speed library keys)", () => {
    const known: Record<GoalQuality, string[]> = {
      top_speed: ["flying_sprints", "accel_sprints", "heavy_strength", "nordic", "plyometrics", "jump_squat"],
      acceleration: ACCEL_METHODS.map((m) => m.key),
      jump: JUMP_METHODS.map((m) => m.key),
      braking: BRAKING_METHODS.map((m) => m.key),
    };
    for (const p of allPlans().filter(ok)) for (const w of p.weeks) for (const s of w.sessions) for (const b of s.blocks) expect(known[p.quality]).toContain(b.method);
  });
  it("every ok plan lists its sources, each marked full text or abstract", () => {
    for (const p of allPlans().filter(ok)) {
      expect(p.refs.length).toBeGreaterThan(0);
      for (const r of p.refs) expect(["full_text", "abstract"]).toContain(r.verifiedFrom);
    }
  });
});

describe("never touches the colour or Today's session", () => {
  const codeOf = async (path: string) => {
    const { readFileSync } = await import("node:fs");
    // Code only: the doc comments name the table on purpose ("never writes …").
    return readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  };
  it("the engine has no DB writes or Today-override reference; only store.ts writes, and only the goal tables", async () => {
    const { readdirSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const dir = resolve(process.cwd(), "src/lib/micropulse/goalPlan");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      const src = await codeOf(resolve(dir, f));
      expect(src).not.toMatch(/player_today_strength_override|readiness_entries/);
      if (f === "store.ts") {
        const tables = [...src.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
        expect(tables.length).toBeGreaterThan(0);
        for (const t of tables) expect(["player_goal_plans", "player_goal_plan_events", "player_goal_plan_sessions", "player_goal_plan_results"]).toContain(t);
      } else {
        expect(src).not.toMatch(/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
      }
    }
  });
  it("the goal routes never name Today's session or the readiness entries", async () => {
    const { resolve } = await import("node:path");
    for (const r of [
      "src/app/api/player/goal-plan/route.ts",
      "src/app/api/player/goal-plan/_shared.ts",
      "src/app/api/player/goal-plan/today/route.ts",
      "src/app/api/player/goal-plan/history/route.ts",
      "src/app/api/coach/goal-plans/requests/route.ts",
      "src/app/api/coach/goal-plans/requests/[id]/route.ts",
      "src/app/api/coach/goal-plans/requests/[id]/decision/route.ts",
      "src/app/api/coach/goal-plans/requests/[id]/results/route.ts",
      "src/app/api/coach/goal-plans/[id]/preview/route.ts",
    ]) {
      expect(await codeOf(resolve(process.cwd(), r))).not.toMatch(/player_today_strength_override|readiness_entries|\.insert\(|\.update\(|\.delete\(/);
    }
  });
});

describe("coach's choice of start (lota 2)", () => {
  it("lists only safe starts: youth keeps the youth level, heavy braking keeps technique only, no flying sprints after a long gap", () => {
    expect(allowedStarts(base({ quality: "acceleration", ageYears: 16 })).map((s) => s.key)).toEqual(["youth"]);
    expect(allowedStarts(base({ quality: "jump", ageYears: null })).map((s) => s.key)).toEqual(["youth"]);
    expect(allowedStarts(base({ quality: "braking", braking: { overloadFlag: "red", codAsymHighPct: null, codLean: null } })).map((s) => s.key)).toEqual(["technique_only"]);
    expect(allowedStarts(base({ quality: "top_speed", topSpeed: ts(30) })).map((s) => s.key)).toEqual(["build_first"]);
    expect(allowedStarts(base({ quality: "top_speed", topSpeed: null })).map((s) => s.key)).toEqual(["build_first"]);
    const mid = allowedStarts(base({ quality: "top_speed", topSpeed: ts(15) }));
    expect(mid.map((s) => s.key)).toEqual(["build_first", "ready"]);
    expect(mid[0].rule).toBe(true);
  });
  it("an unsafe choice falls back to the rule's start", () => {
    const youth = buildGoalPlan(base({ quality: "acceleration", ageYears: 16, startOverride: "strength_first" }));
    expect(youth.start).toBe("youth");
    expect(youth.startOverride).toBeNull();
    expect(youth.weeks.some((w) => w.sessions.some((s) => s.blocks.some((b) => b.method === "resisted_sled")))).toBe(false);
    const brake = buildGoalPlan(base({ quality: "braking", braking: { overloadFlag: "yellow", codAsymHighPct: null, codLean: null }, startOverride: "standard" }));
    expect(brake.start).toBe("technique_only");
    const fly = buildGoalPlan(base({ quality: "top_speed", topSpeed: ts(40), startOverride: "ready" }));
    expect(fly.start).toBe("build_first");
    expect(buildGoalPlan(base({ quality: "jump", startOverride: "nonsense" })).startOverride).toBeNull();
  });
  it("an allowed choice is used, said plainly, and drops the data-based 'what would change it'", () => {
    const p = buildGoalPlan(base({ quality: "top_speed", topSpeed: ts(15), startOverride: "ready" }));
    expect(p.start).toBe("ready");
    expect(p.startOverride).toEqual({ rule: "build_first", chosen: "ready" });
    expect(p.facts[0].en).toMatch(/The coach chose this start/);
    expect(p.branch?.why.en).toMatch(/The coach chose this start/);
    expect(p.counterfactual).toBeNull();
    const same = buildGoalPlan(base({ quality: "top_speed", topSpeed: ts(15), startOverride: "build_first" }));
    expect(same.startOverride).toBeNull();
  });
  it("every allowed start, for every player shape, keeps the safety limits", () => {
    const shapes: Partial<GoalPlanInput>[] = [
      {}, { topSpeed: ts(4), strength: strong }, { topSpeed: ts(15), strength: weak },
      { braking: { overloadFlag: "red", codAsymHighPct: 22, codLean: "left" } },
      { cmj: { heightCm: 38, rsiMod: 0.4, date: "2026-10-01", heightBand: "average", rsiBand: "below" }, strength: strong },
    ];
    for (const q of GOAL_QUALITIES) for (const sh of shapes) for (const age of [24, 16, null]) {
      const input = base({ ...sh, quality: q, ageYears: age });
      for (const st of allowedStarts(input)) {
        const p = buildGoalPlan({ ...input, startOverride: st.key });
        if (!ok(p)) continue;
        expect(p.start).toBe(st.key);
        for (const w of p.weeks) for (const s of w.sessions) {
          expect(s.minutes).toBeLessThanOrEqual(MAX_SESSION_MINUTES);
          expect(s.blocks.reduce((m, b) => m + (b.flatOutM ?? 0), 0)).toBeLessThanOrEqual(MAX_FLYING_M_PER_SESSION);
          for (const b of s.blocks) {
            if (p.youthLevel) expect(b.supervised).toBe(true);
            if (p.youthLevel) expect(b.method).not.toBe("resisted_sled");
            if (b.dropJumps || b.hardStops || (b.flatOutM ?? 0) > 0) expect(b.supervised).toBe(true);
          }
        }
      }
    }
  });
});

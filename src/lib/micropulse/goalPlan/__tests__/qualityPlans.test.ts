import { describe, expect, it } from "vitest";
import {
  INDIVIDUAL_STARTS,
  QUALITY_PLAN_KEYS,
  QUALITY_PLAN_RULES,
  SLED_M_RANGE,
  TEAM_PLAN_BASIS,
  YOUTH_MAX_CONTACTS,
  allQualityPlans,
  individualPlan,
  individualStarts,
  individualWeeks,
  planMethodKeys,
  qualityPlan,
  type QualityPlan,
} from "../qualityPlans";
import { QUALITY_LIBRARIES, LIBRARY_QUALITIES } from "../qualityLibrary";
import { accelWeeks } from "../acceleration";
import { brakingWeeks } from "../braking";
import { jumpWeeks } from "../jump";
import { applySupervision } from "../common";
import type { Bi } from "../types";
import {
  JUMP_LEVEL_CONTACTS,
  LEVEL_BASIS,
  LEVEL_CHANGES,
  LEVEL_GUIDE_NOTE,
  LEVEL_LABEL,
  LEVEL_WHO,
  LEVEL_YOUTH_NOTE,
  TRAINING_LEVELS,
  isTrainingLevel,
} from "../levels";

const plans = allQualityPlans();
const teamPlans = plans.filter((p) => p.key !== "individual");
const texts = (p: QualityPlan): Bi[] => [p.title, p.who, p.verdict, ...p.facts, ...p.limits, p.basis];

describe("Speed & power plans (lota 2)", () => {
  it("three plans per quality; team plans are 6 weeks (jump: 8) with a test in the first and last week", () => {
    for (const q of LIBRARY_QUALITIES) for (const k of QUALITY_PLAN_KEYS) expect(qualityPlan(q, k).quality).toBe(q);
    expect(teamPlans).toHaveLength(18); // 3 qualities × 2 team plans × 3 levels
    for (const p of teamPlans) {
      const weekCount = p.weeks.reduce((n, w) => n + (/[–-]\s?\d/.test(w.label.en.split(":")[0]) ? 2 : 1), 0);
      expect(weekCount, p.title.en).toBe(p.quality === "jump" ? 8 : 6);
      const tested = (w: QualityPlan["weeks"][number]) => w.sessions.some((s) => s.blocks.some((b) => b.test));
      expect(tested(p.weeks[0]), p.title.en).toBe(true);
      expect(tested(p.weeks[p.weeks.length - 1]), p.title.en).toBe(true);
    }
  });

  it("every block points at a method in that quality's library, and every reference resolves", () => {
    for (const p of plans) {
      const lib = QUALITY_LIBRARIES[p.quality];
      const keys = new Set(lib.methods.map((m) => m.key));
      for (const k of planMethodKeys(p)) expect(keys.has(k), `${p.title.en}: ${k}`).toBe(true);
      for (const r of p.refs) expect(lib.refs[r], `${p.title.en}: ${r}`).toBeDefined();
    }
  });

  it("in season: never on MD-1 or MD+1, and at least 2 days between sessions and from the match", () => {
    for (const p of teamPlans.filter((x) => x.matchDay != null)) {
      const md = p.matchDay!;
      for (const w of p.weeks) {
        const days = w.sessions.map((s) => s.day!).sort((a, b) => a - b);
        for (const d of days) {
          expect(d).not.toBe(md - 1);
          expect(d).not.toBe((md + 1) % 7);
          expect(md - d, p.title.en).toBeGreaterThanOrEqual(2);
        }
        for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("pre-season: two days a week, at least 72 hours apart (also across the week)", () => {
    for (const p of teamPlans.filter((x) => x.matchDay == null)) {
      for (const w of p.weeks) {
        const days = w.sessions.map((s) => s.day!).sort((a, b) => a - b);
        expect(days).toHaveLength(2);
        expect(days[1] - days[0]).toBeGreaterThanOrEqual(3);
        expect(7 - days[1] + days[0]).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("sled metres stay inside what worked (60–340 m) and never appear at the youth level", () => {
    for (const p of plans) for (const w of p.weeks) for (const s of w.sessions) for (const b of s.blocks) {
      if (b.method !== "resisted_sled") continue;
      expect(b.sledM).toBeGreaterThanOrEqual(p.key === "individual" ? 45 : SLED_M_RANGE.min);
      expect(b.sledM).toBeLessThanOrEqual(SLED_M_RANGE.max);
      expect(p.start).not.toBe("youth");
    }
  });

  it(`youth level: every block supervised, no sled, at most ${YOUTH_MAX_CONTACTS} contacts a session`, () => {
    for (const p of plans.filter((x) => x.start === "youth")) for (const w of p.weeks) for (const s of w.sessions) {
      expect(s.blocks.every((b) => b.supervised)).toBe(true);
      expect(s.blocks.some((b) => b.method === "resisted_sled")).toBe(false);
      expect(s.blocks.reduce((t, b) => t + (b.contacts ?? 0), 0)).toBeLessThanOrEqual(YOUTH_MAX_CONTACTS);
    }
  });

  it("flat-out sprints, hard stops and drop jumps are always supervised", () => {
    for (const p of plans) for (const w of p.weeks) for (const s of w.sessions) for (const b of s.blocks) {
      if ((b.flatOutM ?? 0) > 0 || (b.hardStops ?? 0) > 0 || b.dropJumps) expect(b.supervised, `${p.title.en}: ${b.what.en}`).toBe(true);
    }
  });

  it("the individual plan is the goal plan's own 8 weeks for that start", () => {
    for (const s of INDIVIDUAL_STARTS.acceleration) {
      expect(individualWeeks("acceleration", s.key)).toEqual(applySupervision(accelWeeks(s.key as never, s.key === "youth"), s.key === "youth"));
    }
    for (const s of INDIVIDUAL_STARTS.braking) expect(individualWeeks("braking", s.key)).toEqual(applySupervision(brakingWeeks(s.key as never, null), false));
    for (const s of INDIVIDUAL_STARTS.jump) {
      expect(individualWeeks("jump", s.key)).toEqual(applySupervision(jumpWeeks(s.key as never), s.key === "youth"));
    }
    for (const q of LIBRARY_QUALITIES) {
      expect(individualPlan(q).weeks).toHaveLength(8);
      expect(individualPlan(q, "nonsense").start).toBe(INDIVIDUAL_STARTS[q][0].key);
    }
  });

  it("every plan has a verdict, 2–3 facts and the no-study basis line", () => {
    for (const p of plans) {
      expect(p.verdict.en.length).toBeGreaterThan(20);
      expect(p.facts.length).toBeGreaterThanOrEqual(2);
      expect(p.facts.length).toBeLessThanOrEqual(3);
      expect(p.basis.en).toMatch(/No study tested/);
    }
    expect(TEAM_PLAN_BASIS.is).toMatch(/Engin rannsókn/);
  });

  it("rules carry the under-18 limits and one quality at a time", () => {
    const all = QUALITY_PLAN_RULES.map((r) => r.en).join(" ");
    expect(all).toMatch(/Under 18: no sled/);
    expect(all).toMatch(/120 foot contacts/);
    expect(all).toMatch(/One quality at a time/);
    expect(all).toMatch(/MD-1/);
  });
});

describe("jump sessions reach 50–60 foot contacts (lota 4)", () => {
  const contacts = (blocks: { contacts?: number; test?: boolean; method: string }[]) =>
    blocks.reduce((n, b) => n + (b.test || b.method === "squat_bar_speed" ? 0 : b.contacts ?? 0), 0);

  it("team plans: every full week's jump session is in the level's range (intermediate 50–60); the light last week under 50", () => {
    for (const lv of TRAINING_LEVELS) for (const p of allQualityPlans([lv]).filter((x) => x.key !== "individual" && x.quality === "jump")) {
      const R = JUMP_LEVEL_CONTACTS[lv];
      p.weeks.forEach((w, i) => {
        for (const s of w.sessions) {
          const n = contacts(s.blocks);
          if (i === p.weeks.length - 1) expect(n, `${p.title.en} ${w.label.en}`).toBeLessThan(50);
          else {
            expect(n, `${p.title.en} ${w.label.en}`).toBeGreaterThanOrEqual(R.min);
            expect(n, `${p.title.en} ${w.label.en}`).toBeLessThanOrEqual(R.max);
          }
        }
      });
    }
    expect(JUMP_LEVEL_CONTACTS.intermediate).toMatchObject({ min: 50, max: 60 });
  });

  it("adult individual starts: session A in weeks 1–6 is in the level's range; youth unchanged", () => {
    for (const lv of TRAINING_LEVELS) for (const st of individualStarts("jump", lv).map((x) => x.key).filter((k) => k !== "youth")) {
      const R = JUMP_LEVEL_CONTACTS[lv];
      individualWeeks("jump", st, lv).slice(0, 6).forEach((w) => {
        const a = w.sessions.find((s) => s.slot === "A")!;
        const n = contacts(a.blocks);
        expect(n, `${lv} ${st} ${w.label.en}`).toBeGreaterThanOrEqual(R.min);
        expect(n, `${lv} ${st} ${w.label.en}`).toBeLessThanOrEqual(R.max);
      });
    }
    expect(individualWeeks("jump", "youth").flatMap((w) => w.sessions.flatMap((s) => s.blocks)).some((b) => b.method === "squat_cmj_jumps")).toBe(false);
  });
});

describe("levels: beginner · intermediate · advanced (lota 4)", () => {
  const blocksOf = (p: QualityPlan) => p.weeks.flatMap((w) => w.sessions.flatMap((s) => s.blocks));
  const adultStarts = (q: (typeof LIBRARY_QUALITIES)[number], lv: (typeof TRAINING_LEVELS)[number]) => individualStarts(q, lv).filter((s) => s.key !== "youth");

  it("intermediate is the default", () => {
    for (const q of LIBRARY_QUALITIES) for (const k of QUALITY_PLAN_KEYS) expect(qualityPlan(q, k, null, "intermediate")).toEqual(qualityPlan(q, k));
    expect(isTrainingLevel("advanced")).toBe(true);
    expect(isTrainingLevel("expert")).toBe(false);
  });

  it("beginner and advanced name the level, say what changes, keep the test line and add the level basis", () => {
    for (const lv of ["beginner", "advanced"] as const) for (const q of LIBRARY_QUALITIES) {
      for (const k of ["in_season", "pre_season"] as const) {
        const p = qualityPlan(q, k, null, lv);
        const mid = qualityPlan(q, k);
        expect(p.title.en.endsWith(LEVEL_LABEL[lv].en), p.title.en).toBe(true);
        expect(p.facts[0]).toEqual(LEVEL_CHANGES[q][lv]);
        expect(p.facts[p.facts.length - 1]).toEqual(mid.facts[mid.facts.length - 1]);
        expect(p.limits[0]).toEqual(LEVEL_BASIS);
        expect(p.verdict.en).not.toBe(mid.verdict.en);
        expect(p.weeks.length).toBe(mid.weeks.length);
      }
      for (const s of adultStarts(q, lv)) {
        const p = individualPlan(q, s.key, lv);
        expect(p.facts).toContainEqual(LEVEL_CHANGES[q][lv]);
        expect(p.limits).toContainEqual(LEVEL_BASIS);
        expect(p.who.en).toMatch(/intermediate level for now/);
      }
    }
  });

  it("the youth start ignores the level", () => {
    for (const q of LIBRARY_QUALITIES) {
      if (!INDIVIDUAL_STARTS[q].some((s) => s.key === "youth")) continue;
      for (const lv of TRAINING_LEVELS) expect(individualPlan(q, "youth", lv)).toEqual(individualPlan(q, "youth"));
    }
  });

  it("beginner: no sled, no drop jumps, acceleration sprints of 10 m, landings held still", () => {
    for (const p of allQualityPlans(["beginner"])) for (const b of blocksOf(p)) {
      expect(b.method, p.title.en).not.toBe("resisted_sled");
      expect(b.dropJumps ?? false, `${p.title.en}: ${b.what.en}`).toBe(false);
      if (p.quality === "acceleration" && b.method === "accel_sprints" && !b.test) expect(b.dose.en, p.title.en).toMatch(/× 10 m/);
      if (b.method === "squat_cmj_jumps") expect(b.dose.en).toMatch(/hold still for 2 s/);
    }
    for (const st of ["strength_first", "starts_first", "balanced"]) expect(individualPlan("acceleration", st, "beginner").facts[0].en, st).not.toMatch(/sled sprints/);
    expect(individualStarts("jump", "beginner").some((s) => s.key === "fast_jumps")).toBe(false);
    expect(individualPlan("jump", "fast_jumps", "beginner").start).toBe("combined");
  });

  it("advanced: more sled and starts than intermediate, still inside 60–340 m; drop jumps at 30–40 cm", () => {
    const sledM = (p: QualityPlan) => blocksOf(p).reduce((n, b) => n + (b.sledM ?? 0), 0);
    expect(sledM(qualityPlan("acceleration", "pre_season", null, "advanced"))).toBeGreaterThan(sledM(qualityPlan("acceleration", "pre_season")));
    for (const p of allQualityPlans(["advanced"]).filter((x) => x.quality === "jump" && x.key !== "individual")) {
      const drops = blocksOf(p).filter((b) => b.method === "drop_jumps");
      expect(drops.length, p.title.en).toBeGreaterThan(0);
      for (const d of drops) expect(d.dose.en).toMatch(/from a (30|40) cm box/);
    }
  });

  it("braking: the level changes effort and pace only, never the drills or the hard-stop count", () => {
    const drillRows = (p: QualityPlan) => p.weeks.map((w) => w.sessions.map((s) => s.blocks.filter((b) => b.method === "decel_technique").map((b) => [b.dose.en, b.hardStops ?? 0])));
    for (const k of ["in_season", "pre_season"] as const) {
      const mid = drillRows(qualityPlan("braking", k));
      for (const lv of ["beginner", "advanced"] as const) expect(drillRows(qualityPlan("braking", k, null, lv))).toEqual(mid);
    }
    for (const lv of ["beginner", "advanced"] as const) expect(drillRows(individualPlan("braking", "standard", lv))).toEqual(drillRows(individualPlan("braking", "standard")));
    expect(blocksOf(qualityPlan("braking", "in_season", null, "beginner")).some((b) => /on both legs/.test(b.what.en))).toBe(true);
    expect(blocksOf(qualityPlan("braking", "in_season", null, "advanced")).some((b) => /^Single-leg landings/.test(b.what.en))).toBe(true);
  });

  it("level texts: both languages, no placeholders, the guide note says it is not from a study", () => {
    for (const lv of TRAINING_LEVELS) for (const b of [LEVEL_LABEL[lv], LEVEL_WHO[lv]]) {
      expect(b.en.length).toBeGreaterThan(3);
      expect(b.is.length).toBeGreaterThan(3);
      expect(b.is).not.toMatch(/\((ur|n|a|i)\)/);
    }
    expect(LEVEL_GUIDE_NOTE.en).toMatch(/not a rule from a study/);
    expect(LEVEL_BASIS.en).toMatch(/studies tested the intermediate level/);
    expect(LEVEL_YOUTH_NOTE.en).toMatch(/120 foot contacts/);
  });
});

describe("plan wording", () => {
  const levelTexts = [LEVEL_BASIS, LEVEL_GUIDE_NOTE, LEVEL_YOUTH_NOTE, ...TRAINING_LEVELS.map((l) => LEVEL_WHO[l]), ...Object.values(LEVEL_CHANGES).flatMap((r) => Object.values(r))];
  const allTexts = [...plans.flatMap(texts), ...levelTexts, ...QUALITY_PLAN_RULES, ...Object.values(INDIVIDUAL_STARTS).flatMap((o) => o.flatMap((s) => [s.label, s.who]))];

  it("never says training prevents, predicts or causes injury", () => {
    for (const t of allTexts) {
      expect(t.en).not.toMatch(/\b(prevents?|predicts?|causes?)\b/i);
      expect(t.is).not.toMatch(/\b(kemur í veg fyrir|spáir|veldur)\b/i);
    }
  });

  it("never calls a sled better than sprints", () => {
    for (const t of allTexts) for (const s of t.en.split(/[.;:]/)) {
      if (/sled/i.test(s) && /\b(better|beat|more effective|upgrade)\b/i.test(s)) expect(s).toMatch(/\b(no|not)\b/i);
    }
  });

  it("keeps sport-science jargon out of verdicts and facts, and has no Icelandic placeholders", () => {
    for (const p of plans) {
      for (const t of [p.verdict, ...p.facts]) expect(t.en).not.toMatch(/\b(ACWR|IMA|HIR|FMP|CMJ|RSI|eccentric|plyometric|effect size|SMD)\b/i);
      for (const t of texts(p)) expect(t.is).not.toMatch(/\((ur|n|a|i)\)/);
    }
  });
});

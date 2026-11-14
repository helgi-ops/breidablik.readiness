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

const plans = allQualityPlans();
const teamPlans = plans.filter((p) => p.key !== "individual");
const texts = (p: QualityPlan): Bi[] => [p.title, p.who, p.verdict, ...p.facts, ...p.limits, p.basis];

describe("Speed & power plans (lota 2)", () => {
  it("three plans per quality; team plans are 6 weeks (jump: 8) with a test in the first and last week", () => {
    for (const q of LIBRARY_QUALITIES) for (const k of QUALITY_PLAN_KEYS) expect(qualityPlan(q, k).quality).toBe(q);
    expect(teamPlans).toHaveLength(6);
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

  it("team plans: every full week's jump session has 50–60 contacts; the light last week fewer", () => {
    for (const p of teamPlans.filter((x) => x.quality === "jump")) {
      p.weeks.forEach((w, i) => {
        for (const s of w.sessions) {
          const n = contacts(s.blocks);
          if (i === p.weeks.length - 1) expect(n, `${p.title.en} ${w.label.en}`).toBeLessThan(50);
          else {
            expect(n, `${p.title.en} ${w.label.en}`).toBeGreaterThanOrEqual(50);
            expect(n, `${p.title.en} ${w.label.en}`).toBeLessThanOrEqual(60);
          }
        }
      });
    }
  });

  it("adult individual starts: session A in weeks 1–6 has 50–60 contacts; youth unchanged", () => {
    for (const st of ["combined", "strength_first", "fast_jumps"]) {
      individualWeeks("jump", st).slice(0, 6).forEach((w) => {
        const a = w.sessions.find((s) => s.slot === "A")!;
        const n = contacts(a.blocks);
        expect(n, `${st} ${w.label.en}`).toBeGreaterThanOrEqual(50);
        expect(n, `${st} ${w.label.en}`).toBeLessThanOrEqual(60);
      });
    }
    expect(individualWeeks("jump", "youth").flatMap((w) => w.sessions.flatMap((s) => s.blocks)).some((b) => b.method === "squat_cmj_jumps")).toBe(false);
  });
});

describe("plan wording", () => {
  const allTexts = [...plans.flatMap(texts), ...QUALITY_PLAN_RULES, ...Object.values(INDIVIDUAL_STARTS).flatMap((o) => o.flatMap((s) => [s.label, s.who]))];

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

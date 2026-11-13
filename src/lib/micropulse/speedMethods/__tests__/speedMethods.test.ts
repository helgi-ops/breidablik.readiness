import { describe, expect, it } from "vitest";
import {
  MAX_FLYING_M_PER_SESSION,
  MIN_DAYS_BETWEEN_TOP_SPEED,
  SPEED_CAVEATS,
  SPEED_EVIDENCE_LABEL,
  SPEED_FACTS,
  SPEED_METHOD_BY_KEY,
  SPEED_METHODS,
  SPEED_PLAN_BASIS,
  SPEED_PLANS,
  SPEED_REFS,
  SPEED_SAFETY,
  SPEED_VERDICT,
  flatOutMetres,
  planMethodKeys,
  topSpeedGaps,
  type Bi,
} from "../index";

const filled = (b: Bi) => b.en.trim().length > 0 && b.is.trim().length > 0;

/** Every Bi string in the module, for wording checks. */
function allText(): string[] {
  const out: string[] = [];
  const push = (b: Bi | undefined) => {
    if (b) out.push(b.en, b.is);
  };
  push(SPEED_VERDICT);
  push(SPEED_PLAN_BASIS);
  [...SPEED_FACTS, ...SPEED_CAVEATS, ...SPEED_SAFETY].forEach(push);
  for (const m of SPEED_METHODS) {
    [m.label, m.summary, m.dose, m.caution].forEach(push);
    m.findings.forEach((f) => push(f.text));
    m.howTo.forEach(push);
  }
  for (const p of SPEED_PLANS) {
    [p.title, p.who, p.verdict].forEach(push);
    p.facts.forEach(push);
    for (const w of p.weeks) {
      push(w.label);
      for (const s of w.sessions) {
        [s.dayLabel, s.focus].forEach(push);
        s.blocks.forEach((b) => [b.what, b.dose].forEach(push));
      }
    }
  }
  return out;
}

describe("speed methods library", () => {
  it("every method has both languages, a dose and at least one sourced finding", () => {
    for (const m of SPEED_METHODS) {
      expect(filled(m.label), m.key).toBe(true);
      expect(filled(m.summary), m.key).toBe(true);
      expect(filled(m.dose), m.key).toBe(true);
      expect(m.findings.length, m.key).toBeGreaterThan(0);
      for (const f of m.findings) {
        expect(filled(f.text), m.key).toBe(true);
        expect(SPEED_REFS[f.ref], `${m.key} → ${f.ref}`).toBeDefined();
      }
      m.howTo.forEach((h) => expect(filled(h), m.key).toBe(true));
    }
  });

  it("method keys are unique and every evidence level has a label", () => {
    expect(new Set(SPEED_METHODS.map((m) => m.key)).size).toBe(SPEED_METHODS.length);
    for (const m of SPEED_METHODS) expect(filled(SPEED_EVIDENCE_LABEL[m.evidence])).toBe(true);
  });

  it("the top read is a verdict plus 2–3 facts", () => {
    expect(filled(SPEED_VERDICT)).toBe(true);
    expect(SPEED_FACTS.length).toBeGreaterThanOrEqual(2);
    expect(SPEED_FACTS.length).toBeLessThanOrEqual(3);
  });

  it("every reference is used by a method or a plan", () => {
    const used = new Set<string>();
    SPEED_METHODS.forEach((m) => m.findings.forEach((f) => used.add(f.ref)));
    SPEED_PLANS.forEach((p) => p.refs.forEach((r) => used.add(r)));
    // Malone 2017 and Buchheit 2023 back the shared safety rule text.
    used.add("malone2017");
    used.add("buchheit2023");
    for (const k of Object.keys(SPEED_REFS)) expect(used.has(k), k).toBe(true);
  });
});

describe("speed plans", () => {
  it("every block points at a method that exists", () => {
    for (const p of SPEED_PLANS)
      for (const w of p.weeks)
        for (const s of w.sessions)
          for (const b of s.blocks) expect(SPEED_METHOD_BY_KEY[b.method], `${p.key}: ${b.method}`).toBeDefined();
  });

  it("only methods with top-speed evidence carry a top-speed run", () => {
    for (const p of SPEED_PLANS)
      for (const w of p.weeks)
        for (const s of w.sessions)
          for (const b of s.blocks)
            if (b.topSpeed) expect(["best", "some"], `${p.key}: ${b.method}`).toContain(SPEED_METHOD_BY_KEY[b.method].evidence);
  });

  it("no session runs more than 150 m flat out", () => {
    for (const p of SPEED_PLANS)
      for (const w of p.weeks)
        for (const s of w.sessions) expect(flatOutMetres(s), `${p.key} ${w.label.en} ${s.dayLabel.en}`).toBeLessThanOrEqual(MAX_FLYING_M_PER_SESSION);
  });

  it("top-speed sessions are at least 48 h apart (a match counts as one)", () => {
    for (const p of SPEED_PLANS) {
      const gaps = topSpeedGaps(p);
      expect(gaps.length, p.key).toBeGreaterThan(0);
      for (const g of gaps) expect(g, p.key).toBeGreaterThanOrEqual(MIN_DAYS_BETWEEN_TOP_SPEED);
    }
  });

  it("each in-season version counts the match, wraps to next week and leaves subgroups out", () => {
    const p = SPEED_PLANS.find((x) => x.key === "in_season")!;
    expect(p.alternatives).toBe(true);
    // Standard: MD-3 Wed (2) → match Sat (5) → next Wed (9). Tactical: MD-2 Thu (3) → Sat (5) → next Thu (10).
    expect(topSpeedGaps(p)).toEqual([3, 4, 2, 5]);
    const subgroups = p.weeks.flatMap((w) => w.sessions.filter((s) => s.subgroup));
    expect(subgroups.length).toBeGreaterThan(0);
    for (const s of subgroups) expect(filled(s.subgroup!)).toBe(true);
  });

  it("a player on the standard week who also does the MD-2 top-up would be 1 day apart, so the top-up is subgroup-only", () => {
    const p = SPEED_PLANS.find((x) => x.key === "in_season")!;
    const md2 = p.weeks[0].sessions.find((s) => s.day === 3)!;
    expect(md2.subgroup).toBeDefined();
  });

  it("flying sprints are labelled 'some', not 'best' (Nicholson 2022; Wang 2026)", () => {
    expect(SPEED_METHOD_BY_KEY.flying_sprints.evidence).toBe("some");
  });

  it("each plan has both languages, 2–3 facts and sources", () => {
    for (const p of SPEED_PLANS) {
      expect(filled(p.title) && filled(p.who) && filled(p.verdict), p.key).toBe(true);
      expect(p.facts.length, p.key).toBeGreaterThanOrEqual(2);
      expect(p.facts.length, p.key).toBeLessThanOrEqual(3);
      expect(p.refs.length, p.key).toBeGreaterThan(0);
      expect(planMethodKeys(p).length, p.key).toBeGreaterThan(0);
    }
  });

  it("plans that build up test top speed", () => {
    for (const key of ["pre_season", "individual"] as const) {
      const p = SPEED_PLANS.find((x) => x.key === key)!;
      const tests = p.weeks.flatMap((w) => w.sessions.flatMap((s) => s.blocks.filter((b) => b.test)));
      expect(tests.length, key).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("wording", () => {
  it("never says training prevents, predicts or causes injury", () => {
    const bad = /\b(prevent|prevents|predict|predicts|causes)\b|kemur í veg fyrir|spáir fyrir|veldur/i;
    for (const t of allText()) expect(t, t).not.toMatch(bad);
  });

  it("injury lines use association wording", () => {
    const injury = allText().filter((t) => /injur|meiðsl/i.test(t) && /hamstring|aftanlæri/i.test(t));
    expect(injury.length).toBeGreaterThan(0);
    for (const t of injury) if (/fewer|more|færri|fleiri/.test(t)) expect(t).toMatch(/associated|tengj|tengist/);
  });
});

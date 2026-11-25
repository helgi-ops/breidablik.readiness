import { describe, it, expect } from "vitest";
import { buildPreseasonProposal, caltypeFromFocus, type PreseasonProposalInput } from "../preseasonProposal";
import { buildCalendarBlock, sliceByLengths, type CalType, type MatchUnit, type MatchUnitAbs, type SeasonPhase } from "../index";
import { preseasonMatchExposure } from "../preseasonStart";
import { upcomingPreseason, preseasonMeso, preseasonAnchor, preseasonRamp } from "../preseasonWindow";
import { recommendTestingSchedule } from "../testingSchedule";
import { findRefByShort, fullRefsFor } from "../../references/ruleRefs";

const m = (typical: number | null) => ({ typical, peak: typical });
const UNIT = {
  nNearFull: 10, nInWindow: 10, fellBack: false, confidence: "high", windowNote: { en: "", is: "" }, minutesTypical: 90,
  load: m(1000), distance: m(10000), hsr: m(600), sprint: m(150), accel: m(40), decel: m(45),
  accHiEff: m(20), decHiEff: m(22), stride: m(30), rhie: m(null), symmetry: m(null), metPower: m(null),
  imaCod: m(55), imaFr: m(2400),
} as unknown as MatchUnit;
const EMPTY = { ...UNIT, load: m(null), distance: m(null), hsr: m(null), sprint: m(null), accel: m(null), decel: m(null), imaCod: m(null), imaFr: m(null), stride: m(null) } as unknown as MatchUnit;
const ABS: MatchUnitAbs = { dist: 10000, hsr: 600, load: 1000, accdec: 85, accHiEff: 20, decHiEff: 22, stride: 30, dirFwd: 0.6, dirBack: 0.2, dirLat: 0.2, rhie: null, symmetry: null, metPower: null, fr: 2400, cod: 55, accel: 40, decel: 45 } as MatchUnitAbs;

const phase = (key: string, start: string, end: string, weeks: number): SeasonPhase =>
  ({ key, label: { en: key, is: key }, start, end, weeks, matches: 0, rationale: { en: "", is: "" } }) as SeasonPhase;
const PHASES: SeasonPhase[] = [
  phase("preseason", "2026-02-02", "2026-04-10", 10),
  phase("competitive", "2026-04-10", "2026-10-25", 28),
  phase("offseason", "2026-10-25", "2026-11-30", 5),
];
const OPENER = "2027-04-05";
const addIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const FRIENDLIES = ["2027-01-16", "2027-02-06", "2027-03-13"];

const base = (over: Partial<PreseasonProposalInput> = {}): PreseasonProposalInput => ({
  phases: PHASES, today: "2026-11-25", nextFirstFixture: OPENER,
  saved: { preseasonSessions: 5, preseasonWeek1Mult: 1.2, preMesoTail: [3, 2] },
  matchUnits: [UNIT], matchLoad: 1000, matchSrpe: 700, loadSource: "gps", unit: ABS,
  fixtures: ["2026-10-17", ...FRIENDLIES, OPENER],
  savedDays: { "2026-12-02": { dayType: "OFF", focus: "MD-4" }, "2026-12-05": { dayType: "TRAIN", focus: "MD-1 Locomotive" }, "2026-06-01": { dayType: "OFF", focus: null } },
  camps: [{ start: "2027-02-15", end: "2027-02-21", loadPct: 110, twoADay: true }],
  cadence: 4, baseOverloadPct: 100, stepPct: 5, aerobicMode: null, hasVald: true,
  ...over,
});

describe("buildPreseasonProposal — golden: same weeks and days the hub built inline", () => {
  it("matches the old inline composition for the same input", () => {
    const input = base();
    const p = buildPreseasonProposal(input)!;
    // The hub's previous inline composition (page.tsx Pre-season tab), reproduced step by step.
    const up = upcomingPreseason(PHASES, input.today, OPENER)!;
    const preEndMs = Date.parse(`${up.start}T00:00:00Z`) + up.weeks * 7 * 86_400_000;
    const preFixtures = input.fixtures.filter((d) => d >= up.start && Date.parse(`${d}T00:00:00Z`) < preEndMs).sort();
    const off: string[] = [], on: string[] = [], ty: Record<string, CalType> = {};
    for (const [iso, sp] of Object.entries(input.savedDays!)) {
      if (iso < up.start || Date.parse(`${iso}T00:00:00Z`) >= preEndMs) continue;
      if (sp.dayType === "OFF") off.push(iso);
      else { on.push(iso); const ct = sp.focus ? caltypeFromFocus(sp.focus) : undefined; if (ct) ty[iso] = ct; }
    }
    const cal = buildCalendarBlock({ unit: ABS, startDate: up.start, numWeeks: up.weeks, scopeName: "__team__", phase: { en: "Pre-season", is: "Undirbúningur" }, baseOverloadPct: 100, stepPct: 5, matchDates: preFixtures, offDays: off, onDays: on, typeOverrides: ty, allFixtures: input.fixtures, matchExposure: (wi) => preseasonMatchExposure(wi + 1, up.weeks), camps: input.camps });
    const ramp = preseasonRamp(preseasonAnchor({ matchUnits: [UNIT], matchLoad: 1000, matchSrpe: 700, loadSource: "gps" }), 700, up.weeks, { sessionsPerWeek: 5, week1MatchMultiple: 1.2, week1Kpi: {} });
    const preEndIso = up.end!;
    const meso = preseasonMeso(up.weeks, [3, 2], 4);
    const lens: Record<string, number> = {}; meso.lens.forEach((n, i) => { lens[String(i)] = n; });
    const blocks = sliceByLengths(up.start, preEndIso, 4, lens, 0);
    const tests = recommendTestingSchedule({ preseasonWeeks: up.weeks, hasGps: true, hasVald: true, aerobicMode: null });

    // Same weeks and the same friendlies as before. Two deliberate changes since (tests below): a week with no
    // friendly now gets an assumed weekend game instead of an empty week, and the days are fitted to the week's total.
    expect(p.engine.cal.weeks.map((w) => w.weekStart)).toEqual(cal.weeks.map((w) => w.weekStart));
    expect(p.engine.cal.weeks.map((w) => w.mult)).toEqual(cal.weeks.map((w) => w.mult));
    for (const f of FRIENDLIES) {
      const at = (c: typeof cal) => { const wi = c.weeks.findIndex((w) => w.weekStart <= f && f < addIso(w.weekStart, 7)); return c.weeks[wi].days[Math.round((Date.parse(f) - Date.parse(c.weeks[wi].weekStart)) / 86_400_000)].type; };
      expect(at(p.engine.cal)).toBe("match");
      expect(at(cal)).toBe("match");
    }
    expect(p.engine.ramp).toEqual(ramp);
    expect(p.engine.meso).toEqual(meso);
    expect(p.engine.blocks).toEqual(blocks);
    expect(p.engine.tests).toEqual(tests);
    expect(p.engine.fixtures).toEqual(FRIENDLIES);
    expect(p.weeks).toHaveLength(up.weeks);
  });
});

describe("buildPreseasonProposal — his choice stands, the rule fills the rest", () => {
  it("keeps the saved settings, blocks and days and tags them coach", () => {
    const p = buildPreseasonProposal(base())!;
    const src = Object.fromEntries(p.choices.map((c) => [c.key, c.source]));
    expect(src.sessionsPerWeek).toBe("coach");
    expect(src.week1MatchMultiple).toBe("coach");
    expect(src.blocks).toBe("coach");
    expect(src.days).toBe("coach");
    expect(src.week1Kpi).toBe("rule");
    expect(src.tests).toBe("rule");
    expect(p.settings.sessionsPerWeek).toBe(5);
    expect(p.engine.ramp[0].multipleOfMatch).toBe(1.2);
    expect(p.blocks.slice(-2).map((b) => b.weeks)).toEqual([3, 2]);
    expect(p.blocks.slice(-2).every((b) => b.source === "coach")).toBe(true);
    // The saved OFF day stays off; the day outside the window is ignored.
    const dec2 = p.weeks[0].days.find((d) => d.date === "2026-12-02")!;
    expect(dec2.type).toBe("rest");
    expect(dec2.coachSet).toBe(true);
    expect(p.weeks.flatMap((w) => w.days).filter((d) => d.coachSet)).toHaveLength(2);
    expect(p.confidence.coachChoices).toBe(4);
  });

  it("from scratch ignores the saved choices and days", () => {
    const p = buildPreseasonProposal(base({ fromScratch: true }))!;
    expect(p.choices.every((c) => c.source === "rule" || c.key === "start")).toBe(true);
    expect(p.settings.sessionsPerWeek).toBe(4);
    expect(p.engine.ramp[0].multipleOfMatch).toBe(1.3);
    expect(p.weeks.flatMap((w) => w.days).some((d) => d.coachSet)).toBe(false);
  });

  it("friendlies stay fixed as match days; the competitive opener is outside the window", () => {
    const p = buildPreseasonProposal(base())!;
    const all = p.weeks.flatMap((w) => w.days);
    for (const f of FRIENDLIES) expect(all.find((d) => d.date === f)?.type).toBe("match");
    expect(all.some((d) => d.date === OPENER)).toBe(false);
    expect(p.window).toEqual({ start: "2026-11-30", weeks: 18, end: OPENER });
  });

  it("the layered read: one verdict, 2–3 facts, high confidence on own data, no gaps", () => {
    const p = buildPreseasonProposal(base())!;
    expect(p.verdict.en).toBe("18-week pre-season, 30 Nov → 5 Apr, 5 sessions a week, load from 1.2× to " + p.engine.ramp[17].multipleOfMatch + "× a match.");
    expect(p.verdict.is).toContain("1,2×");
    expect(p.facts.length).toBeGreaterThanOrEqual(2);
    expect(p.facts.length).toBeLessThanOrEqual(3);
    expect(p.confidence.level).toBe("high");
    expect(p.gaps).toEqual([]);
  });
});

describe("buildPreseasonProposal — a team without data", () => {
  it("reference values, low confidence, and the gaps are named", () => {
    const p = buildPreseasonProposal(base({ matchUnits: [EMPTY], matchLoad: null, matchSrpe: null, saved: null, fixtures: [], nextFirstFixture: null, savedDays: {} }))!;
    expect(p.engine.anchor.anchor).toBe("normative");
    expect(p.confidence.level).toBe("low");
    expect(p.window.weeks).toBe(10); // last pre-season's length
    expect(p.gaps.map((g) => g.en).join(" ")).toMatch(/No match data/);
    expect(p.gaps.map((g) => g.en).join(" ")).toMatch(/First competitive game not entered/);
    expect(p.gaps.map((g) => g.en).join(" ")).toMatch(/No friendlies/);
  });

  it("an estimated opener is named", () => {
    const p = buildPreseasonProposal(base({ nextFirstFixtureEstimated: true }))!;
    expect(p.gaps.map((g) => g.en).join(" ")).toMatch(/estimate/);
  });

  it("no phases → nothing to propose", () => {
    expect(buildPreseasonProposal(base({ phases: [] }))).toBeNull();
  });
});

describe("buildPreseasonProposal — provenance", () => {
  it("every rule citation resolves to a real reference", () => {
    const p = buildPreseasonProposal(base())!;
    for (const c of p.choices.filter((x) => x.cite && x.key !== "tests")) {
      for (const hit of fullRefsFor(c.cite!)) expect(hit.ref, `${c.key}: ${hit.short}`).not.toBeNull();
      expect(fullRefsFor(c.cite!).length).toBeGreaterThan(0);
    }
    expect(findRefByShort("Issurin 2010")).not.toBeNull();
  });
  it("numbers without a study are labelled a MicroPulse line", () => {
    const p = buildPreseasonProposal(base({ saved: null }))!;
    expect(p.choices.find((c) => c.key === "sessionsPerWeek")?.micropulseLine).toBe(true);
    expect(p.choices.find((c) => c.key === "week1MatchMultiple")?.micropulseLine).toBe(true);
  });
});

describe("buildPreseasonProposal — the days add up to the week's plan", () => {
  const sumAxis = (days: Array<Record<string, unknown>>, k: string) => days.reduce((t, d) => t + (typeof d[k] === "number" ? (d[k] as number) : 0), 0);

  it("every week: the days (friendly included) sum to the planned total per variable, each with its own multiple", () => {
    const p = buildPreseasonProposal(base())!;
    p.engine.cal.weeks.forEach((w, i) => {
      if (w.isDeload) return; // the taper week keeps the calendar's own lighter days
      const t = p.engine.ramp[i].byKpi;
      expect(Math.abs(sumAxis(w.days, "dist") - t.totalDistance!)).toBeLessThanOrEqual(7);
      expect(Math.abs(sumAxis(w.days, "hsr") - (t.velocityBand5! + (t.velocityBand6 ?? 0)))).toBeLessThanOrEqual(7);
      expect(Math.abs(sumAxis(w.days, "load") - t.totalPlayerLoad!)).toBeLessThanOrEqual(7);
    });
    // Distance and HSR keep their own multiples of a match (not one shared number).
    const r = p.engine.ramp[0].byKpi;
    expect(r.totalDistance! / 10000).not.toBeCloseTo((r.velocityBand5! + r.velocityBand6!) / 600, 2);
  });

  it("take a session out → the other days carry it; add one → they get lighter; the week total holds", () => {
    const p0 = buildPreseasonProposal(base({ savedDays: {} }))!;
    const wi = 3, w = p0.engine.cal.weeks[wi];
    const di = w.days.findIndex((d) => d.type !== "match" && d.type !== "rest");
    const iso = p0.weeks[wi].days[di].date;
    const p1 = buildPreseasonProposal(base({ savedDays: { [iso]: { dayType: "OFF", focus: null } } }))!;
    const w1 = p1.engine.cal.weeks[wi];
    expect(w1.days[di].type).toBe("rest");
    expect(Math.abs(sumAxis(w1.days, "dist") - sumAxis(w.days, "dist"))).toBeLessThanOrEqual(7);
    const other = w.days.findIndex((d, j) => j !== di && d.type !== "match" && d.type !== "rest");
    expect(w1.days[other].dist!).toBeGreaterThan(w.days[other].dist!);
    const ri = w.days.findIndex((d) => d.type === "rest");
    if (ri >= 0) {
      const p2 = buildPreseasonProposal(base({ savedDays: { [p0.weeks[wi].days[ri].date]: { dayType: "TRAIN", focus: null } } }))!;
      const w2 = p2.engine.cal.weeks[wi];
      expect(Math.abs(sumAxis(w2.days, "dist") - sumAxis(w.days, "dist"))).toBeLessThanOrEqual(7);
      expect(w2.days[other].dist!).toBeLessThan(w.days[other].dist!);
    }
  });

  it("friendlies in some weeks: the other weeks still get a training week around an assumed weekend game", () => {
    const p = buildPreseasonProposal(base({ savedDays: {} }))!;
    for (const w of p.engine.cal.weeks) expect(w.days.filter((d) => d.type !== "rest" && d.type !== "match").length).toBeGreaterThan(0);
    for (const f of FRIENDLIES) expect(p.weeks.flatMap((w) => w.days).find((d) => d.date === f)!.type).toBe("match");
  });

  it("an assumed weekend game labels the days around it, not a fixture months back", () => {
    const p = buildPreseasonProposal(base({ fixtures: ["2026-10-17", OPENER] }))!;
    expect(p.engine.cal.weeks.every((w) => w.days.some((d) => d.type === "match"))).toBe(true);
    for (const w of p.engine.cal.weeks) for (const d of w.days) {
      const n = /^MD[+-](\d+)$/.exec(d.md);
      if (n) expect(Number(n[1])).toBeLessThanOrEqual(6);
    }
  });
});

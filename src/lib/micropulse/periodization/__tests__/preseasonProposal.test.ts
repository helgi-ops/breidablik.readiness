import { describe, it, expect } from "vitest";
import { buildPreseasonProposal, caltypeFromFocus, type PreseasonProposalInput } from "../preseasonProposal";
import { buildCalendarBlock, buildMesoBlocks, sliceByLengths, type CalType, type MatchUnit, type MatchUnitAbs, type SeasonPhase } from "../index";
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
    expect(p.verdict.en).toBe("18-week pre-season, 30 Nov → 5 Apr, 5 sessions a week, load from 1.2× to " + p.engine.ramp[16].multipleOfMatch + "× a match, then a light week before the opener.");
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
    expect(p.gaps.map((g) => g.en).join(" ")).toMatch(/No games in the pre-season/);
    const q = buildPreseasonProposal(base({ matchUnits: [EMPTY], matchLoad: null, matchSrpe: null, saved: { preGamesFrom: "2027-01-04" }, fixtures: [], nextFirstFixture: null, savedDays: {} }))!;
    expect(q.gaps.map((g) => g.en).join(" ")).toMatch(/No friendlies entered — the calendar assumes a Saturday game in \d+ weeks from/);
  });

  it("an estimated opener is named", () => {
    const p = buildPreseasonProposal(base({ nextFirstFixtureEstimated: true }))!;
    expect(p.gaps.map((g) => g.en).join(" ")).toMatch(/estimate/);
  });

  it("before this season starts, the opener is THIS season's first league game — not a friendly, not the next season's estimate", () => {
    // Breiðablik 2027 (bug 2026-11-27): the 2028 opener is an estimate, the 10 Apr 2027 league game is real.
    const PH: SeasonPhase[] = [phase("preseason", "2026-11-30", "2027-04-10", 19), phase("competitive", "2027-04-10", "2027-10-26", 28), phase("offseason", "2027-10-27", "2028-01-05", 10)];
    const p = buildPreseasonProposal(base({ phases: PH, today: "2026-11-27", nextFirstFixture: "2028-04-10", nextFirstFixtureEstimated: true, fixturesEstimated: false,
      saved: null, savedDays: {}, fixtures: ["2027-01-08", "2027-01-23", "2027-04-10"] }))!;
    expect(p.opener).toBe("2027-04-10");
    expect(p.openerEstimated).toBe(false);
    expect(p.weeks.flatMap((w) => w.friendlies)).toEqual(["2027-01-08", "2027-01-23"]);
    expect(p.facts.map((f) => f.en).join(" ")).toMatch(/2 friendlies in the plan/);
    expect(p.gaps.map((g) => g.en).join(" ")).not.toMatch(/estimate/);
    const openerDay = p.weeks.flatMap((w) => w.days).find((d) => d.date === "2027-04-10")!;
    expect(openerDay.type).toBe("match");
    expect(openerDay.label.en).toBe("First league game");
    const friendlyDay = p.weeks.flatMap((w) => w.days).find((d) => d.date === "2027-01-08")!;
    expect(friendlyDay.label.en).toBe("FRIENDLY (match)");
  });

  it("from the off-season on, the opener is the NEXT season's first game (estimated when it is)", () => {
    const p = buildPreseasonProposal(base({ nextFirstFixtureEstimated: true }))!;
    expect(p.opener).toBe(OPENER);
    expect(p.openerEstimated).toBe(true);
    expect(p.weeks.flatMap((w) => w.friendlies)).not.toContain(OPENER);
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

  it("friendlies in some weeks: the other weeks still get a training week", () => {
    const p = buildPreseasonProposal(base({ savedDays: {} }))!;
    for (const w of p.engine.cal.weeks) expect(w.days.filter((d) => d.type !== "rest" && d.type !== "match").length).toBeGreaterThan(0);
    for (const f of FRIENDLIES) expect(p.weeks.flatMap((w) => w.days).find((d) => d.date === f)!.type).toBe("match");
  });

  it("an assumed weekend game labels the days around it, not a fixture months back", () => {
    const p = buildPreseasonProposal(base({ fixtures: ["2026-10-17", OPENER], saved: { preseasonSessions: 5, preseasonWeek1Mult: 1.2, preGamesFrom: "2026-11-30" } }))!;
    expect(p.engine.cal.weeks.every((w) => w.days.some((d) => d.type === "match"))).toBe(true);
    for (const w of p.engine.cal.weeks) for (const d of w.days) {
      const n = /^MD[+-](\d+)$/.exec(d.md);
      if (n) expect(Number(n[1])).toBeLessThanOrEqual(6);
    }
  });
});

describe("buildPreseasonProposal — games: entered ones always, assumed Saturday games from the coach's date, else the first friendly", () => {
  const matchDays = (p: NonNullable<ReturnType<typeof buildPreseasonProposal>>) => p.weeks.flatMap((w) => w.days).filter((d) => d.type === "match").map((d) => d.date);
  const savedWith = (preGamesFrom?: string | null) => ({ preseasonSessions: 5, preseasonWeek1Mult: 1.2, preMesoTail: [3, 2], preGamesFrom });

  it("not set → a Saturday game in every game-free week from the first friendly on, none before it (user's rule 2026-11-25)", () => {
    const p = buildPreseasonProposal(base({ savedDays: {}, saved: savedWith(null) }))!;
    const games = matchDays(p);
    for (const f of FRIENDLIES) expect(games).toContain(f);
    expect(games.filter((d) => d < FRIENDLIES[0])).toEqual([]);
    for (const d of games.filter((g) => !FRIENDLIES.includes(g))) expect(new Date(`${d}T00:00:00Z`).getUTCDay()).toBe(6);
    for (const w of p.weeks) if (w.weekStart > FRIENDLIES[0]) expect(w.days.some((d) => d.type === "match")).toBe(true);
    expect(p.weekendGames).toEqual({ from: FRIENDLIES[0], by: "first_friendly" });
    expect(p.settings.gamesFrom).toBeNull();
  });

  it("\"none\" → only the entered games; every other week is a training week that carries the week's plan", () => {
    const p = buildPreseasonProposal(base({ savedDays: {}, saved: savedWith("none") }))!;
    expect(matchDays(p)).toEqual(FRIENDLIES);
    expect(p.weekendGames).toEqual({ from: null, by: "off" });
    expect(p.choices.find((c) => c.key === "gamesFrom")?.source).toBe("coach");
    for (const w of p.engine.cal.weeks) expect(w.days.filter((d) => d.type !== "rest" && d.type !== "match").length).toBeGreaterThan(0);
    // A week with no game has no match day to count from → no MD labels.
    const free = p.engine.cal.weeks.find((w) => !w.days.some((d) => d.type === "match"))!;
    expect(free.days.every((d) => d.md === "")).toBe(true);
  });

  it("set → an assumed weekend game in every week without one from that date, none before it", () => {
    const from = "2027-02-08";
    const p = buildPreseasonProposal(base({ savedDays: {}, saved: savedWith(from) }))!;
    const games = matchDays(p);
    for (const f of FRIENDLIES) expect(games).toContain(f);
    expect(games.filter((d) => d < from && !FRIENDLIES.includes(d))).toEqual([]);
    for (const w of p.weeks) if (w.weekStart >= from) expect(w.days.some((d) => d.type === "match")).toBe(true);
    // Assumed games are always on the Saturday.
    for (const d of games.filter((g) => !FRIENDLIES.includes(g))) expect(new Date(`${d}T00:00:00Z`).getUTCDay()).toBe(6);
    expect(p.choices.find((c) => c.key === "gamesFrom")?.source).toBe("coach");
  });

  it("a game in the fixtures wins over a saved training / off day on the same date", () => {
    const p = buildPreseasonProposal(base({ savedDays: { [FRIENDLIES[0]]: { dayType: "OFF", focus: null } } }))!;
    const d = p.weeks.flatMap((w) => w.days).find((x) => x.date === FRIENDLIES[0])!;
    expect(d.type).toBe("match");
    expect(d.coachSet).toBe(false);
  });

  it("games after New Year reach the plan when the caller passes them (the loader's upcomingFixtures)", () => {
    const thisYearOnly = buildPreseasonProposal(base({ savedDays: {}, fixtures: ["2026-10-17"] }))!;
    expect(matchDays(thisYearOnly)).toEqual([]);
    expect(thisYearOnly.weekendGames.by).toBe("no_friendly");
    const withNext = buildPreseasonProposal(base({ savedDays: {}, fixtures: ["2026-10-17", ...FRIENDLIES, OPENER] }))!;
    for (const f of FRIENDLIES) expect(matchDays(withNext)).toContain(f);
  });
});

describe("buildPreseasonProposal — the coach moves or removes an assumed game per week", () => {
  const matchDays = (p: NonNullable<ReturnType<typeof buildPreseasonProposal>>) => p.weeks.flatMap((w) => w.days).filter((d) => d.type === "match").map((d) => d.date);
  const from = "2027-02-08";
  const saved = (preAssumedGames: Record<string, number | null>) => ({ preseasonSessions: 5, preseasonWeek1Mult: 1.2, preMesoTail: [3, 2], preGamesFrom: from, preAssumedGames });
  // A week after `from` with no friendly: 15 Feb 2027 (Mon) → Saturday 20 Feb.
  const WK = "2027-02-22", SAT = "2027-02-27", THU = "2027-02-25";

  it("moved: the game is on the coach's day, not the Saturday, and the days label from it", () => {
    const p = buildPreseasonProposal(base({ savedDays: {}, saved: saved({ [WK]: 3 }) }))!;
    const games = matchDays(p);
    expect(games).toContain(THU);
    expect(games).not.toContain(SAT);
    const w = p.weeks.find((x) => x.weekStart === WK)!;
    expect(w.assumedGame).toEqual({ date: THU, coachSet: true });
    expect(w.days.find((d) => d.date === "2027-02-24")!.md).toBe("MD-1");
  });

  it("removed: no game that week, the week is a training week; other weeks keep the Saturday", () => {
    const p = buildPreseasonProposal(base({ savedDays: {}, saved: saved({ [WK]: null }) }))!;
    const w = p.weeks.find((x) => x.weekStart === WK)!;
    expect(w.days.some((d) => d.type === "match")).toBe(false);
    expect(w.noGameByCoach).toBe(true);
    expect(w.days.filter((d) => d.type !== "rest").length).toBeGreaterThan(0);
    expect(matchDays(p)).toContain("2027-03-06");
  });

  it("a game placed before the weekend-games date counts too", () => {
    const early = "2026-12-14";
    const p = buildPreseasonProposal(base({ savedDays: {}, saved: saved({ [early]: 5 }) }))!;
    expect(matchDays(p)).toContain("2026-12-19");
    expect(p.weeks.find((x) => x.weekStart === early)!.assumedGame?.coachSet).toBe(true);
  });

  it("an entered game in the week wins over the coach's assumed game", () => {
    const fwk = "2027-02-01"; // FRIENDLIES[1] = Sat 6 Feb
    const p = buildPreseasonProposal(base({ savedDays: {}, saved: saved({ [fwk]: 2 }) }))!;
    expect(matchDays(p)).not.toContain("2027-02-03");
    expect(matchDays(p)).toContain(FRIENDLIES[1]);
  });

  it("the moved game wins over a saved day on that date; ignoreSavedWeeks re-flows the week", () => {
    const p = buildPreseasonProposal(base({ savedDays: { [THU]: { dayType: "OFF", focus: null }, "2027-02-23": { dayType: "OFF", focus: null } }, saved: saved({ [WK]: 3 }) }))!;
    expect(p.weeks.flatMap((w) => w.days).find((d) => d.date === THU)!.type).toBe("match");
    expect(p.weeks.flatMap((w) => w.days).find((d) => d.date === "2027-02-23")!.coachSet).toBe(true);
    const q = buildPreseasonProposal(base({ savedDays: { "2027-02-23": { dayType: "OFF", focus: null } }, saved: saved({ [WK]: 3 }), ignoreSavedWeeks: [WK] }))!;
    expect(q.weeks.flatMap((w) => w.days).find((d) => d.date === "2027-02-23")!.coachSet).toBe(false);
  });

  it("a bad saved map is dropped, never a crash", () => {
    const p = buildPreseasonProposal(base({ savedDays: {}, saved: { ...saved({}), preAssumedGames: { "2027-02-23": 3, [WK]: 9, nope: 1 } as unknown as Record<string, number | null> } }))!;
    expect(p.settings.assumedGames).toEqual({});
  });
});

describe("buildPreseasonProposal — sessions a week set the days in a week without a game", () => {
  it.each([3, 4, 5, 6])("%i sessions → %i training days in a game-free week; the week total holds", (n) => {
    const p = buildPreseasonProposal(base({ savedDays: {}, fixtures: ["2026-10-17", OPENER], saved: { preseasonSessions: n, preseasonWeek1Mult: 1.2 } }))!;
    const wi = 1, w = p.engine.cal.weeks[wi];
    expect(w.days.some((d) => d.type === "match")).toBe(false);
    expect(w.days.filter((d) => d.type !== "rest" && d.type !== "match").length).toBe(n);
    const t = p.engine.ramp[wi].byKpi;
    expect(Math.abs(w.days.reduce((s, d) => s + (d.dist ?? 0), 0) - t.totalDistance!)).toBeLessThanOrEqual(7);
  });
  it("a day the coach set stays as set", () => {
    const p0 = buildPreseasonProposal(base({ savedDays: {}, fixtures: ["2026-10-17", OPENER], saved: { preseasonSessions: 5 } }))!;
    const iso = p0.weeks[1].days[0].date;
    const p = buildPreseasonProposal(base({ savedDays: { [iso]: { dayType: "OFF", focus: null } }, fixtures: ["2026-10-17", OPENER], saved: { preseasonSessions: 5 } }))!;
    expect(p.weeks[1].days[0].type).toBe("rest");
    expect(p.weeks[1].days.filter((d) => d.type !== "rest" && d.type !== "match").length).toBe(4);
  });
});

describe("buildPreseasonProposal — sessions a week set the days in a week WITH a game too", () => {
  const sess = (w: { days: Array<{ type: string }> }) => w.days.filter((d) => !["rest", "match", "topup"].includes(d.type)).length;
  const friendlyWeek = (p: NonNullable<ReturnType<typeof buildPreseasonProposal>>) => p.weeks.find((w) => w.friendlies.includes("2027-01-16"))!;

  it.each([3, 4, 5])("%i sessions → the friendly's week has %i training days (the top-up not counted), the week total holds", (n) => {
    const p = buildPreseasonProposal(base({ savedDays: {}, saved: { preseasonSessions: n, preseasonWeek1Mult: 1.2 } }))!;
    const w = friendlyWeek(p);
    expect(sess(w)).toBe(n);
    expect(w.days.find((d) => d.date === "2027-01-16")!.type).toBe("match");
    const i = w.weekIndex - 1;
    expect(Math.abs(p.engine.cal.weeks[i].days.reduce((s, d) => s + (d.dist ?? 0), 0) - p.engine.ramp[i].byKpi.totalDistance!)).toBeLessThanOrEqual(7);
  });

  it("fewer: Mixed goes first; the activation day before the game stays", () => {
    const p = buildPreseasonProposal(base({ savedDays: {}, saved: { preseasonSessions: 3, preseasonWeek1Mult: 1.2 } }))!;
    const w = friendlyWeek(p);
    expect(w.days.some((d) => d.type === "mixed")).toBe(false);
    expect(w.days.find((d) => d.date === "2027-01-15")!.type).toBe("activation");
  });

  it("more: never in the two days after a game; no week passes 3 sessions when 3 are set", () => {
    const p = buildPreseasonProposal(base({ savedDays: {}, saved: { preseasonSessions: 6, preseasonWeek1Mult: 1.2 } }))!;
    for (const f of FRIENDLIES) for (const k of [1, 2]) {
      const d = p.weeks.flatMap((w) => w.days).find((x) => x.date === addIso(f, k));
      if (d) expect(["rest", "topup"]).toContain(d.type);
    }
    const p3 = buildPreseasonProposal(base({ savedDays: {}, saved: { preseasonSessions: 3, preseasonWeek1Mult: 1.2 } }))!;
    // A training camp week keeps the camp's days (the coach entered the camp).
    for (const w of p3.weeks) if (!(w.weekStart <= "2027-02-21" && "2027-02-15" < addIso(w.weekStart, 7))) expect(sess(w)).toBeLessThanOrEqual(3);
  });
});

describe("buildPreseasonProposal — the blocks are the ones the strength delivery reads (lota 3, user's call 2026-11-25)", () => {
  // Breiðablik 2027 shape: start-keyed lengths from Meso, cadence 6, the coach's goal on three blocks.
  const PH: SeasonPhase[] = [phase("preseason", "2026-11-30", "2027-04-10", 19), phase("competitive", "2027-04-10", "2027-10-26", 28)];
  const bw = { "2026-11-30": 4, "2026-12-28": 4 };
  const goals = { "2026-12-28": "accum", "2027-01-25": "transmute", "2027-03-08": "realize" };
  const p = buildPreseasonProposal(base({ phases: PH, today: "2026-11-25", nextFirstFixture: "2027-04-10", saved: null, savedDays: {}, cadence: 6, blockWeeks: bw, blockGoals: goals, fixtures: ["2027-01-08", "2027-01-23", "2027-04-10"] }))!;

  it("same boundaries and goals as buildMesoBlocks + the coach's goals (what blockFromPlan returns)", () => {
    const delivered = buildMesoBlocks("2026-11-30", "2027-10-26", [], 6, null, ["2027-04-10"], "2027-04-10", [], null, null, { blockWeeks: bw })
      .filter((b) => b.start < "2027-04-10")
      .map((b) => ({ start: b.start, end: b.end, goalKey: (goals as Record<string, string>)[b.start] ?? b.goalKey }));
    expect(p.blocks.map((b) => ({ start: b.start, end: b.end, goalKey: b.goalKey }))).toEqual(delivered);
    expect(p.blocks.map((b) => b.start)).toEqual(["2026-11-30", "2026-12-28", "2027-01-25", "2027-03-08"]);
    expect(p.blocks.map((b) => b.goalByCoach)).toEqual([false, true, true, true]);
  });

  it("every week carries its block's goal; the editor's tail is the blocks after the first", () => {
    for (const w of p.weeks) {
      const b = p.blocks.find((x) => x.start <= w.weekStart && w.weekStart < x.end)!;
      expect(w.goalKey).toBe(b.goalKey);
    }
    expect(p.engine.meso.tail).toEqual(p.blocks.slice(1).map((b) => b.weeks));
  });

  it("no lengths saved → cadence blocks from the start, goals in the build-up order", () => {
    const q = buildPreseasonProposal(base({ phases: PH, nextFirstFixture: "2027-04-10", saved: null, savedDays: {}, cadence: 6, blockWeeks: {}, blockGoals: {}, fixtures: [] }))!;
    expect(q.blocks.map((b) => b.start)).toEqual(["2026-11-30", "2027-01-11", "2027-02-22", "2027-04-05"]);
    expect(q.blocks.map((b) => b.goalKey)).toEqual(["accum", "transmute", "realize", "transmute"]);
  });
});

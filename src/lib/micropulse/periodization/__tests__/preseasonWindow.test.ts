import { describe, it, expect } from "vitest";
import {
  upcomingPreseason, preseasonWeekOf, preseasonMeso, preseasonSettingsFrom, preseasonSettingsForPlan,
  preseasonForDate, preseasonAnchor, preseasonRamp, PRESEASON_DEFAULT_SESSIONS, PRESEASON_DEFAULT_WEEK1, clampTaperPct,
} from "../preseasonWindow";
import { planWeeklyTarget } from "../planWeeklyTarget";
import { NORMATIVE_MATCH_LOAD } from "../preseasonStart";
import type { MatchUnit, SeasonPhase } from "../index";

const m = (typical: number | null) => ({ typical, peak: typical });
const UNIT = {
  nNearFull: 10, nInWindow: 10, fellBack: false, confidence: "high", windowNote: { en: "", is: "" }, minutesTypical: 90,
  load: m(1000), distance: m(10000), hsr: m(600), sprint: m(150), accel: m(40), decel: m(45),
  accHiEff: m(null), decHiEff: m(null), stride: m(30), rhie: m(null), symmetry: m(null), metPower: m(null),
  imaCod: m(55), imaFr: m(2400),
} as unknown as MatchUnit;
const NO_PL = { ...UNIT, load: m(null) } as unknown as MatchUnit;

const phase = (key: string, start: string, end: string, weeks: number): SeasonPhase =>
  ({ key, label: { en: key, is: key }, start, end, weeks, matches: 0, rationale: { en: "", is: "" } }) as SeasonPhase;
// 2026: pre-season 2 Feb–10 Apr (10 w), competitive → 25 Oct, off-season → 30 Nov. Next opener 5 Apr 2027.
const PHASES: SeasonPhase[] = [
  phase("preseason", "2026-02-02", "2026-04-10", 10),
  phase("competitive", "2026-04-10", "2026-10-25", 28),
  phase("offseason", "2026-10-25", "2026-11-30", 5),
];
const NEXT_OPENER = "2027-04-05";

describe("upcomingPreseason", () => {
  it("in the off-season → the next pre-season, off-season end → next opener", () => {
    expect(upcomingPreseason(PHASES, "2026-11-25", NEXT_OPENER)).toEqual({ start: "2026-11-30", weeks: 18, end: NEXT_OPENER });
  });
  it("no next opener → reuses the detected pre-season's length", () => {
    expect(upcomingPreseason(PHASES, "2026-11-25", null)).toEqual({ start: "2026-11-30", weeks: 10 });
  });
  it("before the off-season → this season's own pre-season", () => {
    expect(upcomingPreseason(PHASES, "2026-06-01", NEXT_OPENER)).toEqual({ start: "2026-02-02", weeks: 10, end: "2026-04-10" });
  });
});

describe("preseasonWeekOf / preseasonMeso", () => {
  it("weeks are 1-based and outside the window is null", () => {
    const win = { start: "2026-11-30", weeks: 18 };
    expect(preseasonWeekOf("2026-11-30", win)).toBe(1);
    expect(preseasonWeekOf("2026-12-07", win)).toBe(2);
    expect(preseasonWeekOf("2026-11-29", win)).toBeNull();
    expect(preseasonWeekOf("2027-04-05", win)).toBeNull();
  });
  it("the base block absorbs what the coach's tail leaves", () => {
    expect(preseasonMeso(18, [3, 2], 4)).toEqual({ lens: [5, 4, 4, 3, 2], base: [5, 4, 4], tail: [3, 2] });
    // A tail that would leave < 2 base weeks drops its earliest block.
    expect(preseasonMeso(5, [3, 3], 4).tail).toEqual([3]);
  });
});

describe("preseasonSettingsFrom", () => {
  it("\"weekend games from\" is an ISO day the coach set, or null", () => {
    expect(preseasonSettingsFrom({ preGamesFrom: "2027-02-10" }).gamesFrom).toBe("2027-02-10");
    expect(preseasonSettingsFrom({ preGamesFrom: "2027-02-10" }).saved.gamesFrom).toBe(true);
    expect(preseasonSettingsFrom({ preGamesFrom: "10 Feb" }).gamesFrom).toBeNull();
    expect(preseasonSettingsFrom({ preGamesFrom: null }).gamesFrom).toBeNull();
  });
  it("defaults when nothing is saved, and says so", () => {
    const s = preseasonSettingsFrom(null);
    expect(s.sessionsPerWeek).toBe(PRESEASON_DEFAULT_SESSIONS);
    expect(s.week1MatchMultiple).toBe(PRESEASON_DEFAULT_WEEK1);
    expect(s.saved).toEqual({ sessionsPerWeek: false, week1MatchMultiple: false, week1Kpi: false, mesoTail: false, taperPct: false, gamesFrom: false, assumedGames: false });
    expect(s.gamesFrom).toBeNull();
    expect(s.taperPct).toBe(40);
  });
  it("keeps the coach's choices, with the hub's clamps", () => {
    const s = preseasonSettingsFrom({ preseasonSessions: 5, preseasonWeek1Mult: 9, preWeek1Kpi: { totalDistance: 20000, velocityBand6: -1 }, preMesoTail: [3] });
    expect(s.sessionsPerWeek).toBe(5);
    expect(s.week1MatchMultiple).toBe(3);
    expect(s.week1Kpi).toEqual({ totalDistance: 20000 });
    expect(s.mesoTail).toEqual([3]);
    expect(s.saved.sessionsPerWeek && s.saved.week1MatchMultiple && s.saved.week1Kpi && s.saved.mesoTail).toBe(true);
  });
  it("an off-menu session count falls back to the default", () => {
    expect(preseasonSettingsFrom({ preseasonSessions: 9 }).sessionsPerWeek).toBe(PRESEASON_DEFAULT_SESSIONS);
  });
  it("the upcoming pre-season reads the next season's row", () => {
    const cur = { preseasonSessions: 3 }, next = { preseasonSessions: 6 };
    expect(preseasonSettingsForPlan({ seasonYear: 2026, nextSeasonYear: 2027 }, cur, next).sessionsPerWeek).toBe(6);
    expect(preseasonSettingsForPlan({ seasonYear: 2026, nextSeasonYear: 2026 }, cur, next).sessionsPerWeek).toBe(3);
  });
});

describe("preseasonAnchor", () => {
  it("own match unit → this season's matches, IMA KPIs included", () => {
    const a = preseasonAnchor({ matchUnits: [UNIT], matchLoad: 999, matchSrpe: null, loadSource: "gps" });
    expect(a.anchor).toBe("match_this_season");
    expect(a.matchLoad).toBe(1000);
    expect(a.kpi.imaCod).toBe(55);
    expect(a.kpi.imaFrDistance).toBe(2400);
  });
  it("no PlayerLoad → the normative reference, low confidence", () => {
    const a = preseasonAnchor({ matchUnits: [NO_PL], matchLoad: null, matchSrpe: null, loadSource: "gps" });
    expect(a.hasOwnKpi).toBe(false);
    expect(a.anchor).toBe("normative");
    expect(a.matchLoad).toBe(NORMATIVE_MATCH_LOAD);
    expect(preseasonAnchor({ matchUnits: [NO_PL], matchLoad: null, matchSrpe: 600, loadSource: "srpe" }).anchor).toBe("srpe_only");
  });
});

// The point of lota 1: the hub, Week Setup and Weekly Load show the same number for the same week.
describe("one pre-season week, one number", () => {
  const savedWindow = { preseasonSessions: 4, preseasonWeek1Mult: 1.3 };
  const savedWindowNext = { preseasonSessions: 5, preseasonWeek1Mult: 1.1, preWeek1Kpi: { totalDistance: 18000 } };
  const today = "2026-12-07"; // week 2 of the upcoming pre-season

  // Hub: upcoming window + the next row's settings (psSess / psW1 / week1KpiOv) → ramp row.
  const up = upcomingPreseason(PHASES, today, NEXT_OPENER)!;
  const hubSettings = preseasonSettingsForPlan({ seasonYear: 2026, nextSeasonYear: 2027 }, savedWindow, savedWindowNext);
  const hubRow = preseasonRamp(preseasonAnchor({ matchUnits: [UNIT], matchLoad: 1000, matchSrpe: null, loadSource: "gps" }), null, up.weeks, hubSettings)[1];

  it("Week Setup card resolves the same week + settings", () => {
    const ps = preseasonForDate({ phases: PHASES, seasonYear: 2026, nextSeasonYear: 2027, nextFirstFixture: NEXT_OPENER, today, date: "2026-12-07", savedWindow, savedWindowNext })!;
    expect(ps.which).toBe("upcoming");
    expect(ps.weekIndex).toBe(2);
    expect(ps.window.weeks).toBe(up.weeks);
    const cardRow = preseasonRamp(preseasonAnchor({ matchUnits: [UNIT], matchLoad: 1000, matchSrpe: null, loadSource: "gps" }), null, ps.window.weeks, ps.settings)[ps.weekIndex! - 1];
    expect(cardRow).toEqual(hubRow);
    expect(cardRow.sessionCount).toBe(5); // the coach's 5, not a hard-coded 4
  });

  it("Weekly Load plan target matches the hub's row", () => {
    const t = planWeeklyTarget({ phases: PHASES, matchUnits: [UNIT], today, seasonYear: 2026, nextSeasonYear: 2027, nextFirstFixture: NEXT_OPENER, savedWindow, savedWindowNext })!;
    expect(t.phase).toBe("preseason");
    expect(t.weekIndex).toBe(2);
    expect(t.totalWeeks).toBe(up.weeks);
    expect(t.multipleOfMatch).toBe(hubRow.multipleOfMatch);
    expect(t.byKpi).toEqual(hubRow.byKpi);
  });

  it("a date inside this season's own (past) pre-season reads that window with this season's row", () => {
    const ps = preseasonForDate({ phases: PHASES, seasonYear: 2026, nextSeasonYear: 2027, nextFirstFixture: NEXT_OPENER, today, date: "2026-02-16", savedWindow, savedWindowNext })!;
    expect(ps.which).toBe("current");
    expect(ps.weekIndex).toBe(3);
    expect(ps.settings.sessionsPerWeek).toBe(4);
  });
});

describe("preseasonRamp — the last week before the opener is light (taper)", () => {
  const a = preseasonAnchor({ matchUnits: [UNIT], matchLoad: 1000, matchSrpe: null, loadSource: "gps" });
  const s = { sessionsPerWeek: 4, week1MatchMultiple: 1.3, week1Kpi: {} };

  it("peaks the week before, then cuts the whole week by one factor (default −40%)", () => {
    const r = preseasonRamp(a, null, 8, s);
    expect(r).toHaveLength(8);
    const peak = r[6], taper = r[7];
    expect(taper.taper).toBe(true);
    expect(peak.taper).toBeUndefined();
    expect(Math.max(...r.map((w) => w.multipleOfMatch ?? 0))).toBe(peak.multipleOfMatch);
    expect(taper.multipleOfMatch).toBeCloseTo((peak.multipleOfMatch ?? 0) * 0.6, 2);
    for (const [k, v] of Object.entries(peak.byKpi)) expect(taper.byKpi[k as keyof typeof taper.byKpi]).toBe(Math.round((v as number) * 0.6));
  });

  it("each variable keeps its own research share: the order of ×match does not turn round", () => {
    const r = preseasonRamp(a, null, 8, s);
    const mk = a.kpi as Record<string, number>;
    const xm = (w: typeof r[number], k: string) => (w.byKpi as Record<string, number>)[k] / mk[k];
    const order = (w: typeof r[number]) => Object.keys(w.byKpi).filter((k) => mk[k] > 0).sort((x, y) => xm(w, x) - xm(w, y));
    expect(order(r[7]).length).toBeGreaterThan(2);
    expect(order(r[7])).toEqual(order(r[6]));
  });

  it("the coach's cut is used; 0 = no light week; capped at the research top (60%)", () => {
    expect(preseasonRamp(a, null, 8, { ...s, taperPct: 50 })[7].multipleOfMatch).toBeCloseTo((preseasonRamp(a, null, 8, s)[6].multipleOfMatch ?? 0) * 0.5, 2);
    expect(preseasonRamp(a, null, 8, { ...s, taperPct: 0 }).some((w) => w.taper)).toBe(false);
    expect(clampTaperPct(90)).toBe(60);
    expect(preseasonSettingsFrom({ preTaperPct: 25 })).toMatchObject({ taperPct: 25, saved: { taperPct: true } });
  });

  it("a short pre-season (< 3 weeks) keeps the straight build", () => {
    expect(preseasonRamp(a, null, 2, s).some((w) => w.taper)).toBe(false);
  });
});

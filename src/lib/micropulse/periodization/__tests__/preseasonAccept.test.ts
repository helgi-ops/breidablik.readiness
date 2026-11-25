import { describe, it, expect } from "vitest";
import { buildPreseasonProposal, type PreseasonProposalInput } from "../preseasonProposal";
import { planPreseasonAccept, type AcceptInput } from "../preseasonAccept";
import type { MatchUnit, MatchUnitAbs, SeasonPhase } from "../index";

const m = (typical: number | null) => ({ typical, peak: typical });
const UNIT = {
  nNearFull: 10, nInWindow: 10, fellBack: false, confidence: "high", windowNote: { en: "", is: "" }, minutesTypical: 90,
  load: m(1000), distance: m(10000), hsr: m(600), sprint: m(150), accel: m(40), decel: m(45),
  accHiEff: m(20), decHiEff: m(22), stride: m(30), rhie: m(null), symmetry: m(null), metPower: m(null), imaCod: m(55), imaFr: m(2400),
} as unknown as MatchUnit;
const ABS = { dist: 10000, hsr: 600, load: 1000, accdec: 85, accHiEff: 20, decHiEff: 22, stride: 30, dirFwd: 0.6, dirBack: 0.2, dirLat: 0.2, rhie: null, symmetry: null, metPower: null, fr: 2400, cod: 55, accel: 40, decel: 45 } as MatchUnitAbs;
const phase = (key: string, start: string, end: string, weeks: number): SeasonPhase =>
  ({ key, label: { en: key, is: key }, start, end, weeks, matches: 0, rationale: { en: "", is: "" } }) as SeasonPhase;
const PHASES = [phase("preseason", "2026-02-02", "2026-04-10", 10), phase("competitive", "2026-04-10", "2026-10-25", 28), phase("offseason", "2026-10-25", "2026-11-30", 5)];
const FRIENDLY = "2026-12-12";

const propInput = (over: Partial<PreseasonProposalInput> = {}): PreseasonProposalInput => ({
  phases: PHASES, today: "2026-11-25", nextFirstFixture: "2027-04-05", saved: null,
  matchUnits: [UNIT], matchLoad: 1000, matchSrpe: null, loadSource: "gps", unit: ABS,
  fixtures: [FRIENDLY, "2027-04-05"], cadence: 4, hasVald: true, ...over,
});

const accInput = (over: Partial<AcceptInput> = {}): AcceptInput => {
  const proposal = buildPreseasonProposal(propInput())!;
  return {
    proposal, today: "2026-12-03", existingDays: {}, existingWeekSetups: {}, fixtures: [FRIENDLY, "2027-04-05"],
    breaks: [{ start: "2026-12-24", end: "2026-12-27" }], existingTests: [], plansNext: true, ...over,
  };
};

const written = (plan: ReturnType<typeof planPreseasonAccept>) => plan.weeks.flatMap((w) => w.days.map((d) => d.day_date));

describe("planPreseasonAccept — safety", () => {
  it("never writes a past day", () => {
    const plan = planPreseasonAccept(accInput());
    expect(written(plan).every((d) => d >= "2026-12-03")).toBe(true);
    expect(plan.summary.kept.past).toBe(3); // 30 Nov, 1–2 Dec
  });

  it("never writes a match day or a team break day", () => {
    const plan = planPreseasonAccept(accInput());
    const days = written(plan);
    expect(days).not.toContain(FRIENDLY);
    for (const d of ["2026-12-24", "2026-12-25", "2026-12-26", "2026-12-27"]) expect(days).not.toContain(d);
    expect(plan.summary.kept.match).toBeGreaterThanOrEqual(1);
    // 24–27 Dec: every day kept (an assumed weekend game on a break day counts as a match day, still not written).
    expect(plan.summary.kept.teamBreak).toBeGreaterThanOrEqual(3);
  });

  it("keeps a day the coach saved, unless he changed it in the draft or started from scratch", () => {
    const existingDays = { "2026-12-04": { dayType: "OFF", focus: null } };
    expect(written(planPreseasonAccept(accInput({ existingDays })))).not.toContain("2026-12-04");
    // The rule's day for 4 Dec, if the draft edit asks for it:
    const p = planPreseasonAccept(accInput({ existingDays, editedDays: ["2026-12-04"] }));
    const ruleDay = accInput().proposal.weeks[0].days.find((d) => d.date === "2026-12-04")!;
    if (ruleDay.type === "rest") expect(written(p)).not.toContain("2026-12-04"); // same → not rewritten
    else expect(written(p)).toContain("2026-12-04");
    const scratch = planPreseasonAccept(accInput({ existingDays, fromScratch: true }));
    if (ruleDay.type !== "rest") expect(written(scratch)).toContain("2026-12-04");
  });

  it("a day that already reads the same is not rewritten", () => {
    const base = accInput();
    const d = base.proposal.weeks[1].days.find((x) => x.type !== "match" && x.type !== "rest")!;
    const existingDays = { [d.date]: { dayType: "TRAIN", focus: [d.md, d.label.en].filter(Boolean).join(" ") } };
    const plan = planPreseasonAccept(accInput({ existingDays, fromScratch: true }));
    expect(written(plan)).not.toContain(d.date);
    expect(plan.summary.kept.same).toBe(1);
  });

  it("an existing Week Setup row keeps its system and intensity", () => {
    const plan = planPreseasonAccept(accInput({ existingWeekSetups: { "2026-12-07": { system_key: "POWER", intensity_target: 6 } } }));
    const wk = plan.weeks.find((w) => w.week_start === "2026-12-07")!;
    expect(wk.createSetup).toBe(false);
    expect(wk.system_key).toBe("POWER");
    expect(wk.intensity_target).toBe(6);
    expect(plan.weeks.find((w) => w.week_start === "2026-12-14")!.createSetup).toBe(true);
  });

  it("week_plans rows use the hub day editor's shape", () => {
    const row = planPreseasonAccept(accInput()).weeks[0].days[0];
    expect(["TRAIN", "OFF"]).toContain(row.day_type);
    if (row.day_type === "OFF") expect(row.day_intent).toBe("OFF"); else expect(row.day_intent).toBeNull();
    expect(row.day_index).toBeGreaterThanOrEqual(1);
  });
});

describe("planPreseasonAccept — tests", () => {
  it("core tests only, never on a match / break / past day or the day after a match when avoidable", () => {
    const inp = accInput();
    const plan = planPreseasonAccept(inp);
    const core = new Set(inp.proposal.tests.filter((t) => t.priority === "core").map((t) => t.key));
    expect(plan.tests.length).toBeGreaterThan(0);
    for (const t of plan.tests) {
      expect(core.has(t.test_key)).toBe(true);
      expect(t.test_date >= "2026-12-03").toBe(true);
      expect(t.test_date).not.toBe(FRIENDLY);
      expect(t.test_date < "2026-12-24" || t.test_date > "2026-12-27").toBe(true);
      const day = inp.proposal.weeks.flatMap((w) => w.days).find((d) => d.date === t.test_date)!;
      expect(day.type).not.toBe("rest");
    }
  });

  it("not where the coach already has that test in the week", () => {
    const inp = accInput({ today: "2026-11-25" });
    const first = planPreseasonAccept(inp).tests[0];
    const wkStart = inp.proposal.weeks.find((w) => w.days.some((d) => d.date === first.test_date))!.weekStart;
    const again = planPreseasonAccept({ ...inp, existingTests: [{ test_key: first.test_key, test_date: wkStart }] });
    expect(again.tests.some((t) => t.test_key === first.test_key && t.test_date >= wkStart && t.test_date < "2026-12-07" && wkStart === "2026-11-30")).toBe(false);
    expect(again.tests.length).toBe(planPreseasonAccept(inp).tests.length - 1);
  });
});

describe("planPreseasonAccept — settings", () => {
  it("writes the plan's settings; this season's own row keeps its ISO-keyed block lengths", () => {
    const next = planPreseasonAccept(accInput()).overrides;
    expect(next.preseasonSessions).toBe(4);
    expect(next.preseasonWeek1Mult).toBe(1.3);
    expect(Object.keys(next.blockWeeks as object).every((k) => /^\d+$/.test(k))).toBe(true);
    expect("preWeek1Kpi" in next).toBe(false);
    const cur = planPreseasonAccept(accInput({ plansNext: false, existingBlockWeeks: { "2026-05-04": 5, "0": 9 } })).overrides;
    expect((cur.blockWeeks as Record<string, number>)["2026-05-04"]).toBe(5);
    expect(planPreseasonAccept(accInput({ fromScratch: true })).overrides.preWeek1Kpi).toEqual({});
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isWeekSeasonPhase, macroPhaseForWeek, mondayOfWeek, weekPhaseOf } from "../weekPhase";
import { resetWeekPhaseCache, resolveWeekPhase } from "../weekPhaseServer";

// Breiðablik's real plan (2026-11-18): this season's phases, then next season's (pre-season opens 30 Nov).
const P2026 = [
  { key: "preseason", start: "2026-02-02", end: "2026-04-10" },
  { key: "competitive", start: "2026-04-10", end: "2026-10-24" },
  { key: "offseason", start: "2026-10-25", end: "2026-11-30" },
];
const P2027 = [
  { key: "preseason", start: "2026-11-30", end: "2027-04-10" },
  { key: "competitive", start: "2027-04-10", end: "2027-10-26" },
  { key: "offseason", start: "2027-10-27", end: "2028-01-05" },
];
const BOTH = [...P2026, ...P2027];

describe("macroPhaseForWeek — the season plan's phase for a week", () => {
  it("off-season weeks before the pre-season", () => {
    expect(macroPhaseForWeek("2026-11-16", BOTH)).toBe("offseason");
    expect(macroPhaseForWeek("2026-11-23", BOTH)).toBe("offseason");
  });

  it("the week of 30 Nov is pre-season: the off-season's end date is the pre-season's first day", () => {
    expect(macroPhaseForWeek("2026-11-30", BOTH)).toBe("preseason");
    expect(macroPhaseForWeek("2026-12-07", BOTH)).toBe("preseason");
  });

  it("with only this season's plan, a plan's last day still has a phase; after it, none", () => {
    expect(macroPhaseForWeek("2026-11-30", P2026)).toBe("offseason");
    expect(macroPhaseForWeek("2026-12-07", P2026)).toBeNull();
  });

  it("competitive → in season; a week starting on the first fixture is in season", () => {
    expect(macroPhaseForWeek("2026-06-01", BOTH)).toBe("inseason");
    const phases = [{ key: "preseason", start: "2026-01-05", end: "2026-04-06" }, { key: "competitive", start: "2026-04-06", end: "2026-10-24" }];
    expect(macroPhaseForWeek("2026-04-06", phases)).toBe("inseason");
    expect(macroPhaseForWeek("2026-03-30", phases)).toBe("preseason");
  });

  it("a phase that starts mid-week, and no phases", () => {
    expect(macroPhaseForWeek("2025-12-29", [{ key: "preseason", start: "2026-01-01", end: "2026-03-01" }])).toBe("preseason");
    expect(macroPhaseForWeek("2026-06-01", [])).toBeNull();
  });
});

describe("weekPhaseOf / helpers", () => {
  it("a saved phase wins; otherwise the plan's", () => {
    expect(weekPhaseOf("inseason", "preseason")).toBe("inseason");
    expect(weekPhaseOf(null, "preseason")).toBe("preseason");
    expect(weekPhaseOf("bogus", null)).toBeNull();
    expect(isWeekSeasonPhase("playoffs")).toBe(true);
  });
  it("Monday of the week (UTC)", () => {
    expect(mondayOfWeek("2026-12-02")).toBe("2026-11-30");
    expect(mondayOfWeek("2026-11-30")).toBe("2026-11-30");
    expect(mondayOfWeek("2026-12-06")).toBe("2026-11-30");
  });
});

// A minimal Supabase stand-in: a table's rows, filtered by gte / lte / gt (the date windows); other filters are
// ignored. maybeSingle → the first row.
function fakeSb(tables: Record<string, Array<Record<string, unknown>>>) {
  const calls: string[] = [];
  const builder = (table: string) => {
    let rows = tables[table] ?? [];
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit", "or", "is", "not"]) b[m] = () => b;
    b.gte = (c: string, v: string) => { rows = rows.filter((r) => String(r[c]) >= v); return b; };
    b.lte = (c: string, v: string) => { rows = rows.filter((r) => String(r[c]) <= v); return b; };
    b.gt = (c: string, v: string) => { rows = rows.filter((r) => String(r[c]) > v); return b; };
    b.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res, rej);
    return b;
  };
  return { sb: { from: (t: string) => { calls.push(t); return builder(t); } } as never, calls };
}

describe("resolveWeekPhase — server read", () => {
  beforeEach(() => resetWeekPhaseCache());

  it("a saved phase wins and the season plan is not read", async () => {
    const { sb, calls } = fakeSb({ coach_week_setup: [{ season_phase: "inseason" }] });
    const r = await resolveWeekPhase(sb, "t1", "2026-12-02");
    expect(r).toMatchObject({ weekStart: "2026-11-30", phase: "inseason", saved: "inseason", planPhase: null });
    expect(calls).toEqual(["coach_week_setup"]);
  });

  it("unsaved: follows the season plan (fixtures + the coach's dates), across into next season's plan", async () => {
    const { sb } = fakeSb({
      coach_week_setup: [],
      season_plans: [
        { season_year: 2026, overrides: { preseasonStart: "2026-02-02", seasonEnd: "2026-10-24", nextPreseasonStart: "2026-11-30" } },
        { season_year: 2027, overrides: { preseasonStart: "2026-11-30", seasonEnd: "2027-10-26" } },
      ],
      match_schedule: [
        { match_date: "2026-04-10", competition: "Besta deild", is_home: true, is_friendly: false },
        { match_date: "2027-04-10", competition: "Besta deild", is_home: true, is_friendly: false },
      ],
    });
    const r = await resolveWeekPhase(sb, "t1", "2026-12-02");
    expect(r.saved).toBeNull();
    expect(r.phase).toBe("preseason");
    const r2 = await resolveWeekPhase(sb, "t1", "2026-11-25");
    expect(r2.phase).toBe("offseason");
  });

  it("no saved phase and no plan → null (the callers' old default)", async () => {
    const { sb } = fakeSb({ coach_week_setup: [], season_plans: [], match_schedule: [] });
    const r = await resolveWeekPhase(sb, "t1", "2026-12-02");
    expect(r.phase).toBeNull();
  });
});

describe("wiring — engine, programme check, Today and Week setup use the same rule", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
  it("the strength engine's team context reads resolveWeekPhase", () => {
    const s = read("src/lib/micropulse/playerContext/domains.ts");
    expect(s).toMatch(/resolveWeekPhase\(sb, teamId, todayIso\)/);
    expect(s).not.toMatch(/from\("coach_week_setup"\)/);
  });
  it("the Custom Programme check reads resolveWeekPhase", () => {
    const s = read("src/lib/micropulse/strengthProgramming/customProgrammeActive.ts");
    expect(s).toMatch(/resolveWeekPhase\(sb, teamId, todayIso\)/);
    expect(s).not.toMatch(/from\("coach_week_setup"\)/);
  });
  it("the route takes the team from the caller's profile, never a param", () => {
    const s = read("src/app/api/week-phase/route.ts");
    expect(s).toMatch(/from\("profiles"\)\.select\("team_id"\)\.eq\("id", uid\)/);
    expect(s).not.toMatch(/searchParams\.get\("team/);
  });
  it("Today falls back to the route's phase only when the week has no saved phase", () => {
    const s = read("src/app/player/PlayerClient.tsx");
    expect(s).toMatch(/\/api\/week-phase\?week=/);
    expect(s).toMatch(/validPhases\.includes\(savedSp\) \? savedSp : planPhase/);
  });
  it("Week setup uses the shared macroPhaseForWeek with both seasons' phases", () => {
    const s = read("src/components/coach/WeekSetupView.tsx");
    expect(s).toMatch(/import \{ macroPhaseForWeek \} from "@\/lib\/micropulse\/weekSetup\/weekPhase"/);
    expect(s).not.toMatch(/function macroPhaseForWeek/);
    expect(s).toMatch(/\/api\/week-phase\?week=\$\{weekStart\}&plan=1/);
  });
});

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTeamCustomTable, customProgrammeCoversDay } from "../customProgrammeActive";

/**
 * A tiny chainable stub matching the two query styles the helper uses:
 *  - single reads ending in .maybeSingle()  → coach_week_setup, custom_template_sets
 *  - list read ending in .limit() (awaited)  → the dynamic custom table
 * The builder records the table + which filters ran, and resolves accordingly.
 */
type Cfg = {
  seasonPhase?: string;                                  // coach_week_setup.season_phase
  teamTable?: string | null;                             // custom_template_sets (player_id IS NULL).table_name
  playerWindow?: { table_name: string; md_days: string[] } | null; // per-player window row
  rows?: unknown[];                                      // dynamic table rows
  sport?: string;                                        // teams.sport
};

function makeSb(cfg: Cfg): SupabaseClient {
  const build = (table: string) => {
    const state = { table, isNull: false, window: false };
    const api: Record<string, unknown> = {};
    const chain = () => api;
    api.select = chain;
    api.eq = chain;
    api.in = chain;
    api.order = chain;
    api.not = chain;
    api.is = () => { state.isNull = true; return api; };
    api.lte = () => { state.window = true; return api; };
    api.gte = () => { state.window = true; return api; };
    api.limit = () => api; // dynamic-table terminal is awaited via then() below
    api.maybeSingle = () => {
      if (state.table === "coach_week_setup") return Promise.resolve({ data: cfg.seasonPhase ? { season_phase: cfg.seasonPhase } : null });
      if (state.table === "teams") return Promise.resolve({ data: cfg.sport ? { sport: cfg.sport } : null });
      // custom_template_sets: a team read carries .is("player_id", null); a per-player window carries only lte/gte.
      if (state.table === "custom_template_sets" && state.isNull) return Promise.resolve({ data: cfg.teamTable ? { table_name: cfg.teamTable } : null });
      if (state.table === "custom_template_sets" && state.window) return Promise.resolve({ data: cfg.playerWindow ?? null });
      return Promise.resolve({ data: null });
    };
    // Make the builder awaitable for the dynamic-table list read (…​.limit() then await).
    api.then = (onF: (v: { data: unknown[] | null }) => unknown) => onF({ data: cfg.rows ?? [] });
    return api;
  };
  return { from: (t: string) => build(t) } as unknown as SupabaseClient;
}

const base = { teamId: "t1", playerId: "p1", mdDay: "MD-4", todayIso: "2026-10-12" };

describe("resolveTeamCustomTable", () => {
  it("returns the team's custom table + season_phase", async () => {
    const ctx = await resolveTeamCustomTable(makeSb({ seasonPhase: "preseason", teamTable: "lower_body_prog" }), "t1", "2026-10-12");
    expect(ctx).toEqual({ seasonPhase: "preseason", tableName: "lower_body_prog", isBasketball: false });
  });
  it("flags a basketball team + resolves its date-covering block table", async () => {
    const ctx = await resolveTeamCustomTable(makeSb({ sport: "basketball", teamTable: "njardvik_w_block_20261019" }), "t1", "2026-10-12");
    expect(ctx).toEqual({ seasonPhase: "inseason", tableName: "njardvik_w_block_20261019", isBasketball: true });
  });
  it("tableName is null when it resolves to the shared default", async () => {
    const ctx = await resolveTeamCustomTable(makeSb({ teamTable: "microdose_templates" }), "t1", "2026-10-12");
    expect(ctx.tableName).toBeNull();
  });
  it("defaults season_phase to inseason when no week row / invalid", async () => {
    const ctx = await resolveTeamCustomTable(makeSb({ teamTable: "x", seasonPhase: undefined }), "t1", "2026-10-12");
    expect(ctx.seasonPhase).toBe("inseason");
  });
});

describe("customProgrammeCoversDay", () => {
  it("true when the team's custom table has a row for the MD day", async () => {
    const sb = makeSb({ teamTable: "lower_body_prog", seasonPhase: "inseason", rows: [{ id: "r1" }] });
    expect(await customProgrammeCoversDay(sb, base)).toBe(true);
  });

  it("false when the team has no custom table and no player window", async () => {
    const sb = makeSb({ teamTable: "microdose_templates", rows: [{ id: "r1" }] });
    expect(await customProgrammeCoversDay(sb, base)).toBe(false);
  });

  it("false when the custom table has no row for the day (empty)", async () => {
    const sb = makeSb({ teamTable: "lower_body_prog", rows: [] });
    expect(await customProgrammeCoversDay(sb, base)).toBe(false);
  });

  it("a per-player window covering the MD day makes it true even with no team table", async () => {
    const sb = makeSb({ teamTable: "microdose_templates", playerWindow: { table_name: "p1_block", md_days: ["MD-4", "MD-2"] }, rows: [{ id: "r1" }] });
    expect(await customProgrammeCoversDay(sb, base)).toBe(true);
  });

  it("a per-player window that does NOT include today's MD day is ignored", async () => {
    const sb = makeSb({ teamTable: "microdose_templates", playerWindow: { table_name: "p1_block", md_days: ["MD-2"] }, rows: [{ id: "r1" }] });
    expect(await customProgrammeCoversDay(sb, base)).toBe(false);
  });

  it("uses a pre-resolved team ctx when provided", async () => {
    const sb = makeSb({ teamTable: "SHOULD_NOT_BE_READ", rows: [{ id: "r1" }] });
    expect(await customProgrammeCoversDay(sb, { ...base, ctx: { seasonPhase: "inseason", tableName: "lower_body_prog", isBasketball: false } })).toBe(true);
  });

  it("basketball: covers the day via the weekday block table (ignores the football mdDay passed in)", async () => {
    // mdDay is a football tag, but a basketball ctx resolves the slot from the weekday — the block table
    // has a row, so the standard send stands aside. ctx pre-resolved (isBasketball) to skip team reads.
    const sb = makeSb({ rows: [{ id: "r1" }] });
    const ctx = { seasonPhase: "inseason", tableName: "njardvik_w_block_20261019", isBasketball: true };
    expect(await customProgrammeCoversDay(sb, { ...base, mdDay: "MD-4", ctx })).toBe(true);
  });
});

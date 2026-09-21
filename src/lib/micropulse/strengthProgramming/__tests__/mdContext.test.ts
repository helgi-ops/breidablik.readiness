import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAutoMdContext } from "../loader";

/** Stub matching the two query chains fetchMdContext now uses, run together via Promise.all:
 *   match_schedule → .select().eq().gte().lte()  → { data: [{ match_date }] }
 *   week_plans     → .select().eq().gte().lte()  → { data: [{ day_date, day_type }] }
 * Neither ends in .order() any more (post-match-aware rewrite reads a −3…+5 window from both). */
function sb(opts: { fixtures?: string[]; plans?: Array<{ day_date: string; day_type: string }> }): SupabaseClient {
  const chain = (rows: unknown[]) => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.gte = () => q;
    q.lte = () => Promise.resolve({ data: rows, error: null });
    return q;
  };
  return {
    from: (table: string) =>
      table === "match_schedule"
        ? chain((opts.fixtures ?? []).map((d) => ({ match_date: d })))
        : chain(opts.plans ?? []),
  } as unknown as SupabaseClient;
}

describe("resolveAutoMdContext → fetchMdContext — post-match aware, fixture-or-week driven", () => {
  // ── Forward countdown from the training week (week_plans GAME) ──
  it("GAME tomorrow → MD-1 (the reported bug: no override, reads the plan)", async () => {
    expect(await resolveAutoMdContext(sb({ plans: [
      { day_date: "2026-09-10", day_type: "TRAIN" },
      { day_date: "2026-09-11", day_type: "GAME" },
    ] }), "team1", "2026-09-10")).toBe("MD-1");
  });

  it("GAME in 3 days → MD-3", async () => {
    expect(await resolveAutoMdContext(sb({ plans: [{ day_date: "2026-09-13", day_type: "GAME" }] }), "team1", "2026-09-10")).toBe("MD-3");
  });

  it("matchday (GAME today) → OFF", async () => {
    expect(await resolveAutoMdContext(sb({ plans: [{ day_date: "2026-09-10", day_type: "GAME" }] }), "team1", "2026-09-10")).toBe("OFF");
  });

  it("no GAME in range → MD-3 default", async () => {
    expect(await resolveAutoMdContext(sb({ plans: [{ day_date: "2026-09-10", day_type: "TRAIN" }] }), "team1", "2026-09-10")).toBe("MD-3");
  });

  it("no team → MD-3 default", async () => {
    expect(await resolveAutoMdContext(sb({}), null, "2026-09-10")).toBe("MD-3");
  });

  // ── Post-match recovery: the day(s) AFTER a game now resolve backward ──
  it("day after a game → MD+1 (recovery), from a fixture, with NO week_plans", async () => {
    // Coach forgot the week; match_schedule has yesterday's game → still resolves.
    expect(await resolveAutoMdContext(sb({ fixtures: ["2026-09-09"] }), "team1", "2026-09-10")).toBe("MD+1");
  });

  it("two days after a game (nothing ahead) → MD+2", async () => {
    expect(await resolveAutoMdContext(sb({ fixtures: ["2026-09-08"] }), "team1", "2026-09-10")).toBe("MD+2");
  });

  it("three days after a game → MD+3", async () => {
    expect(await resolveAutoMdContext(sb({ fixtures: ["2026-09-07"] }), "team1", "2026-09-10")).toBe("MD+3");
  });

  it("fixture drives MD when the coach forgot to set the week", async () => {
    // No week_plans at all; the fixture list alone gives the countdown.
    expect(await resolveAutoMdContext(sb({ fixtures: ["2026-09-11"] }), "team1", "2026-09-10")).toBe("MD-1");
  });

  it("congested: game yesterday AND next game in 3 days → MD+1 wins (recovery first)", async () => {
    expect(await resolveAutoMdContext(sb({ fixtures: ["2026-09-09", "2026-09-13"] }), "team1", "2026-09-10")).toBe("MD+1");
  });

  it("mid-week: last game 3 ago, next game in 4 → countdown wins over MD+3 (Wed = MD-4)", async () => {
    // Normal week Sun game + next Sun game: on Wed both are in range; MD-4 (countdown) beats MD+3.
    expect(await resolveAutoMdContext(sb({ fixtures: ["2026-09-07", "2026-09-14"] }), "team1", "2026-09-10")).toBe("MD-4");
  });
});

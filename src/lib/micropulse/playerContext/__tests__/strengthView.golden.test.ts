import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerContext } from "../index";
import { strengthView } from "../views/strengthView";
import type { PlayerStrengthSnapshot } from "../../strengthProgramming/types";

/**
 * The convergence contract: the strength snapshot must stay byte-identical after
 * moving its reads into buildPlayerContext.
 *   1. `strengthView` maps a context → snapshot 1:1 (the one place a mapping bug
 *      could slip in) — full deep-equal.
 *   2. `buildPlayerContext` wiring is complete: an empty DB yields the canonical
 *      "no data" snapshot (the Lite-team case), and populated direct tables flow
 *      through the relocated fetchers to the right derived fields.
 * The composed loaders (sprint exposure, deficit ledger, movement screens) are
 * mocked to empty so the context is deterministic; they have their own tests.
 */

vi.mock("@/lib/micropulse/sprintExposure/loader", () => ({
  loadSprintExposure: vi.fn(async () => ({ band: null })),
}));
vi.mock("@/lib/micropulse/movementScreen/loader", () => ({
  loadPlayerMovementScreens: vi.fn(async () => []),
}));
vi.mock("@/lib/micropulse/unifiedDeficits/collect", () => ({
  collectDeficits: vi.fn(async () => ({ rows: [], overrides: [], prehabFlags: [], clearances: [] })),
}));

// Import AFTER the mocks are registered.
import { buildPlayerContext } from "../index";

// ---- a minimal chainable Supabase fake: filters/order are ignored, the table's
// rows are returned as-is; maybeSingle returns the first row (or null). ----
type Row = Record<string, unknown>;
function makeFakeSb(tables: Record<string, Row[]>): SupabaseClient {
  const build = (rows: Row[]) => {
    const qb: Record<string, unknown> = {
      select: () => qb,
      eq: () => qb,
      gte: () => qb,
      lte: () => qb,
      gt: () => qb,
      order: () => qb,
      limit: () => qb,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null }),
      then: (res: (v: { data: Row[] }) => unknown) => Promise.resolve({ data: rows }).then(res),
    };
    return qb;
  };
  return { from: (tbl: string) => build(tables[tbl] ?? []) } as unknown as SupabaseClient;
}

function fullContext(): PlayerContext {
  return {
    playerId: "p1",
    playerName: "Test Player",
    todayIso: "2026-09-11",
    teamId: "t1",
    vbtDecrement: null,
    teamConfig: { data: { sport: "football", seasonPhase: "in_season", palette: { power_explosive: ["ex_a"] }, mdStructures: { "MD-1": "contrast" } }, status: { available: true, freshness: "fresh" } },
    externalLoad: { data: { sprintDropPct: 3.2, sprintBand: "SAFE", codAsymmetryPct: 12.5, codWeakerSide: "L", decelBurdenBand: "elevated", decelBurdenHighStreakDays: 2 }, status: { available: true, freshness: "fresh" } },
    forcePlate: { data: { valdAsymmetryPct: 9.4, valdWeakerSide: "R" }, status: { available: true, freshness: "fresh" } },
    wellness: { data: { sleepQuality: 4, muscleSoreness: 2, fatigueEnergy: 3, stressMood: 4, soreAreas: ["hamstring"] }, status: { available: true, freshness: "fresh" } },
    verdict: { data: { action: "MODIFIED" }, status: { available: true, freshness: "fresh" } },
    injury: { data: { status: "cleared" }, status: { available: true, freshness: "fresh" } },
    conditioning: { data: { fosterMonotony: 1.8, fosterStrain: 2200, isCongestedWeek: true }, status: { available: true, freshness: "fresh" } },
    microcycle: { data: { mdContext: "MD-1" }, status: { available: true, freshness: "fresh" } },
    movementDeficit: { data: { ledgerEmphases: ["posterior_chain"], correctives: [], correctiveEmphases: ["hip_abductor_er"] }, status: { available: true, freshness: "fresh" } },
  };
}

describe("strengthView (pure projection)", () => {
  it("maps every context domain onto the snapshot 1:1", () => {
    const snap = strengthView(fullContext());
    const expected: PlayerStrengthSnapshot = {
      playerId: "p1",
      playerName: "Test Player",
      todayIso: "2026-09-11",
      mdContext: "MD-1",
      verdict: "MODIFIED",
      sprintSpeedDropPct: 3.2,
      sprintExposureBand: "SAFE",
      codAsymmetryPct: 12.5,
      codWeakerSide: "L",
      valdAsymmetryPct: 9.4,
      valdWeakerSide: "R",
      decelBurdenBand: "elevated",
      decelBurdenHighStreakDays: 2,
      wellness: { sleepQuality: 4, muscleSoreness: 2, fatigueEnergy: 3, stressMood: 4, soreAreas: ["hamstring"] },
      vbtDecrement: null,
      injuryStatus: "cleared",
      fosterMonotony: 1.8,
      fosterStrain: 2200,
      isCongestedWeek: true,
      ledgerEmphases: ["posterior_chain"],
      correctives: [],
      correctiveEmphases: ["hip_abductor_er"],
      teamPalette: { power_explosive: ["ex_a"] },
      mdStructures: { "MD-1": "contrast" },
      sport: "football",
      seasonPhase: "in_season",
    };
    expect(snap).toEqual(expected);
  });
});

describe("buildPlayerContext → strengthView (wiring)", () => {
  it("empty DB → the canonical no-data snapshot (Lite-team case)", async () => {
    const sb = makeFakeSb({});
    const snap = strengthView(await buildPlayerContext(sb, { playerId: "p1", teamId: null, todayIso: "2026-09-11" }));
    expect(snap).toEqual({
      playerId: "p1",
      playerName: undefined,
      todayIso: "2026-09-11",
      mdContext: "MD-3",
      verdict: null,
      sprintSpeedDropPct: null,
      sprintExposureBand: null,
      codAsymmetryPct: null,
      codWeakerSide: null,
      valdAsymmetryPct: null,
      valdWeakerSide: null,
      decelBurdenBand: null,
      decelBurdenHighStreakDays: 0,
      wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
      vbtDecrement: null,
      injuryStatus: null,
      fosterMonotony: null,
      fosterStrain: null,
      isCongestedWeek: false,
      ledgerEmphases: [],
      correctives: [],
      correctiveEmphases: [],
      teamPalette: {},
      mdStructures: {},
      sport: null,
      seasonPhase: null,
    });
  });

  it("populated direct tables flow through the relocated fetchers", async () => {
    const sb = makeFakeSb({
      teams: [{ sport: "football" }],
      coach_week_setup: [{ season_phase: "in_season" }],
      // one Catapult row carries CoD + decel-band columns (sprint stays null — no valid mv/hsr).
      player_external_load_daily: [{ date: "2026-09-11", source: "catapult", ima_cod_left_high: 10, ima_cod_right_high: 6, decel_burden_band: "high", max_velocity: null, max_vel: null, high_speed_distance: null }],
      readiness_entries: [{ entry_date: "2026-09-11", sleep_quality: 4, muscle_soreness: 2, fatigue_energy: 3, stress_mood: 4, sore_areas: ["hamstring"], notes: null }],
      athlete_decision_history: [{ verdict_action: "FULL", decision_date: "2026-09-11" }],
      player_injuries: [{ status: "injured" }],
      session_rpe_entries: [{ session_load: 100 }, { session_load: 200 }, { session_load: 300 }],
      match_player_minutes: [{ match_date: "2026-09-08", minutes_played: 90 }, { match_date: "2026-09-12", minutes_played: 90 }],
      week_plans: [{ day_date: "2026-09-12", day_type: "GAME" }],
    });
    const snap = strengthView(await buildPlayerContext(sb, { playerId: "p1", teamId: "t1", todayIso: "2026-09-11" }));

    expect(snap.verdict).toBe("FULL");
    expect(snap.injuryStatus).toBe("injured");
    expect(snap.mdContext).toBe("MD-1");           // GAME in 1 day
    expect(snap.isCongestedWeek).toBe(true);       // 2 matches ≥60 min in the ±7d window
    expect(snap.sport).toBe("football");
    expect(snap.seasonPhase).toBe("in_season");
    expect(snap.codAsymmetryPct).toBe(40);         // |10-6|/10*100
    expect(snap.codWeakerSide).toBe("R");          // right side has fewer CoD
    expect(snap.decelBurdenBand).toBe("high");
    expect(snap.decelBurdenHighStreakDays).toBe(1);
    expect(snap.wellness.sleepQuality).toBe(4);
    expect(snap.wellness.soreAreas).toContain("hamstring");
    expect(snap.fosterMonotony).not.toBeNull();    // 3 varied loads → computable
    expect(snap.sprintSpeedDropPct).toBeNull();    // no valid sprint row
  });
});

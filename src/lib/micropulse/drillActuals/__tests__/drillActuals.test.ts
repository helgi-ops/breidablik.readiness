import { describe, it, expect } from "vitest";
import {
  csvRowsToPeriodRows,
  aggregatePeriodsPerPlayer,
  matchPeriodsToItems,
  isSessionTotalName,
  periodHasNoGps,
  templatePatchFromActual,
  longRunsFromBands,
  applyLongRuns,
  boundsFromDayRow,
  PERIOD_METRIC_KEYS,
  IMA_DETAIL_KEYS,
  type DrillActual,
  type SessionItem,
} from "../index";

// Minimal CSV row helper (only the fields csvRowsToPeriodRows reads).
function row(period: string, athlete: string, pl: number, dist: number) {
  return { periodName: period, athleteId: athlete, athleteName: athlete, raw: { playerLoad: String(pl), totalDistance: String(dist) } };
}

describe("csvRowsToPeriodRows + isSessionTotalName", () => {
  it("drops Session-total and unnamed rows, keeps drills in first-appearance order", () => {
    const rows = [
      row("Session", "A", 300, 5000),
      row("Warm-up", "A", 80, 700),
      row("Rondo", "A", 120, 900),
      row("", "A", 10, 10),
    ];
    const out = csvRowsToPeriodRows(rows);
    expect(out.map((r) => r.periodName)).toEqual(["Warm-up", "Rondo"]);
    expect(out[0].order).toBe(0);
    expect(out[1].order).toBe(1);
  });
  it("isSessionTotalName catches session/total/blank", () => {
    expect(isSessionTotalName("Session")).toBe(true);
    expect(isSessionTotalName("Total")).toBe(true);
    expect(isSessionTotalName("")).toBe(true);
    expect(isSessionTotalName("Rondo")).toBe(false);
  });
});

describe("aggregatePeriodsPerPlayer", () => {
  it("averages each metric per player across the squad", () => {
    const rows = csvRowsToPeriodRows([
      row("Rondo", "A", 100, 800),
      row("Rondo", "B", 140, 1000),
      row("Rondo", "C", 120, 900),
    ]);
    const [g] = aggregatePeriodsPerPlayer(rows);
    expect(g.nPlayers).toBe(3);
    expect(g.perPlayer.player_load).toBe(120); // (100+140+120)/3
    expect(g.perPlayer.distance_m).toBe(900);
  });
});

describe("matchPeriodsToItems", () => {
  const groups = aggregatePeriodsPerPlayer(
    csvRowsToPeriodRows([
      row("Warm-up", "A", 80, 700),
      row("Rondo", "A", 120, 900),
      row("SSG 10v10", "A", 200, 1800),
    ]),
  );

  it("matches by name regardless of order/case/punctuation", () => {
    const items: SessionItem[] = [
      { drill_id: "d1", drill_name: "SSG 10v10", sets: 1 },
      { drill_id: "d2", drill_name: "warm up", sets: 1 }, // punctuation/case differs
      { drill_id: "d3", drill_name: "Rondo", sets: 1 },
    ];
    const { items: out, matchedCount, unmatchedPeriods } = matchPeriodsToItems(items, groups);
    expect(matchedCount).toBe(3);
    expect(unmatchedPeriods).toHaveLength(0);
    expect(out[0].actual?.period_name).toBe("SSG 10v10");
    expect(out[0].actual?.matched_by).toBe("name");
    expect(out[1].actual?.period_name).toBe("Warm-up");
    expect(out[2].actual?.player_load).toBe(120);
  });

  it("falls back to order when names differ", () => {
    const items: SessionItem[] = [
      { drill_id: "d1", drill_name: "Activation", sets: 1 },
      { drill_id: "d2", drill_name: "Possession box", sets: 1 },
      { drill_id: "d3", drill_name: "Big game", sets: 1 },
    ];
    const { items: out, matchedCount } = matchPeriodsToItems(items, groups);
    expect(matchedCount).toBe(3);
    // Order fallback zips by first-appearance: Warm-up, Rondo, SSG 10v10
    expect(out[0].actual?.period_name).toBe("Warm-up");
    expect(out[0].actual?.matched_by).toBe("order");
    expect(out[2].actual?.period_name).toBe("SSG 10v10");
  });

  it("surfaces unmatched periods when there are fewer drills", () => {
    const items: SessionItem[] = [{ drill_id: "d1", drill_name: "Rondo", sets: 1 }];
    const { matchedCount, unmatchedPeriods } = matchPeriodsToItems(items, groups);
    expect(matchedCount).toBe(1);
    expect(unmatchedPeriods.map((g) => g.periodName).sort()).toEqual(["SSG 10v10", "Warm-up"]);
  });

  it("is idempotent (re-running yields the same actuals)", () => {
    const items: SessionItem[] = [{ drill_id: "d1", drill_name: "Rondo", sets: 1 }];
    const once = matchPeriodsToItems(items, groups).items;
    const twice = matchPeriodsToItems(once, groups).items;
    expect(twice[0].actual).toEqual(once[0].actual);
  });
});

// ── IMA detail + indoor rule (2026-11) ───────────────────────────────────────

function imaRow(period: string, athlete: string, raw: Record<string, number>) {
  return { periodName: period, athleteId: athlete, athleteName: athlete, raw: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)])) };
}

describe("CSV → IMA detail per drill", () => {
  it("keeps accel/decel by band and CoD by side, and averages them per player", () => {
    const groups = aggregatePeriodsPerPlayer(csvRowsToPeriodRows([
      imaRow("Rondo", "A", { playerLoad: 80, totalDistance: 0, imaAccelBand1: 6, imaAccelBand2: 2, imaAccelBand3: 2, imaDecelBand3: 4,
        imaCodLeftHigh: 1, imaCodLeftMedium: 3, imaCodLeftLow: 10, imaCodRightHigh: 1, imaCodRightMedium: 1, imaCodRightLow: 4 }),
      imaRow("Rondo", "B", { playerLoad: 100, totalDistance: 0, imaAccelBand1: 4, imaAccelBand2: 2, imaAccelBand3: 0, imaDecelBand3: 2,
        imaCodLeftHigh: 1, imaCodLeftMedium: 1, imaCodLeftLow: 6, imaCodRightHigh: 3, imaCodRightMedium: 3, imaCodRightLow: 8 }),
    ]));
    const p = groups[0].perPlayer;
    expect(p.ima_accel).toBe(8);          // (10 + 6) / 2
    expect([p.ima_accel_low, p.ima_accel_med, p.ima_accel_high]).toEqual([5, 2, 1]);
    expect(p.ima_decel_high).toBe(3);
    expect(p.ima_cod_left).toBe(11);      // (14 + 8) / 2
    expect(p.ima_cod_right).toBe(10);     // (6 + 14) / 2
    expect((p.ima_cod_left ?? 0) + (p.ima_cod_right ?? 0)).toBe(p.ima_cod_total);
  });
  it("every IMA detail key rides through aggregation and the per-player write", () => {
    for (const k of IMA_DETAIL_KEYS) expect(PERIOD_METRIC_KEYS).toContain(k);
  });
});

describe("periodHasNoGps", () => {
  it("is true for load with no distance, false outdoors or without a distance column", () => {
    expect(periodHasNoGps(80, 0)).toBe(true);
    expect(periodHasNoGps(80, 12)).toBe(true);
    expect(periodHasNoGps(80, 217)).toBe(false); // outdoor tactic drill
    expect(periodHasNoGps(80, null)).toBe(false); // no distance column (basketball)
    expect(periodHasNoGps(0, 0)).toBe(false);     // nothing recorded
  });
  it("flags an indoor drill's actual", () => {
    const groups = aggregatePeriodsPerPlayer(csvRowsToPeriodRows([imaRow("Rondo", "A", { playerLoad: 80, totalDistance: 0 })]));
    const { items } = matchPeriodsToItems([{ drill_id: "d1", drill_name: "Rondo" }], groups);
    expect(items[0].actual?.no_gps).toBe(true);
  });
});

describe("templatePatchFromActual", () => {
  const base = (o: Partial<DrillActual>): DrillActual => ({
    player_load: null, player_load_per_min: null, distance_m: null, hir_total: null, vel_b5: null, vel_b6: null,
    max_velocity: null, accel_b23: null, decel_b23: null, accel_total: null, decel_total: null, hmld_m: null,
    metabolic_power_avg: null, metabolic_power_peak: null, duration_min: null, ima_accel: null, ima_decel: null,
    ima_cod_total: null, high_ima: null, jumps: null,
    ima_accel_low: null, ima_accel_med: null, ima_accel_high: null, ima_decel_low: null, ima_decel_med: null, ima_decel_high: null,
    ima_cod_left: null, ima_cod_right: null, ima_cod_med: null, ima_cod_low: null, long_runs: null, long_run_strides: null,
    n_players: 11, matched_by: "name", period_name: "Rondo", ...o,
  });

  it("indoors: writes load + IMA, leaves every GPS column alone, records where it came from", () => {
    const p = templatePatchFromActual(base({ player_load: 74, duration_min: 15, distance_m: 0, hir_total: 0, vel_b5: 0, max_velocity: 0,
      accel_b23: 0, ima_accel: 12, ima_decel: 19, ima_cod_left: 30, ima_cod_right: 27, no_gps: true }), "2026-11-05")!;
    expect(p.player_load).toBe(74);
    expect(p.player_load_per_min).toBeCloseTo(4.93, 2);
    expect(p.ima_accel).toBe(12);
    expect(p.ima_cod_left).toBe(30);
    for (const col of ["distance_m", "hir_total", "vel_b5", "vel_b5_avg", "max_velocity", "accel_b23", "accel_b23_avg"]) expect(p).not.toHaveProperty(col);
    expect(p.measured_on).toBe("2026-11-05");
    expect(p.measured_players).toBe(11);
    expect(p.measured_no_gps).toBe(true);
  });

  it("outdoors: writes GPS and IMA, measured_no_gps false", () => {
    const p = templatePatchFromActual(base({ player_load: 142, distance_m: 641, ima_accel: 13 }), "2026-09-12")!;
    expect(p.distance_m).toBe(641);
    expect(p.ima_accel).toBe(13);
    expect(p.measured_no_gps).toBe(false);
  });

  it("an older actual without the no_gps flag is still treated as indoors when distance is ~0", () => {
    const p = templatePatchFromActual(base({ player_load: 74, distance_m: 0 }), null)!;
    expect(p).not.toHaveProperty("distance_m");
    expect(p).not.toHaveProperty("measured_on");
  });

  it("returns null when there is nothing to write", () => {
    expect(templatePatchFromActual(base({}), "2026-11-05")).toBeNull();
  });
});

describe("long runs per drill (≥18 s under the player's own band edges)", () => {
  const LEGACY = [0, 8, 12, 15, 18, 21, 24, 27, 100];
  const NEW = [0, 2.5, 5, 8, 12, 18, 24, 30, 1000];
  const CATAPULT_DEFAULT = [0, 2.5, 5, 1000, 1000, 1000, 1000, 1000, 1000];
  const fr = { events: [9, 5, 3, 2, 1, 1, 0, 0], strides: [90, 60, 40, 30, 20, 25, 0, 0] };

  it("counts bands 5–8 under the legacy edges and 6–8 under the new ones", () => {
    expect(longRunsFromBands(fr, LEGACY)).toEqual({ long_runs: 2, long_run_strides: 45 });
    expect(longRunsFromBands(fr, NEW)).toEqual({ long_runs: 1, long_run_strides: 25 });
  });
  it("is null, not 0, without an 18 s edge, without edges, or without band counts", () => {
    expect(longRunsFromBands(fr, CATAPULT_DEFAULT)).toEqual({ long_runs: null, long_run_strides: null });
    expect(longRunsFromBands(fr, null)).toEqual({ long_runs: null, long_run_strides: null });
    expect(longRunsFromBands(undefined, LEGACY)).toEqual({ long_runs: null, long_run_strides: null });
  });
  it("0 runs of 18 s+ is a real 0", () => {
    expect(longRunsFromBands({ events: [4, 1, 0, 0, 0, 0, 0, 0], strides: [40, 9, 0, 0, 0, 0, 0, 0] }, LEGACY)).toEqual({ long_runs: 0, long_run_strides: 0 });
  });
  it("applyLongRuns uses each athlete's own edges, then averages per player", () => {
    const base = csvRowsToPeriodRows([
      { periodName: "Rondo", athleteId: "A", athleteName: "A", raw: { playerLoad: "50", totalDistance: "0" } },
      { periodName: "Rondo", athleteId: "B", athleteName: "B", raw: { playerLoad: "60", totalDistance: "0" } },
    ]).map((r) => ({ ...r, frBands: fr }));
    const rows = applyLongRuns(base, (k) => (k === "A" ? LEGACY : NEW));
    expect(rows.map((r) => r.metrics.long_runs)).toEqual([2, 1]);
    expect(aggregatePeriodsPerPlayer(rows)[0].perPlayer.long_runs).toBe(1.5);
  });
  it("boundsFromDayRow trusts only well-formed, known edges", () => {
    expect(boundsFromDayRow({ ima_fr_band_bounds: LEGACY, ima_fr_bounds_source: "detected" })).toEqual(LEGACY);
    expect(boundsFromDayRow({ ima_fr_band_bounds: ["0", "8", "12", "15", "18", "21", "24", "27", "100"], ima_fr_bounds_source: "player" })).toEqual(LEGACY);
    expect(boundsFromDayRow({ ima_fr_band_bounds: LEGACY, ima_fr_bounds_source: "unknown" })).toBeNull();
    expect(boundsFromDayRow({ ima_fr_band_bounds: null })).toBeNull();
    expect(boundsFromDayRow(null)).toBeNull();
  });
  it("an indoor drill's long runs reach the drill template", () => {
    const groups = aggregatePeriodsPerPlayer(applyLongRuns(
      csvRowsToPeriodRows([{ periodName: "Rondo", athleteId: "A", athleteName: "A", raw: { playerLoad: "50", totalDistance: "0" } }]).map((r) => ({ ...r, frBands: fr })),
      () => LEGACY,
    ));
    const { items } = matchPeriodsToItems([{ drill_id: "d1", drill_name: "Rondo" }], groups);
    const patch = templatePatchFromActual(items[0].actual!, "2026-11-05")!;
    expect(patch.long_runs).toBe(2);
    expect(patch.long_run_strides).toBe(45);
    expect(patch.measured_no_gps).toBe(true);
  });
});

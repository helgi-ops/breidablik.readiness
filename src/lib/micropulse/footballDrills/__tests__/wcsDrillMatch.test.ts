import { describe, it, expect } from "vitest";
import { wcsTargetFromWindows, matchDrillsToWcs, type WcsDrillRow, type PeakWindowRow } from "../wcsDrillMatch";

const win = (o: Partial<PeakWindowRow>): PeakWindowRow => ({
  window_min: 1, hsr_m: null, vb5_m: null, vb6_m: null, player_load: null, ima_accel: null, ima_decel: null, ima_cod: null, ...o,
});

const drill = (o: Partial<WcsDrillRow>): WcsDrillRow => ({
  id: "d", label: "Drill", player_load_per_min: null, vel_b5: null, vel_b6: null, accel_b23: null, decel_b23: null, ima_cod_total: null, duration_min: 10, area_per_player_m2: 200, ...o,
});

describe("wcsTargetFromWindows", () => {
  it("builds a per-minute target from the shortest (most intense) window", () => {
    const t = wcsTargetFromWindows([
      win({ window_min: 5, hsr_m: 250, ima_accel: 20, ima_decel: 20, ima_cod: 10, player_load: 100 }),
      win({ window_min: 1, hsr_m: 90, ima_accel: 8, ima_decel: 6, ima_cod: 4, player_load: 30 }),
    ], "player");
    expect(t).not.toBeNull();
    expect(t!.windowMin).toBe(1);          // shortest window chosen
    expect(t!.hsrPerMin).toBe(90);         // 90 / 1
    expect(t!.accelDecelPerMin).toBe(14);  // (8+6)/1
    expect(t!.codPerMin).toBe(4);
    expect(t!.playerLoadPerMin).toBe(30);
    expect(t!.source).toBe("player");
  });

  it("returns null when no usable window", () => {
    expect(wcsTargetFromWindows([], "player")).toBeNull();
    expect(wcsTargetFromWindows([win({ window_min: 0, hsr_m: 50 })], "player")).toBeNull();
  });

  it("a missing quality stays null (never fabricated)", () => {
    const t = wcsTargetFromWindows([win({ window_min: 1, player_load: 30 })], "player");
    expect(t!.hsrPerMin).toBeNull();
    expect(t!.playerLoadPerMin).toBe(30);
  });
});

describe("matchDrillsToWcs", () => {
  const target = wcsTargetFromWindows([win({ window_min: 1, hsr_m: 90, ima_accel: 8, ima_decel: 6, ima_cod: 4, player_load: 30 })], "player")!;

  it("a high-PL/min small-area drill EXCEEDS the accel/decel WCS", () => {
    // 5-min drill: accel+decel = 90 → 18/min (target 14); PL/min 40 (target 30); high cod 25 → 5/min (target 4)
    const fit = matchDrillsToWcs(target, [drill({ id: "x", accel_b23: 45, decel_b23: 45, ima_cod_total: 25, player_load_per_min: 40, duration_min: 5, area_per_player_m2: 100, vel_b5: 300, vel_b6: 200 })])[0];
    expect(fit.reaches.accelDecel).toBe(true);
    expect(fit.reaches.playerLoad).toBe(true);
    expect(fit.verdict).toBe("exceeds");
    expect(fit.levers.length).toBe(0);
  });

  it("a low-intensity drill is BELOW and gets area/tempo levers", () => {
    const fit = matchDrillsToWcs(target, [drill({ id: "y", accel_b23: 5, decel_b23: 5, ima_cod_total: 2, player_load_per_min: 8, duration_min: 20, vel_b5: 20, vel_b6: 5, area_per_player_m2: 300 })])[0];
    expect(fit.verdict).toBe("below");
    expect(fit.levers.length).toBeGreaterThan(0);
    // short on accel/decel → a "shrink the area" lever aimed at ~70% of 300
    expect(fit.levers.some((l) => /shrink|minnka/i.test(l.en + l.is))).toBe(true);
  });

  it("ranks drills by overallPct (worst-case ready first)", () => {
    const ranked = matchDrillsToWcs(target, [
      drill({ id: "low", accel_b23: 5, decel_b23: 5, player_load_per_min: 8, duration_min: 20, vel_b5: 20, vel_b6: 5 }),
      drill({ id: "high", accel_b23: 45, decel_b23: 45, player_load_per_min: 40, duration_min: 5, vel_b5: 300, vel_b6: 200, ima_cod_total: 25 }),
    ]);
    expect(ranked[0].drillId).toBe("high");
  });

  it("unknown verdict when no shared metrics", () => {
    const fit = matchDrillsToWcs(target, [drill({ id: "z", duration_min: null })])[0];
    expect(fit.verdict).toBe("unknown");
    expect(fit.overallPct).toBeNull();
  });
});

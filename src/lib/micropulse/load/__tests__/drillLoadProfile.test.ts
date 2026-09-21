import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  computeDrillLoadProfile,
  profileFromDrillLoadRow,
  sessionLoadProfile,
  mergeLoadFactors,
  DEFAULT_LOAD_FACTORS,
  type LoadFactors,
} from "../drillLoadProfile";

describe("computeDrillLoadProfile — each category = Σ(measure × factor), hand-checked", () => {
  it("aerobic from HR zones", () => {
    // z3=10min ×4 + z4=5min ×7 = 40 + 35 = 75
    const p = computeDrillLoadProfile({ durationMin: 15, hrZoneMinutes: { z3: 10, z4: 5 } });
    expect(p.byCategory.aerobic).toBe(75);
    expect(p.aerobicSource).toBe("hr_zones");
  });

  it("anaerobic = distance-per-100m × band factor", () => {
    // b4=300m → 3×7=21 ; b5=100m → 1×10=10 ; total 31
    const p = computeDrillLoadProfile({ durationMin: 10, speedBandDistanceM: { b4: 300, b5: 100 } });
    expect(p.byCategory.anaerobic).toBe(31);
  });

  it("speed = effort counts × band factor", () => {
    // s1=2 ×5 + s2=1 ×10 + s3=3 ×20 = 10 + 10 + 60 = 80
    const p = computeDrillLoadProfile({ durationMin: 5, maxSpeedEffortsByBand: { s1: 2, s2: 1, s3: 3 } });
    expect(p.byCategory.speed).toBe(80);
  });

  it("muscular = accel/decel + impacts + turns × factor", () => {
    // ad: low4×5 + med2×10 + high1×20 = 20+20+20 = 60
    // impacts: high2×20 = 40 ; turns 1×20 = 20 ; total 120
    const p = computeDrillLoadProfile({
      durationMin: 20,
      accelDecel: { low: 4, med: 2, high: 1 },
      impacts: { low: 0, med: 0, high: 2 },
      turns: 1,
    });
    expect(p.byCategory.muscular).toBe(120);
  });
});

describe("dominant + total + session roll-up", () => {
  it("dominant picks the largest category", () => {
    const p = computeDrillLoadProfile({ durationMin: 10, maxSpeedEffortsByBand: { s3: 5 }, hrZoneMinutes: { z1: 5 } });
    expect(p.dominant).toBe("speed"); // 100 vs aerobic 5
    expect(p.total).toBe(p.byCategory.aerobic + p.byCategory.anaerobic + p.byCategory.speed + p.byCategory.muscular);
  });

  it("sessionLoadProfile sums across drills and reads the balance", () => {
    const a = computeDrillLoadProfile({ durationMin: 10, hrZoneMinutes: { z4: 10 } }); // aerobic 70
    const b = computeDrillLoadProfile({ durationMin: 5, maxSpeedEffortsByBand: { s3: 1 } }); // speed 20
    const s = sessionLoadProfile([a, b]);
    expect(s.byCategory.aerobic).toBe(70);
    expect(s.byCategory.speed).toBe(20);
    expect(s.total).toBe(90);
    expect(s.dominant).toBe("aerobic");
    expect(s.balance.en).toMatch(/aerobic 78%/); // 70/90
  });

  it("empty session → zero + a prompt, never a crash", () => {
    const s = sessionLoadProfile([]);
    expect(s.total).toBe(0);
    expect(s.balance.en).toMatch(/no load inputs/i);
  });
});

describe("aerobic source falls back hr_zones → mean_hr → speed_proxy → none", () => {
  it("mean_hr when no zones", () => {
    // mean 88% → z3 (×4) over 12 min = 48
    const p = computeDrillLoadProfile({ durationMin: 12, meanPctHrMax: 88 });
    expect(p.aerobicSource).toBe("mean_hr");
    expect(p.byCategory.aerobic).toBe(48);
  });

  it("speed_proxy when neither HR source, from low-speed running volume", () => {
    // b1=400m ×1 + b2=200m ×2 = (400 + 400)/100 = 8
    const p = computeDrillLoadProfile({ durationMin: 10, speedBandDistanceM: { b1: 400, b2: 200, b4: 100 } });
    expect(p.aerobicSource).toBe("speed_proxy");
    expect(p.byCategory.aerobic).toBe(8);
  });

  it("none when there is no aerobic input at all", () => {
    const p = computeDrillLoadProfile({ durationMin: 10, maxSpeedEffortsByBand: { s3: 1 } });
    expect(p.aerobicSource).toBe("none");
    expect(p.byCategory.aerobic).toBe(0);
    expect(p.note.en).toMatch(/no aerobic input/i);
  });

  it("mean %HRmax below 70 → no aerobic zone (none)", () => {
    const p = computeDrillLoadProfile({ durationMin: 10, meanPctHrMax: 60 });
    expect(p.aerobicSource).toBe("none");
    expect(p.byCategory.aerobic).toBe(0);
  });
});

describe("profileFromDrillLoadRow — GPS row mapping", () => {
  const row = {
    duration_min: 20, distance_m: 3000, hir_total: 400,
    vel_b5: 300, vel_b6: 100, max_velocity: 30,
    accel_b23: 6, decel_b23: 4, accel_total: 20, decel_total: 15,
  };

  it("vel_b6 → the >24 factor (b5), vel_b5 → the 21–24 factor (b4)", () => {
    const p = profileFromDrillLoadRow(row, 32); // MSS 32 → 30/32 = 93.75% → s2
    // anaerobic = (300×7 + 100×10)/100 = (2100 + 1000)/100 = 31
    expect(p.byCategory.anaerobic).toBe(31);
  });

  it("accel_b23 + decel_b23 → the HIGH muscular factor; remainder → low", () => {
    const p = profileFromDrillLoadRow(row, 32);
    // high = (6+4)=10 ×20 = 200 ; rest = (20+15) − 10 = 25 ×5 = 125 ; total 325
    expect(p.byCategory.muscular).toBe(325);
  });

  it("max_velocity vs MSS picks the %-of-max band (1 effort)", () => {
    const p = profileFromDrillLoadRow(row, 32); // 93.75% → s2 ×10
    expect(p.byCategory.speed).toBe(10);
    // below 85% → no speed effort
    expect(profileFromDrillLoadRow({ ...row, max_velocity: 20 }, 32).byCategory.speed).toBe(0);
  });

  it("no per-drill HR in a GPS row → aerobic unresolved", () => {
    const p = profileFromDrillLoadRow(row, 32);
    expect(p.aerobicSource).toBe("none");
    expect(p.byCategory.aerobic).toBe(0);
    expect(p.note.en).toMatch(/aerobic unresolved/i);
  });
});

describe("robustness — missing axis → 0 (never fabricated); factors are editable", () => {
  it("every axis missing → all zero, no NaN", () => {
    const p = computeDrillLoadProfile({ durationMin: 0 });
    for (const c of ["aerobic", "anaerobic", "speed", "muscular"] as const) expect(p.byCategory[c]).toBe(0);
    expect(Number.isFinite(p.total)).toBe(true);
  });

  it("non-finite measures are ignored, not propagated", () => {
    const p = computeDrillLoadProfile({ durationMin: 10, hrZoneMinutes: { z3: Number.NaN, z4: 5 } });
    expect(p.byCategory.aerobic).toBe(35); // NaN z3 dropped, z4=5 ×7
  });

  it("editing a factor changes the result", () => {
    const doubled: LoadFactors = {
      ...DEFAULT_LOAD_FACTORS,
      speedEffort: { s1: 10, s2: 20, s3: 40 },
    };
    const base = computeDrillLoadProfile({ durationMin: 5, maxSpeedEffortsByBand: { s3: 2 } });
    const tuned = computeDrillLoadProfile({ durationMin: 5, maxSpeedEffortsByBand: { s3: 2 } }, doubled);
    expect(base.byCategory.speed).toBe(40);
    expect(tuned.byCategory.speed).toBe(80);
  });
});

describe("mergeLoadFactors — safe over defaults for the persisted per-team editor", () => {
  it("no stored blob → the defaults", () => {
    expect(mergeLoadFactors(null)).toEqual(DEFAULT_LOAD_FACTORS);
    expect(mergeLoadFactors(undefined)).toEqual(DEFAULT_LOAD_FACTORS);
    expect(mergeLoadFactors({})).toEqual(DEFAULT_LOAD_FACTORS);
  });

  it("a partial blob overrides only the keys it carries", () => {
    const merged = mergeLoadFactors({ speedEffort: { s3: 30 }, muscular: { turn: 25 } });
    expect(merged.speedEffort.s3).toBe(30);
    expect(merged.speedEffort.s1).toBe(DEFAULT_LOAD_FACTORS.speedEffort.s1); // untouched
    expect(merged.muscular.turn).toBe(25);
    expect(merged.muscular.accelDecel.high).toBe(DEFAULT_LOAD_FACTORS.muscular.accelDecel.high);
  });

  it("non-finite / negative / non-numeric values fall back to the default", () => {
    const merged = mergeLoadFactors({ anaerobicSpeedBand: { b5: Number.NaN, b4: -3, b3: "x" } });
    expect(merged.anaerobicSpeedBand.b5).toBe(DEFAULT_LOAD_FACTORS.anaerobicSpeedBand.b5);
    expect(merged.anaerobicSpeedBand.b4).toBe(DEFAULT_LOAD_FACTORS.anaerobicSpeedBand.b4);
    expect(merged.anaerobicSpeedBand.b3).toBe(DEFAULT_LOAD_FACTORS.anaerobicSpeedBand.b3);
  });

  it("a merged blob then drives compute", () => {
    const f = mergeLoadFactors({ speedEffort: { s3: 40 } });
    const p = computeDrillLoadProfile({ durationMin: 5, maxSpeedEffortsByBand: { s3: 2 } }, f);
    expect(p.byCategory.speed).toBe(80); // 2 × 40
  });
});

describe("boundary — the profile lib never reaches readiness / decision / load-target modules", () => {
  it("drillLoadProfile.ts imports nothing from those engines", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../drillLoadProfile.ts"), "utf8");
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const forbidden of ["readiness", "resolveFinalState", "stage4", "athlete_decision", "decision", "loadTarget", "recommend", "prescription"]) {
      expect(imports.some((p) => p.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
    }
  });
});

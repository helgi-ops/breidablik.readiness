import { describe, it, expect } from "vitest";
import { parseCatapultCtr } from "../parseCatapultCtr";

// Mirrors a real Breiðablik Bulk-CTR export: metadata preamble, a "Player Name" header row,
// then one row per (athlete, period). Periods are Session + halves; MII peak windows exist for
// Distance only; HIR Distance is per period.
const HEADER = [
  "Player Name", "Period Name", "Period Number", "HIR Distance",
  "Velocity Band 5 Total Distance", "Velocity Band 6 Total Distance", "Total Distance", "Total Player Load",
  "MII Distance Interval 1", "MII Distance Interval 1 Start Time", "MII Distance Interval 1 End Time",
  "MII Distance Interval 2", "MII Distance Interval 2 Start Time", "MII Distance Interval 2 End Time",
  // Newly-added params (24 Aug 2026): MII Player Load intervals + RHIE + running.
  "MII Player Load Interval 1", "MII Player Load Interval 1 Start Time", "MII Player Load Interval 1 End Time",
  "RHIE Total Bouts", "RHIE Efforts Per Bout (Mean)", "Running Symmetry", "Running Imbalance", "Footstrikes",
];
const pad = (a: string[]) => { const b = a.slice(); while (b.length < HEADER.length) b.push(""); return b; };
const MATRIX = [
  ["Date:", "03/05/2026"],
  ["Start Time:", "14:48:14"],
  ["Unix Start Time:", "1777819694"],
  ["Num Periods:", "3"],
  [""],
  HEADER,
  pad(["Agust Orri T.", "Session", "0", "1082.52", "889.8", "192.72", "10500", "620",
    "207.39", "1777829156.63", "1777829216.63", "503.25", "1777827729.03", "1777827909.03",
    "9.4", "1777829150.00", "1777829210.00", "12", "3.5", "98.2", "1.8", "5400"]),
  pad(["Agust Orri T.", "Fyrri halfleikur", "1", "600", "500", "100", "5200", "310"]),
];

describe("parseCatapultCtr — real Bulk-CTR format", () => {
  it("skips the preamble, finds the header, and reads per-period high-speed + MII peak windows", () => {
    const p = parseCatapultCtr(MATRIX);
    expect(p.sessionUnixStart).toBe(1777819694);
    expect(p.athletes).toEqual(["Agust Orri T."]);
    expect(p.rows).toHaveLength(2);

    const sess = p.rows[0];
    expect(sess.periodName).toBe("Session");
    expect(sess.hirM).toBe(1082.52);      // velocity-based HIR distance, per PERIOD (not peak window)
    expect(sess.vb5M).toBe(889.8);
    expect(sess.vb6M).toBe(192.72);
    // MII peak windows: 2 distance + 1 player_load, each with clock times (alignment key)
    const dist = sess.peaks.filter((w) => w.metric === "distance");
    const pl = sess.peaks.filter((w) => w.metric === "player_load");
    expect(dist).toHaveLength(2);
    expect(dist[0]).toEqual({ metric: "distance", windowMin: 1, value: 207.39, distanceM: 207.39, startEpoch: 1777829156.63, endEpoch: 1777829216.63 });
    expect(dist[1].windowMin).toBe(3);
    expect(pl).toHaveLength(1);
    expect(pl[0]).toEqual({ metric: "player_load", windowMin: 1, value: 9.4, distanceM: 0, startEpoch: 1777829150.0, endEpoch: 1777829210.0 });

    // Newly-added per-period params.
    expect(sess.rhieBouts).toBe(12);
    expect(sess.rhieEffortsPerBoutMean).toBe(3.5);
    expect(sess.runningSymmetry).toBe(98.2);
    expect(sess.runningImbalance).toBe(1.8);
    expect(sess.footstrikes).toBe(5400);

    const half = p.rows[1];
    expect(half.periodName).toBe("Fyrri halfleikur");
    expect(half.hirM).toBe(600);
    expect(half.peaks).toHaveLength(0); // no MII columns filled for the half
    expect(half.rhieBouts).toBeNull();
  });

  it("rejects a file with no Player Name header row", () => {
    const p = parseCatapultCtr([["Foo", "Bar"], ["1", "2"]]);
    expect(p.rows).toHaveLength(0);
    expect(p.warnings[0]).toMatch(/Player Name/);
  });

  it("warns when the MII peak columns are absent (no window clock)", () => {
    const p = parseCatapultCtr([
      ["Unix Start Time:", "100"], [""],
      ["Player Name", "Period Name", "HIR Distance", "Velocity Band 5 Total Distance"],
      ["A B", "Session", "900", "700"],
    ]);
    expect(p.rows[0].hirM).toBe(900);
    expect(p.rows[0].peaks).toHaveLength(0);
    expect(p.warnings.some((w) => /MII/.test(w))).toBe(true);
  });
});

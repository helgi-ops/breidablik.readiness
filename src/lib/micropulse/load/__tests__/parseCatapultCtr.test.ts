import { test } from "vitest";
import assert from "node:assert/strict";
import { parseCatapultCtr, peakFixedWindows } from "../parseCatapultCtr";

/**
 * Trimmed OpenField "Activity Report → CSV" fixture (3 athletes, 1 Session period).
 * Ground truth from the real Breiðablik–Fram export (24 Aug 2026): NO HIR column, NO
 * "Velocity Band N Total Distance"; instead "… Average Distance (Session)" (per-band
 * session totals), MII intervals present, and RHIE means spelled with a hyphen.
 */
function activityReportMatrix(): string[][] {
  const header = [
    "Player Name", "Period Name", "Period Number",
    "Total Distance", "Total Player Load", "Total Duration",
    "Velocity Band 5 Average Distance (Session)", "Velocity Band 6 Average Distance (Session)",
    "MII Distance Interval 1", "MII Distance Interval 1 Start Time", "MII Distance Interval 1 End Time",
    "MII Player Load Interval 1", "MII Player Load Interval 1 Start Time", "MII Player Load Interval 1 End Time",
    "RHIE Total Bouts", "RHIE Bout Recovery - Mean", "Footstrikes",
  ];
  // one Session row per athlete; MII interval = a 60s window (1.0 min).
  const row = (name: string, td: number, pl: number, v5: number, v6: number, bouts: number, rec: number) => [
    name, "Session", "1",
    String(td), String(pl), "5400",
    String(v5), String(v6),
    "380", "1756062800", "1756062860",
    "95", "1756062800", "1756062860",
    String(bouts), String(rec), "3200",
  ];
  return [
    ["Date", "2026-08-24"],
    ["Unix Start Time", "1756062187"],
    ["Num Players", "3"],
    header,
    row("Aron G.", 9000, 520, 500, 120, 4, 42.5),
    row("Halldór S.", 8600, 495, 470, 90, 3, 51),
    row("Dagur Orn F.", 9400, 540, 560, 140, 5, 38),
  ];
}

test("Activity Report parses (not zero) with 3 athletes + Session rows + MII windows", () => {
  const p = parseCatapultCtr(activityReportMatrix());
  assert.equal(p.athletes.length, 3);
  assert.equal(p.rows.length, 3);
  assert.equal(p.sessionUnixStart, 1756062187);
  // MII peak windows: one distance + one player_load per Session row.
  assert.equal(p.rows[0].peaks.length, 2);
  assert.ok(p.rows[0].peaks.some((w) => w.metric === "distance"));
  assert.ok(p.rows[0].peaks.some((w) => w.metric === "player_load"));
});

test("HSR is derived from V5+V6 at the 19.8 threshold; HIR stays null", () => {
  const p = parseCatapultCtr(activityReportMatrix());
  const aron = p.rows[0];
  assert.equal(aron.hirM, null);            // no HIR column in this export
  assert.equal(aron.vb5M, 500);
  assert.equal(aron.vb6M, 120);
  assert.equal(aron.hsrM, 620);             // V5 + V6
  assert.equal(aron.sprintM, 120);          // V6
  assert.equal(aron.hsrThresholdKmh, 19.8);
});

test("a non-standard band-5 edge stores the bands but leaves HSR null (never mislabel)", () => {
  const p = parseCatapultCtr(activityReportMatrix(), { hsrBand5EdgeKmh: 18.0 });
  assert.equal(p.rows[0].vb5M, 500);        // bands still stored
  assert.equal(p.rows[0].hsrM, null);       // but not summed as HSR
  assert.ok(p.warnings.some((w) => /band-5 edge/.test(w)));
});

test("warns that HIR is absent and peak-window HSR stays gated", () => {
  const p = parseCatapultCtr(activityReportMatrix());
  assert.ok(p.warnings.some((w) => /HIR/.test(w) && /gated/.test(w)));
});

test("RHIE mean is read from the hyphen spelling", () => {
  const p = parseCatapultCtr(activityReportMatrix());
  assert.equal(p.rows[0].rhieBoutRecoveryMeanS, 42.5);
  assert.equal(p.rows[0].rhieBouts, 4);
  assert.equal(p.rows[0].footstrikes, 3200);
});

test("MII Accel/Decel interval columns parse into accel + decel peak windows", () => {
  const header = [
    "Player Name", "Period Name", "Period Number", "Total Distance", "Total Player Load", "Total Duration",
    "MII Distance Interval 1", "MII Distance Interval 1 Start Time", "MII Distance Interval 1 End Time",
    "MII IMA Acceleration Interval 1", "MII IMA Acceleration Interval 1 Start Time", "MII IMA Acceleration Interval 1 End Time",
    "MII IMA Deceleration Interval 1", "MII IMA Deceleration Interval 1 Start Time", "MII IMA Deceleration Interval 1 End Time",
  ];
  const matrix = [
    ["Unix Start Time", "1756062187"],
    header,
    ["Aron G.", "Session", "1", "9000", "520", "5400",
      "380", "1756062800", "1756062860",
      "8", "1756062900", "1756062960",   // 8 accels in a 60s window
      "11", "1756062900", "1756062960"], // 11 decels in a 60s window
  ];
  const p = parseCatapultCtr(matrix);
  const acc = p.rows[0].peaks.find((w) => w.metric === "accel");
  const dec = p.rows[0].peaks.find((w) => w.metric === "decel");
  assert.ok(acc && acc.value === 8 && acc.windowMin === 1);
  assert.ok(dec && dec.value === 11 && dec.windowMin === 1);
});

/** Fixture with fixed-time interval rows at 1 / 3 / 5-min — bare AND half-prefixed —
 *  carrying V5/V6 (HSR) and high-intensity IMA Accel/Decel/CoD (Left+Right) counts. */
function fixedBinMatrix(): string[][] {
  const header = [
    "Player Name", "Period Name", "Period Number", "Total Distance", "Total Player Load", "Total Duration",
    "Velocity Band 5 Average Distance (Session)", "Velocity Band 6 Average Distance (Session)",
    "IMA Accel High", "IMA Decel High", "IMA CoD Left High", "IMA CoD Right High",
    "MII Player Load Interval 1", "MII Player Load Interval 1 Start Time", "MII Player Load Interval 1 End Time",
  ];
  // v5,v6 → HSR = v5+v6; acc/dec High counts; cod High = codL+codR.
  const bin = (name: string, v5: number, v6: number, acc: number, dec: number, codL: number, codR: number, dur: string) =>
    ["Aron G.", name, "0", "1000", "60", dur, String(v5), String(v6),
      String(acc), String(dec), String(codL), String(codR), "20", "1756062800", "1756062860"];
  return [
    ["Unix Start Time", "1756062187"], header,
    bin("Fyrri halfleikur - 0-1", 30, 10, 3, 2, 1, 1, "60"),   // 1-min: HSR 40, acc 3, dec 2, cod 2
    bin("Fyrri halfleikur - 1-2", 50, 15, 5, 4, 2, 1, "60"),   // 1-min: HSR 65, acc 5, dec 4, cod 3 ← peaks
    bin("Fyrri halfleikur - 0-3", 90, 30, 8, 9, 3, 2, "180"),  // 3-min: HSR 120, acc 8, dec 9, cod 5 ← peaks
    bin("0-5", 100, 40, 11, 12, 4, 3, "300"),                  // 5-min: HSR 140, acc 11, dec 12, cod 7 ← peaks
    bin("5-10", 60, 20, 6, 5, 1, 1, "300"),                    // 5-min: lower
    bin("Category 1 1", 200, 100, 99, 99, 50, 50, "0"),        // not a trailing range → ignored
  ];
}

test("peakFixedWindows returns HSR + accel + decel + CoD peaks per window length, prefix-tolerant", () => {
  const peaks = peakFixedWindows(parseCatapultCtr(fixedBinMatrix()).rows);
  const get = (metric: string, win: number) => peaks.find((x) => x.metric === metric && x.windowMin === win);
  // HSR (V5+V6)
  assert.equal(get("hsr", 1)!.value, 65);
  assert.equal(get("hsr", 1)!.fromLabel, "Fyrri halfleikur - 1-2");
  assert.equal(get("hsr", 3)!.value, 120);
  assert.equal(get("hsr", 5)!.value, 140);
  // Accel / Decel High counts
  assert.equal(get("accel", 1)!.value, 5);
  assert.equal(get("decel", 3)!.value, 9);
  assert.equal(get("accel", 5)!.value, 11);
  // CoD High = Left + Right
  assert.equal(get("cod", 1)!.value, 3);
  assert.equal(get("cod", 5)!.value, 7);
});

test("peakFixedWindows keeps HSR gated but still emits IMA peaks when the band-5 edge is non-standard", () => {
  const peaks = peakFixedWindows(parseCatapultCtr(fixedBinMatrix(), { hsrBand5EdgeKmh: 18.0 }).rows);
  assert.equal(peaks.some((x) => x.metric === "hsr"), false); // HSR gated off
  assert.equal(peaks.some((x) => x.metric === "accel"), true); // counts are threshold-free
  assert.equal(peaks.some((x) => x.metric === "cod"), true);
});

test("peakFixedWindows is empty for a Session-only export (no fixed-time bins)", () => {
  assert.deepEqual(peakFixedWindows(parseCatapultCtr(activityReportMatrix()).rows), []);
});

test("still rejects a genuinely non-CTR file", () => {
  const p = parseCatapultCtr([["Foo", "Bar"], ["1", "2"]]);
  assert.equal(p.rows.length, 0);
  assert.ok(p.warnings[0].length > 0);
});

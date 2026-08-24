/**
 * Catapult OpenField CTR / session-summary (Bulk Export CTRs) parser.
 *
 * The real bulk-CTR CSV has a metadata PREAMBLE (Date, Start Time, Unix Start Time, Num
 * Periods, ...) then a header row beginning "Player Name","Period Name","Period Number", then
 * one row per (athlete, period) across up to ~1600 parameter columns. Periods are the coach's
 * time-based periods (Session, halves, drills). It carries the velocity-based HIGH-SPEED data —
 * HIR Distance, Velocity Band 5-8 distance — plus the MII (peak) Distance / Player Load windows
 * with their start/end times.
 *
 * IMPORTANT (verified against real Breidablik exports): MII peak windows exist ONLY for Distance
 * and Player Load — there is NO MII HIR/high-speed interval, and HIR Distance is per PERIOD, not
 * per peak window. So this parser captures (a) per-period HIR / velocity bands and (b) the MII
 * peak-distance windows WITH clock times (the event-time alignment key), but it CANNOT produce a
 * peak-window HIR figure — the Ju-2022 Table-2 peak score stays honestly gated until raw GPS.
 *
 * Pure, no I/O. Descriptive load context only — never touches the readiness colour or the daily
 * decision.
 */

/**
 * One MII (peak) window resolved from a row: metric + window length + value + clock.
 * `metric` is "distance" or "player_load" (the MII Player Load intervals the coach
 * added 24 Aug carry the same clock and are the preferred window-clock source for
 * peak-period alignment).
 */
export type CtrPeakWindow = {
  metric: "distance" | "player_load";
  windowMin: number;
  value: number;              // distance m or player-load AU for the window
  distanceM: number;          // back-compat: distance windows keep this; PL windows = 0
  startEpoch: number | null;
  endEpoch: number | null;
};

/** One (athlete, period) row of the CTR. */
export type CtrPeriodRow = {
  athlete: string;
  periodName: string;
  periodNumber: number | null;
  hirM: number | null;        // HIR Distance (velocity-based high-intensity running), m
  vb5M: number | null;        // Velocity Band 5 Total Distance, m
  vb6M: number | null;
  vb7M: number | null;
  vb8M: number | null;
  distanceM: number | null;   // Total Distance, m
  playerLoad: number | null;  // Total Player Load
  durationS: number | null;
  // Newly-added OpenField Reporting_Parameters (24 Aug 2026) — read when present,
  // null otherwise. RHIE = the repeated-sprint signal; running_* = mechanical /
  // asymmetry. Per-period here; the upload route lands them on the session row.
  rhieBouts: number | null;
  rhieEffortsPerBoutMean: number | null;
  rhieEffortsPerBoutMax: number | null;
  rhieEffortsPerBoutMin: number | null;
  rhieEffortDurationMeanS: number | null;
  rhieEffortRecoveryMeanS: number | null;
  rhieBoutRecoveryMeanS: number | null;
  runningSymmetry: number | null;
  runningDeviation: number | null;
  runningImbalance: number | null;
  runningSeriesCount: number | null;
  footstrikes: number | null;
  /** MII peak windows from THIS row (distance + player_load, 1/3/5-min), each with its clock. */
  peaks: CtrPeakWindow[];
};

export type CtrParse = {
  rows: CtrPeriodRow[];
  athletes: string[];
  sessionUnixStart: number | null;   // from the preamble (session/recording start epoch)
  detectedColumns: number;
  warnings: string[];
};

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").replace(/[^0-9.\-]/g, "").trim());
  return Number.isFinite(n) ? n : null;
};
const cell = (r: string[], i: number): string => (i >= 0 && i < r.length ? String(r[i] ?? "").trim().replace(/^"|"$/g, "") : "");

export function parseCatapultCtr(matrix: string[][]): CtrParse {
  const warnings: string[] = [];
  const rowsRaw = (matrix ?? []).map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "").trim().replace(/^"|"$/g, "")) : []));

  // Preamble: pull the session unix start; find the header row (starts with "Player Name").
  let sessionUnixStart: number | null = null;
  let headerIdx = -1;
  for (let i = 0; i < rowsRaw.length; i++) {
    const c0 = (rowsRaw[i][0] ?? "").toLowerCase();
    if (c0.startsWith("unix start time")) sessionUnixStart = num(rowsRaw[i][1]);
    if (c0 === "player name") { headerIdx = i; break; }
  }
  if (headerIdx < 0) return { rows: [], athletes: [], sessionUnixStart, detectedColumns: 0, warnings: ["No 'Player Name' header row — is this a Bulk CTR export?"] };

  const header = rowsRaw[headerIdx];
  const idx = (name: string): number => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  /** First header that matches any of the candidate names (defensive: OpenField display-name spellings vary). */
  const idxAny = (...names: string[]): number => { for (const nm of names) { const i = idx(nm); if (i >= 0) return i; } return -1; };
  const cAth = idx("Player Name"), cPer = idx("Period Name"), cNum = idx("Period Number");
  const cHir = idx("HIR Distance");
  const cV5 = idx("Velocity Band 5 Total Distance"), cV6 = idx("Velocity Band 6 Total Distance");
  const cV7 = idx("Velocity Band 7 Total Distance"), cV8 = idx("Velocity Band 8 Total Distance");
  const cDist = idx("Total Distance"), cPl = idx("Total Player Load"), cDur = idx("Total Duration");

  // MII (peak) interval columns for a metric prefix — Interval 1/2/3, value + start/end times.
  const miiCols = (prefix: string) => ({
    val: [1, 2, 3].map((n) => idx(`${prefix} Interval ${n}`)),
    start: [1, 2, 3].map((n) => idx(`${prefix} Interval ${n} Start Time`)),
    end: [1, 2, 3].map((n) => idx(`${prefix} Interval ${n} End Time`)),
  });
  const miiDist = miiCols("MII Distance");
  const miiPl = miiCols("MII Player Load");

  // Newly-added params (24 Aug 2026) — defensive candidate spellings.
  const cRhieBouts = idxAny("RHIE Total Bouts", "RHIE Bouts", "Total RHIE Bouts");
  const cRhieEpbMean = idxAny("RHIE Efforts Per Bout (Mean)", "RHIE Efforts Per Bout Mean", "RHIE Mean Efforts Per Bout");
  const cRhieEpbMax = idxAny("RHIE Efforts Per Bout (Max)", "RHIE Efforts Per Bout Max", "RHIE Max Efforts Per Bout");
  const cRhieEpbMin = idxAny("RHIE Efforts Per Bout (Min)", "RHIE Efforts Per Bout Min", "RHIE Min Efforts Per Bout");
  const cRhieEffDur = idxAny("RHIE Effort Duration (Mean)", "RHIE Effort Duration Mean", "RHIE Mean Effort Duration");
  const cRhieEffRec = idxAny("RHIE Effort Recovery (Mean)", "RHIE Effort Recovery Mean", "RHIE Mean Effort Recovery");
  const cRhieBoutRec = idxAny("RHIE Bout Recovery (Mean)", "RHIE Bout Recovery Mean", "RHIE Mean Bout Recovery");
  const cRunSym = idxAny("Running Symmetry", "Run Symmetry");
  const cRunDev = idxAny("Running Deviation", "Run Deviation");
  const cRunImb = idxAny("Running Imbalance", "Run Imbalance");
  const cRunSeries = idxAny("Running Series Count", "Running Series", "Run Series Count");
  const cFoot = idxAny("Footstrikes", "Foot Strikes", "Footstrike Count");

  const detected = [cAth, cPer, cHir, cV5, cV6, ...miiDist.val].filter((i) => i >= 0).length;
  if (cAth < 0 || cPer < 0 || (cHir < 0 && cV5 < 0)) {
    return { rows: [], athletes: [], sessionUnixStart, detectedColumns: detected, warnings: ["Not a CTR export — need Player Name + Period Name + a high-speed column (HIR Distance / Velocity Band 5)."] };
  }
  if (cHir < 0) warnings.push("No HIR Distance column found.");
  if (miiDist.val.every((i) => i < 0) && miiPl.val.every((i) => i < 0)) warnings.push("No MII (peak) interval columns (Distance or Player Load) — peak-window clock times will be absent.");
  if (miiPl.val.every((i) => i < 0)) warnings.push("No MII Player Load interval columns — using MII Distance windows for the peak-window clock.");

  // Read one metric's MII intervals into peak windows.
  const readPeaks = (r: string[], cols: ReturnType<typeof miiCols>, metric: "distance" | "player_load"): CtrPeakWindow[] => {
    const out: CtrPeakWindow[] = [];
    for (let k = 0; k < 3; k++) {
      const val = num(cell(r, cols.val[k]));
      if (val == null || val <= 0) continue;
      const s = num(cell(r, cols.start[k])), e = num(cell(r, cols.end[k]));
      const windowMin = s != null && e != null && e - s > 0 ? Math.round(((e - s) / 60) * 2) / 2 : null;
      if (windowMin == null || windowMin <= 0) continue;
      out.push({ metric, windowMin, value: val, distanceM: metric === "distance" ? val : 0, startEpoch: s, endEpoch: e });
    }
    return out;
  };

  const rows: CtrPeriodRow[] = [];
  const athletes = new Set<string>();
  for (let i = headerIdx + 1; i < rowsRaw.length; i++) {
    const r = rowsRaw[i];
    const athlete = cell(r, cAth), periodName = cell(r, cPer);
    if (!athlete || !periodName) continue;
    athletes.add(athlete);
    const peaks = [...readPeaks(r, miiDist, "distance"), ...readPeaks(r, miiPl, "player_load")];
    rows.push({
      athlete, periodName, periodNumber: num(cell(r, cNum)),
      hirM: num(cell(r, cHir)), vb5M: num(cell(r, cV5)), vb6M: num(cell(r, cV6)), vb7M: num(cell(r, cV7)), vb8M: num(cell(r, cV8)),
      distanceM: num(cell(r, cDist)), playerLoad: num(cell(r, cPl)), durationS: num(cell(r, cDur)),
      rhieBouts: num(cell(r, cRhieBouts)),
      rhieEffortsPerBoutMean: num(cell(r, cRhieEpbMean)),
      rhieEffortsPerBoutMax: num(cell(r, cRhieEpbMax)),
      rhieEffortsPerBoutMin: num(cell(r, cRhieEpbMin)),
      rhieEffortDurationMeanS: num(cell(r, cRhieEffDur)),
      rhieEffortRecoveryMeanS: num(cell(r, cRhieEffRec)),
      rhieBoutRecoveryMeanS: num(cell(r, cRhieBoutRec)),
      runningSymmetry: num(cell(r, cRunSym)),
      runningDeviation: num(cell(r, cRunDev)),
      runningImbalance: num(cell(r, cRunImb)),
      runningSeriesCount: num(cell(r, cRunSeries)),
      footstrikes: num(cell(r, cFoot)),
      peaks,
    });
  }
  return { rows, athletes: [...athletes], sessionUnixStart, detectedColumns: detected, warnings };
}

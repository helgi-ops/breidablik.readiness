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
  vb5M: number | null;        // Velocity Band 5 distance, m (Total, or Activity-Report "Average Distance (Session)" = per-band session total)
  vb6M: number | null;
  vb7M: number | null;
  vb8M: number | null;
  // HSR derived from velocity bands when the account's band-5 lower edge IS the
  // Ju-2022 HSR threshold (5.50 m/s = 19.8 km/h): hsrM = V5+V6, sprintM = V6
  // (7.00 m/s = 25.2 km/h). Null when the edge differs (never mislabel) or bands absent.
  hsrM: number | null;
  sprintM: number | null;
  hsrThresholdKmh: number | null;
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

/** The Ju-2022 HSR threshold (5.50 m/s). Used both as the default band-5 edge and
 *  the standard against which we decide whether V5+V6 IS the HSR sum for this account. */
const HSR_STD_KMH = 19.8;

export function parseCatapultCtr(
  matrix: string[][],
  opts?: { hsrBand5EdgeKmh?: number },
): CtrParse {
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
  // Bulk Export spells these "… Total Distance"; the Activity Report spells them
  // "… Average Distance (Session)" (verified: per-band session totals — they sum to
  // Total Distance, NOT averages-of-averages), so accept both.
  const cV5 = idxAny("Velocity Band 5 Total Distance", "Velocity Band 5 Average Distance (Session)");
  const cV6 = idxAny("Velocity Band 6 Total Distance", "Velocity Band 6 Average Distance (Session)");
  const cV7 = idxAny("Velocity Band 7 Total Distance", "Velocity Band 7 Average Distance (Session)");
  const cV8 = idxAny("Velocity Band 8 Total Distance", "Velocity Band 8 Average Distance (Session)");
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
  // The Activity Report uses hyphen forms ("RHIE Bout Recovery - Mean"); Bulk uses
  // parenthesised / plain forms. Accept all.
  const cRhieBouts = idxAny("RHIE Total Bouts", "RHIE Bouts", "Total RHIE Bouts");
  const cRhieEpbMean = idxAny("RHIE Efforts Per Bout (Mean)", "RHIE Efforts Per Bout Mean", "RHIE Efforts Per Bout - Mean", "RHIE Mean Efforts Per Bout");
  const cRhieEpbMax = idxAny("RHIE Efforts Per Bout (Max)", "RHIE Efforts Per Bout Max", "RHIE Efforts Per Bout - Max", "RHIE Max Efforts Per Bout");
  const cRhieEpbMin = idxAny("RHIE Efforts Per Bout (Min)", "RHIE Efforts Per Bout Min", "RHIE Efforts Per Bout - Min", "RHIE Min Efforts Per Bout");
  const cRhieEffDur = idxAny("RHIE Effort Duration (Mean)", "RHIE Effort Duration Mean", "RHIE Effort Duration - Mean", "RHIE Mean Effort Duration");
  const cRhieEffRec = idxAny("RHIE Effort Recovery (Mean)", "RHIE Effort Recovery Mean", "RHIE Effort Recovery - Mean", "RHIE Mean Effort Recovery");
  const cRhieBoutRec = idxAny("RHIE Bout Recovery (Mean)", "RHIE Bout Recovery Mean", "RHIE Bout Recovery - Mean", "RHIE Mean Bout Recovery");
  const cRunSym = idxAny("Running Symmetry", "Run Symmetry");
  const cRunDev = idxAny("Running Deviation", "Run Deviation");
  const cRunImb = idxAny("Running Imbalance", "Run Imbalance");
  const cRunSeries = idxAny("Running Series Count", "Running Series", "Run Series Count");
  const cFoot = idxAny("Footstrikes", "Foot Strikes", "Footstrike Count");

  const detected = [cAth, cPer, cHir, cV5, cV6, ...miiDist.val].filter((i) => i >= 0).length;
  // Accept the file when it has the athlete/period keys AND EITHER a high-speed
  // column OR any MII peak-window column. The Activity Report has no HIR column but
  // carries the MII intervals (the peak-window clock — the actual feed we need), so
  // rejecting on the missing HIR column threw away a usable export.
  const hasHiSpeed = cHir >= 0 || cV5 >= 0;
  const hasMii = miiDist.val.some((i) => i >= 0) || miiPl.val.some((i) => i >= 0);
  if (cAth < 0 || cPer < 0 || (!hasHiSpeed && !hasMii)) {
    return { rows: [], athletes: [], sessionUnixStart, detectedColumns: detected, warnings: ["Not a CTR export — need Player Name + Period Name AND a high-speed column (HIR / Velocity Band 5) or MII peak-window columns."] };
  }
  if (!hasHiSpeed) warnings.push("No HIR/high-speed column in this export — peak-window HSR (Ju-2022) stays gated; loaded distance + Player-Load peak windows and per-period load only.");
  else if (cHir < 0) warnings.push("No HIR Distance column — per-period HSR derived from velocity bands (V5+V6); peak-window HSR (Ju-2022) stays gated (MII intervals carry distance + Player Load only).");
  if (miiDist.val.every((i) => i < 0) && miiPl.val.every((i) => i < 0)) warnings.push("No MII (peak) interval columns (Distance or Player Load) — peak-window clock times will be absent.");
  if (miiPl.val.every((i) => i < 0) && miiDist.val.some((i) => i >= 0)) warnings.push("No MII Player Load interval columns — using MII Distance windows for the peak-window clock.");

  // HSR from velocity bands: only when this account's band-5 lower edge IS the Ju
  // HSR threshold (5.50 m/s = 19.8 km/h). Then V5+V6 = >19.8 km/h HSR and V6 = >25.2
  // sprint. If the edge differs, store the bands but leave hsr null (never mislabel).
  const band5EdgeKmh = opts?.hsrBand5EdgeKmh ?? HSR_STD_KMH;
  const bandsAreHsr = Math.abs(band5EdgeKmh - HSR_STD_KMH) < 0.3;
  if ((cV5 >= 0 || cV6 >= 0) && !bandsAreHsr) {
    warnings.push(`Velocity bands present but this account's band-5 edge (${band5EdgeKmh} km/h) is not the Ju HSR threshold (19.8) — bands stored, HSR left null.`);
  }

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
    const vb5 = num(cell(r, cV5)), vb6 = num(cell(r, cV6));
    // HSR = V5+V6 (both at/above the 19.8 threshold for this account); sprint = V6.
    const hsrM = bandsAreHsr && (vb5 != null || vb6 != null) ? (vb5 ?? 0) + (vb6 ?? 0) : null;
    const sprintM = bandsAreHsr ? vb6 : null;
    rows.push({
      athlete, periodName, periodNumber: num(cell(r, cNum)),
      hirM: num(cell(r, cHir)), vb5M: vb5, vb6M: vb6, vb7M: num(cell(r, cV7)), vb8M: num(cell(r, cV8)),
      hsrM, sprintM, hsrThresholdKmh: hsrM != null ? HSR_STD_KMH : null,
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

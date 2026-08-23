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

/** One MII (peak) distance window resolved from a row: window length + clock. */
export type CtrPeakWindow = { windowMin: number; distanceM: number; startEpoch: number | null; endEpoch: number | null };

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
  /** MII peak-distance windows from THIS row (1/3/5-min), each with its clock, if present. */
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
  const cAth = idx("Player Name"), cPer = idx("Period Name"), cNum = idx("Period Number");
  const cHir = idx("HIR Distance");
  const cV5 = idx("Velocity Band 5 Total Distance"), cV6 = idx("Velocity Band 6 Total Distance");
  const cV7 = idx("Velocity Band 7 Total Distance"), cV8 = idx("Velocity Band 8 Total Distance");
  const cDist = idx("Total Distance"), cPl = idx("Total Player Load"), cDur = idx("Total Duration");
  // MII (peak) distance intervals 1/2/3 + their start/end times.
  const miiVal = [1, 2, 3].map((n) => idx(`MII Distance Interval ${n}`));
  const miiStart = [1, 2, 3].map((n) => idx(`MII Distance Interval ${n} Start Time`));
  const miiEnd = [1, 2, 3].map((n) => idx(`MII Distance Interval ${n} End Time`));

  const detected = [cAth, cPer, cHir, cV5, cV6, ...miiVal].filter((i) => i >= 0).length;
  if (cAth < 0 || cPer < 0 || (cHir < 0 && cV5 < 0)) {
    return { rows: [], athletes: [], sessionUnixStart, detectedColumns: detected, warnings: ["Not a CTR export — need Player Name + Period Name + a high-speed column (HIR Distance / Velocity Band 5)."] };
  }
  if (cHir < 0) warnings.push("No HIR Distance column found.");
  if (miiVal.every((i) => i < 0)) warnings.push("No MII (peak) distance interval columns — peak-window clock times will be absent.");

  const rows: CtrPeriodRow[] = [];
  const athletes = new Set<string>();
  for (let i = headerIdx + 1; i < rowsRaw.length; i++) {
    const r = rowsRaw[i];
    const athlete = cell(r, cAth), periodName = cell(r, cPer);
    if (!athlete || !periodName) continue;
    athletes.add(athlete);
    const peaks: CtrPeakWindow[] = [];
    for (let k = 0; k < 3; k++) {
      const val = num(cell(r, miiVal[k]));
      if (val == null || val <= 0) continue;
      const s = num(cell(r, miiStart[k])), e = num(cell(r, miiEnd[k]));
      const windowMin = s != null && e != null && e - s > 0 ? Math.round(((e - s) / 60) * 2) / 2 : null;
      if (windowMin == null || windowMin <= 0) continue;
      peaks.push({ windowMin, distanceM: val, startEpoch: s, endEpoch: e });
    }
    rows.push({
      athlete, periodName, periodNumber: num(cell(r, cNum)),
      hirM: num(cell(r, cHir)), vb5M: num(cell(r, cV5)), vb6M: num(cell(r, cV6)), vb7M: num(cell(r, cV7)), vb8M: num(cell(r, cV8)),
      distanceM: num(cell(r, cDist)), playerLoad: num(cell(r, cPl)), durationS: num(cell(r, cDur)),
      peaks,
    });
  }
  return { rows, athletes: [...athletes], sessionUnixStart, detectedColumns: detected, warnings };
}

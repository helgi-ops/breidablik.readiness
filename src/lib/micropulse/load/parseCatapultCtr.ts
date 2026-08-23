/**
 * Catapult OpenField CTR / session-summary (period) export -> per-(athlete, period) rows.
 *
 * The CTR export is TIME-BASED (each period has a start/end) and carries the HIGH-SPEED data —
 * HIR Dist, Vel B5/B6 Avg Dist, Max Vel — unlike the MII widget (distance + player load only).
 * So one CTR file supplies BOTH things the contextualised peak-period flagship needs: peak-HSR
 * (the Ju-2022 Table-2 score) and the window's clock start time (event-time alignment).
 *
 * Pure, no I/O. Pattern-detects columns (OpenField templates vary) rather than fixing positions.
 * Descriptive load context only — it never touches the readiness colour or the daily decision.
 */

export type CtrRow = {
  athlete: string;
  periodLabel: string;
  /** 1/3/5 for a recognised peak window; null for a coaching period. */
  windowMin: number | null;
  /** raw period start clock string from the export (the alignment key), or null. */
  windowStart: string | null;
  windowSeconds: number | null;
  hsrM: number | null;   // HIR Dist (m)
  vb5M: number | null;   // Vel B5 Avg Dist (m)
  vb6M: number | null;   // Vel B6 Avg Dist (m)
  maxKmh: number | null; // Max Vel (km/h)
  playerLoad: number | null; // Avg PL
  distanceM: number | null;  // Avg Dist (m)
};

export type CtrParse = {
  rows: CtrRow[];
  athletes: string[];
  detectedColumns: number;
  warnings: string[];
};

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").replace(/[^0-9.\-]/g, "").trim());
  return Number.isFinite(n) ? n : null;
};

/** Parse a duration cell to seconds: "mm:ss", "h:mm:ss", a plain seconds number, or decimal minutes. */
function durationSeconds(v: string): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const clock = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (clock) { const a = Number(clock[1]), b = Number(clock[2]), c = clock[3] ? Number(clock[3]) : null; return c != null ? a * 3600 + b * 60 + c : a * 60 + b; }
  const n = num(s);
  if (n == null) return null;
  return n < 20 ? Math.round(n * 60) : Math.round(n); // small decimals read as minutes, else seconds
}

/** Recognise a peak window (1/3/5 min) from the period label and/or its duration. */
function windowMinOf(label: string, seconds: number | null): number | null {
  const l = label.toLowerCase();
  const looksPeak = /peak|rolling|max|wcs|worst/.test(l);
  const tok = l.match(/(\d+(?:\.\d+)?)\s*(?:min|m\b)/) ?? (looksPeak ? l.match(/\b(\d+(?:\.\d+)?)\b/) : null);
  if (looksPeak && tok) { const w = Math.round(Number(tok[1]) * 100) / 100; return w > 0 && w <= 15 ? w : null; }
  if (seconds != null) { const w = Math.round(seconds / 60); if ([1, 3, 5].includes(w) && Math.abs(seconds - w * 60) <= 5) return w; }
  return null;
}

const findCol = (header: string[], pred: (h: string) => boolean): number => header.findIndex((h) => pred(h.toLowerCase()));

export function parseCatapultCtr(matrix: string[][]): CtrParse {
  const warnings: string[] = [];
  const clean = (matrix ?? []).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""));
  if (clean.length < 2) return { rows: [], athletes: [], detectedColumns: 0, warnings: ["Empty or header-only export."] };
  const header = clean[0].map((h) => String(h ?? "").trim());
  const body = clean.slice(1);

  const cAth = findCol(header, (h) => /(athlete|player|full\s*name|^name$)/.test(h) && !/period|split/.test(h));
  const cPer = findCol(header, (h) => /(period|split)/.test(h) && !/start|dur|time|order|elapsed/.test(h));
  const cStart = findCol(header, (h) => /start/.test(h) && !/dist/.test(h));
  const cDur = findCol(header, (h) => /duration/.test(h) || (/period/.test(h) && /time/.test(h)));
  const cHir = findCol(header, (h) => /hir/.test(h) && /dist/.test(h));
  const cVb5 = findCol(header, (h) => /(vel\s*b5|band\s*5|\bb5\b)/.test(h) && /dist/.test(h));
  const cVb6 = findCol(header, (h) => /(vel\s*b6|band\s*6|\bb6\b)/.test(h) && /dist/.test(h));
  const cMax = findCol(header, (h) => /max\s*vel/.test(h) && /km/.test(h));
  const cPl = findCol(header, (h) => /avg\s*pl\b/.test(h) || (/player\s*load/.test(h) && !/min/.test(h)));
  const cDist = findCol(header, (h) => /avg\s*dist/.test(h) && !/(vel|band|b5|b6|hir)/.test(h));

  const cols = [cAth, cPer, cHir, cVb5, cVb6, cMax, cPl, cDist, cStart, cDur];
  const detectedColumns = cols.filter((i) => i >= 0).length;
  if (cAth < 0 || cPer < 0 || (cHir < 0 && cVb5 < 0)) {
    return { rows: [], athletes: [], detectedColumns, warnings: ["Not a CTR/period export — need athlete + period + a high-speed (HIR / Vel B5) column."] };
  }
  if (cHir < 0) warnings.push("No HIR Dist column — the Ju-2022 peak-HIR score needs HIR Dist; Vel B5/B6 only.");
  if (cStart < 0) warnings.push("No period start-time column — window clock (event-time alignment) will be absent for this file.");

  const at = (r: string[], i: number): string => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const rows: CtrRow[] = [];
  const athletes = new Set<string>();
  for (const r of body) {
    const athlete = at(r, cAth);
    const periodLabel = at(r, cPer);
    if (!athlete || !periodLabel) continue;
    athletes.add(athlete);
    const windowSeconds = cDur >= 0 ? durationSeconds(at(r, cDur)) : null;
    rows.push({
      athlete, periodLabel,
      windowMin: windowMinOf(periodLabel, windowSeconds),
      windowStart: cStart >= 0 ? (at(r, cStart) || null) : null,
      windowSeconds,
      hsrM: num(at(r, cHir)), vb5M: num(at(r, cVb5)), vb6M: num(at(r, cVb6)),
      maxKmh: num(at(r, cMax)), playerLoad: num(at(r, cPl)), distanceM: num(at(r, cDist)),
    });
  }
  return { rows, athletes: [...athletes], detectedColumns, warnings };
}

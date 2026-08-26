/**
 * StatsBomb IQ "Squad" export scoped to ONE match, ingested as a single game — pure, no IO.
 *
 * The Squad export (`Player, Minutes, Age, Height, …, Player SBD ID`) is per-90 RATE data:
 * every counting/value column is normalised to 90 minutes. That's right for a season page,
 * but a coach can also export it filtered to the last match — then each player's row is that
 * one game, still expressed per-90. Shown as-is on a single-match view it OVER-states anyone
 * who didn't play ~90' (a 25-minute sub's numbers are a 90-minute rate).
 *
 * So here we DE-NORMALISE back to real match totals with the minutes we have:
 *     raw = per90 × (minutes / 90)
 * This is exact (StatsBomb produced the per-90 by the inverse), not an estimate. Rates that
 * are already minute-invariant — %s, ratios, lengths, distances, age/height — pass through
 * untouched (a DENY list); everything else is scaled. Counting columns round to whole numbers
 * (they were integers before StatsBomb divided); value columns (xG, OBV) keep 2 dp.
 *
 * Single team only (the coach's own squad export) — the route supplies the date/opponent.
 * Descriptive football data — never a readiness signal.
 */

type Row = Record<string, unknown>;

const str = (v: unknown): string => (v == null ? "" : String(v).replace(/﻿/g, "").trim());
const num = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).trim().replace("%", "");
  if (s === "" || s === "-" || s === "N/A") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Is this the StatsBomb "Squad" export (per-player, one team, per-90 season shape)? */
export function isStatsbombSquadMatchHeader(headers: string[]): boolean {
  const h = headers.map((x) => str(x));
  const has = (n: string) => h.includes(n);
  // The Squad export's fingerprint: Player + Minutes + Player SBD ID, and NO per-match
  // "Team" column and NO Match/Date column (those belong to the per-match Match Stats file).
  return has("Player") && has("Minutes") && has("Player SBD ID") && !has("Team") && !has("Match") && !has("Date");
}

/** Columns that are already minute-invariant → never scale (percentages, ratios, lengths, static). */
function isRateColumn(header: string): boolean {
  const h = header.toLowerCase();
  return (
    h.includes("%") ||
    h.includes("ratio") ||
    h.includes("length") ||
    h.includes("distance") ||
    /\bdist\b/.test(h) ||
    h.startsWith("average ") ||
    h.includes("/shot") ||
    h.includes("footedness") ||
    h.includes("sbd id") ||
    h === "age" || h === "height" || h === "minutes"
  );
}

/** Value columns keep decimals; everything else scaled is a count → whole number. */
function isValueColumn(header: string): boolean {
  return /xg|obv|psxg|on ball value|saved above/i.test(header);
}

export type SquadMatchPlayer = {
  name: string;
  minutes: number | null;
  shots: number | null; goals: number | null; assists: number | null; xg: number | null; keyPasses: number | null; passes: number | null;
  /** Every numeric column, DE-NORMALISED to match totals, original header names. */
  metrics: Record<string, number>;
};
export type SquadMatchParse = { players: SquadMatchPlayer[] };

const IGNORE = new Set(["player", "first name", "last name", "nickname", "preferred foot", "date of birth", "current team sbd id"]);

/** De-normalise one Squad row (per-90 → this match's totals) using its Minutes. */
export function parseStatsbombSquadMatch(rows: Row[]): SquadMatchParse {
  const players: SquadMatchPlayer[] = [];
  for (const r of rows) {
    const name = str(r["Player"]) || [str(r["First Name"]), str(r["Last Name"])].filter(Boolean).join(" ");
    const minutes = num(r["Minutes"]);
    if (!name || minutes == null || minutes <= 0) continue; // can't de-normalise without minutes
    const factor = minutes / 90;

    const metrics: Record<string, number> = {};
    for (const [k, v] of Object.entries(r)) {
      if (IGNORE.has(k.toLowerCase())) continue;
      const nv = num(v);
      if (nv == null) continue;
      if (k.toLowerCase() === "minutes") { metrics[k] = nv; continue; }
      if (isRateColumn(k)) { metrics[k] = nv; continue; }         // rate → as-is
      const raw = nv * factor;                                    // per-90 → this match
      metrics[k] = isValueColumn(k) ? Math.round(raw * 100) / 100 : Math.round(raw);
    }

    const pick = (...keys: string[]): number | null => {
      for (const key of keys) if (key in metrics) return metrics[key];
      return null;
    };
    players.push({
      name, minutes,
      shots: pick("Shots", "Non Penalty Shots"),
      goals: pick("Goals & Penalty Goals", "Non Penalty Goals"),
      assists: pick("Assists"),
      xg: pick("xG", "Non Penalty xG"),
      keyPasses: pick("Key Passes", "Non Throw-in Key Passes"),
      passes: pick("Open Play Passes", "Passes"),
      metrics,
    });
  }
  return { players };
}

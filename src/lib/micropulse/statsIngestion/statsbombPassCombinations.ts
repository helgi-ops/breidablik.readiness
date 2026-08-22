/**
 * StatsBomb "Passing Combinations" CSV parser — pure, no IO.
 *
 * Columns: Team, Passer, Receiver, Passes, OBV. One row per directed passer->receiver
 * link in a single match (the file carries no Match/Date column — the coach supplies the
 * date at upload, and no pitch coordinates). Both teams appear; the club is inferred as
 * the most frequent team so each row gets side = own/opp. Output feeds sb_pass_combinations.
 *
 * Descriptive football data — never touches the readiness colour or the daily decision.
 */

import { normTeam } from "./wyscoutTeamStats";
import { normalizeName } from "./nameMatch";

type Row = Record<string, unknown>;
const str = (v: unknown): string => (v == null ? "" : String(v).trim());
const num = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).trim().replace("%", "");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export type PassCombination = {
  teamName: string;
  passerName: string;
  passerRef: string;
  receiverName: string;
  receiverRef: string;
  passes: number | null;
  obv: number | null;
  raw: Record<string, unknown>;
};

/** A Passing Combinations file is the only StatsBomb export with BOTH Passer and Receiver. */
export function isStatsbombPassCombinationsHeader(headers: string[]): boolean {
  const h = headers.map((x) => str(x).toLowerCase());
  return h.includes("passer") && h.includes("receiver");
}

/** Which team is "the club" (most rows) — so each edge can be tagged own vs opp downstream. */
export function inferCombinationsClub(rows: Row[]): string | null {
  const counts = new Map<string, { name: string; n: number }>();
  for (const r of rows) {
    const t = str(r["Team"]);
    if (!t) continue;
    const k = normTeam(t);
    const e = counts.get(k) ?? { name: t, n: 0 };
    e.n++; counts.set(k, e);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.name ?? null;
}

export function parseStatsbombPassCombinations(
  rows: Row[],
): { combinations: PassCombination[]; skipped: { row: string; reason: string }[] } {
  const skipped: { row: string; reason: string }[] = [];
  const combinations: PassCombination[] = [];
  for (const r of rows) {
    const teamName = str(r["Team"]);
    const passerName = str(r["Passer"]);
    const receiverName = str(r["Receiver"]);
    if (!teamName || !passerName || !receiverName) {
      skipped.push({ row: `${teamName} ${passerName}->${receiverName}`, reason: "missing team/passer/receiver" });
      continue;
    }
    combinations.push({
      teamName,
      passerName, passerRef: normalizeName(passerName),
      receiverName, receiverRef: normalizeName(receiverName),
      passes: num(r["Passes"]),
      obv: num(r["OBV"]),
      raw: { Team: teamName, Passer: passerName, Receiver: receiverName, Passes: r["Passes"] ?? null, OBV: r["OBV"] ?? null },
    });
  }
  return { combinations, skipped };
}

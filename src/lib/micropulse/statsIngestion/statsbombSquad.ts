/**
 * StatsBomb IQ "Squad" CSV parser — pure, no IO.
 *
 * The coach exports StatsBomb IQ → Squad → CSV: one row per player, season
 * aggregates. Crucially StatsBomb reports rate stats **per 90** while `Minutes`
 * is a season total — so we compute the coach-facing TOTALS (per-90 × minutes/90)
 * for the core counting fields (matching the Wyscout totals convention) and keep
 * the raw per-90 values in `metrics` tagged `unit: "per90"` so nothing is mislabelled.
 *
 * Output is the same normalized `PlayerSeasonStat` the Wyscout Excel adapter emits,
 * so the upload route reuses the exact resolve + commit machinery (name-matcher →
 * stat_player_mapping, idempotent upsert into player_season_stats). Stable identity
 * is the StatsBomb `Player SBD ID`. The empty Iceland 360 columns are dropped.
 *
 * Descriptive football data — never touches the readiness colour.
 */

import type { PlayerSeasonStat } from "./types";

type Row = Record<string, unknown>;
const str = (v: unknown): string => (v == null ? "" : String(v).trim());
const num = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).trim().replace("%", "");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const normName = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const DROP360 = /^(Line Breaking Passes|Ball Receipts in Space|Space Received)/i;

/** Is this header a StatsBomb squad export (vs a Wyscout player list)? */
export function isStatsbombSquadHeader(headers: string[]): boolean {
  const h = headers.map((x) => str(x));
  // The per-player name column is "Player" in the Squad export but "Name" in the
  // Player Stats export — accept either (or First/Last). The StatsBomb tell (OBV /
  // Non Penalty xG / SBD ID) keeps this from ever matching a Wyscout player list.
  const hasName = h.includes("Player") || h.includes("Name") || (h.includes("First Name") && h.includes("Last Name"));
  const hasSbTell = h.includes("Player SBD ID") || h.includes("OBV") || h.includes("Non Penalty xG");
  return hasName && hasSbTell;
}

export function parseStatsbombSquad(
  rows: Row[],
  ctx: { teamId: string; season: string; sourceRef?: string | null },
): { stats: PlayerSeasonStat[]; skipped: { player: string; team: string; reason: string }[] } {
  const stats: PlayerSeasonStat[] = [];
  const skipped: { player: string; team: string; reason: string }[] = [];

  for (const r of rows) {
    const name = str(r["Player"]) || str(r["Name"]) || [str(r["First Name"]), str(r["Last Name"])].filter(Boolean).join(" ").trim();
    if (!name) { skipped.push({ player: "", team: "", reason: "no player name" }); continue; }
    const minutes = num(r["Minutes"]);
    const factor = minutes != null ? minutes / 90 : null;
    const total = (per90: number | null): number | null => (per90 != null && factor != null ? per90 * factor : null);
    const rint = (v: number | null): number | null => (v == null ? null : Math.round(v));
    const r2 = (v: number | null): number | null => (v == null ? null : Math.round(v * 100) / 100);

    // Keep the whole (non-360) row in metrics as the raw per-90 values.
    const metrics: Record<string, number | string | null> = {};
    for (const [k, v] of Object.entries(r)) {
      if (DROP360.test(k)) continue;
      const nv = num(v);
      if (nv != null) metrics[k] = nv;
      else if (str(v) !== "") metrics[k] = str(v);
    }
    metrics.unit = "per90"; // StatsBomb squad rate stats are per-90; Minutes is a total.

    const sbid = str(r["Player SBD ID"]);
    stats.push({
      teamId: ctx.teamId, season: ctx.season, source: "statsbomb_csv", sourceRef: ctx.sourceRef ?? null,
      sourcePlayerRef: sbid ? `sb:${sbid}` : `sbname:${normName(name)}`,
      wyscoutPlayerName: name,
      minutes,
      goals: rint(total(num(r["Goals & Penalty Goals"]) ?? num(r["Goals & Pen Goals"]) ?? num(r["Non Penalty Goals"]))),
      assists: rint(total(num(r["Assists"]))),
      xg: r2(total(num(r["Non Penalty xG"]))),
      shots: rint(total(num(r["Non Penalty Shots"]))),
      metrics,
    });
  }
  return { stats, skipped };
}

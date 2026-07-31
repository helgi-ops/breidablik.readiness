/**
 * Roll up per-game basketball box scores into a season aggregate per player,
 * shaped as a PlayerSeasonStat whose `metrics` use the EXACT keys the basketball
 * catalog (playerBasketballStats) reads — so the coach page, player card and AI
 * summary render the feed with zero extra wiring, the same season row Wyscout
 * produces for football.
 *
 * Counting stats become per-game (how basketball is read). Shooting % sums
 * makes/attempts across games (correct — not an average of per-game %). A stat
 * never reported stays null → renders "–", never 0.
 */

import type { BasketballBoxScoreRow } from "./types";
import type { PlayerSeasonStat } from "@/lib/micropulse/statsIngestion/types";

type Key = keyof BasketballBoxScoreRow;

const round = (n: number, d = 2) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/** Sum only the defined values; null if none were reported. */
function sumOrNull(rows: BasketballBoxScoreRow[], k: Key): number | null {
  let sum = 0;
  let seen = false;
  for (const r of rows) {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) { sum += v; seen = true; }
  }
  return seen ? sum : null;
}

/** Per-game average over the player's games; null if the stat was never reported. */
function perGame(rows: BasketballBoxScoreRow[], k: Key, games: number): number | null {
  const s = sumOrNull(rows, k);
  return s == null || games <= 0 ? null : round(s / games, 1);
}

/** makes/attempts as a %; null if no attempts were reported (≠ 0%). */
function pct(rows: BasketballBoxScoreRow[], made: Key, att: Key): number | null {
  const a = sumOrNull(rows, att);
  const m = sumOrNull(rows, made);
  if (a == null || a === 0 || m == null) return null;
  return round((m / a) * 100, 1);
}

export function rollupBasketballSeason(
  rows: BasketballBoxScoreRow[],
  teamId: string,
  season: string,
): PlayerSeasonStat[] {
  // Group by the stable per-source player ref.
  const byPlayer = new Map<string, BasketballBoxScoreRow[]>();
  for (const r of rows) {
    const arr = byPlayer.get(r.sourcePlayerRef) ?? [];
    arr.push(r);
    byPlayer.set(r.sourcePlayerRef, arr);
  }

  const out: PlayerSeasonStat[] = [];
  for (const [ref, gs] of byPlayer) {
    const games = gs.length;
    const totalMin = sumOrNull(gs, "minutes");

    // True shooting %: PTS / (2 * (FGA + 0.44*FTA)). Null if the inputs are absent.
    const pts = sumOrNull(gs, "points");
    const fga = sumOrNull(gs, "fga");
    const fta = sumOrNull(gs, "fta");
    const tsDen = (fga ?? 0) + 0.44 * (fta ?? 0);
    const ts = pts != null && (fga != null || fta != null) && tsDen > 0 ? round((pts / (2 * tsDen)) * 100, 1) : null;

    // Assist-to-turnover: sum(AST)/sum(TO). Null if turnovers absent/zero.
    const ast = sumOrNull(gs, "assists");
    const to = sumOrNull(gs, "turnovers");
    const astTo = ast != null && to != null && to > 0 ? round(ast / to, 2) : null;

    const metrics: Record<string, number | string | null> = {
      "Games": games,
      "Points per game": perGame(gs, "points", games),
      "Rebounds per game": perGame(gs, "reb", games),
      "Assists per game": perGame(gs, "assists", games),
      "Steals per game": perGame(gs, "steals", games),
      "Blocks per game": perGame(gs, "blocks", games),
      "Turnovers per game": perGame(gs, "turnovers", games),
      "Offensive rebounds per game": perGame(gs, "oreb", games),
      "Defensive rebounds per game": perGame(gs, "dreb", games),
      "Field goals %": pct(gs, "fgm", "fga"),
      "Three-point %": pct(gs, "tpm", "tpa"),
      "Free throws %": pct(gs, "ftm", "fta"),
      "True shooting %": ts,
      "Assist to turnover": astTo,
      "Efficiency": perGame(gs, "efficiency", games),
    };

    out.push({
      teamId,
      season,
      // Football-typed core columns stay null for basketball; everything lives in
      // `metrics`, keyed for the basketball catalog. Minutes = season total.
      minutes: totalMin,
      metrics,
      source: "baskethotel", // umbrella season provenance; per-game rows keep the exact vendor
      sourceRef: null,
      sourcePlayerRef: ref,
      wyscoutPlayerName: gs[0].playerName,
    });
  }
  return out;
}

/**
 * pitchSession / gapDrills
 *
 * Slice 4a of Move 2: turn each player's under-exposure to a MATCH demand into
 * drill recommendations, and roll those up to the team session. Two pure pieces:
 *  - `exposureToDemand` crosswalks a match-vs-training exposure ratio into the
 *    football recommender's `PlayerDemand` (a synthesized z that trips the
 *    recommender's gap threshold when the player trains a quality below his own
 *    match demand — train-like-you-play).
 *  - `aggregateGapDrills` ranks the recommended drills by how many players' gaps
 *    each one closes, so the coach sees the drills that help the most
 *    under-exposed players.
 *
 * Descriptive/advisory; screening-grade (means, not per-90 physiology). Pure — no
 * IO. Type-only imports from the recommender keep this client-safe.
 */

import type { PlayerDemand, DrillRec, DrillQuality } from "@/lib/micropulse/footballDrills/recommend";

/**
 * Crosswalk a quality's match demand + training exposure into a `PlayerDemand`.
 * `pct = train/match ×100`; `z = clamp((pct−100)/20, −2, 2)` so pct 90 → z −0.5
 * (the recommender's GAP_Z, first gap band) and pct 80 → −1 (TLYP's <80% "gap").
 * Returns null when there's no match reference (matchMean ≤ 0).
 */
export function exposureToDemand(
  quality: DrillQuality,
  matchMean: number,
  trainMean: number,
): PlayerDemand | null {
  if (!(matchMean > 0)) return null;
  const pct = (trainMean / matchMean) * 100;
  const z = Math.max(-2, Math.min(2, (pct - 100) / 20));
  return { quality, value: matchMean, z };
}

export type PlayerGapRecs = { playerId: string; name: string; recs: DrillRec[] };

export type TeamGapDrill = {
  id: string;
  name: string;
  category: string | null;
  /** Names of players whose gap this drill closes. */
  players: string[];
  /** The gap qualities this drill loads (across those players). */
  qualities: DrillQuality[];
  /** Number of players covered — the ranking key. */
  coverage: number;
};

/**
 * Roll each player's GAP recommendations up to the team: which drills close the
 * most players' under-exposure gaps. Deduped by drill id; ranked by coverage.
 */
export function aggregateGapDrills(players: PlayerGapRecs[]): TeamGapDrill[] {
  const byId = new Map<string, { name: string; category: string | null; players: Set<string>; qualities: Set<DrillQuality> }>();
  for (const p of players) {
    for (const rec of p.recs) {
      if (rec.kind !== "gap") continue;
      for (const d of rec.drills) {
        let e = byId.get(d.id);
        if (!e) { e = { name: d.name, category: d.category, players: new Set(), qualities: new Set() }; byId.set(d.id, e); }
        e.players.add(p.name);
        e.qualities.add(rec.quality);
      }
    }
  }
  return [...byId.entries()]
    .map(([id, e]) => ({ id, name: e.name, category: e.category, players: [...e.players], qualities: [...e.qualities], coverage: e.players.size }))
    .sort((a, b) => b.coverage - a.coverage);
}

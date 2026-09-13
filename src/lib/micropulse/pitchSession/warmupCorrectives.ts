/**
 * pitchSession / warmupCorrectives
 *
 * Slice 3 of Move 2: aggregate the squad's individualised prehab correctives (from
 * the reconciled deficit ledger) for the team warm-up. A corrective needed by
 * several players becomes a shared TEAM warm-up addition; the rest are per-player
 * extras. This is the meaningful "dedupe" axis for a team pitch session (the
 * football session has no movement-quality tags on drills, unlike the strength
 * engine's emphasis-vs-emphasis merge). Descriptive/advisory; never a colour.
 *
 * Pure — no IO.
 */

import type { SessionCorrective } from "@/lib/micropulse/strengthProgramming/types";

export type PlayerCorrectives = { playerId: string; name: string; correctives: SessionCorrective[] };

export type AggregatedCorrective = Pick<
  SessionCorrective,
  "slug" | "nameEN" | "nameIS" | "doseEN" | "doseIS" | "cueEN" | "cueIS"
> & { playerNames: string[]; count: number };

export type WarmupAggregation = {
  /** Correctives shared by ≥ minShared players — candidates for the team warm-up. */
  teamCommon: AggregatedCorrective[];
  /** Per-player correctives that aren't team-common. */
  individual: PlayerCorrectives[];
};

/**
 * Split the squad's correctives into team-common (shared by `minShared`+ players,
 * default 2) and individual. Keyed by corrective `slug`; deduped within a player.
 */
export function aggregateWarmupCorrectives(
  players: PlayerCorrectives[],
  opts?: { minShared?: number },
): WarmupAggregation {
  const minShared = opts?.minShared ?? 2;

  const bySlug = new Map<string, { c: SessionCorrective; players: string[] }>();
  for (const p of players) {
    const seen = new Set<string>();
    for (const c of p.correctives) {
      if (seen.has(c.slug)) continue; // one vote per player per corrective
      seen.add(c.slug);
      const entry = bySlug.get(c.slug);
      if (entry) entry.players.push(p.name);
      else bySlug.set(c.slug, { c, players: [p.name] });
    }
  }

  const commonSlugs = new Set<string>();
  const teamCommon: AggregatedCorrective[] = [];
  for (const [slug, { c, players: names }] of bySlug) {
    if (names.length >= minShared) {
      commonSlugs.add(slug);
      teamCommon.push({
        slug, nameEN: c.nameEN, nameIS: c.nameIS, doseEN: c.doseEN, doseIS: c.doseIS,
        cueEN: c.cueEN, cueIS: c.cueIS, playerNames: names, count: names.length,
      });
    }
  }
  teamCommon.sort((a, b) => b.count - a.count);

  const individual: PlayerCorrectives[] = players
    .map((p) => ({ playerId: p.playerId, name: p.name, correctives: p.correctives.filter((c) => !commonSlugs.has(c.slug)) }))
    .filter((p) => p.correctives.length > 0);

  return { teamCommon, individual };
}

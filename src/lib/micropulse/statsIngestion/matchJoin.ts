/**
 * Same-match football-vs-physical join (pure, IO-free).
 *
 * Anchors on a player's Wyscout per-match football stats (player_match_stats)
 * and attaches his physical output (GPS/IMA) + match minutes for the SAME
 * (player_id, match_date). Ready to render the moment player_match_stats has
 * rows — but that table is populated ONLY by Adapter B (the Wyscout Data API),
 * so today the join yields nothing and the UI shows the labelled empty state.
 * Descriptive — never a readiness signal.
 */

export type MatchFootball = {
  playerId: string;
  matchDate: string;
  opponent: string | null;
  homeAway: "home" | "away" | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  xg: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  passAccuracyPct: number | null;
};

export type MatchPhysical = {
  playerId: string;
  matchDate: string;
  distanceKm: number | null;
  topSpeed: number | null;
  playerLoad: number | null;
};

export type MatchMinutes = { playerId: string; matchDate: string; minutes: number | null };

export type JoinedMatchRow = MatchFootball & {
  physical: { distanceKm: number | null; topSpeed: number | null; playerLoad: number | null; matchMinutes: number | null };
};

const key = (playerId: string, matchDate: string) => `${playerId}|${matchDate}`;

/** Join football (anchor) to physical + minutes on (player_id, match_date). */
export function joinMatchFootballPhysical(
  football: MatchFootball[],
  physical: MatchPhysical[],
  minutes: MatchMinutes[],
): JoinedMatchRow[] {
  const physIdx = new Map<string, MatchPhysical>();
  for (const p of physical) physIdx.set(key(p.playerId, p.matchDate), p);
  const minIdx = new Map<string, number | null>();
  for (const m of minutes) minIdx.set(key(m.playerId, m.matchDate), m.minutes);

  return football
    .map((f) => {
      const p = physIdx.get(key(f.playerId, f.matchDate));
      return {
        ...f,
        physical: {
          distanceKm: p?.distanceKm ?? null,
          topSpeed: p?.topSpeed ?? null,
          playerLoad: p?.playerLoad ?? null,
          matchMinutes: minIdx.get(key(f.playerId, f.matchDate)) ?? null,
        },
      };
    })
    .sort((a, b) => (a.matchDate < b.matchDate ? 1 : a.matchDate > b.matchDate ? -1 : a.playerId.localeCompare(b.playerId)));
}

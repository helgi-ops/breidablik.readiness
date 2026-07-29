/**
 * Match Intensity — 1st vs 2nd half (IMA fade across the match).
 *
 * Pure, IO-free engine. Takes per-half period rows (already fetched from
 * `player_drill_load`) and computes, per player per match, how far a player's
 * high-intensity movement fell from the first half to the second — normalised
 * PER MINUTE so unequal half lengths, substitutions and stoppage time don't
 * confound the read. Then a per-player rolling figure (his typical fade) and a
 * squad figure.
 *
 * This is a conditioning / rotation CONTEXT signal (Akenhead 2013; Mohr 2003),
 * NOT a readiness verdict and NOT injury prediction — it must never touch
 * `v_coach_readiness_today_v8.final_color` or the daily decision.
 *
 * Honesty gates (manifesto):
 *  - Both halves, meaningful minutes: a match counts only if BOTH halves have
 *    ≥ MIN_HALF_MINUTES. A sub who played one half has no delta → excluded
 *    (surfaced as "–", never a fabricated number).
 *  - Confidence = matches behind it. Below MIN_MATCHES_CONFIDENT the read is
 *    "building", never a confident verdict (a −74% off one match is not a
 *    −35% off eight).
 *  - No-data ≠ zero. A player with half rows but zero qualifying matches is
 *    returned with nMatches = 0 and null figures.
 */

/** One half of one match for one player (a row of `player_drill_load`). */
export type HalfPeriodRow = {
  playerId: string;
  playerName: string;
  position?: string | null;
  /** Usually NULL on real half rows — the match is keyed by player + date, not this. */
  savedSessionId?: string | null;
  sessionDate: string; // ISO yyyy-mm-dd
  half: 1 | 2;
  durationMin: number;
  highIma: number;
  imaAccel: number;
  imaDecel: number;
  imaCodTotal: number;
  hirTotal?: number | null;
  playerLoadPerMin?: number | null;
};

export type MovementDriver = "accel" | "decel" | "cod";

/** One qualifying match (both halves ≥ MIN_HALF_MINUTES) for one player. */
export type MatchFade = {
  savedSessionId: string | null;
  sessionDate: string;
  h1HighPerMin: number;
  h2HighPerMin: number;
  /** (h2/h1 − 1) × 100 for high-intensity IMA/min. Negative = a 2nd-half fade. */
  pctChangeHigh: number;
  h1TotalPerMin: number;
  h2TotalPerMin: number;
  pctChangeTotal: number;
  h1HirPerMin: number | null;
  h2HirPerMin: number | null;
  h1PlPerMin: number | null;
  h2PlPerMin: number | null;
  /** Which movement fell most from h1→h2 (per-min), for the plain "why". */
  driver: MovementDriver | null;
};

export type FadeConfidence = "building" | "moderate" | "high";

export type PlayerFade = {
  playerId: string;
  playerName: string;
  position: string | null;
  /** Qualifying matches, newest first. */
  matches: MatchFade[];
  nMatches: number;
  /** Rolling typical fade = mean pctChangeHigh across qualifying matches. */
  typicalPctChangeHigh: number | null;
  /** Most recent qualifying match's fade. */
  latestPctChangeHigh: number | null;
  meanH1HighPerMin: number | null;
  meanH2HighPerMin: number | null;
  confidence: FadeConfidence;
  /** Movement that dropped most across his qualifying matches (aggregate). */
  driver: MovementDriver | null;
};

export type TeamFade = {
  /** Players with ≥ 1 qualifying match. */
  nPlayers: number;
  nMatches: number;
  h1HighPerMin: number;
  h2HighPerMin: number;
  pctChangeHigh: number;
  h1TotalPerMin: number;
  h2TotalPerMin: number;
  pctChangeTotal: number;
};

// ── Cited constants ──────────────────────────────────────────────────────────
/** Both-halves gate: each half must have at least this many minutes to count. */
export const MIN_HALF_MINUTES = 20;
/** Below this many qualifying matches the read is "building", not confident. */
export const MIN_MATCHES_CONFIDENT = 3;
/** At/above this many matches the personal norm is treated as mature. */
export const MATURE_MATCHES = 6;

// ── Half classifier (spelling variants) ──────────────────────────────────────
/**
 * Map a Catapult period name to a match half, or null if it isn't a half.
 * Real OpenField data carries THREE naming families (verified on Breiðablik):
 *   • English:            "1st half" / "2nd half"
 *   • Icelandic accented: "Fyrri hálfleikur" / "Seinni hálfleikur"
 *   • Icelandic plain:    "Fyrri halfleikur" / "Seinni halfleikur"
 * Whole-session periods ("Auto Created Period" / "AutoCreatedPeriod") and any
 * drill/fixed period ("Period 1", "Possession", …) return null.
 */
export function classifyHalf(periodName: string | null | undefined): 1 | 2 | null {
  if (!periodName) return null;
  const p = periodName.trim().toLowerCase();
  // First half
  if (p.startsWith("fyrri h") || p.startsWith("1st h") || p.startsWith("first h")) return 1;
  // Second half
  if (p.startsWith("seinni h") || p.startsWith("2nd h") || p.startsWith("second h")) return 2;
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function round(x: number, d: number): number {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}
function perMin(total: number, minutes: number): number {
  return minutes > 0 ? total / minutes : 0;
}
function pctChange(h1: number, h2: number): number {
  return h1 > 0 ? round((h2 / h1 - 1) * 100, 1) : 0;
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function confidenceFor(n: number): FadeConfidence {
  if (n >= MATURE_MATCHES) return "high";
  if (n >= MIN_MATCHES_CONFIDENT) return "moderate";
  return "building";
}

/** Pick the movement (accel/decel/cod) with the largest per-min drop h1→h2. */
function driverOf(
  h1: { accel: number; decel: number; cod: number },
  h2: { accel: number; decel: number; cod: number },
): MovementDriver | null {
  const deltas: Array<[MovementDriver, number]> = [
    ["accel", h2.accel - h1.accel],
    ["decel", h2.decel - h1.decel],
    ["cod", h2.cod - h1.cod],
  ];
  // Only a genuine drop counts as a "driver of the fade".
  const drops = deltas.filter(([, d]) => d < 0).sort((a, b) => a[1] - b[1]);
  return drops.length ? drops[0][0] : null;
}

// ── Core ─────────────────────────────────────────────────────────────────────
/**
 * Group half rows into per-player, per-match fades. Only matches with BOTH
 * halves ≥ MIN_HALF_MINUTES qualify. Players with half rows but no qualifying
 * match are still returned (nMatches = 0, null figures) so the UI can show "–".
 */
export function computeMatchIntensityHalves(rows: HalfPeriodRow[]): PlayerFade[] {
  // player -> match-date -> { 1?: row, 2?: row }.
  // The match key is player + session_date: on real data `saved_session_id` is
  // NULL for half rows, and a player plays at most one match per day.
  const byPlayer = new Map<
    string,
    { name: string; position: string | null; sessions: Map<string, Partial<Record<1 | 2, HalfPeriodRow>>> }
  >();

  for (const r of rows) {
    if (r.half !== 1 && r.half !== 2) continue;
    if (!Number.isFinite(r.durationMin) || !Number.isFinite(r.highIma)) continue;
    if (!r.sessionDate) continue;
    let p = byPlayer.get(r.playerId);
    if (!p) {
      p = { name: r.playerName, position: r.position ?? null, sessions: new Map() };
      byPlayer.set(r.playerId, p);
    }
    let sess = p.sessions.get(r.sessionDate);
    if (!sess) { sess = {}; p.sessions.set(r.sessionDate, sess); }
    // Keep the longer row if a half somehow appears twice (defensive).
    const existing = sess[r.half];
    if (!existing || r.durationMin > existing.durationMin) sess[r.half] = r;
  }

  const out: PlayerFade[] = [];
  for (const [playerId, { name, position, sessions }] of byPlayer) {
    const matches: MatchFade[] = [];
    for (const [sessionDate, half] of sessions) {
      const a = half[1];
      const b = half[2];
      if (!a || !b) continue; // needs both halves
      if (a.durationMin < MIN_HALF_MINUTES || b.durationMin < MIN_HALF_MINUTES) continue; // meaningful minutes

      const h1High = perMin(a.highIma, a.durationMin);
      const h2High = perMin(b.highIma, b.durationMin);
      const h1Tot = perMin(a.imaAccel + a.imaDecel + a.imaCodTotal, a.durationMin);
      const h2Tot = perMin(b.imaAccel + b.imaDecel + b.imaCodTotal, b.durationMin);

      matches.push({
        savedSessionId: a.savedSessionId ?? b.savedSessionId ?? null,
        sessionDate,
        h1HighPerMin: round(h1High, 3),
        h2HighPerMin: round(h2High, 3),
        pctChangeHigh: pctChange(h1High, h2High),
        h1TotalPerMin: round(h1Tot, 2),
        h2TotalPerMin: round(h2Tot, 2),
        pctChangeTotal: pctChange(h1Tot, h2Tot),
        h1HirPerMin: a.hirTotal != null ? round(perMin(a.hirTotal, a.durationMin), 3) : null,
        h2HirPerMin: b.hirTotal != null ? round(perMin(b.hirTotal, b.durationMin), 3) : null,
        h1PlPerMin: a.playerLoadPerMin ?? null,
        h2PlPerMin: b.playerLoadPerMin ?? null,
        driver: driverOf(
          { accel: perMin(a.imaAccel, a.durationMin), decel: perMin(a.imaDecel, a.durationMin), cod: perMin(a.imaCodTotal, a.durationMin) },
          { accel: perMin(b.imaAccel, b.durationMin), decel: perMin(b.imaDecel, b.durationMin), cod: perMin(b.imaCodTotal, b.durationMin) },
        ),
      });
    }

    matches.sort((x, y) => (x.sessionDate < y.sessionDate ? 1 : x.sessionDate > y.sessionDate ? -1 : 0));
    const n = matches.length;

    // Aggregate driver across matches (most-negative summed per-min drop).
    let driver: MovementDriver | null = null;
    if (n > 0) {
      const tally: Record<MovementDriver, number> = { accel: 0, decel: 0, cod: 0 };
      for (const m of matches) if (m.driver) tally[m.driver] += 1;
      const ranked = (Object.entries(tally) as Array<[MovementDriver, number]>).sort((a, b) => b[1] - a[1]);
      driver = ranked[0][1] > 0 ? ranked[0][0] : null;
    }

    out.push({
      playerId,
      playerName: name,
      position,
      matches,
      nMatches: n,
      typicalPctChangeHigh: n > 0 ? round(mean(matches.map((m) => m.pctChangeHigh)), 1) : null,
      latestPctChangeHigh: n > 0 ? matches[0].pctChangeHigh : null,
      meanH1HighPerMin: n > 0 ? round(mean(matches.map((m) => m.h1HighPerMin)), 3) : null,
      meanH2HighPerMin: n > 0 ? round(mean(matches.map((m) => m.h2HighPerMin)), 3) : null,
      confidence: confidenceFor(n),
      driver,
    });
  }

  // Biggest fade first (most negative typical). Players with no qualifying
  // match (null) sort to the bottom; alphabetical tiebreak.
  out.sort((a, b) => {
    const av = a.typicalPctChangeHigh, bv = b.typicalPctChangeHigh;
    if (av == null && bv == null) return a.playerName.localeCompare(b.playerName);
    if (av == null) return 1;
    if (bv == null) return -1;
    return av - bv || a.playerName.localeCompare(b.playerName);
  });
  return out;
}

/** Squad fatigue signature: pooled per-match per-minute means across players. */
export function computeTeamFade(players: PlayerFade[]): TeamFade | null {
  const all = players.flatMap((p) => p.matches);
  if (all.length === 0) return null;
  const h1High = mean(all.map((m) => m.h1HighPerMin));
  const h2High = mean(all.map((m) => m.h2HighPerMin));
  const h1Tot = mean(all.map((m) => m.h1TotalPerMin));
  const h2Tot = mean(all.map((m) => m.h2TotalPerMin));
  return {
    nPlayers: players.filter((p) => p.nMatches > 0).length,
    nMatches: all.length,
    h1HighPerMin: round(h1High, 3),
    h2HighPerMin: round(h2High, 3),
    pctChangeHigh: pctChange(h1High, h2High),
    h1TotalPerMin: round(h1Tot, 2),
    h2TotalPerMin: round(h2Tot, 2),
    pctChangeTotal: pctChange(h1Tot, h2Tot),
  };
}

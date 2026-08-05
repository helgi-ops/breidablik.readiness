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

/**
 * The both-halves minutes gate scales with the sport: football halves are ~45
 * min (20 is "meaningful minutes"), but basketball halves are only ~20 min, so
 * the same 20-min gate would demand a full 40-min game. Lower it for basketball
 * so a normal rotation player (both halves ≥ 12 min) still qualifies.
 */
export function minHalfMinutesForSport(sport: string | null | undefined): number {
  return String(sport ?? "").toLowerCase() === "basketball" ? 12 : MIN_HALF_MINUTES;
}
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
export function computeMatchIntensityHalves(rows: HalfPeriodRow[], minHalfMinutes: number = MIN_HALF_MINUTES): PlayerFade[] {
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
      if (a.durationMin < minHalfMinutes || b.durationMin < minHalfMinutes) continue; // meaningful minutes

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

// ── First-half-across-matches (compare one match's 1st half to the others) ────
// Answers "how did the last match's first-half running compare to other matches?"
// Uses ONLY the first-half rows (no both-halves requirement — this isn't a fade).
// Per-minute so unequal first halves compare fairly. Running here = the signals
// stored per half: high-intensity IMA, total IMA, HIR distance, PlayerLoad/min.
// (Per-half GPS distance/HSR isn't stored — only whole-match.) Descriptive.

export const FIRST_HALF_METRICS = ["high", "total", "hir", "pl"] as const;
export type FirstHalfMetricKey = (typeof FIRST_HALF_METRICS)[number];

export type FirstHalfMatch = {
  sessionDate: string;
  minutes: number;
  /** Per-minute first-half values (null when the underlying signal is absent). */
  high: number;
  total: number;
  hir: number | null;
  pl: number | null;
};

export type FirstHalfMetricCompare = {
  key: FirstHalfMetricKey;
  latest: number | null;
  priorMean: number | null;
  priorSd: number | null;
  /** (latest − priorMean) / priorSd. null when SD is 0 or no prior. */
  z: number | null;
  /** (latest / priorMean − 1) × 100. */
  deltaPct: number | null;
  nPrior: number;
};

export type PlayerFirstHalf = {
  playerId: string;
  playerName: string;
  position: string | null;
  /** First halves, newest first. */
  matches: FirstHalfMatch[];
  latestDate: string | null;
  /** Latest first half vs the mean±SD of his prior first halves, per metric. */
  compares: FirstHalfMetricCompare[];
  confidence: FadeConfidence;
};

export type TeamFirstHalf = {
  /** Per match-date squad means (newest first). */
  matches: Array<{ sessionDate: string; nPlayers: number; high: number; total: number; hir: number | null; pl: number | null }>;
  latestDate: string | null;
  compares: FirstHalfMetricCompare[];
};

function sd(xs: number[], m: number): number {
  if (xs.length < 2) return 0;
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1));
}

/** Compare a latest value to the distribution of prior values for one metric. */
function compareLatestVsPrior(latest: number | null, prior: number[]): Omit<FirstHalfMetricCompare, "key"> {
  const nPrior = prior.length;
  if (!nPrior) return { latest, priorMean: null, priorSd: null, z: null, deltaPct: null, nPrior: 0 };
  const m = mean(prior);
  const s = sd(prior, m);
  return {
    latest,
    priorMean: round(m, 3),
    priorSd: round(s, 3),
    z: latest != null && s > 0 ? round((latest - m) / s, 2) : null,
    deltaPct: latest != null && m > 0 ? round((latest / m - 1) * 100, 1) : null,
    nPrior,
  };
}

function firstHalfOf(row: HalfPeriodRow): FirstHalfMatch {
  const min = row.durationMin;
  return {
    sessionDate: row.sessionDate,
    minutes: round(min, 1),
    high: round(perMin(row.highIma, min), 3),
    total: round(perMin(row.imaAccel + row.imaDecel + row.imaCodTotal, min), 2),
    hir: row.hirTotal != null ? round(perMin(row.hirTotal, min), 3) : null,
    pl: row.playerLoadPerMin ?? null,
  };
}

function comparesFor(matches: FirstHalfMatch[]): FirstHalfMetricCompare[] {
  const [latest, ...prior] = matches; // newest first
  return FIRST_HALF_METRICS.map((key) => {
    const latestVal = latest ? (latest[key] as number | null) : null;
    const priorVals = prior.map((m) => m[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return { key, ...compareLatestVsPrior(latestVal, priorVals) };
  });
}

/** Per-player first-half series + latest-vs-prior comparison (newest first). */
export function firstHalfSeries(rows: HalfPeriodRow[], minHalfMinutes: number = MIN_HALF_MINUTES): PlayerFirstHalf[] {
  const byPlayer = new Map<string, { name: string; position: string | null; byDate: Map<string, HalfPeriodRow> }>();
  for (const r of rows) {
    if (r.half !== 1) continue; // first halves only
    if (!r.sessionDate || !Number.isFinite(r.durationMin) || r.durationMin < minHalfMinutes) continue;
    if (!Number.isFinite(r.highIma)) continue;
    let p = byPlayer.get(r.playerId);
    if (!p) { p = { name: r.playerName, position: r.position ?? null, byDate: new Map() }; byPlayer.set(r.playerId, p); }
    const existing = p.byDate.get(r.sessionDate);
    if (!existing || r.durationMin > existing.durationMin) p.byDate.set(r.sessionDate, r);
  }

  const out: PlayerFirstHalf[] = [];
  for (const [playerId, { name, position, byDate }] of byPlayer) {
    const matches = Array.from(byDate.values())
      .map(firstHalfOf)
      .sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : a.sessionDate > b.sessionDate ? -1 : 0));
    out.push({
      playerId,
      playerName: name,
      position,
      matches,
      latestDate: matches[0]?.sessionDate ?? null,
      compares: comparesFor(matches),
      confidence: confidenceFor(matches.length),
    });
  }
  out.sort((a, b) => a.playerName.localeCompare(b.playerName));
  return out;
}

/** Squad first-half means per match-date + the latest match-day vs the others. */
export function teamFirstHalfSeries(rows: HalfPeriodRow[], minHalfMinutes: number = MIN_HALF_MINUTES): TeamFirstHalf {
  // date -> list of per-player first halves that day.
  const byDate = new Map<string, FirstHalfMatch[]>();
  const seen = new Map<string, Set<string>>(); // date -> playerIds (dedupe)
  for (const r of rows) {
    if (r.half !== 1) continue;
    if (!r.sessionDate || !Number.isFinite(r.durationMin) || r.durationMin < minHalfMinutes || !Number.isFinite(r.highIma)) continue;
    let players = seen.get(r.sessionDate);
    if (!players) { players = new Set(); seen.set(r.sessionDate, players); }
    if (players.has(r.playerId)) continue;
    players.add(r.playerId);
    const list = byDate.get(r.sessionDate) ?? [];
    list.push(firstHalfOf(r));
    byDate.set(r.sessionDate, list);
  }

  const matches = Array.from(byDate.entries())
    .map(([sessionDate, list]) => {
      const hirs = list.map((m) => m.hir).filter((v): v is number => v != null);
      const pls = list.map((m) => m.pl).filter((v): v is number => v != null);
      return {
        sessionDate,
        nPlayers: list.length,
        high: round(mean(list.map((m) => m.high)), 3),
        total: round(mean(list.map((m) => m.total)), 2),
        hir: hirs.length ? round(mean(hirs), 3) : null,
        pl: pls.length ? round(mean(pls), 3) : null,
      };
    })
    .sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : a.sessionDate > b.sessionDate ? -1 : 0));

  const [latest, ...prior] = matches;
  const compares = FIRST_HALF_METRICS.map((key) => {
    const latestVal = latest ? (latest[key] as number | null) : null;
    const priorVals = prior.map((m) => m[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return { key, ...compareLatestVsPrior(latestVal, priorVals) };
  });

  return { matches, latestDate: latest?.sessionDate ?? null, compares };
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

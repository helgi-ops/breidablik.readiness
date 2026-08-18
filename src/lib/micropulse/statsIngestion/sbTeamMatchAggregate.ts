/**
 * Aggregate a StatsBomb per-player "Match Stats" file to TEAM totals for one game — the extra
 * columns beyond the basics (xG/shots/OBV) that the recap already sums. Pure: sums the counting
 * stats and reconstructs the two ratio metrics (aerial win %, cross completion %) from each
 * player's count + own percentage. Only the columns THIS file genuinely carries are returned;
 * team-level-only metrics (PPDA, directness, possession %, shots on target, progressive passes,
 * aggressive actions, defensive-action regains, long balls, clear/counter shots) are NOT invented
 * here — they stay null until the StatsBomb team "Match Stats" summary is uploaded. Note: the
 * per-player "LB"/"LB%" column is Long Balls (confirmed against the team file), not line breaks.
 *
 * Descriptive football context — never touches readiness.
 * Cite: StatsBomb IQ metric glossary (per-player Match Stats export).
 */

export type AggPlayer = {
  shots?: number | null;
  goals?: number | null;
  xg?: number | null;
  passes?: number | null;
  assists?: number | null;
  keyPasses?: number | null;
  metrics: Record<string, number | string | null>;
};

/** First present numeric value among the given original-header keys in a player's metric bag. */
function bagNum(bag: Record<string, number | string | null>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = bag[k];
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

export type SbTeamAggregate = {
  passes_final_third: number | null;
  through_balls: number | null;
  long_balls: number | null;      // the per-player "LB" column is Long Balls (NOT line breaks)
  key_passes: number | null;
  assists: number | null;
  xg_assist: number | null;
  tackles: number | null;
  interceptions: number | null;
  fouls: number | null;
  clearances: number | null;
  aerials_won: number | null;
  aerials_total: number | null;   // reconstructed contested count (approximate for 0-win players)
  dribbles: number | null;
  dispossessed: number | null;
  cross_pct: number | null;       // completion %, weighted by attempts
};

/**
 * Sum one team's player rows to the extra team columns. Returns null for a metric when NO player
 * carried it (so the merge leaves any existing value untouched rather than zeroing it).
 */
export function aggregateSbTeamMatchStats(own: AggPlayer[]): SbTeamAggregate {
  const mv = (s: AggPlayer, ...keys: string[]) => bagNum(s.metrics, ...keys);

  // Sum a column; return null when not a single player carried it (all-missing → leave alone).
  const sumOrNull = (get: (s: AggPlayer) => number | null): number | null => {
    let any = false, total = 0;
    for (const s of own) { const v = get(s); if (v != null) { any = true; total += v; } }
    return any ? total : null;
  };

  // Aerials: contested ≈ won ÷ win%. Players who won 0 and show 0% contribute only their wins
  // (their losses can't be recovered without a "lost" column) — so the total is a slight under-count.
  let aerWon = 0, aerTot = 0, aerAny = false;
  for (const s of own) {
    const w = mv(s, "AerWin"); const pct = mv(s, "Aer%");
    if (w == null && pct == null) continue;
    aerAny = true;
    const won = w ?? 0;
    aerWon += won;
    aerTot += pct && pct > 0 ? won / (pct / 100) : won;
  }

  // Cross completion %: weight each player's % by his cross attempts.
  let crossAtt = 0, crossComp = 0, crossAny = false;
  for (const s of own) {
    const c = mv(s, "Cross"); const pct = mv(s, "Cross%");
    if (c == null) continue;
    crossAny = true;
    crossAtt += c;
    crossComp += c * ((pct ?? 0) / 100);
  }

  return {
    passes_final_third: sumOrNull((s) => mv(s, "OP F3 Pass")),
    through_balls: sumOrNull((s) => mv(s, "TB")),
    long_balls: sumOrNull((s) => mv(s, "LB")),
    key_passes: sumOrNull((s) => s.keyPasses ?? mv(s, "KP")),
    assists: sumOrNull((s) => s.assists ?? mv(s, "Assists")),
    xg_assist: (() => { const v = sumOrNull((s) => mv(s, "xG Assist")); return v == null ? null : r2(v); })(),
    tackles: sumOrNull((s) => mv(s, "T")),
    interceptions: sumOrNull((s) => mv(s, "I")),
    fouls: sumOrNull((s) => mv(s, "Fouls")),
    clearances: sumOrNull((s) => mv(s, "Clear")),
    aerials_won: aerAny ? Math.round(aerWon) : null,
    aerials_total: aerAny ? Math.round(aerTot) : null,
    dribbles: sumOrNull((s) => mv(s, "Drib")),
    dispossessed: sumOrNull((s) => mv(s, "Disp")),
    cross_pct: crossAny && crossAtt > 0 ? r1((crossComp / crossAtt) * 100) : null,
  };
}

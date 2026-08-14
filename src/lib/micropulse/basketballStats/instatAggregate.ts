/**
 * Pure aggregation of InStat basketball advanced stats — shared by the season
 * read (basketball-season-insights) and the single-game read
 * (basketball-match-insights) so both compute identically.
 *
 * All descriptive: Four Factors, tactical shot-type mix (FG playtypes + offensive
 * efficiency), and court-zone efficiency. Operate on plain rows so they work for
 * one game (array of 1) or a whole season. Never a signal, never a verdict.
 */

export type FourFactorAvg = { efgPct: number | null; toPct: number | null; orebPct: number | null; ftf: number | null; ppp: number | null; games: number };

/** Average the Four Factors across full-game team rows (metric-wise, skipping nulls). */
export function avgFactors(rows: Array<Record<string, unknown>>): FourFactorAvg {
  const mean = (key: string, dp: number) => {
    const vals = rows.map((r) => r[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const f = Math.pow(10, dp);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * f) / f : null;
  };
  return { efgPct: mean("efg_pct", 1), toPct: mean("to_pct", 1), orebPct: mean("oreb_pct", 1), ftf: mean("ftf", 1), ppp: mean("ppp", 2), games: rows.length };
}

export type ShotTypeAgg = { key: string; made: number; att: number; pct: number | null; sharePct: number | null };

/** Sum made/attempted per FG-playtype (pt_*) or efficiency (eff_*) across team rows'
 *  advanced jsonb → shooting% + share of total attempts, ranked by volume. */
export function aggregateAdvancedShots(rows: Array<{ advanced: Record<string, unknown> | null }>, prefix: "pt" | "eff"): ShotTypeAgg[] {
  const sum: Record<string, { m: number; a: number }> = {};
  const re = new RegExp(`^${prefix}_(.+)_(m|a)$`);
  for (const r of rows) {
    const adv = (r.advanced ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(adv)) {
      const mm = k.match(re);
      if (!mm || typeof v !== "number" || !Number.isFinite(v)) continue;
      const base = mm[1];
      sum[base] ??= { m: 0, a: 0 };
      if (mm[2] === "m") sum[base].m += v; else sum[base].a += v;
    }
  }
  const totalAtt = Object.values(sum).reduce((acc, s) => acc + s.a, 0);
  return Object.entries(sum)
    .map(([key, s]) => ({
      key, made: s.m, att: s.a,
      pct: s.a > 0 ? Math.round((s.m / s.a) * 1000) / 10 : null,
      sharePct: totalAtt > 0 ? Math.round((s.a / totalAtt) * 1000) / 10 : null,
    }))
    .filter((r) => r.att > 0)
    .sort((a, b) => b.att - a.att);
}

/** The six InStat court zones, in shot-map order (inside → out). */
export const ZONE_BASES = ["paint", "fg_lt2m", "fg_lt4m", "under_3pt_line", "3pt_lt8m", "3pt_gt8m"] as const;
export type ZoneAgg = { key: string; made: number; att: number; pct: number | null };
export type PlayerZones = { name: string; totalMade: number; totalAtt: number; zones: ZoneAgg[] };

/** Sum makes/attempts per court zone across a set of per-player advanced jsonb blobs. */
export function zonesFromAdvanced(advList: Array<Record<string, unknown>>): ZoneAgg[] {
  return ZONE_BASES.map((base) => {
    let m = 0, a = 0;
    for (const adv of advList) {
      const mm = adv[`zone_${base}_m`], aa = adv[`zone_${base}_a`];
      if (typeof mm === "number" && Number.isFinite(mm)) m += mm;
      if (typeof aa === "number" && Number.isFinite(aa)) a += aa;
    }
    return { key: base, made: m, att: a, pct: a > 0 ? Math.round((m / a) * 1000) / 10 : null };
  }).filter((z) => z.att > 0);
}

/** True if a per-player advanced blob carries any shot-zone band. */
export function hasZones(adv: Record<string, unknown> | null | undefined): boolean {
  if (!adv) return false;
  return ZONE_BASES.some((b) => typeof adv[`zone_${b}_a`] === "number");
}

/** Group per-player rows by name → each player's zone profile, ranked by volume. */
export function playerZonesFromRows(rows: Array<{ source_player_name: string | null; advanced: Record<string, unknown> | null }>): PlayerZones[] {
  const byPlayer = new Map<string, Array<Record<string, unknown>>>();
  for (const r of rows) {
    if (!hasZones(r.advanced)) continue;
    const name = (r.source_player_name ?? "—").trim();
    const list = byPlayer.get(name) ?? [];
    list.push(r.advanced ?? {});
    byPlayer.set(name, list);
  }
  return [...byPlayer.entries()]
    .map(([name, advList]) => {
      const zones = zonesFromAdvanced(advList);
      return { name, zones, totalMade: zones.reduce((s, z) => s + z.made, 0), totalAtt: zones.reduce((s, z) => s + z.att, 0) };
    })
    .filter((p) => p.totalAtt > 0)
    .sort((a, b) => b.totalAtt - a.totalAtt);
}

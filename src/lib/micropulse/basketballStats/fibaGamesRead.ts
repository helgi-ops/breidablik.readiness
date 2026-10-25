/**
 * Pure readers over the basketball_fiba_games box-score store (the FIBA/KKÍ feed coaches SAVE into).
 * Used as the fallback data source across the Game/Player analysis pages so a team whose only basketball
 * data is KKÍ-saved games (no InStat upload) still sees real numbers. IO stays in the routes; these are
 * pure so they're testable and shared. Descriptive — never the readiness colour.
 */

import { latestSeason } from "./season";

export type FibaBoxRow = {
  name?: string; min?: string | number | null; pts?: number; reb?: number; oreb?: number; dreb?: number; ast?: number;
  stl?: number; blk?: number; tov?: number; fgm?: number; fga?: number; tpm?: number; tpa?: number; ftm?: number; fta?: number; pm?: number | null;
};
export type FibaGame = {
  match_id?: string | null; match_date: string | null; own_name?: string | null; opp_name: string | null;
  own_box: FibaBoxRow[] | null; opp_box?: FibaBoxRow[] | null; own_totals?: Record<string, unknown> | null; opp_totals?: Record<string, unknown> | null;
  competition_code?: string | null; season: string | null;
};

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** "24:42" → 24.7 min; decimal string/number → itself; blank → 0. */
export function toMinutes(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  const mm = /^(\d+):(\d{1,2})$/.exec(s);
  if (mm) return Math.round((Number(mm[1]) + Number(mm[2]) / 60) * 10) / 10;
  const x = Number(s.replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

/** Keep only the newest season's games (by latestSeason label), sorted newest game first. */
export function scopeToCurrentSeason<T extends { season: string | null; match_date: string | null }>(games: T[]): { season: string | null; games: T[] } {
  const season = latestSeason(games.map((g) => g.season));
  const scoped = (season ? games.filter((g) => g.season === season) : games.slice());
  scoped.sort((a, b) => {
    if (a.match_date && b.match_date) return b.match_date.localeCompare(a.match_date);
    if (a.match_date) return -1; if (b.match_date) return 1; return 0;
  });
  return { season, games: scoped };
}

export type PlayerSeasonAgg = {
  key: string; name: string; gp: number; min: number; pts: number; oreb: number; dreb: number; reb: number;
  ast: number; stl: number; blk: number; tov: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
};

/** Aggregate own_box across games into a per-player season line (keyed by keyFn over the box name). */
export function aggregateOwnBox(games: FibaGame[], keyFn: (name: string) => string): PlayerSeasonAgg[] {
  const by = new Map<string, PlayerSeasonAgg>();
  for (const g of games) {
    const box = Array.isArray(g.own_box) ? g.own_box : [];
    for (const b of box) {
      const nm = (b.name ?? "").trim();
      if (!nm) continue;
      const key = keyFn(nm) || nm.toLowerCase();
      let a = by.get(key);
      if (!a) { a = { key, name: nm, gp: 0, min: 0, pts: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 }; by.set(key, a); }
      a.gp += 1; a.min += toMinutes(b.min);
      a.pts += n(b.pts); a.oreb += n(b.oreb); a.dreb += n(b.dreb); a.reb += n(b.reb); a.ast += n(b.ast);
      a.stl += n(b.stl); a.blk += n(b.blk); a.tov += n(b.tov);
      a.fgm += n(b.fgm); a.fga += n(b.fga); a.tpm += n(b.tpm); a.tpa += n(b.tpa); a.ftm += n(b.ftm); a.fta += n(b.fta);
    }
  }
  return [...by.values()];
}

/** Friendly competition label (shared across the basketball reads). */
export function competitionLabel(code: string | null | undefined): string {
  switch (String(code ?? "").toLowerCase()) {
    case "urvalsdeild-kvenna": case "urvalsdeild-karla": return "Úrvalsdeild";
    case "bonus-deild-karla": case "bonus-deild-kvenna": return "Bónus deild";
    case "1deild-kvenna": case "1deild-karla": return "1. deild";
    default: return code ? String(code) : "Annað";
  }
}
/** Seniority rank — top divisions (Úrvalsdeild / Bónus deild) rank above a 1. deild reserve side. */
const seniorRank = (code: string | null | undefined): number => (String(code ?? "").toLowerCase().includes("1deild") ? 0 : 1);

export type CompetitionOption = { code: string | null; label: string; games: number };
/** The distinct competitions (aðallið vs varalið, etc.) present in a set of games — senior first, then by
 *  game count. Lets a season read separate the main team from a lower-division reserve side. */
export function competitionsOf<T extends { competition_code?: string | null }>(games: T[]): CompetitionOption[] {
  const m = new Map<string, number>();
  for (const g of games) { const c = g.competition_code ?? ""; m.set(c, (m.get(c) ?? 0) + 1); }
  return [...m.entries()].map(([c, n]) => ({ code: c || null, label: competitionLabel(c || null), games: n }))
    .sort((a, b) => seniorRank(b.code) - seniorRank(a.code) || b.games - a.games);
}
/** Resolve the competition to show: an explicit (valid) choice, else the senior-most. */
export function resolveCompetition<T extends { competition_code?: string | null }>(games: T[], requested?: string | null): string | null {
  const opts = competitionsOf(games);
  if (requested && opts.some((o) => (o.code ?? "") === requested)) return requested || null;
  return opts[0]?.code ?? null;
}

export const pctOf = (m: number, a: number): number | null => (a > 0 ? Math.round((m / a) * 1000) / 10 : null);
/** Team points from a stored totals object (KKÍ saves store `pts`). */
export const totalsPts = (t: Record<string, unknown> | null | undefined): number => n((t as { pts?: number } | null | undefined)?.pts);

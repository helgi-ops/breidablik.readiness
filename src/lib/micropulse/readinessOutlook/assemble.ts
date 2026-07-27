/**
 * Pure assembler — turns already-fetched rows into the engine's per-player inputs.
 * Kept separate from the async DB layer (loader.ts) so it's unit-testable.
 */

import type { OutlookPlayerInput } from "./index";
import type { PlayerHistory } from "./features";

export interface RpeRow { player_id: string; session_date: string; session_load: number | null }
export interface WellnessRow { player_id: string; entry_date: string; total_score: number | null }
export interface RosterPlayer { id: string; full_name: string | null }

const DAY = 86_400_000;
const weekBucket = (dateISO: string) => Math.floor(Date.parse(`${dateISO}T00:00:00Z`) / DAY / 7);

/** Parse an MD label ("MD" → 0, "MD-2" → −2, "MD+1" → +1). Null when unparseable. */
export function parseMdOffset(mdDay: string | null | undefined): number | null {
  if (!mdDay) return null;
  const m = String(mdDay).trim().toUpperCase();
  if (m === "MD") return 0;
  const mm = m.match(/^MD([+-]\d+)$/);
  return mm ? Number(mm[1]) : null;
}

/**
 * MD-day offset of a date from the fixture list: 0 on a match, −n up to 6 days before
 * the next match, +n up to 2 days after the last one, else a deep pre-match −5. Purely
 * from `matchDates` (the team-level source of truth), so it's shared across players.
 */
export function mdOffsetForDate(dateISO: string, matchDates: string[]): number {
  const t = Date.parse(`${dateISO}T00:00:00Z`);
  let next = Infinity, prev = -Infinity;
  for (const md of matchDates) {
    const m = Date.parse(`${md}T00:00:00Z`);
    if (m >= t && m < next) next = m;
    if (m <= t && m > prev) prev = m;
  }
  const daysUntil = Number.isFinite(next) ? Math.round((next - t) / DAY) : Infinity;
  const daysSince = Number.isFinite(prev) ? Math.round((t - prev) / DAY) : Infinity;
  if (daysUntil === 0) return 0; // match day
  // The closer anchor wins: a day right after a match reads MD+1/MD+2 (recovery), even
  // if the next fixture is still days away; otherwise it's a lead-in day (−n).
  if (daysSince >= 1 && daysSince <= 2 && daysSince <= daysUntil) return daysSince;
  if (daysUntil >= 1 && daysUntil <= 6) return -daysUntil;
  if (daysSince >= 1 && daysSince <= 2) return daysSince;
  return -5;
}

/** Build the per-player engine inputs. weeksOfData = distinct check-in weeks. */
export function buildOutlookInputs(params: {
  players: RosterPlayer[];
  rpeRows: RpeRow[];
  wellnessRows: WellnessRow[];
  matchDates: string[];
}): OutlookPlayerInput[] {
  const { players, rpeRows, wellnessRows, matchDates } = params;

  const loadByPlayer = new Map<string, Map<string, number>>();
  for (const r of rpeRows) {
    const load = r.session_load;
    if (r.player_id == null || !r.session_date || load == null || !Number.isFinite(load)) continue;
    const d = String(r.session_date).slice(0, 10);
    let m = loadByPlayer.get(r.player_id);
    if (!m) { m = new Map(); loadByPlayer.set(r.player_id, m); }
    m.set(d, (m.get(d) ?? 0) + Number(load)); // sum sessions on the same day
  }

  const wellnessByPlayer = new Map<string, Map<string, number>>();
  for (const w of wellnessRows) {
    const total = w.total_score;
    if (w.player_id == null || !w.entry_date || total == null || !Number.isFinite(total)) continue;
    const d = String(w.entry_date).slice(0, 10);
    let m = wellnessByPlayer.get(w.player_id);
    if (!m) { m = new Map(); wellnessByPlayer.set(w.player_id, m); }
    m.set(d, Number(total));
  }

  // MD offsets are team-level (fixture-driven) — build once over every date seen.
  const allDates = new Set<string>();
  for (const m of loadByPlayer.values()) for (const d of m.keys()) allDates.add(d);
  for (const m of wellnessByPlayer.values()) for (const d of m.keys()) allDates.add(d);
  const mdOffsetByDate = new Map<string, number>();
  for (const d of allDates) mdOffsetByDate.set(d, mdOffsetForDate(d, matchDates));

  return players.map((p) => {
    const loadByDate = loadByPlayer.get(p.id) ?? new Map<string, number>();
    const wellnessByDate = wellnessByPlayer.get(p.id) ?? new Map<string, number>();

    // weeksOfData = distinct weeks with a check-in.
    const weeks = new Set<number>();
    for (const d of wellnessByDate.keys()) weeks.add(weekBucket(d));

    // Weekly total load (last 8 weeks by bucket order) for the stability read.
    const byWeek = new Map<number, number>();
    for (const [d, v] of loadByDate) byWeek.set(weekBucket(d), (byWeek.get(weekBucket(d)) ?? 0) + v);
    const weeklyLoads = [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v).slice(-8);

    const history: PlayerHistory = { loadByDate, wellnessByDate, mdOffsetByDate };
    return {
      playerId: p.id,
      playerName: p.full_name ?? "Player",
      history,
      weeksOfData: weeks.size,
      weeklyLoads,
    };
  });
}

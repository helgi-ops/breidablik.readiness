/**
 * Async data layer for the Signal Pack — assembles each active player's inputs from the
 * tables and runs the pure combiner. Read-only; never touches the canonical verdict.
 * Paginates past Supabase's 1000-row cap (a squad's months of rows exceed it).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeSignalPack, weeklyMonotony, type SignalPack } from "./index";

const LOAD_DAYS = 35;      // EWMA runway + a few weeks for the monotony norm
const WELLNESS_DAYS = 42;
const CMJ_DAYS = 42;

function addISO(d: string, n: number): string { const x = new Date(`${d}T00:00:00.000Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
const num = (v: unknown): number | null => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
function stdev(xs: number[]): number | null { if (xs.length < 2) return null; const m = xs.reduce((s, v) => s + v, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / xs.length); }

const PAGE = 1000;
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) { const { data } = await build(from, from + PAGE - 1); const rows = data ?? []; out.push(...rows); if (rows.length < PAGE) break; }
  return out;
}

/** Ordered daily series ending at `end` (0-filled) + how many days had real data. */
function series(byDate: Map<string, number>, end: string, days: number): { daily: number[]; coverageDays: number } {
  const daily: number[] = []; let coverageDays = 0;
  for (let i = days - 1; i >= 0; i--) { const d = addISO(end, -i); const v = byDate.get(d); daily.push(v ?? 0); if (v != null) coverageDays++; }
  return { daily, coverageDays };
}

/** Player's own average weekly monotony over the prior weeks (excludes the current week). */
function monotonyNorm(loadByDate: Map<string, number>, end: string): number | null {
  const weeks: number[] = [];
  for (let w = 1; w <= 4; w++) {
    const wk: number[] = [];
    for (let i = 0; i < 7; i++) wk.push(loadByDate.get(addISO(end, -(w * 7) - i + 6)) ?? 0);
    const m = weeklyMonotony(wk);
    if (m != null) weeks.push(m);
  }
  return mean(weeks);
}

export interface PlayerSignalPack { playerId: string; playerName: string; pack: SignalPack }

export async function loadTeamSignalPack(sb: SupabaseClient, teamId: string, asOf: string): Promise<PlayerSignalPack[]> {
  const loadSince = addISO(asOf, -LOAD_DAYS);

  const { data: playerRows } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const players = (playerRows ?? []) as Array<{ id: string; full_name: string | null }>;
  if (!players.length) return [];
  const ids = players.map((p) => p.id);

  const [rpe, gps, injuries, wellness, cmj] = await Promise.all([
    fetchAll<Record<string, unknown>>((f, t) => sb.from("session_rpe_entries").select("player_id, session_date, session_load").eq("team_id", teamId).gte("session_date", loadSince).lte("session_date", asOf).order("session_date").range(f, t)),
    fetchAll<Record<string, unknown>>((f, t) => sb.from("player_external_load_daily").select("player_id, date, decelerations, high_speed_distance").eq("team_id", teamId).gte("date", loadSince).lte("date", asOf).order("date").range(f, t)),
    fetchAll<Record<string, unknown>>((f, t) => sb.from("player_injuries").select("player_id, injury_date, actual_return_date, body_part").in("player_id", ids).order("injury_date", { ascending: false }).range(f, t)),
    fetchAll<Record<string, unknown>>((f, t) => sb.from("readiness_entries").select("player_id, entry_date, sleep_quality").in("player_id", ids).gte("entry_date", addISO(asOf, -WELLNESS_DAYS)).lte("entry_date", asOf).order("entry_date").range(f, t)),
    fetchAll<Record<string, unknown>>((f, t) => sb.from("vald_forcedecks_results").select("microplayer_id, jump_height_cm, asymmetry_percent, test_timestamp").in("microplayer_id", ids).gte("test_timestamp", `${addISO(asOf, -CMJ_DAYS)}T00:00:00`).lte("test_timestamp", `${asOf}T23:59:59`).not("jump_height_cm", "is", null).order("test_timestamp").range(f, t)),
  ]);

  // Per-player maps.
  const loadBy = new Map<string, Map<string, number>>();
  for (const r of rpe) { const pid = String(r.player_id ?? ""); const d = String(r.session_date ?? "").slice(0, 10); const v = num(r.session_load); if (!pid || !d || v == null) continue; let m = loadBy.get(pid); if (!m) { m = new Map(); loadBy.set(pid, m); } m.set(d, (m.get(d) ?? 0) + v); }
  const decelBy = new Map<string, Map<string, number>>(); const hsrBy = new Map<string, Map<string, number>>();
  for (const r of gps) { const pid = String(r.player_id ?? ""); const d = String(r.date ?? "").slice(0, 10); if (!pid || !d) continue; const dc = num(r.decelerations); const hs = num(r.high_speed_distance); if (dc != null) { let m = decelBy.get(pid); if (!m) { m = new Map(); decelBy.set(pid, m); } m.set(d, dc); } if (hs != null) { let m = hsrBy.get(pid); if (!m) { m = new Map(); hsrBy.set(pid, m); } m.set(d, hs); } }
  const injuryBy = new Map<string, { injury_date: string; actual_return_date: string | null; body_part: string | null }>();
  for (const r of injuries) { const pid = String(r.player_id ?? ""); if (!pid || injuryBy.has(pid)) continue; injuryBy.set(pid, { injury_date: String(r.injury_date ?? "").slice(0, 10), actual_return_date: r.actual_return_date ? String(r.actual_return_date).slice(0, 10) : null, body_part: (r.body_part as string | null) ?? null }); }
  const sleepBy = new Map<string, Array<{ d: string; v: number }>>();
  for (const r of wellness) { const pid = String(r.player_id ?? ""); const v = num(r.sleep_quality); const d = String(r.entry_date ?? "").slice(0, 10); if (!pid || v == null) continue; let a = sleepBy.get(pid); if (!a) { a = []; sleepBy.set(pid, a); } a.push({ d, v }); }
  const cmjBy = new Map<string, Array<{ ts: string; jump: number; asym: number | null }>>();
  for (const r of cmj) { const pid = String(r.microplayer_id ?? ""); const j = num(r.jump_height_cm); if (!pid || j == null) continue; let a = cmjBy.get(pid); if (!a) { a = []; cmjBy.set(pid, a); } a.push({ ts: String(r.test_timestamp ?? ""), jump: j, asym: num(r.asymmetry_percent) }); }

  return players.map((p) => {
    const load = loadBy.get(p.id) ?? new Map();
    const loadS = series(load, asOf, LOAD_DAYS);
    const weekLoads: number[] = []; for (let i = 6; i >= 0; i--) weekLoads.push(load.get(addISO(asOf, -i)) ?? 0);

    const inj = injuryBy.get(p.id);
    const sleepRows = (sleepBy.get(p.id) ?? []).sort((a, b) => a.d.localeCompare(b.d));
    const sleepVals = sleepRows.map((s) => s.v);
    const sleepRecent = sleepVals.length ? mean(sleepVals.slice(-5)) : null;

    const cmjRows = (cmjBy.get(p.id) ?? []).sort((a, b) => a.ts.localeCompare(b.ts));
    const latestCmj = cmjRows[cmjRows.length - 1] ?? null;
    const priorJumps = cmjRows.slice(0, -1).map((c) => c.jump);

    const pack = computeSignalPack({
      today: asOf,
      load: { daily: loadS.daily, coverageDays: loadS.coverageDays },
      decel: series(decelBy.get(p.id) ?? new Map(), asOf, LOAD_DAYS),
      hsr: series(hsrBy.get(p.id) ?? new Map(), asOf, LOAD_DAYS),
      weekLoads,
      monotonyNorm: monotonyNorm(load, asOf),
      monotonyCoverageDays: loadS.coverageDays,
      injury: { lastInjuryDate: inj?.injury_date ?? null, lastReturnDate: inj?.actual_return_date ?? null, bodyPart: inj?.body_part ?? null },
      sleep: { recent: sleepRecent, baselineMean: mean(sleepVals), baselineSd: stdev(sleepVals), coverageDays: sleepVals.length },
      cmjJump: { latest: latestCmj?.jump ?? null, baselineMean: mean(priorJumps), baselineSd: stdev(priorJumps), testCount: cmjRows.length },
      cmjAsym: { asymPct: latestCmj?.asym ?? null, testCount: cmjRows.length },
    });

    return { playerId: p.id, playerName: p.full_name ?? "Player", pack };
  });
}

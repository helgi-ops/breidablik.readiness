/**
 * The coach's per-variable setting for an in-season block (− / + in the hub's "Load per variable" table).
 *
 * The system proposes each variable's standard week (`inSeasonStandardWeek`: what the calendar week adds up to,
 * as × a match). The coach can set any variable to another × a match for one block; that variable then moves by the
 * same share everywhere the block is read — the calendar's days, every week of the block (ramp and light week keep
 * their shape), the server's weekly target, the players' blocks and the block PDF. Rules propose; the coach decides.
 *
 * Saved in `season_plans.overrides.blockKpi` = { [block start ISO]: { [variable]: × a match } }. Pure.
 */

import type { CalWeek, CalendarBlock } from "./index";
import { inSeasonKpiMultiple } from "./inSeasonStandardWeek";
import { WEEKLY_LOAD_LABELS, type WeeklyLoadMetricKey } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";

/** One block's settings: variable → the coach's standard week in × a match. */
export type BlockKpiSet = Partial<Record<WeeklyLoadMetricKey, number>>;
/** Every block's settings, keyed by block start (ISO). */
export type BlockKpiMap = Record<string, BlockKpiSet>;

/** Bounds of a setting (× a match) and the step of the − / + buttons. */
export const BLOCK_KPI_MIN = 0.05;
export const BLOCK_KPI_MAX = 6;
export const BLOCK_KPI_STEP = 0.05;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** A setting clamped to the bounds and rounded to 0.01× — or null when it is not a usable number. */
export function cleanKpiValue(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  if (!Number.isFinite(n) || n <= 0) return null;
  return r2(Math.max(BLOCK_KPI_MIN, Math.min(BLOCK_KPI_MAX, n)));
}

/** Keep only well-formed entries: ISO block starts, known variables, usable values. Empty blocks are dropped. */
export function cleanBlockKpi(raw: unknown): BlockKpiMap {
  const out: BlockKpiMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [start, set] of Object.entries(raw as Record<string, unknown>)) {
    if (!ISO.test(start) || !set || typeof set !== "object" || Array.isArray(set)) continue;
    const clean: BlockKpiSet = {};
    for (const [k, v] of Object.entries(set as Record<string, unknown>)) {
      if (!(k in WEEKLY_LOAD_LABELS)) continue;
      const x = cleanKpiValue(v);
      if (x != null) clean[k as WeeklyLoadMetricKey] = x;
    }
    if (Object.keys(clean).length) out[start] = clean;
  }
  return out;
}

/** Each set variable's share of the system's standard week (coach ÷ system), e.g. 1.1 = 10% more. Unset = absent. */
export function blockKpiRatios(set: BlockKpiSet | null | undefined, sport?: string | null): Partial<Record<WeeklyLoadMetricKey, number>> {
  const out: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  for (const [k, v] of Object.entries(set ?? {}) as Array<[WeeklyLoadMetricKey, number | undefined]>) {
    const base = inSeasonKpiMultiple(k, 1, sport);
    if (v == null || !Number.isFinite(v) || !(base > 0)) continue;
    out[k] = v / base;
  }
  return out;
}

/** Per calendar axis: how much each day's planned value moves. Missing = unchanged (1). */
export type CalAxisScale = Partial<Record<"dist" | "hsr" | "load" | "accHi" | "decHi" | "stride" | "fr" | "cod" | "acc" | "dec", number>>;

/** The calendar axis each variable is planned on (sprint has no day number of its own: it rides the running days). */
const AXIS_OF: Partial<Record<WeeklyLoadMetricKey, keyof CalAxisScale>> = {
  totalDistance: "dist", velocityBand5: "hsr", totalPlayerLoad: "load", accelB23: "accHi", decelB23: "decHi",
  imaStrideHi: "stride", imaFrDistance: "fr", imaCod: "cod", imaAccel: "acc", imaDecel: "dec",
};

/** The variables a setting moves in the calendar's days (the rest move only the weekly target). */
export const hasCalendarDay = (k: WeeklyLoadMetricKey): boolean => AXIS_OF[k] != null;

/** Ratios → the calendar axes they move. */
export function calendarScaleFromRatios(ratios: Partial<Record<WeeklyLoadMetricKey, number>>): CalAxisScale {
  const sc: CalAxisScale = {};
  for (const [k, r] of Object.entries(ratios) as Array<[WeeklyLoadMetricKey, number]>) {
    const ax = AXIS_OF[k];
    if (ax && Number.isFinite(r) && r > 0) sc[ax] = r;
  }
  return sc;
}

/** True when the scale moves nothing. */
export const isNoScale = (sc: CalAxisScale): boolean => Object.values(sc).every((v) => v == null || v === 1);

/** Scale one week's training days and its running totals per axis. Match and rest days stay as they are. */
export function scaleCalWeek(w: CalWeek, sc: CalAxisScale): void {
  const f = (k: keyof CalAxisScale) => sc[k] ?? 1;
  const accBefore = w.days.reduce((s, d) => s + (d.type === "match" ? 0 : (d.accHiEff ?? 0) + (d.decHiEff ?? 0)), 0);
  for (const d of w.days) {
    if (d.type === "match" || d.type === "rest") continue;
    if (d.dist != null) d.dist = Math.round((d.dist * f("dist")) / 10) * 10;
    if (d.hsr != null) d.hsr = Math.round((d.hsr * f("hsr")) / 5) * 5;
    if (d.load != null) d.load = Math.round(d.load * f("load"));
    if (d.accHiEff != null) d.accHiEff = Math.round(d.accHiEff * f("accHi"));
    if (d.decHiEff != null) d.decHiEff = Math.round(d.decHiEff * f("decHi"));
    if (d.stride != null) d.stride = Math.round(d.stride * f("stride"));
    if (d.fr != null) d.fr = Math.round((d.fr * f("fr")) / 10) * 10;
    if (d.cod != null) d.cod = Math.round(d.cod * f("cod"));
    if (d.accel != null) d.accel = Math.round(d.accel * f("acc"));
    if (d.decel != null) d.decel = Math.round(d.decel * f("dec"));
  }
  if (w.pctRunning != null) w.pctRunning = Math.round(w.pctRunning * f("dist"));
  if (w.pctHsr != null) w.pctHsr = Math.round(w.pctHsr * f("hsr"));
  if (w.pctMech != null) w.pctMech = Math.round(w.pctMech * f("load"));
  if (w.pctAccDec23 != null) {
    // One total for both: the same factor scales it directly; two factors scale it by what the days now add up to.
    if (f("accHi") === f("decHi")) w.pctAccDec23 = Math.round(w.pctAccDec23 * f("accHi"));
    else {
      const accAfter = w.days.reduce((s, d) => s + (d.type === "match" ? 0 : (d.accHiEff ?? 0) + (d.decHiEff ?? 0)), 0);
      w.pctAccDec23 = accBefore > 0 ? Math.round((w.pctAccDec23 * accAfter) / accBefore) : w.pctAccDec23;
    }
  }
  if (w.pctStride != null) w.pctStride = Math.round(w.pctStride * f("stride"));
  if (w.pctFr != null) w.pctFr = Math.round(w.pctFr * f("fr"));
  if (w.pctCod != null) w.pctCod = Math.round(w.pctCod * f("cod"));
  if (w.pctAccel != null) w.pctAccel = Math.round(w.pctAccel * f("acc"));
  if (w.pctDecel != null) w.pctDecel = Math.round(w.pctDecel * f("dec"));
}

/** Apply a block's settings to its calendar (in place). No setting → untouched. */
export function applyBlockKpiToCalendar(block: CalendarBlock, set: BlockKpiSet | null | undefined, sport?: string | null): void {
  const sc = calendarScaleFromRatios(blockKpiRatios(set, sport));
  if (isNoScale(sc)) return;
  for (const w of block.weeks) scaleCalWeek(w, sc);
}

/** One logged change of a block setting (server-stamped; the audit trail of coach overrides). */
export type BlockKpiChange = { block: string; kpi: string; from: number | null; to: number | null; by: string; at: string };
export const BLOCK_KPI_LOG_MAX = 500;

/** The log after a save: one entry per variable whose setting changed (set, moved or cleared), newest last,
 *  capped at BLOCK_KPI_LOG_MAX. `prev` / `next` are the whole cleaned maps before and after. */
export function nextBlockKpiLog(log: unknown, prev: BlockKpiMap, next: BlockKpiMap, by: string, at: string): BlockKpiChange[] {
  const out: BlockKpiChange[] = Array.isArray(log) ? (log as BlockKpiChange[]).filter((e) => e && typeof e === "object") : [];
  const blocks = [...new Set([...Object.keys(prev), ...Object.keys(next)])].sort();
  for (const b of blocks) {
    const p = prev[b] ?? {}, n = next[b] ?? {};
    const keys = [...new Set([...Object.keys(p), ...Object.keys(n)])].sort() as WeeklyLoadMetricKey[];
    for (const k of keys) {
      const from = p[k] ?? null, to = n[k] ?? null;
      if (from !== to) out.push({ block: b, kpi: k, from, to, by, at });
    }
  }
  return out.slice(-BLOCK_KPI_LOG_MAX);
}

/** A logged change as the hub shows it: who by name (null = unknown), never the user id. */
export type BlockKpiLogEntry = { block: string; kpi: WeeklyLoadMetricKey; from: number | null; to: number | null; at: string; byName: string | null };

const numOrNull = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** The stored log → what the hub shows: well-formed entries only, names resolved, newest first, at most `limit`. */
export function blockKpiLogView(log: unknown, names: Record<string, string>, limit = 200): BlockKpiLogEntry[] {
  if (!Array.isArray(log)) return [];
  const out: BlockKpiLogEntry[] = [];
  for (const e of log as Array<Partial<BlockKpiChange>>) {
    if (!e || typeof e !== "object" || typeof e.block !== "string" || !ISO.test(e.block) || typeof e.at !== "string") continue;
    if (typeof e.kpi !== "string" || !(e.kpi in WEEKLY_LOAD_LABELS)) continue;
    out.push({ block: e.block, kpi: e.kpi as WeeklyLoadMetricKey, from: numOrNull(e.from), to: numOrNull(e.to), at: e.at, byName: (typeof e.by === "string" && names[e.by]) || null });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, Math.max(0, limit));
}

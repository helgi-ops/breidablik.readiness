/**
 * Per-drill ACTUAL load from Catapult OpenField "periods".
 *
 * A coach splits a performed session into periods in OpenField (one per drill).
 * On CSV upload / API sync we read each period's per-athlete metrics, collapse
 * them to a squad MEAN-PER-PLAYER (matching how drill templates and session
 * totals are per-player), match each period to a drill in that day's built
 * session (period name == drill name first, then order), and write the result
 * onto `saved_sessions.items[].actual` so the coach sees planned vs actual.
 *
 * The CSV path and the API path both produce `PeriodRow[]`, so the matching and
 * write-back logic below is shared and provider-agnostic.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accept any Supabase client (admin or server)
type Sb = any;

/** Canonical per-drill metric keys — aligned with the drill_library columns. */
export type PeriodMetrics = {
  // GPS / load (every tier)
  player_load: number | null;
  player_load_per_min: number | null;
  distance_m: number | null;
  hir_total: number | null;          // high-intensity running distance (m)
  vel_b5: number | null;             // high-speed distance (m)
  vel_b6: number | null;             // sprint distance (m)
  max_velocity: number | null;
  accel_b23: number | null;
  decel_b23: number | null;
  accel_total: number | null;
  decel_total: number | null;
  hmld_m: number | null;             // high metabolic load distance (m)
  metabolic_power_avg: number | null;
  metabolic_power_peak: number | null;
  duration_min: number | null;
  // IMA — Pro / Vector Pro only (stay null on Core, which has no IMA)
  ima_accel: number | null;
  ima_decel: number | null;
  ima_cod_total: number | null;
  high_ima: number | null;           // high-intensity IMA events (≥3.5 m/s²)
  jumps: number | null;
};

export const PERIOD_METRIC_KEYS: (keyof PeriodMetrics)[] = [
  "player_load", "player_load_per_min", "distance_m", "hir_total", "vel_b5", "vel_b6",
  "max_velocity", "accel_b23", "decel_b23", "accel_total", "decel_total", "hmld_m",
  "metabolic_power_avg", "metabolic_power_peak", "duration_min",
  "ima_accel", "ima_decel", "ima_cod_total", "high_ima", "jumps",
];

/** One athlete's numbers for one period of a performed session. */
export type PeriodRow = {
  periodName: string;
  /** First-appearance order of the period in the export = drill order (for the order fallback). */
  order: number;
  /** Athlete identity — used to count squad coverage and average per player. */
  athleteKey: string;
  metrics: PeriodMetrics;
};

/** A period aggregated across the squad → mean per player. */
export type PeriodGroup = {
  periodName: string;
  norm: string;
  order: number;
  nPlayers: number;
  perPlayer: PeriodMetrics;
};

/** What lands on saved_sessions.items[].actual. */
export type DrillActual = PeriodMetrics & {
  n_players: number;
  matched_by: "name" | "order";
  period_name: string;
};

export type SessionItem = {
  drill_id?: string | null;
  drill_name?: string | null;
  sets?: number;
  actual?: DrillActual | null;
  [k: string]: unknown;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** Loose name key so "Rondo 4v4" ≈ "rondo 4v4" ≈ "Rondo-4v4". */
export function normPeriodName(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[_\-.,/()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A period name that is really a whole-session total, not a drill. */
export function isSessionTotalName(name: string | null | undefined): boolean {
  const n = normPeriodName(String(name ?? ""));
  return n === "" || n === "session" || n === "whole session" || n === "total";
}

/** Null-safe sum of two optional numbers (null when both are null). */
const sum2 = (a: number | null, b: number | null): number | null => (a == null && b == null ? null : (a ?? 0) + (b ?? 0));
const sumN = (...xs: (number | null)[]): number | null => (xs.every((x) => x == null) ? null : xs.reduce((s, x) => (s ?? 0) + (x ?? 0), 0 as number | null));

/**
 * Map a Catapult CSV `raw` metric bag (canonical keys from catalog.ts) to the
 * per-drill metric shape. IMA columns are only present on Pro/Vector Pro exports
 * (Core has none) and stay null there.
 */
export function csvRawToMetrics(raw: Record<string, string>): PeriodMetrics {
  return {
    player_load: num(raw.playerLoad),
    player_load_per_min: num(raw.playerLoadPerMinute),
    distance_m: num(raw.totalDistance),
    hir_total: num(raw.highSpeedDistance),
    vel_b5: num(raw.velocityBand5Distance),
    vel_b6: num(raw.velocityBand6Distance) ?? num(raw.sprintDistance),
    max_velocity: num(raw.maxVelocity),
    accel_b23: num(raw.accelB23Efforts),
    decel_b23: num(raw.decelB23Efforts),
    accel_total: num(raw.totalAccelerations),
    decel_total: num(raw.totalDecelerations),
    hmld_m: num(raw.hmld),
    metabolic_power_avg: num(raw.metabolicPower),
    metabolic_power_peak: null,
    duration_min: num(raw.durationMinutes),
    ima_accel: sumN(num(raw.imaAccelBand1), num(raw.imaAccelBand2), num(raw.imaAccelBand3)),
    ima_decel: sumN(num(raw.imaDecelBand1), num(raw.imaDecelBand2), num(raw.imaDecelBand3)),
    ima_cod_total: sumN(
      num(raw.imaCodLeftHigh), num(raw.imaCodLeftMedium), num(raw.imaCodLeftLow),
      num(raw.imaCodRightHigh), num(raw.imaCodRightMedium), num(raw.imaCodRightLow),
    ),
    high_ima: sum2(num(raw.imaCodLeftHigh), num(raw.imaCodRightHigh)),
    jumps: null,
  };
}

/**
 * Convert parsed Catapult CSV rows to PeriodRow[], dropping session-total and
 * unnamed rows. `order` is assigned by first appearance of each period name
 * (OpenField exports periods in chronological = drill order).
 */
export function csvRowsToPeriodRows(
  rows: Array<{ periodName: string | null; athleteId: string | null; athleteName: string | null; raw: Record<string, string> }>,
): PeriodRow[] {
  const orderByNorm = new Map<string, number>();
  let nextOrder = 0;
  const out: PeriodRow[] = [];
  for (const r of rows) {
    const periodName = (r.periodName ?? "").trim();
    if (isSessionTotalName(periodName)) continue;
    const athleteKey = r.athleteId ?? r.athleteName ?? "";
    if (!athleteKey) continue;
    const norm = normPeriodName(periodName);
    if (!orderByNorm.has(norm)) orderByNorm.set(norm, nextOrder++);
    out.push({ periodName, order: orderByNorm.get(norm)!, athleteKey, metrics: csvRawToMetrics(r.raw) });
  }
  return out;
}

/** Group period rows by (normalised) name and average each metric per player. */
export function aggregatePeriodsPerPlayer(rows: PeriodRow[]): PeriodGroup[] {
  const map = new Map<string, { periodName: string; order: number; athletes: Set<string>; sum: Partial<Record<keyof PeriodMetrics, number>> }>();
  for (const r of rows) {
    const norm = normPeriodName(r.periodName);
    if (!norm) continue;
    let g = map.get(norm);
    if (!g) { g = { periodName: r.periodName, order: r.order, athletes: new Set(), sum: {} }; map.set(norm, g); }
    g.order = Math.min(g.order, r.order);
    g.athletes.add(r.athleteKey);
    for (const k of PERIOD_METRIC_KEYS) {
      const v = r.metrics[k];
      if (v != null) g.sum[k] = (g.sum[k] ?? 0) + v;
    }
  }
  const out: PeriodGroup[] = [];
  for (const [norm, g] of map) {
    const n = g.athletes.size || 1;
    const perPlayer = {} as PeriodMetrics;
    for (const k of PERIOD_METRIC_KEYS) perPlayer[k] = g.sum[k] != null ? Math.round(((g.sum[k] as number) / n) * 10) / 10 : null;
    out.push({ periodName: g.periodName, norm, order: g.order, nPlayers: g.athletes.size, perPlayer });
  }
  return out.sort((a, b) => a.order - b.order);
}

function toActual(g: PeriodGroup, matched_by: "name" | "order"): DrillActual {
  return { ...g.perPlayer, n_players: g.nPlayers, matched_by, period_name: g.periodName };
}

/**
 * Attach `.actual` to each session item: name match first (period name ==
 * drill name), then the leftover periods/items zipped by order. Each period is
 * used at most once. Returns the new items and match stats.
 */
export function matchPeriodsToItems(
  items: SessionItem[],
  groups: PeriodGroup[],
): { items: SessionItem[]; matchedCount: number; unmatchedPeriods: PeriodGroup[] } {
  const used = new Set<string>(); // norm names consumed
  const result: SessionItem[] = items.map((it) => ({ ...it, actual: null }));

  // Pass 1 — name match.
  for (const it of result) {
    const dn = normPeriodName(String(it.drill_name ?? ""));
    if (!dn) continue;
    const g = groups.find((gr) => gr.norm === dn && !used.has(gr.norm));
    if (g) { it.actual = toActual(g, "name"); used.add(g.norm); }
  }

  // Pass 2 — order fallback for still-unmatched items ↔ leftover periods.
  const leftovers = groups.filter((g) => !used.has(g.norm)).sort((a, b) => a.order - b.order);
  let gi = 0;
  for (const it of result) {
    if (it.actual || gi >= leftovers.length) continue;
    const g = leftovers[gi++];
    it.actual = toActual(g, "order");
    used.add(g.norm);
  }

  const matchedCount = result.filter((it) => it.actual).length;
  const unmatchedPeriods = groups.filter((g) => !used.has(g.norm));
  return { items: result, matchedCount, unmatchedPeriods };
}

/**
 * Find the built session for (team, date) and write per-drill actuals onto it.
 * Prefers a published session, else the most recently updated. No-op when there
 * is no session that day or no periods to apply.
 */
export async function writeSessionActuals(
  sb: Sb,
  teamId: string,
  dateISO: string,
  groups: PeriodGroup[],
): Promise<{ ok: boolean; matched: number; sessionId: string | null; templatesUpdated?: number; reason?: string }> {
  if (!groups.length) return { ok: false, matched: 0, sessionId: null, reason: "no_periods" };

  const { data, error } = await sb
    .from("saved_sessions")
    .select("id, items, published_at, updated_at")
    .eq("team_id", teamId)
    .eq("session_date", dateISO)
    .is("deleted_at", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });
  if (error) return { ok: false, matched: 0, sessionId: null, reason: error.message };

  const sessions = (data ?? []) as Array<{ id: string; items: SessionItem[] | null }>;
  if (!sessions.length) return { ok: false, matched: 0, sessionId: null, reason: "no_session" };

  const chosen = sessions[0]; // published first (nullsFirst:false), else most recent
  const { items, matchedCount } = matchPeriodsToItems(chosen.items ?? [], groups);
  const { error: updErr } = await sb
    .from("saved_sessions")
    .update({ items, actuals_synced_at: new Date().toISOString() })
    .eq("id", chosen.id);
  if (updErr) return { ok: false, matched: 0, sessionId: chosen.id, reason: updErr.message };

  // Calibrate the drill_library templates from the measured actuals so the
  // drills themselves carry a real load for the next session they're used in.
  const templatesUpdated = await updateDrillTemplatesFromActuals(sb, items);

  return { ok: true, matched: matchedCount, sessionId: chosen.id, templatesUpdated };
}

/**
 * Write each matched drill's ACTUAL (mean-per-player) load back onto its
 * drill_library template, so a drill built without numbers gets a real profile
 * once it's been performed. Maps the actual metric keys onto the template
 * columns; only writes the values we have. Returns how many templates updated.
 */
export async function updateDrillTemplatesFromActuals(sb: Sb, items: SessionItem[]): Promise<number> {
  let updated = 0;
  for (const it of items) {
    const a = it.actual;
    const drillId = it.drill_id;
    if (!a || !drillId) continue;
    // actual metric key → drill_library column. Only present values are written.
    const MAP: Array<[keyof PeriodMetrics, string]> = [
      ["player_load", "player_load"],
      ["distance_m", "distance_m"],
      ["duration_min", "duration_min"],
      ["hir_total", "hir_total"],
      ["vel_b5", "vel_b5"],
      ["vel_b6", "vel_b6"],
      ["max_velocity", "max_velocity"],
      ["accel_b23", "accel_b23"],
      ["accel_b23", "accel_b23_avg"],   // the drill card shows the per-player avg
      ["decel_b23", "decel_b23"],
      ["decel_b23", "decel_b23_avg"],
      ["vel_b5", "vel_b5_avg"],
      ["vel_b6", "vel_b6_avg"],
      ["accel_total", "accel_total"],
      ["decel_total", "decel_total"],
      ["hmld_m", "hmld_m"],
      ["metabolic_power_avg", "metabolic_power_avg"],
      ["metabolic_power_peak", "metabolic_power_peak"],
      ["ima_cod_total", "ima_cod_total"],
      ["high_ima", "high_ima"],
      ["jumps", "jump_count"],
    ];
    const patch: Record<string, number | string | null> = {};
    for (const [mk, col] of MAP) {
      const v = a[mk];
      if (v != null) patch[col] = v;
    }
    // Derive PL/min if we have both but the source didn't provide it.
    if (a.player_load_per_min != null) patch.player_load_per_min = a.player_load_per_min;
    else if (a.player_load != null && a.duration_min != null && a.duration_min > 0) {
      patch.player_load_per_min = Math.round((a.player_load / a.duration_min) * 100) / 100;
    }
    if (!Object.keys(patch).length) continue;
    patch.updated_at = new Date().toISOString();
    const { error } = await sb.from("drill_library").update(patch).eq("id", drillId);
    if (!error) updated += 1;
  }
  return updated;
}

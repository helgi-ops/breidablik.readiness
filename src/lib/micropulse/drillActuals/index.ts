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

/** Canonical per-drill metric keys — aligned with saved_sessions.totals / drill_library. */
export type PeriodMetrics = {
  player_load: number | null;
  distance_m: number | null;
  hsr: number | null;
  sprint: number | null;
  accel_b23: number | null;
  decel_b23: number | null;
  duration_min: number | null;
};

export const PERIOD_METRIC_KEYS: (keyof PeriodMetrics)[] = [
  "player_load", "distance_m", "hsr", "sprint", "accel_b23", "decel_b23", "duration_min",
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

/**
 * Map a Catapult CSV `raw` metric bag (canonical keys from catalog.ts) to the
 * per-drill metric shape. Sprint prefers the dedicated sprint distance, else the
 * velocity-band-6 distance (same concept, different tier export).
 */
export function csvRawToMetrics(raw: Record<string, string>): PeriodMetrics {
  return {
    player_load: num(raw.playerLoad),
    distance_m: num(raw.totalDistance),
    hsr: num(raw.highSpeedDistance),
    sprint: num(raw.sprintDistance) ?? num(raw.velocityBand6Distance),
    accel_b23: num(raw.accelB23Efforts),
    decel_b23: num(raw.decelB23Efforts),
    duration_min: num(raw.durationMinutes),
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
): Promise<{ ok: boolean; matched: number; sessionId: string | null; reason?: string }> {
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
  return { ok: true, matched: matchedCount, sessionId: chosen.id };
}

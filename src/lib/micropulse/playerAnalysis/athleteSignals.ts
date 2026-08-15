/**
 * Athlete signal reduction — raw source rows → one headline number per quality per
 * player, ready for `buildAthleteProfile`.
 *
 * Pure + IO-free (the route fetches; this reduces), so the GPS/VALD/VBT rules are
 * unit-testable. Every emitted signal carries its source, date, unit and sample
 * size. Aggregates existing physical data — never re-ingests, never touches the
 * readiness colour.
 *
 * Comparability rule: for a metric with two possible columns (IMA counts vs raw
 * accel counts; high-speed distance vs HIR), the WHOLE squad is reduced from the
 * SAME column — the one with the wider coverage — so percentiles compare like with
 * like (mirrors the tier-detection heuristic used elsewhere).
 */

import type { AthleteSignalSet, MetricSample } from "./athleteProfile";
import { computeMechanicalPower, type MechRow } from "@/lib/micropulse/load/mechanicalPower";
import { computePeakIntensity, type PeakRow } from "@/lib/micropulse/load/peakIntensity";
import type { ClockGrid } from "@/lib/micropulse/directionalSignature";

// ── Tunables ───────────────────────────────────────────────────────────────
export const SPEED_MIN_KMH = 10;      // ignore implausible/parked GPS rows
export const SPEED_MAX_KMH = 45;      // above elite human top speed → bad fix
export const MIN_GPS_VALID_DIST_M = 50; // a session with ~0 distance had no GPS lock
export const MIN_SESSIONS_FOR_RATE = 3; // per-90 counts need a few sessions to mean anything

// ── Raw row shapes (subset of the real columns the route selects) ───────────
export type GpsRow = {
  player_id: string; date: string;
  max_velocity: number | null;
  ima_accel: number | null; accelerations: number | null;
  ima_decel: number | null; decelerations: number | null;
  ima_cod: number | null; cod_events: number | null;
  high_speed_distance: number | null; hir_dist: number | null;
  total_distance: number | null; session_duration_minutes: number | null;
  // Mechanical-power / peak-demands inputs (session-summary columns).
  accel_b2_3_tot_effs_gen2?: number | null; decel_b2_3_tot_effs_gen2?: number | null;
  ima_clock_gen2?: unknown; // jsonb 12-direction × {high,medium,low} grid
  metabolic_power?: number | null; metabolic_power_peak?: number | null;
  player_load_per_minute?: number | null; velocity_band6_total_distance?: number | null;
};
export type ForceDeckRow = {
  microplayer_id: string; test_timestamp: string; test_type: string | null;
  rsi_mod: number | null; relative_peak_power_w_kg: number | null;
  asymmetry_percent: number | null; is_valid: boolean | null;
};
export type ImtpMetricRow = { microplayer_id: string; test_timestamp: string; metric_code: string; value: number | null };
export type VbtRow = { player_id: string; session_date: string; exercise_name: string | null; peak_power: number | null };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const dayOf = (ts: string) => (ts || "").slice(0, 10);
const monthOf = (ts: string) => (ts || "").slice(0, 7);

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
  return m;
}
function ensure(map: Map<string, AthleteSignalSet>, id: string): AthleteSignalSet {
  let s = map.get(id); if (!s) { s = {}; map.set(id, s); } return s;
}

/** Which of two candidate columns has the wider non-zero coverage across all rows. */
function chooseColumn<T>(rows: T[], cols: Array<(r: T) => number | null>): ((r: T) => number | null) {
  let best = cols[0], bestN = -1;
  for (const col of cols) {
    const n = rows.reduce((acc, r) => acc + (isNum(col(r)) && col(r) !== 0 ? 1 : 0), 0);
    if (n > bestN) { bestN = n; best = col; }
  }
  return best;
}

/** Sum the high-intensity tier across the 12-direction ima_clock_gen2 grid. Null if absent. */
function imaHighCount(grid: unknown): number | null {
  if (!grid || typeof grid !== "object") return null;
  let total = 0, any = false;
  for (const cell of Object.values(grid as ClockGrid)) {
    const h = cell?.high;
    if (typeof h === "number" && Number.isFinite(h)) { total += h; any = true; }
  }
  return any ? total : null;
}

/** Monthly aggregate series (oldest→newest) for the development trend. */
function monthlySeries(rows: Array<{ ts: string; v: number }>, mode: "max" | "mean"): Array<{ date: string; value: number }> {
  const byMonth = groupBy(rows, (r) => monthOf(r.ts));
  const out = Array.from(byMonth.entries()).map(([m, rs]) => {
    const vs = rs.map((r) => r.v);
    const value = mode === "max" ? Math.max(...vs) : vs.reduce((a, b) => a + b, 0) / vs.length;
    return { date: `${m}-01`, value: round(value, 1) };
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ── GPS ────────────────────────────────────────────────────────────────────
export function reduceGps(rows: GpsRow[]): Map<string, AthleteSignalSet> {
  const out = new Map<string, AthleteSignalSet>();
  // Squad-wide column choice so every player is ranked from the same metric.
  const accelCol = chooseColumn(rows, [(r) => r.ima_accel, (r) => r.accelerations]);
  const decelCol = chooseColumn(rows, [(r) => r.ima_decel, (r) => r.decelerations]);
  const codCol = chooseColumn(rows, [(r) => r.ima_cod, (r) => r.cod_events]);
  const workCol = chooseColumn(rows, [(r) => r.high_speed_distance, (r) => r.hir_dist]);

  for (const [pid, rs] of groupBy(rows, (r) => r.player_id)) {
    const set = ensure(out, pid);

    // Speed — best plausible in-game top speed, with a monthly-max trend series.
    const speedRows = rs.filter((r) => isNum(r.max_velocity) && r.max_velocity! >= SPEED_MIN_KMH && r.max_velocity! <= SPEED_MAX_KMH);
    if (speedRows.length) {
      const best = speedRows.reduce((a, b) => (b.max_velocity! > a.max_velocity! ? b : a));
      set.speed = {
        value: round(best.max_velocity!, 1), unit: "km/h", source: "GPS", date: dayOf(best.date), sampleSize: speedRows.length,
        series: monthlySeries(speedRows.map((r) => ({ ts: r.date, v: r.max_velocity! })), "max"),
      } satisfies MetricSample;
    }

    // Per-90 rates — only from sessions with a real GPS lock (distance + minutes).
    const valid = rs.filter((r) => isNum(r.session_duration_minutes) && r.session_duration_minutes! > 0 && isNum(r.total_distance) && r.total_distance! > MIN_GPS_VALID_DIST_M);
    if (valid.length >= MIN_SESSIONS_FOR_RATE) {
      const totalMin = valid.reduce((a, r) => a + (r.session_duration_minutes ?? 0), 0);
      const latest = valid.reduce((a, b) => (b.date > a.date ? b : a)).date;
      const per90 = (col: (r: GpsRow) => number | null): number | null => {
        if (totalMin <= 0) return null;
        const s = valid.reduce((a, r) => a + (isNum(col(r)) ? col(r)! : 0), 0);
        return s / (totalMin / 90);
      };
      const emit = (id: keyof AthleteSignalSet, col: (r: GpsRow) => number | null, unit: string, series?: MetricSample["series"]) => {
        const v = per90(col);
        if (v == null) return;
        set[id] = { value: round(v, 1), unit, source: "GPS", date: dayOf(latest), sampleSize: valid.length, series } satisfies MetricSample;
      };
      emit("acceleration", accelCol, "/90");
      emit("deceleration", decelCol, "/90");
      emit("change_of_direction", codCol, "/90");
      // Work capacity gets a monthly per-90 trend series (valuable for young players).
      const monthly = Array.from(groupBy(valid, (r) => monthOf(r.date)).entries()).map(([m, mr]) => {
        const min = mr.reduce((a, r) => a + (r.session_duration_minutes ?? 0), 0);
        const s = mr.reduce((a, r) => a + (isNum(workCol(r)) ? workCol(r)! : 0), 0);
        return { date: `${m}-01`, value: min > 0 ? round(s / (min / 90), 1) : 0 };
      }).sort((a, b) => a.date.localeCompare(b.date));
      emit("work_capacity", workCol, "m/90", monthly);
    }

    // Mechanical power + peak demands — reuse the load engines, then surface ONE
    // cross-athlete-comparable absolute per quality (the personal-norm indices stay
    // inside the engines; the radar needs an absolute so the squad percentile is fair).
    const mechRows: MechRow[] = rs.map((r) => ({
      date: r.date,
      imaHigh: imaHighCount(r.ima_clock_gen2),
      accelEfforts: r.accel_b2_3_tot_effs_gen2 ?? null,
      decelEfforts: r.decel_b2_3_tot_effs_gen2 ?? null,
      metabolicPeak: r.metabolic_power_peak ?? null,
      metabolicAvg: r.metabolic_power ?? null,
      durationMin: r.session_duration_minutes,
    }));
    const mech = computeMechanicalPower(mechRows);
    if (mech.baseline.avgMechIntensity != null && mech.dataCoverage.sessions >= MIN_SESSIONS_FOR_RATE) {
      const latestMech = [...mech.history].reverse().find((s) => s.mechIntensity != null);
      set.mechanical_power = {
        value: round(mech.baseline.avgMechIntensity, 2), unit: "/min", source: "GPS · IMA",
        date: latestMech?.date ?? null, sampleSize: mech.dataCoverage.sessions,
      } satisfies MetricSample;
    }

    const peakRows: PeakRow[] = rs.map((r) => ({
      date: r.date,
      loadPerMin: r.player_load_per_minute ?? null,
      metabolicPeak: r.metabolic_power_peak ?? null,
      hsrBand6: r.velocity_band6_total_distance ?? null,
      accelEfforts: r.accel_b2_3_tot_effs_gen2 ?? null,
      decelEfforts: r.decel_b2_3_tot_effs_gen2 ?? null,
      durationMin: r.session_duration_minutes,
    }));
    const peak = computePeakIntensity(peakRows);
    // Peak demands = the player's worst-case PlayerLoad/min (his most intense session's
    // load rate) — an absolute, cross-athlete "peak demands" number.
    const worstLoad = peak.worstCase?.proxies.loadPerMin ?? null;
    if (worstLoad != null && peak.dataCoverage.sessions >= MIN_SESSIONS_FOR_RATE) {
      set.peak_demands = {
        value: round(worstLoad, 1), unit: "PL/min", source: "GPS",
        date: peak.worstCase?.date ?? null, sampleSize: peak.dataCoverage.sessions,
      } satisfies MetricSample;
    }
  }
  return out;
}

// ── VALD ForceDecks (CMJ) ────────────────────────────────────────────────────
export function reduceForceDecks(rows: ForceDeckRow[]): Map<string, AthleteSignalSet> {
  const out = new Map<string, AthleteSignalSet>();
  const cmj = rows.filter((r) => (r.test_type ?? "").toUpperCase() === "CMJ" && r.is_valid !== false);
  // Reactive power must use ONE metric squad-wide, else the percentile pool would mix
  // RSI-mod with W/kg. Prefer RSI-mod when it is at least as widely reported.
  const rsiN = cmj.filter((r) => isNum(r.rsi_mod)).length;
  const powN = cmj.filter((r) => isNum(r.relative_peak_power_w_kg)).length;
  const useRsi = rsiN >= powN;
  const reactiveGet = useRsi ? (r: ForceDeckRow) => r.rsi_mod : (r: ForceDeckRow) => r.relative_peak_power_w_kg;
  const reactiveUnit = useRsi ? "RSI-mod" : "W/kg";

  // Latest test DAY carrying the metric, mean across that day's trials (trial mean, not
  // best — Claudino). Reactive power and asymmetry pick their day independently so a
  // day missing one metric doesn't drop the other.
  const latestDayMean = (rs: ForceDeckRow[], get: (r: ForceDeckRow) => number | null): { value: number; date: string; n: number } | null => {
    const withVal = rs.filter((r) => isNum(get(r)));
    if (!withVal.length) return null;
    const day = withVal.reduce((a, b) => (dayOf(b.test_timestamp) > dayOf(a.test_timestamp) ? b : a));
    const d = dayOf(day.test_timestamp);
    const vs = withVal.filter((r) => dayOf(r.test_timestamp) === d).map(get).filter(isNum);
    return vs.length ? { value: vs.reduce((a, b) => a + b, 0) / vs.length, date: d, n: vs.length } : null;
  };

  for (const [pid, rs] of groupBy(cmj, (r) => r.microplayer_id)) {
    const set = ensure(out, pid);
    const reactive = latestDayMean(rs, reactiveGet);
    if (reactive) set.reactive_power = { value: round(reactive.value, 2), unit: reactiveUnit, source: "ForceDecks", date: reactive.date, sampleSize: reactive.n };
    const asym = latestDayMean(rs, (r) => (isNum(r.asymmetry_percent) ? Math.abs(r.asymmetry_percent) : null));
    if (asym) set.robustness = { value: round(asym.value, 1), unit: "% asym", source: "ForceDecks", date: asym.date, sampleSize: asym.n };
  }
  return out;
}

// ── VALD IMTP (max strength proxy) ───────────────────────────────────────────
const IMTP_FORCE_CODES = ["PEAK_VERTICAL_FORCE", "NET_PEAK_VERTICAL_FORCE"];
export function reduceImtp(rows: ImtpMetricRow[]): Map<string, AthleteSignalSet> {
  const out = new Map<string, AthleteSignalSet>();
  // Prefer PEAK_VERTICAL_FORCE; fall back to NET across the whole squad for comparability.
  const code = IMTP_FORCE_CODES.find((c) => rows.some((r) => r.metric_code === c)) ?? null;
  if (!code) return out;
  const force = rows.filter((r) => r.metric_code === code && isNum(r.value));
  for (const [pid, rs] of groupBy(force, (r) => r.microplayer_id)) {
    const latestDay = rs.reduce((a, b) => (dayOf(b.test_timestamp) > dayOf(a.test_timestamp) ? b : a));
    const day = dayOf(latestDay.test_timestamp);
    const dayRows = rs.filter((r) => dayOf(r.test_timestamp) === day);
    const vs = dayRows.map((r) => r.value!).filter(isNum);
    if (!vs.length) continue;
    const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
    ensure(out, pid).max_strength = { value: Math.round(mean), unit: "N", source: "IMTP", date: day, sampleSize: dayRows.length };
  }
  return out;
}

// ── GymAware VBT (power output) ──────────────────────────────────────────────
export function reduceVbt(rows: VbtRow[]): Map<string, AthleteSignalSet> {
  const out = new Map<string, AthleteSignalSet>();
  const withPower = rows.filter((r) => isNum(r.peak_power) && (r.exercise_name ?? "").trim());
  if (!withPower.length) return out;
  // Rank within the squad's most-common lift so power is compared like with like.
  const byEx = groupBy(withPower, (r) => (r.exercise_name ?? "").trim());
  const dominant = Array.from(byEx.entries()).sort((a, b) => b[1].length - a[1].length)[0][0];
  for (const [pid, rs] of groupBy(byEx.get(dominant)!, (r) => r.player_id)) {
    const best = rs.reduce((a, b) => (b.peak_power! > a.peak_power! ? b : a));
    ensure(out, pid).vbt_power = {
      value: Math.round(best.peak_power!), unit: `W · ${dominant}`, source: "GymAware", date: dayOf(best.session_date), sampleSize: rs.length,
    } satisfies MetricSample;
  }
  return out;
}

// ── Merge ────────────────────────────────────────────────────────────────────
/** Merge the per-source signal maps into one AthleteSignalSet per player id. */
export function mergeSignals(maps: Array<Map<string, AthleteSignalSet>>): Map<string, AthleteSignalSet> {
  const out = new Map<string, AthleteSignalSet>();
  for (const m of maps) for (const [pid, set] of m) Object.assign(ensure(out, pid), set);
  return out;
}

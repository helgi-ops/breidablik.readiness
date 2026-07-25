/**
 * Team HR read — the single data-gather behind BOTH the Load & RPE tab's
 * HrLoadCrossCheckCard and the Heart Rate Intelligence page, so the two can never
 * disagree about belt coverage, per-player divergence, or zone distribution.
 *
 * It reads the belt HR (player_external_load_daily), the sRPE cross-check
 * (session_rpe_entries), the roster (players, incl. the configured hr_max), runs the
 * pure `computeHrLoad` engine per player, and carries the latest belt session's
 * distribution + %HRmax for display. Effective %HRmax = Catapult's own
 * pct_*_heart_rate when present, else computed from the athlete's configured hr_max —
 * so setting HRmax fills the gap when OpenField's value is absent. Never fabricated:
 * no belt / no hr_max → null, not 0.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeHrLoad, hrZoneDistribution,
  type HrLoadRead, type HrLoadRow, type HrBand,
} from "./index";

export const HR_WINDOW_DAYS = 28;

export interface PlayerHrRead {
  playerId: string;
  name: string;
  position: string | null;
  read: HrLoadRead;
  /** 8-band distribution of the player's latest belt session (display only). */
  dist: HrBand[];
  /** Configured max HR (bpm) from players.hr_max — null when not set. */
  hrMax: number | null;
  /** Latest belt session's HR summary + effective %HRmax (Catapult ?? from hr_max). */
  latestHr: { date: string; avgHr: number | null; maxHr: number | null; pctAvg: number | null; pctMax: number | null } | null;
}

export interface TeamHrReads {
  reads: PlayerHrRead[];  // players with belt HR, sorted by name
  rosterCount: number;    // active roster size (the "N of M wore the belt" denominator)
  windowDays: number;
}

const numOf = (v: unknown): number | null => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);

function windowStartISO(windowDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - windowDays);
  return d.toISOString().slice(0, 10);
}

/** Effective %HRmax: prefer Catapult's own value, else compute from configured HRmax. */
function effectivePct(raw: number | null, hr: number | null, hrMax: number | null): number | null {
  if (raw != null) return raw;
  if (hrMax && hrMax > 0 && hr != null) return Math.round((hr / hrMax) * 100);
  return null;
}

export async function loadHrForTeam(
  sb: SupabaseClient,
  teamId: string,
  opts: { windowDays?: number } = {},
): Promise<TeamHrReads> {
  const windowDays = opts.windowDays ?? HR_WINDOW_DAYS;
  const start = windowStartISO(windowDays);

  const [playersRes, loadRes, rpeRes] = await Promise.all([
    sb.from("players").select("id, full_name, position, hr_max").eq("team_id", teamId).eq("is_active", true),
    sb.from("player_external_load_daily")
      .select("player_id, date, hr_zone_1_time_s, hr_zone_2_time_s, hr_zone_3_time_s, hr_zone_4_time_s, hr_zone_5_time_s, hr_zone_6_time_s, hr_zone_7_time_s, hr_zone_8_time_s, hr_zone_1_avg_bpm, hr_zone_2_avg_bpm, hr_zone_3_avg_bpm, hr_zone_4_avg_bpm, hr_zone_5_avg_bpm, hr_zone_6_avg_bpm, hr_zone_7_avg_bpm, hr_zone_8_avg_bpm, avg_heart_rate, max_heart_rate, pct_max_heart_rate, pct_avg_heart_rate")
      .eq("team_id", teamId).gte("date", start),
    sb.from("session_rpe_entries").select("player_id, session_date, session_load").eq("team_id", teamId).gte("session_date", start),
  ]);

  const meta = new Map<string, { name: string; position: string | null; hrMax: number | null }>();
  for (const p of (playersRes.data ?? []) as Array<Record<string, unknown>>) {
    meta.set(String(p.id), { name: String(p.full_name ?? "Player"), position: (p.position as string | null) ?? null, hrMax: numOf(p.hr_max) });
  }

  // player → date → the engine row (+ raw HR fields for the latest-session display)
  const byPlayerDate = new Map<string, Map<string, HrLoadRow>>();
  const ensure = (pid: string, date: string): HrLoadRow => {
    let m = byPlayerDate.get(pid);
    if (!m) { m = new Map(); byPlayerDate.set(pid, m); }
    let r = m.get(date);
    if (!r) { r = { date, srpeLoad: null, hrZonesSec: [], pctMaxHr: null }; m.set(date, r); }
    return r;
  };
  const latestByPlayer = new Map<string, { date: string; zonesSec: Array<number | null>; bpm: Array<number | null>; avgHr: number | null; maxHr: number | null; pctAvgRaw: number | null; pctMaxRaw: number | null }>();

  for (const row of (loadRes.data ?? []) as Array<Record<string, unknown>>) {
    const pid = String(row.player_id ?? ""); const date = String(row.date ?? "").slice(0, 10);
    if (!pid || !date) continue;
    const zonesSec = [1, 2, 3, 4, 5, 6, 7, 8].map((b) => numOf(row[`hr_zone_${b}_time_s`]));
    const bpm = [1, 2, 3, 4, 5, 6, 7, 8].map((b) => numOf(row[`hr_zone_${b}_avg_bpm`]));
    const avgHr = numOf(row.avg_heart_rate);
    const maxHr = numOf(row.max_heart_rate);
    const pctMaxRaw = numOf(row.pct_max_heart_rate);
    const pctAvgRaw = numOf(row.pct_avg_heart_rate);
    const hrMax = meta.get(pid)?.hrMax ?? null;

    const r = ensure(pid, date);
    r.hrZonesSec = zonesSec;
    r.pctMaxHr = effectivePct(pctMaxRaw, maxHr, hrMax); // gates the engine's confidence
    if (zonesSec.some((v) => v !== null)) {
      const prev = latestByPlayer.get(pid);
      if (!prev || date > prev.date) latestByPlayer.set(pid, { date, zonesSec, bpm, avgHr, maxHr, pctAvgRaw, pctMaxRaw });
    }
  }

  for (const row of (rpeRes.data ?? []) as Array<Record<string, unknown>>) {
    const pid = String(row.player_id ?? ""); const date = String(row.session_date ?? "").slice(0, 10);
    if (!pid || !date) continue;
    const load = numOf(row.session_load); if (load == null) continue;
    const r = ensure(pid, date);
    r.srpeLoad = (r.srpeLoad ?? 0) + load;
  }

  const reads: PlayerHrRead[] = [];
  for (const [pid, m] of byPlayerDate) {
    const read = computeHrLoad([...m.values()]);
    if (!read.dataCoverage.hasHr) continue;
    const info = meta.get(pid);
    const hrMax = info?.hrMax ?? null;
    const latest = latestByPlayer.get(pid);
    const dist = latest ? hrZoneDistribution(latest.zonesSec, latest.bpm) : [];
    const latestHr = latest
      ? {
          date: latest.date,
          avgHr: latest.avgHr,
          maxHr: latest.maxHr,
          pctAvg: effectivePct(latest.pctAvgRaw, latest.avgHr, hrMax),
          pctMax: effectivePct(latest.pctMaxRaw, latest.maxHr, hrMax),
        }
      : null;
    reads.push({ playerId: pid, name: info?.name ?? "Player", position: info?.position ?? null, read, dist, hrMax, latestHr });
  }
  reads.sort((a, b) => a.name.localeCompare(b.name));

  return { reads, rosterCount: meta.size, windowDays };
}

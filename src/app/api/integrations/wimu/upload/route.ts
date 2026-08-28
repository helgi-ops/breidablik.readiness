export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/integrations/wimu/upload
 *
 * Stores a coach's parsed WIMU (Hudl SPRO) export into player_external_load_daily.
 * The browser does the CSV/XLSX parse + normalize + athlete-day aggregation (SheetJS
 * runs client-side), then POSTs the normalized sessions here. This route resolves each
 * WIMU athlete name to a MicroPulse player on the COACH'S OWN team (so we can never
 * write another team's player), maps the metrics to the shared external-load columns,
 * and upserts with source="wimu" — the same table Catapult and STATSports write to, so
 * baselines / decoupling / the load surfaces treat it identically.
 *
 * Coach/staff only. Descriptive external-load data — never the readiness colour.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { WimuSessionMetric } from "@/lib/integrations/wimu";

const MAX_SESSIONS = 10_000;

const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const intOrNull = (v: unknown): number | null => {
  const n = numOrNull(v);
  return n == null ? null : Math.round(n);
};

/** Case/spacing/punctuation-insensitive name key (keeps Icelandic letters intact). */
const normName = (s: string): string => s.toLowerCase().replace(/[,._]/g, " ").replace(/\s+/g, " ").trim();
/** Word-order-independent key so "Jón Ari" matches "Ari, Jón". */
const tokenKey = (s: string): string => normName(s).split(" ").filter(Boolean).sort().join(" ");

type ExternalLoadRow = {
  player_id: string;
  team_id: string;
  date: string;
  source: "wimu";
  external_athlete_id: string;
  activity_count: number;
  total_distance: number | null;
  high_speed_distance: number | null;
  sprint_distance: number | null;
  hir_dist: number | null;
  accelerations: number | null;
  decelerations: number | null;
  cod_events: number | null;
  max_velocity: number | null;
  player_load: number | null;
  total_player_load: number | null;
  player_load_per_minute: number | null;
  metabolic_power: number | null;
  metabolic_power_peak: number | null;
  metabolic_load_score: number | null;
  high_metabolic_load_distance_m: number | null;
  metabolic_energy_kj: number | null;
  metabolic_data_valid: boolean;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  hr_zone_1_time_s: number | null;
  hr_zone_2_time_s: number | null;
  hr_zone_3_time_s: number | null;
  hr_zone_4_time_s: number | null;
  hr_zone_5_time_s: number | null;
  raw_payload_json: unknown;
};

function metricToRow(m: WimuSessionMetric, playerId: string, teamId: string): ExternalLoadRow {
  const hasMetabolic = numOrNull(m.metabolicPower) != null
    || numOrNull(m.metabolicPowerPeak) != null
    || numOrNull(m.highMetabolicLoadDistanceM) != null
    || numOrNull(m.metabolicEnergyKj) != null;
  return {
    player_id: playerId,
    team_id: teamId,
    date: m.date,
    source: "wimu",
    external_athlete_id: m.athleteName,
    activity_count: 1,
    total_distance: numOrNull(m.totalDistance),
    high_speed_distance: numOrNull(m.highSpeedDistance),
    sprint_distance: numOrNull(m.sprintDistance),
    hir_dist: numOrNull(m.hirDistance),
    accelerations: intOrNull(m.accelerations),
    decelerations: intOrNull(m.decelerations),
    cod_events: intOrNull(m.codEvents),
    max_velocity: numOrNull(m.maxVelocity),
    // WIMU exposes one Player Load figure; write it to both the raw and canonical
    // columns so every load surface (which reads either) sees the same value.
    player_load: numOrNull(m.playerLoad),
    total_player_load: numOrNull(m.playerLoad),
    player_load_per_minute: numOrNull(m.playerLoadPerMinute),
    metabolic_power: numOrNull(m.metabolicPower),
    metabolic_power_peak: numOrNull(m.metabolicPowerPeak),
    metabolic_load_score: numOrNull(m.metabolicLoadScore),
    high_metabolic_load_distance_m: numOrNull(m.highMetabolicLoadDistanceM),
    metabolic_energy_kj: numOrNull(m.metabolicEnergyKj),
    metabolic_data_valid: hasMetabolic,
    avg_heart_rate: numOrNull(m.avgHeartRate),
    max_heart_rate: numOrNull(m.maxHeartRate),
    hr_zone_1_time_s: numOrNull(m.hrZone1TimeS),
    hr_zone_2_time_s: numOrNull(m.hrZone2TimeS),
    hr_zone_3_time_s: numOrNull(m.hrZone3TimeS),
    hr_zone_4_time_s: numOrNull(m.hrZone4TimeS),
    hr_zone_5_time_s: numOrNull(m.hrZone5TimeS),
    raw_payload_json: m,
  };
}

export async function POST(req: Request) {
  try {
    // ── Auth: coach/staff on a team ──
    const authz = req.headers.get("authorization") ?? "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const sbUser = getSupabaseServer();
    const { data: userRes } = await sbUser.auth.getUser(token);
    if (!userRes?.user?.id) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const { data: prof } = await sbUser.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
    const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
    if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ ok: false, error: "Coach role required" }, { status: 403 });
    const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
    if (!teamId) return NextResponse.json({ ok: false, error: "No team context" }, { status: 400 });

    // ── Body ──
    const body = await req.json().catch(() => null);
    const sessions = (body?.sessions ?? []) as WimuSessionMetric[];
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return NextResponse.json({ ok: false, error: "No sessions to store." }, { status: 400 });
    }
    if (sessions.length > MAX_SESSIONS) {
      return NextResponse.json({ ok: false, error: `Too many rows (${sessions.length} > ${MAX_SESSIONS}).` }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // ── Roster name → player_id (own team only; include inactive so historical
    //    sessions still match). Exact-name first, word-order-independent fallback. ──
    const { data: roster } = await sb.from("players").select("id, full_name").eq("team_id", teamId);
    const byNorm = new Map<string, string>();
    const byToken = new Map<string, string>();
    const ambiguousToken = new Set<string>();
    for (const p of (roster ?? []) as Array<{ id: string; full_name: string | null }>) {
      const full = (p.full_name ?? "").trim();
      if (!full) continue;
      byNorm.set(normName(full), String(p.id));
      const tk = tokenKey(full);
      if (byToken.has(tk) && byToken.get(tk) !== String(p.id)) ambiguousToken.add(tk);
      else byToken.set(tk, String(p.id));
    }
    const resolve = (name: string): string | null => {
      const exact = byNorm.get(normName(name));
      if (exact) return exact;
      const tk = tokenKey(name);
      if (ambiguousToken.has(tk)) return null; // two players share these words → don't guess
      return byToken.get(tk) ?? null;
    };

    // ── Build rows, tracking unmatched names ──
    const rows: ExternalLoadRow[] = [];
    const unmatched = new Set<string>();
    const matchedPlayers = new Set<string>();
    const dates: string[] = [];
    let skipped = 0;
    for (const m of sessions) {
      const name = (m?.athleteName ?? "").trim();
      const date = String(m?.date ?? "");
      if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; continue; }
      const playerId = resolve(name);
      if (!playerId) { unmatched.add(name); continue; }
      matchedPlayers.add(playerId);
      dates.push(date);
      rows.push(metricToRow(m, playerId, teamId));
    }

    // ── Upsert (source="wimu") ──
    let stored = 0;
    const warnings: string[] = [];
    for (const row of rows) {
      const { error } = await sb.from("player_external_load_daily").upsert(row, { onConflict: "player_id,date,source" });
      if (error) warnings.push(`Upsert failed for ${row.external_athlete_id} on ${row.date}: ${error.message}`);
      else stored++;
    }

    dates.sort();
    return NextResponse.json({
      ok: true,
      result: {
        rowsParsed: sessions.length,
        athletesMatched: matchedPlayers.size,
        athletesUnmatched: [...unmatched].sort(),
        sessionsStored: stored,
        skipped,
        storedCount: stored,          // alias, mirrors the other sync results
        unmatchedCount: unmatched.size,
        earliestDate: dates[0] ?? null,
        latestDate: dates[dates.length - 1] ?? null,
        warnings,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

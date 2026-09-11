import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildTeamDecisionResponse, serializeTeamDecisionResponse, type CoachCommandPlayerSource } from "@/lib/micropulse/coachCommand";
import { normalizeCatapultDailyLoadRow } from "@/lib/micropulse/externalLoad";
import { loadMatchRecoveryInputs } from "@/lib/micropulse/cmjRecovery/loader";
import { computeRpeAcwrFromRows, type RpeAcwrInput } from "@/lib/micropulse/compositeLoad";
import { type VbtSessionRow } from "@/lib/micropulse/vbtReadiness";
import { type AthleteMetricBaseline } from "@/lib/micropulse/baselines";
import { fetchRecentDecisions } from "@/lib/micropulse/domain/decision/history";
import { loadStrideIntelligence } from "@/lib/micropulse/strideIntelligence/loader";
import type { StrideIntelligencePayload } from "@/lib/micropulse/strideIntelligence";
import { deriveSignalTrend, type SignalTrend } from "@/lib/micropulse/domain/decision/forecast";
import type { NormalizedMonitoringSnapshot } from "@/lib/integrations/shared/types";
// Stage 1b: the per-player engine now lives in ONE place — the shared pipeline.
// This route keeps its batched squad fetching but calls the shared buildPlayerSource,
// so the coach and player surfaces can never drift on verdict logic again.
import { buildPlayerSource } from "@/lib/micropulse/playerDecision";

export const runtime = "nodejs";

type AuthProfile = {
  role: string | null;
  team_id: string | null;
};

type CoachRow = Record<string, unknown>;

type TrainingModifierRow = {
  player_id: string;
  training_modifier: unknown;
};

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function getAdminClient() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

function todayInReykjavik(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik" }).format(new Date());
}

function ydayOf(date: string): string {
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() - 1);
  return base.toISOString().slice(0, 10);
}

function toFinite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}


async function requireCoachContext(req: Request): Promise<{ teamId: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");

  const sb = getAdminClient();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");

  const { data: prof, error: profErr } = await sb
    .from("profiles")
    .select("role, team_id")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profErr) throw new Error(profErr.message);

  const profile = prof as AuthProfile | null;
  const role = String(profile?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!profile?.team_id) throw new Error("No team context");
  return { teamId: profile.team_id };
}

async function fetchCoachRows(sb: ReturnType<typeof getAdminClient>, teamId: string, date: string): Promise<CoachRow[]> {
  // Try team_id first (standard column name)
  const query = sb
    .from("v_coach_readiness_today_v8")
    .select("*")
    .eq("entry_date", date)
    .eq("team_id", teamId)
    .order("total_score", { ascending: true })
    .order("full_name", { ascending: true });

  const { data, error } = await query;
  if (!error && data && data.length > 0) return data as CoachRow[];

  // If no rows, the view column may be "team" instead of "team_id"
  if (!error && data && data.length === 0) {
    const alt = await sb
      .from("v_coach_readiness_today_v8")
      .select("*")
      .eq("entry_date", date)
      .eq("team", teamId)
      .order("total_score", { ascending: true })
      .order("full_name", { ascending: true });
    if (!alt.error && alt.data && alt.data.length > 0) return alt.data as CoachRow[];
  }

  // Fallback: view column may be "team" instead of "team_id"
  const fallback = await sb.from("v_coach_readiness_today_v8").select("*").eq("entry_date", date).order("total_score", { ascending: true }).order("full_name", { ascending: true });
  if (fallback.error) throw fallback.error;
  return ((fallback.data ?? []) as CoachRow[]).filter((row) => String(row.team_id ?? (row as Record<string, unknown>).team ?? "") === teamId);
}

/**
 * Pull last 5 days of total_score per player so the forecast engine
 * can compute a SignalTrend (improving / stable / declining). Bulk
 * single round-trip — N+1 would dominate latency at 25-player teams.
 *
 * Returns Map keyed by player_id → SignalTrend (already derived).
 * Empty map on no data; caller should treat absence as "unknown trend".
 */
async function fetchScoreTrendByPlayer(
  sb: ReturnType<typeof getAdminClient>,
  playerIds: string[],
  date: string,
): Promise<Map<string, SignalTrend>> {
  if (!playerIds.length) return new Map();
  // 5 calendar days ending today (inclusive) — short enough to be
  // responsive to current state, long enough to smooth daily noise.
  const start = new Date(`${date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 4);
  const startDate = start.toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("readiness_entries")
    .select("player_id, entry_date, total_score")
    .in("player_id", playerIds)
    .gte("entry_date", startDate)
    .lte("entry_date", date)
    .order("entry_date", { ascending: true });
  if (error) {
    console.warn("fetchScoreTrendByPlayer error:", error.message);
    return new Map();
  }
  const byPlayer = new Map<string, Array<{ date: string; score: number | null }>>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const pid = String(row.player_id);
    const score = typeof row.total_score === "number" ? row.total_score : null;
    if (!byPlayer.has(pid)) byPlayer.set(pid, []);
    byPlayer.get(pid)!.push({ date: String(row.entry_date), score });
  }
  const out = new Map<string, SignalTrend>();
  for (const [pid, rows] of byPlayer.entries()) {
    out.set(pid, deriveSignalTrend(rows.map((r) => r.score)));
  }
  return out;
}

async function fetchTrainingModifiers(
  sb: ReturnType<typeof getAdminClient>,
  playerIds: string[],
  date: string
): Promise<Map<string, TrainingModifierRow>> {
  if (!playerIds.length) return new Map();
  const { data, error } = await sb
    .from("readiness_entries")
    .select("player_id, training_modifier")
    .eq("entry_date", date)
    .in("player_id", playerIds);
  if (error) throw error;
  return new Map(
    ((data ?? []) as Array<Record<string, unknown>>).map((row) => [
      String(row.player_id),
      { player_id: String(row.player_id), training_modifier: row.training_modifier },
    ])
  );
}

async function fetchCatapultRows(
  sb: ReturnType<typeof getAdminClient>,
  playerIds: string[],
  date: string
): Promise<{
  normalized: Map<string, ReturnType<typeof normalizeCatapultDailyLoadRow>[]>;
  raw: Map<string, Array<Record<string, unknown>>>;
}> {
  if (!playerIds.length) return { normalized: new Map(), raw: new Map() };
  const start = new Date(`${date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 28);
  const startDate = start.toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("player_external_load_daily")
    .select("*")
    .in("source", ["catapult", "manual"])
    .in("player_id", playerIds)
    .gte("date", startDate)
    .lte("date", date)
    .order("date", { ascending: true });
  if (error) throw error;

  const normalizedByPlayer = new Map<string, ReturnType<typeof normalizeCatapultDailyLoadRow>[]>();
  const rawByPlayer = new Map<string, Array<Record<string, unknown>>>();
  for (const rawRow of (data ?? []) as Array<Record<string, unknown>>) {
    const pid = String(rawRow.player_id ?? "");
    if (!pid) continue;

    // Store raw row for MLI/Metabolic computation
    const rawList = rawByPlayer.get(pid) ?? [];
    rawList.push(rawRow);
    rawByPlayer.set(pid, rawList);

    // Store normalized row for existing GPS pipeline
    const normalized = normalizeCatapultDailyLoadRow(rawRow);
    if (!normalized) continue;
    const list = normalizedByPlayer.get(normalized.playerId) ?? [];
    list.push(normalized);
    normalizedByPlayer.set(normalized.playerId, list);
  }
  return { normalized: normalizedByPlayer, raw: rawByPlayer };
}

async function fetchRpeAcwrForPlayers(
  sb: ReturnType<typeof getAdminClient>,
  playerIds: string[],
  date: string
): Promise<Map<string, RpeAcwrInput | null>> {
  if (!playerIds.length) return new Map();
  const start = new Date(`${date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 27);
  const startDate = start.toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("session_rpe_entries")
    .select("player_id, session_date, session_load, is_imputed")
    .in("player_id", playerIds)
    .gte("session_date", startDate)
    .lte("session_date", date)
    .order("session_date", { ascending: true });
  if (error) return new Map();

  // Group rows by player
  const rowsByPlayer = new Map<string, Array<{ session_date: string; session_load: number | null; is_imputed?: boolean | null }>>();
  for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
    const pid = String(raw.player_id ?? "");
    const list = rowsByPlayer.get(pid) ?? [];
    list.push({
      session_date: String(raw.session_date ?? ""),
      session_load: raw.session_load != null ? Number(raw.session_load) : null,
      is_imputed: raw.is_imputed as boolean | null | undefined,
    });
    rowsByPlayer.set(pid, list);
  }

  const result = new Map<string, RpeAcwrInput | null>();
  for (const pid of playerIds) {
    const rows = rowsByPlayer.get(pid) ?? [];
    result.set(pid, computeRpeAcwrFromRows(rows, date));
  }
  return result;
}

/**
 * Fetch all real (non-imputed) RPE submissions for a team on a given date.
 * Returns a map of playerId → rpe value, used to compute team median for
 * discrepancy analysis.
 */
async function fetchTeamRpeForDate(
  sb: ReturnType<typeof getAdminClient>,
  playerIds: string[],
  date: string
): Promise<Map<string, number>> {
  if (!playerIds.length) return new Map();
  const { data, error } = await sb
    .from("session_rpe_entries")
    .select("player_id, rpe, is_imputed")
    .in("player_id", playerIds)
    .eq("session_date", date)
    .eq("is_imputed", false);
  if (error) return new Map();

  const result = new Map<string, number>();
  for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
    const pid = String(raw.player_id ?? "");
    const rpe = raw.rpe != null ? Number(raw.rpe) : null;
    if (rpe != null && Number.isFinite(rpe) && !result.has(pid)) {
      result.set(pid, rpe);
    }
  }
  return result;
}

/**
 * Fetch Stride Intelligence (cadence drift, L/R cutting asymmetry,
 * GPS-IMA decoupling) for every player in parallel. Returns a Map
 * keyed by player_id. Players with no Catapult IMA Free Running
 * row for the date map to null — the decision engine treats null
 * as "no signal" rather than "all green".
 */
async function fetchStrideIntelForPlayers(
  sb: ReturnType<typeof getAdminClient>,
  playerIds: string[],
  date: string,
): Promise<Map<string, StrideIntelligencePayload | null>> {
  const out = new Map<string, StrideIntelligencePayload | null>();
  if (!playerIds.length) return out;
  await Promise.all(
    playerIds.map(async (pid) => {
      try {
        const payload = await loadStrideIntelligence(sb, { playerId: pid, date });
        out.set(pid, payload);
      } catch {
        out.set(pid, null);
      }
    }),
  );
  return out;
}

async function fetchYesterdayContext(
  sb: ReturnType<typeof getAdminClient>,
  teamId: string,
  date: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await sb
    .from("training_session_context")
    .select("hsr_m, acc_total, dec_total, total_distance_m, max_velocity_pct, intensity, duration_min")
    .eq("team_id", teamId)
    .eq("session_date", ydayOf(date))
    .maybeSingle();
  if (error) return null;
  return (data as Record<string, unknown> | null) ?? null;
}

async function fetchMdContext(
  sb: ReturnType<typeof getAdminClient>,
  teamId: string,
  date: string
): Promise<string | null> {
  const { data, error } = await sb
    .from("v_training_day_context_team")
    .select("md_day")
    .eq("team_id", teamId)
    .eq("date", date)
    .maybeSingle();
  if (error) return null;
  return (data as { md_day?: string | null } | null)?.md_day ?? null;
}

async function fetchWhoopSnapshots(
  sb: ReturnType<typeof getAdminClient>,
  playerIds: string[]
): Promise<Map<string, NormalizedMonitoringSnapshot>> {
  if (!playerIds.length) return new Map();
  try {
    const { data, error } = await sb
      .from("athlete_monitoring_snapshots")
      .select("athlete_id, date, recovery_score, hrv, resting_hr, respiratory_rate, sleep_performance, sleep_consistency, sleep_efficiency, total_sleep_millis, workout_strain, average_hr, max_hr, raw_payload_json")
      .eq("source", "whoop")
      .in("athlete_id", playerIds)
      .order("date", { ascending: false });

    if (error || !data) return new Map();

    // Keep only the most recent snapshot per player
    const map = new Map<string, NormalizedMonitoringSnapshot>();
    for (const row of data as Array<Record<string, unknown>>) {
      const athleteId = String(row.athlete_id ?? "");
      if (!map.has(athleteId)) {
        map.set(athleteId, {
          athleteId,
          source: "whoop",
          date: String(row.date ?? ""),
          recoveryScore: (row.recovery_score as number | null) ?? undefined,
          hrv: (row.hrv as number | null) ?? undefined,
          restingHr: (row.resting_hr as number | null) ?? undefined,
          respiratoryRate: (row.respiratory_rate as number | null) ?? undefined,
          sleepPerformance: (row.sleep_performance as number | null) ?? undefined,
          sleepConsistency: (row.sleep_consistency as number | null) ?? undefined,
          sleepEfficiency: (row.sleep_efficiency as number | null) ?? undefined,
          totalSleepMillis: (row.total_sleep_millis as number | null) ?? undefined,
          workoutStrain: (row.workout_strain as number | null) ?? undefined,
          averageHr: (row.average_hr as number | null) ?? undefined,
          maxHr: (row.max_hr as number | null) ?? undefined,
          raw: row.raw_payload_json,
        });
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Fetch GymAware VBT sessions for a list of players: today + 28-day history.
 * Returns per-player: { today: VbtSessionRow[], history: VbtSessionRow[] }
 */
async function fetchVbtDataForPlayers(
  sb: ReturnType<typeof getAdminClient>,
  playerIds: string[],
  date: string,
  teamId: string,
): Promise<Map<string, { today: VbtSessionRow[]; history: VbtSessionRow[]; referenceExercise: string }>> {
  const result = new Map<string, { today: VbtSessionRow[]; history: VbtSessionRow[]; referenceExercise: string }>();
  if (!playerIds.length) return result;

  // Check if GymAware is configured for this team
  const { data: settings } = await sb
    .from("gymaware_settings")
    .select("reference_exercise, sync_enabled")
    .eq("team_id", teamId)
    .eq("sync_enabled", true)
    .maybeSingle();

  if (!settings) return result;

  const refExercise = settings.reference_exercise ?? "Trap Bar Deadlift";

  // Compute 28 days back from date
  const dateObj = new Date(`${date}T00:00:00Z`);
  const historyStart = new Date(dateObj);
  historyStart.setUTCDate(historyStart.getUTCDate() - 28);
  const historyStartStr = historyStart.toISOString().slice(0, 10);

  const { data: rows, error } = await sb
    .from("gymaware_vbt_sessions")
    .select("player_id, session_date, exercise_name, load_kg, mean_velocity, peak_velocity")
    .in("player_id", playerIds)
    .gte("session_date", historyStartStr)
    .lte("session_date", date);

  if (error || !rows) return result;

  for (const row of rows as Array<Record<string, unknown>>) {
    const pid = String(row.player_id ?? "");
    if (!pid) continue;

    if (!result.has(pid)) {
      result.set(pid, { today: [], history: [], referenceExercise: refExercise });
    }
    const entry = result.get(pid)!;
    const sessionRow: VbtSessionRow = {
      session_date: String(row.session_date ?? ""),
      exercise_name: String(row.exercise_name ?? ""),
      load_kg: typeof row.load_kg === "number" ? row.load_kg : null,
      mean_velocity: typeof row.mean_velocity === "number" ? row.mean_velocity : null,
      peak_velocity: typeof row.peak_velocity === "number" ? row.peak_velocity : null,
    };

    if (sessionRow.session_date === date) {
      entry.today.push(sessionRow);
    } else {
      entry.history.push(sessionRow);
    }
  }

  return result;
}

/**
 * Bulk-fetch wellness baselines for a list of players, keyed by
 * player_id → metric_key. Used by the injury-risk pipeline to swap
 * the global Likert thresholds (sleep ≤ 2, soreness ≤ 2) for personal
 * z-scores against each player's own 28-day mean+SD (Robertson 2017).
 *
 * Returns an empty Map when the player has no baseline yet — callers
 * fall through to the global threshold so existing behaviour is
 * preserved for new players. We only pull the metrics actually used by
 * the rules engine to keep payload small.
 */
async function fetchWellnessBaselines(
  sb: ReturnType<typeof getAdminClient>,
  playerIds: string[],
): Promise<Map<string, Map<string, AthleteMetricBaseline>>> {
  const out = new Map<string, Map<string, AthleteMetricBaseline>>();
  if (!playerIds.length) return out;
  const { data } = await sb
    .from("athlete_metric_baselines")
    .select("player_id, metric_key, n_observations, mean, sd, cv, median, window_days, status, computed_at")
    .in("player_id", playerIds)
    .in("metric_key", ["wellness.sleep_quality", "wellness.muscle_soreness"]);
  for (const row of (data ?? []) as AthleteMetricBaseline[]) {
    const pid = String(row.player_id);
    if (!out.has(pid)) out.set(pid, new Map());
    out.get(pid)!.set(row.metric_key, row);
  }
  return out;
}


export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoachContext(req);
    const sb = getAdminClient();
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || todayInReykjavik();

    const rows = await fetchCoachRows(sb, teamId, date);
    if (!rows.length) {
      return NextResponse.json(
        serializeTeamDecisionResponse(
          buildTeamDecisionResponse({
            date,
            players: [],
          })
        )
      );
    }

    const playerIds = rows.map((row) => String(row.player_id));

    // Fetch team settings (indoor_mode flag + sport_type)
    const { data: teamSettingsRow } = await sb
      .from("team_settings")
      .select("indoor_mode, sport_type")
      .eq("team_id", teamId)
      .maybeSingle();
    const indoorMode = teamSettingsRow?.indoor_mode === true;
    const sportType = (teamSettingsRow?.sport_type === "basketball" ? "basketball" : "football") as "football" | "basketball";
    // Basketball teams are always indoor regardless of toggle
    const effectiveIndoorMode = sportType === "basketball" ? true : indoorMode;

    const [catapultData, tmByPlayer, rpeAcwrByPlayer, teamRpeMap, ydayContext, mdDay, whoopByPlayer, vbtByPlayer, wellnessBaselinesByPlayer, recentDecisionsByPlayer, signalTrendByPlayer, strideIntelByPlayer, matchRecovery] = await Promise.all([
      fetchCatapultRows(sb, playerIds, date),
      fetchTrainingModifiers(sb, playerIds, date),
      fetchRpeAcwrForPlayers(sb, playerIds, date),
      fetchTeamRpeForDate(sb, playerIds, date),
      fetchYesterdayContext(sb, teamId, date),
      fetchMdContext(sb, teamId, date),
      fetchWhoopSnapshots(sb, playerIds),
      fetchVbtDataForPlayers(sb, playerIds, date, teamId),
      fetchWellnessBaselines(sb, playerIds),
      fetchRecentDecisions(playerIds, 7),
      fetchScoreTrendByPlayer(sb, playerIds, date),
      fetchStrideIntelForPlayers(sb, playerIds, date),
      loadMatchRecoveryInputs(sb, teamId, date).catch(() => ({ matchDate: null, hsrByPlayer: new Map<string, number>() })),
    ]);

    const players: CoachCommandPlayerSource[] = [];
    for (const row of rows) {
      try {
        players.push(
          await buildPlayerSource({
            row,
            date,
            teamId,
            tmRaw: tmByPlayer.get(String(row.player_id))?.training_modifier ?? null,
            catapultRows: (catapultData.normalized.get(String(row.player_id)) ?? []).filter(Boolean),
            rawCatapultRows: catapultData.raw.get(String(row.player_id)) ?? [],
            rpeAcwr: rpeAcwrByPlayer.get(String(row.player_id)) ?? null,
            teamRpeValues: Array.from(teamRpeMap.entries())
              .filter(([pid]) => pid !== String(row.player_id))
              .map(([, rpe]) => rpe),
            ydayContext,
            mdDay,
            matchRecovery: { hsr: matchRecovery.hsrByPlayer.get(String(row.player_id)) ?? null, matchDate: matchRecovery.matchDate },
            whoopSnapshot: whoopByPlayer.get(String(row.player_id)) ?? null,
            vbtData: vbtByPlayer.get(String(row.player_id)) ?? null,
            indoorMode: effectiveIndoorMode,
            sportType,
            wellnessBaselines: wellnessBaselinesByPlayer.get(String(row.player_id)) ?? null,
            recentDecisions: recentDecisionsByPlayer.get(String(row.player_id)) ?? null,
            signalTrend: signalTrendByPlayer.get(String(row.player_id)) ?? null,
            strideIntel: strideIntelByPlayer.get(String(row.player_id)) ?? null,
          })
        );
      } catch {
        players.push({
          athleteId: String(row.player_id),
          athleteName: String(row.full_name ?? "Unknown athlete"),
          readinessScore: toFinite(row.total_score), // total_score (5-25) only — see audit comment above
          cmjRequired: false,
          loadAlerts: [],
          fatigueType: null,
          recommendation: {
            state: "GRAY",
            sessionMode: "pending",
            loadAdjustment: null,
            constraints: ["technique_only"],
            focus: ["monitor_closely"],
            riskFlags: ["manual_review"],
            explanationFactors: [],
            confidence: { score: 0.35, band: "low" },
            coachSummary: "Manual review required. This athlete could not be fully processed.",
            dataQuality: { requiresManualReview: true },
          },
        });
      }
    }

    return NextResponse.json(
      serializeTeamDecisionResponse(
        buildTeamDecisionResponse({
          date,
          players,
        })
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build team decisions.";
    const status =
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : message === "No team context" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

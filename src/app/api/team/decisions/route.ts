import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildTeamDecisionResponse, serializeTeamDecisionResponse, type CoachCommandPlayerSource } from "@/lib/micropulse/coachCommand";
import { buildExplainableReadinessDecision } from "@/lib/micropulse/readiness";
import { buildInjuryRiskDecision } from "@/lib/micropulse/injuryRisk";
import { buildAthleteDecision } from "@/lib/micropulse/domain/decision";
import { buildDailyAthleteSnapshot } from "@/lib/micropulse/domain/snapshot";
import { buildCatapultReadinessContextFromRows, normalizeCatapultDailyLoadRow } from "@/lib/micropulse/externalLoad";
import { getValdDailySnapshot, getValdInjuryRiskSignals, getValdReadinessAdjustment } from "@/lib/micropulse/vald";

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

function normalizeTrainingModifier(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function toFinite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toInt(value: unknown): number | null {
  const parsed = toFinite(value);
  return parsed == null ? null : Math.round(parsed);
}

function extractZ(tmRaw: unknown): number | null {
  const tm = normalizeTrainingModifier(tmRaw);
  return toFinite(tm?.pi && typeof tm.pi === "object" ? (tm.pi as Record<string, unknown>).z : null)
    ?? toFinite(tm?.pi && typeof tm.pi === "object" ? (tm.pi as Record<string, unknown>).z_today : null)
    ?? toFinite(tm?.baseline_z)
    ?? null;
}

function extractYesterdayZ(tmRaw: unknown): number | null {
  const tm = normalizeTrainingModifier(tmRaw);
  const pi = tm?.pi && typeof tm.pi === "object" ? (tm.pi as Record<string, unknown>) : null;
  const explicit = toFinite(pi?.yesterday_z);
  if (explicit != null) return explicit;
  const z = toFinite(pi?.z);
  const delta = toFinite(pi?.delta_z);
  return z != null && delta != null ? z - delta : null;
}

function zToSten(z: number | null): number | null {
  if (typeof z !== "number" || !Number.isFinite(z)) return null;
  return Math.max(1, Math.min(10, Math.round(z * 2 + 5.5)));
}

function deriveLightAteState(row: CoachRow): "GREEN" | "YELLOW" | "RED" | "GRAY" {
  const raw = String(row.final_flag ?? row.final_color ?? "").toUpperCase();
  if (raw === "RED") return "RED";
  if (raw === "YELLOW") return "YELLOW";
  if (raw === "GREEN" || raw === "GREEN_PLUS") return "GREEN";
  return "GRAY";
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
  const query = sb
    .from("v_coach_readiness_today_v8")
    .select("*")
    .eq("entry_date", date)
    .eq("team_id", teamId)
    .order("total_score", { ascending: true })
    .order("full_name", { ascending: true });

  const { data, error } = await query;
  if (!error) return (data ?? []) as CoachRow[];

  const fallback = await sb.from("v_coach_readiness_today_v8").select("*").eq("entry_date", date).order("total_score", { ascending: true }).order("full_name", { ascending: true });
  if (fallback.error) throw fallback.error;
  return ((fallback.data ?? []) as CoachRow[]).filter((row) => String(row.team_id ?? "") === teamId);
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
): Promise<Map<string, ReturnType<typeof normalizeCatapultDailyLoadRow>[]>> {
  if (!playerIds.length) return new Map();
  const start = new Date(`${date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 28);
  const startDate = start.toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("player_external_load_daily")
    .select("*")
    .eq("source", "catapult")
    .in("player_id", playerIds)
    .gte("date", startDate)
    .lte("date", date)
    .order("date", { ascending: true });
  if (error) throw error;

  const byPlayer = new Map<string, ReturnType<typeof normalizeCatapultDailyLoadRow>[]>();
  for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
    const normalized = normalizeCatapultDailyLoadRow(raw);
    if (!normalized) continue;
    const list = byPlayer.get(normalized.playerId) ?? [];
    list.push(normalized);
    byPlayer.set(normalized.playerId, list);
  }
  return byPlayer;
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

async function buildPlayerSource(args: {
  row: CoachRow;
  date: string;
  teamId: string;
  tmRaw: unknown;
  catapultRows: ReturnType<typeof normalizeCatapultDailyLoadRow>[];
  ydayContext: Record<string, unknown> | null;
  mdDay: string | null;
}): Promise<CoachCommandPlayerSource> {
  const tm = normalizeTrainingModifier(args.tmRaw);
  const zToday = extractZ(tm);
  const yZ = extractYesterdayZ(tm);
  const dz = zToday != null && yZ != null ? zToday - yZ : null;
  const catapultContext = buildCatapultReadinessContextFromRows({
    rows: args.catapultRows.filter((row): row is NonNullable<typeof row> => row != null),
    date: args.date,
  });
  const externalToday = catapultContext.today;
  const acwrValue = toFinite((tm?.acwr as unknown) ?? ((tm?.load as Record<string, unknown> | undefined)?.acwr as unknown));
  const volatilityValue = toFinite((tm?.pi as Record<string, unknown> | undefined)?.volatility);
  const hrvValue = toFinite(tm?.hrv);
  const hrvChangePctValue = toFinite(tm?.hrv_change_pct);
  const lightAteState = deriveLightAteState(args.row);

  const snapshot = buildDailyAthleteSnapshot({
    athleteId: String(args.row.player_id),
    date: args.date,
    manual: {
      id: typeof args.row.readiness_entry_id === "string" ? args.row.readiness_entry_id : null,
      totalScore: toFinite(args.row.total_score),
      soreness: toFinite(args.row.muscle_soreness),
      stress: toFinite(args.row.stress_mood),
      mood: toFinite(args.row.stress_mood),
      sleepQuality: toFinite(args.row.sleep_quality),
      motivation: toFinite(args.row.fatigue_energy),
      completed: toFinite(args.row.total_score) != null,
      sourceDate: args.date,
    },
    load: {
      zScore: zToday,
      deltaZ: dz,
      acuteLoad: toInt(args.ydayContext?.hsr_m),
      acwr: acwrValue,
      sessionRpeLoad: toFinite(tm?.session_load),
      volatility5d: volatilityValue,
      sourceDate: args.date,
    },
    context: {
      weekSetupLabel: typeof args.row.md_day === "string" ? args.row.md_day : args.mdDay,
      expectedSessionType: typeof args.row.planned_day_type === "string" ? args.row.planned_day_type : null,
      rehab: false,
      returnToPlay: false,
      sourceDate: args.date,
    },
    externalLoad: {
      totalDistance: externalToday?.totalDistance ?? null,
      highSpeedDistance: externalToday?.hirDist ?? null,
      sprintDistance: externalToday?.velocityBand6TotalDistance ?? null,
      accelerations: externalToday?.accelerations ?? externalToday?.totalAccelerations ?? null,
      decelerations: externalToday?.decelerations ?? externalToday?.totalDecelerations ?? null,
      playerLoad: externalToday?.playerLoad ?? null,
      maxVelocity: externalToday?.maxVelocity ?? null,
      playerLoad7DayAverage: catapultContext.baseline.acute7d.playerLoad / 7,
      sprintDistance7DayAverage: catapultContext.baseline.chronic28dAvg.band6Distance,
      source: externalToday ? "catapult" : null,
      sourceDate: args.date,
    },
  });

  const [valdReadinessAdjustment, valdDailySnapshot, valdInjurySignals] = await Promise.all([
    getValdReadinessAdjustment(args.teamId, String(args.row.player_id), args.date).catch(() => null),
    getValdDailySnapshot(args.teamId, String(args.row.player_id), args.date).catch(() => null),
    getValdInjuryRiskSignals(args.teamId, String(args.row.player_id), args.date).catch(() => null),
  ]);

  const readinessDecision = buildExplainableReadinessDecision({
    playerId: String(args.row.player_id),
    playerName: String(args.row.full_name ?? ""),
    date: args.date,
    dailySnapshot: snapshot,
    readinessScore: toFinite(args.row.readiness) ?? undefined,
    checkinScore: toFinite(args.row.total_score) ?? undefined,
    zScore: zToday ?? undefined,
    deltaZ: dz ?? undefined,
    volatility: volatilityValue ?? undefined,
    sleepScore: toFinite(args.row.sleep_quality) ?? undefined,
    hrvScore: hrvValue ?? undefined,
    hrvChangePct: hrvChangePctValue ?? undefined,
    acuteLoad: toInt(args.ydayContext?.hsr_m) ?? undefined,
    acwr: acwrValue ?? undefined,
    durationMinutes: toFinite(args.ydayContext?.duration_min) ?? undefined,
    sorenessScore: toFinite(args.row.muscle_soreness) ?? undefined,
    sorenessFlag: typeof toFinite(args.row.muscle_soreness) === "number" ? (toFinite(args.row.muscle_soreness) ?? 4) <= 2 : undefined,
    highSpeedRunning: toInt(args.ydayContext?.hsr_m) ?? undefined,
    maxVelocityPct: toFinite(args.ydayContext?.max_velocity_pct) ?? undefined,
    gpsSpike:
      String(args.ydayContext?.intensity ?? "").toUpperCase() !== "OFF" &&
      (toInt(args.ydayContext?.hsr_m) ?? 0) >= 1000,
    recentYellowDays: toFinite(tm?.recent_yellow_days) ?? undefined,
    recentRedDays: toFinite(tm?.recent_red_days) ?? undefined,
    lightAteState,
    catapultDailyLoad: externalToday ?? undefined,
    catapultBaseline: catapultContext.baseline,
    catapultSignals: catapultContext.signals,
    externalLoadState: catapultContext.signals.externalLoadState,
    catapultReadinessModifier: catapultContext.modifier,
    valdDailySnapshot,
    valdReadinessAdjustment,
  });

  const injuryRiskDecision = buildInjuryRiskDecision(
    {
      acwr: acwrValue ?? undefined,
      zScore: zToday ?? undefined,
      deltaZ: dz ?? undefined,
      volatility: volatilityValue ?? undefined,
      recentYellowDays: toFinite(tm?.recent_yellow_days) ?? undefined,
      recentRedDays: toFinite(tm?.recent_red_days) ?? undefined,
      highSpeedRunning: toInt(args.ydayContext?.hsr_m) ?? undefined,
      maxVelocityPct: toFinite(args.ydayContext?.max_velocity_pct) ?? undefined,
      sleepScore: toFinite(args.row.sleep_quality) ?? undefined,
      hrvChangePct: hrvChangePctValue ?? undefined,
      sorenessScore: toFinite(args.row.muscle_soreness) ?? undefined,
      sorenessFlag: typeof toFinite(args.row.muscle_soreness) === "number" ? (toFinite(args.row.muscle_soreness) ?? 4) <= 2 : undefined,
      painFlag: false,
      gpsSpike:
        String(args.ydayContext?.intensity ?? "").toUpperCase() !== "OFF" &&
        (toInt(args.ydayContext?.hsr_m) ?? 0) >= 1000,
      valdHamstringRiskFlag: valdInjurySignals?.hamstringRiskFlag ?? false,
      valdGroinRiskFlag: valdInjurySignals?.groinRiskFlag ?? false,
      valdNeuromuscularRiskFlag: valdInjurySignals?.neuromuscularRiskFlag ?? false,
      valdReasons: valdInjurySignals?.reasons ?? [],
    },
    readinessDecision
  );

  const athleteDecision = buildAthleteDecision({
    snapshot,
    readinessDecision,
    injuryDecision: injuryRiskDecision,
    neural: null,
    hardBlock: false,
  });

  return {
    athleteId: String(args.row.player_id),
    athleteName: String(args.row.full_name ?? ""),
    readinessScore: toFinite(args.row.readiness) ?? toFinite(args.row.total_score),
    recommendation:
      athleteDecision.trainingRecommendation ??
      {
        state: athleteDecision.athleteState,
        sessionMode: athleteDecision.sessionMode,
        loadAdjustment: null,
        constraints: [],
        focus: [],
        riskFlags: [],
        explanationFactors: [],
        confidence: {
          score: athleteDecision.decisionConfidence,
          band: athleteDecision.decisionConfidence >= 0.8 ? "high" : athleteDecision.decisionConfidence >= 0.6 ? "medium" : "low",
        },
        coachSummary: athleteDecision.explanationLines[0] ?? "Decision available.",
        dataQuality: {
          requiresManualReview: athleteDecision.flags.lowDataConfidence,
        },
      },
  };
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
    const [tmByPlayer, catapultByPlayer, ydayContext, mdDay] = await Promise.all([
      fetchTrainingModifiers(sb, playerIds, date),
      fetchCatapultRows(sb, playerIds, date),
      fetchYesterdayContext(sb, teamId, date),
      fetchMdContext(sb, teamId, date),
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
            catapultRows: (catapultByPlayer.get(String(row.player_id)) ?? []).filter(Boolean),
            ydayContext,
            mdDay,
          })
        );
      } catch {
        players.push({
          athleteId: String(row.player_id),
          athleteName: String(row.full_name ?? "Unknown athlete"),
          readinessScore: toFinite(row.readiness) ?? toFinite(row.total_score),
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

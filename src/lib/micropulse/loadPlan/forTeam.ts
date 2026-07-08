/**
 * src/lib/micropulse/loadPlan/forTeam.ts
 *
 * Shared team load-plan assembly. Gathers everything buildLoadPlan needs for a
 * team on a given date — active players, the microcycle (MD) context from Week
 * setup, the 120-day GPS window, today's readiness, recent RPE — and returns the
 * computed LoadPlan plus the readiness rows the caller may need.
 *
 * Extracted from /api/coach/load-plan so the coach Pre-session report AND the
 * player-facing "today's expected load" card read from ONE source and can never
 * disagree. The coach route layers topAttention/readinessSummary on top; the
 * player route takes its own perPlayer slice.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLoadPlan, type LoadRow, type LoadPlan } from "@/lib/micropulse/loadPlan";

export type ReadinessRow = {
  player_id: string;
  full_name: string | null;
  final_color: string | null;
  final_reason: string | null;
  total_score: number | null;
  fatigue_energy: number | null;
  sleep_quality: number | null;
  sleep_duration: number | null;
  stress_mood: number | null;
  muscle_soreness: number | null;
};

export type LoadPlanForTeam = {
  plan: LoadPlan;
  readinessRows: ReadinessRow[];
  readiness: { green: number; yellow: number; red: number } | null;
};

function addDaysISO(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Build the LoadPlan for a team on `sessionDate`. Returns null when the team has
 * no active players. Throws on a GPS read error (callers map to 500). `overrides`
 * lets a caller force the MD context (the coach dashboard passes its already-
 * resolved MD via query params); omit for the auto-resolved microcycle.
 */
export async function buildLoadPlanForTeam(
  sb: SupabaseClient,
  teamId: string,
  sessionDate: string,
  overrides?: { mdDay?: string | null; dayType?: string | null; focus?: string | null },
): Promise<LoadPlanForTeam | null> {
  const today = new Date().toISOString().slice(0, 10);

  // Players on the team.
  const { data: players } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const playerIds = (players ?? []).map((p) => String((p as { id: string }).id));
  const nameById = new Map<string, string>();
  for (const p of (players ?? []) as Array<{ id: string; full_name: string | null }>) nameById.set(String(p.id), (p.full_name ?? "—").trim());
  if (playerIds.length === 0) return null;

  // MD context for the session date.
  let mdDay: string | null = null;
  let dayTypeResolved: string | null = null;
  let focusResolved: string | null = null;
  const daysSincePrev: number | null = null;
  const daysToNext: number | null = null;

  // ── PRIMARY source: the coach's manual Week setup (coach_week_setup) — the
  // SAME source the dashboard's "Planned session load" card reads, so the two
  // never disagree. no_match_intents[weekdayIndex] → MD day, focus, day type.
  try {
    const sd = new Date(sessionDate + "T00:00:00Z");
    const dow = sd.getUTCDay(); // 0=Sun..6=Sat
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(sd); monday.setUTCDate(sd.getUTCDate() + mondayOffset);
    const weekStart = monday.toISOString().slice(0, 10);
    const idx = dow === 0 ? 6 : dow - 1; // Mon=0..Sun=6

    const { data: cws } = await sb
      .from("coach_week_setup")
      .select("no_match_intents")
      .eq("team_id", teamId)
      .eq("week_start_date", weekStart)
      .maybeSingle();
    const intents = (cws as { no_match_intents: string[] | null } | null)?.no_match_intents;
    const intent = Array.isArray(intents) && intents.length === 7 ? String(intents[idx] ?? "").toUpperCase() : null;
    if (intent) {
      const MD_OF: Record<string, string> = {
        FORCE: "MD-4", NEURAL_VELOCITY: "MD-3", VELOCITY: "MD-2", POLISH_CALM: "MD-2", ACTIVATION: "MD-1",
      };
      if (intent === "GAME") { dayTypeResolved = "GAME"; mdDay = "MD"; }
      else if (intent === "OFF" || intent === "RECOVERY") { dayTypeResolved = "OFF"; }
      else if (MD_OF[intent]) { mdDay = MD_OF[intent]; focusResolved = intent; }
    }
  } catch { /* fall through to legacy / baseline */ }

  // ── FALLBACK: legacy match-relative day context, only if Week setup gave nothing.
  if (!mdDay && !dayTypeResolved) {
    try {
      const { data: wsIds } = await sb.from("week_setups").select("id").eq("team_id", teamId);
      const ids = (wsIds ?? []).map((w) => (w as { id: string }).id);
      if (ids.length > 0) {
        const { data: ctx } = await sb
          .from("v_training_day_context")
          .select("md_day, week_setup_id")
          .in("week_setup_id", ids)
          .eq("date", sessionDate)
          .limit(1)
          .maybeSingle();
        if (ctx) mdDay = (ctx as { md_day: string | null }).md_day ?? null;
      }
    } catch { /* no MD context — plan falls back gracefully */ }
  }

  // Caller overrides win (e.g. the dashboard passing its already-resolved MD).
  mdDay = overrides?.mdDay ?? mdDay;
  const dayType = overrides?.dayType ?? dayTypeResolved;
  const focus = overrides?.focus ?? focusResolved;

  // GPS over the lookback window (120 days). PostgREST caps a response at 1000
  // rows, so page through with .range() and assemble the full set.
  const from = addDaysISO(sessionDate, -120);
  const SELECT_COLS = "player_id, date, total_distance, total_player_load, velocity_band5_total_distance, velocity_band6_total_distance, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, ima_fr_band58_total_distance, ima_accel, ima_decel, jumps, ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low, high_speed_distance, sprint_distance, accel_decel_efforts";
  const PAGE = 1000;
  const loadRows: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data: page, error: loadErr } = await sb
      .from("player_external_load_daily")
      .select(SELECT_COLS)
      .in("source", ["catapult", "manual"])
      .in("player_id", playerIds)
      .gte("date", from)
      .lte("date", sessionDate)
      .order("date")
      .range(offset, offset + PAGE - 1);
    if (loadErr) throw new Error(loadErr.message);
    if (!page || page.length === 0) break;
    loadRows.push(...(page as Array<Record<string, unknown>>));
    if (page.length < PAGE) break;
  }

  // Squad readiness check-ins today (canonical v8 view). Only meaningful for today.
  let readiness: { green: number; yellow: number; red: number } | null = null;
  let readinessRows: ReadinessRow[] = [];
  if (sessionDate === today) {
    try {
      const { data: rd } = await sb
        .from("v_coach_readiness_today_v8")
        .select("player_id, full_name, final_color, final_reason, total_score, fatigue_energy, sleep_quality, sleep_duration, stress_mood, muscle_soreness")
        .eq("team_id", teamId)
        .eq("entry_date", sessionDate);
      const seen = new Set<string>();
      readinessRows = ((rd ?? []) as ReadinessRow[]).filter((r) => {
        if (seen.has(r.player_id)) return false;
        seen.add(r.player_id);
        return true;
      });
      if (readinessRows.length > 0) {
        const r = { green: 0, yellow: 0, red: 0 };
        for (const row of readinessRows) {
          const c = String(row.final_color ?? "").toLowerCase();
          if (c === "green") r.green++; else if (c === "yellow") r.yellow++; else if (c === "red") r.red++;
        }
        if (r.green + r.yellow + r.red > 0) readiness = r;
      }
    } catch { /* readiness optional */ }
  }

  // Recent RPE pattern (last 4 weeks, real submissions before today).
  let recentRpe: { avgRpe: number | null; avgDuration: number | null; n: number } | null = null;
  try {
    const rpeFrom = addDaysISO(sessionDate, -28);
    const { data: rpeRows } = await sb
      .from("session_rpe_entries")
      .select("rpe, duration_minutes, is_imputed")
      .eq("team_id", teamId)
      .gte("session_date", rpeFrom)
      .lt("session_date", sessionDate);
    const real = ((rpeRows ?? []) as Array<{ rpe: number | null; duration_minutes: number | null; is_imputed: boolean | null }>)
      .filter((r) => !r.is_imputed && r.rpe != null);
    if (real.length > 0) {
      const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
      const rpes = real.map((r) => Number(r.rpe)).filter((v) => Number.isFinite(v) && v > 0);
      const durs = real.map((r) => Number(r.duration_minutes)).filter((v) => Number.isFinite(v) && v > 0);
      recentRpe = { avgRpe: avg(rpes), avgDuration: avg(durs), n: real.length };
    }
  } catch { /* RPE target is optional */ }

  const plan = buildLoadPlan({
    sessionDate,
    mdDay,
    dayType,
    focus,
    daysSincePrev,
    daysToNext,
    rows: (loadRows as unknown as LoadRow[]),
    nameById,
    readiness,
    recentRpe,
  });

  return { plan, readinessRows, readiness };
}

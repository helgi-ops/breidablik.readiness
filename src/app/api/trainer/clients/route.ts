import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ── helpers ─────────────────────────────────────────── */

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getAdmin() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

interface AuthProfile {
  role: string;
  team_id: string;
}

async function requireTrainerContext(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");

  const sb = getAdmin();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");

  const userId = userRes.user.id;

  const { data: prof } = await sb
    .from("profiles")
    .select("role, team_id")
    .eq("id", userId)
    .maybeSingle();

  const profile = prof as AuthProfile | null;
  const role = String(profile?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF"))
    throw new Error("Forbidden");

  // Accept team_id from query string (frontend sends it when switching teams)
  const url = new URL(req.url);
  const requestedTeamId = url.searchParams.get("team_id");
  const effectiveTeamId = requestedTeamId || profile?.team_id;
  if (!effectiveTeamId) throw new Error("No team context");

  // Verify the coach has access to this team via coach_teams
  if (requestedTeamId && requestedTeamId !== profile?.team_id) {
    const { data: access } = await sb
      .from("coach_teams")
      .select("team_id")
      .eq("coach_id", userId)
      .eq("team_id", requestedTeamId)
      .maybeSingle();
    if (!access) throw new Error("Forbidden: no access to this team");
  }

  const { data: team } = await sb
    .from("teams")
    .select("id, name, team_type, sport")
    .eq("id", effectiveTeamId)
    .maybeSingle();

  return {
    userId,
    teamId: effectiveTeamId,
    teamType: team?.team_type ?? "club_team",
    teamName: team?.name ?? "",
  };
}

/* ── GET /api/trainer/clients ───────────────────────── */
// Returns all clients with their latest readiness + ACWR

export async function GET(req: Request) {
  try {
    const ctx = await requireTrainerContext(req);
    const sb = getAdmin();

    // Get all active players (clients) on this team
    const { data: players, error: playersErr } = await sb
      .from("players")
      .select("id, full_name, user_id, position, sport, is_active, status, created_at")
      .eq("team_id", ctx.teamId)
      .eq("is_active", true)
      .order("full_name");

    if (playersErr) throw new Error(playersErr.message);
    if (!players || players.length === 0) {
      return NextResponse.json({ clients: [], team: { id: ctx.teamId, name: ctx.teamName, type: ctx.teamType } });
    }

    const playerIds = players.map((p) => p.id);
    const today = new Date().toISOString().split("T")[0];

    // Fetch today's readiness for all clients
    const { data: readiness } = await sb
      .from("readiness_entries")
      .select("player_id, total_score, fatigue_energy, sleep_quality, sleep_duration, stress_mood, muscle_soreness, sore_areas, notes")
      .in("player_id", playerIds)
      .eq("entry_date", today);

    // Fetch latest load metrics (ACWR) for all clients
    const { data: loadMetrics } = await sb
      .from("player_load_metrics")
      .select("player_id, metric_date, daily_load, acute_load_7d, chronic_load_28d, acwr, load_trend")
      .in("player_id", playerIds)
      .order("metric_date", { ascending: false });

    // Fetch active plans for all clients
    const { data: plans } = await sb
      .from("individual_training_plans")
      .select("id, player_id, plan_name, plan_type, status, start_date, end_date")
      .in("player_id", playerIds)
      .eq("status", "active");

    // Fetch today's training log (completion status)
    const { data: todayLog } = await sb
      .from("individual_training_log")
      .select("player_id, completed, skipped")
      .in("player_id", playerIds)
      .eq("log_date", today);

    // Build readiness map
    const readinessMap = new Map<string, (typeof readiness extends (infer T)[] | null ? T : never)>();
    readiness?.forEach((r) => readinessMap.set(r.player_id, r));

    // Build latest ACWR map (most recent per player)
    const acwrMap = new Map<string, (typeof loadMetrics extends (infer T)[] | null ? T : never)>();
    loadMetrics?.forEach((m) => {
      if (!acwrMap.has(m.player_id)) acwrMap.set(m.player_id, m);
    });

    // Build plan map
    const planMap = new Map<string, (typeof plans extends (infer T)[] | null ? T : never)>();
    plans?.forEach((p) => {
      if (!planMap.has(p.player_id)) planMap.set(p.player_id, p);
    });

    // Build today's completion map
    const completionMap = new Map<string, { completed: number; skipped: number; total: number }>();
    todayLog?.forEach((l) => {
      const existing = completionMap.get(l.player_id) || { completed: 0, skipped: 0, total: 0 };
      existing.total++;
      if (l.completed) existing.completed++;
      if (l.skipped) existing.skipped++;
      completionMap.set(l.player_id, existing);
    });

    // Compute readiness zone
    function getZone(totalScore: number | null): "green" | "yellow" | "red" | "none" {
      if (totalScore == null) return "none";
      const pct = ((totalScore - 5) / 20) * 100;
      if (pct >= 65) return "green";
      if (pct >= 40) return "yellow";
      return "red";
    }

    // Assemble client list
    const clients = players.map((p) => {
      const r = readinessMap.get(p.id);
      const m = acwrMap.get(p.id);
      const plan = planMap.get(p.id);
      const comp = completionMap.get(p.id);

      return {
        id: p.id,
        name: p.full_name,
        hasAccount: !!p.user_id,
        position: p.position,
        checkedInToday: !!r,
        readiness: r
          ? {
              totalScore: r.total_score,
              zone: getZone(r.total_score),
              fatigue: r.fatigue_energy,
              sleep: r.sleep_quality,
              sleepDuration: r.sleep_duration,
              stress: r.stress_mood,
              soreness: r.muscle_soreness,
              soreAreas: r.sore_areas,
            }
          : null,
        load: m
          ? {
              acwr: m.acwr,
              trend: m.load_trend,
              dailyLoad: m.daily_load,
              acute7d: m.acute_load_7d,
              chronic28d: m.chronic_load_28d,
            }
          : null,
        plan: plan
          ? {
              id: plan.id,
              name: plan.plan_name,
              type: plan.plan_type,
            }
          : null,
        todayCompletion: comp || null,
      };
    });

    return NextResponse.json({
      clients,
      team: { id: ctx.teamId, name: ctx.teamName, type: ctx.teamType },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

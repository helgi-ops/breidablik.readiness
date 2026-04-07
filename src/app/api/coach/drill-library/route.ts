export const runtime = "nodejs";

/**
 * /api/coach/drill-library
 *
 * GET  — list drills for the coach's team (team-scoped)
 *        ?team_id=...&category=...&q=...
 * POST — create a coach drill (source='coach')
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

const CATEGORIES = [
  // Football
  "possession",
  "ssg",
  "transition",
  "running",
  "finishing",
  // Basketball
  "shooting",
  "fast_break",
  "half_court_offense",
  "defense",
  "conditioning",
  // Shared
  "warmup",
  "other",
] as const;

async function getCoachTeam(req: NextRequest, targetTeamId?: string | null) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Vantar auðkenningu", status: 401 };

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Ógilt token", status: 401 };

  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("team_id, role")
    .eq("id", userId)
    .maybeSingle();

  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role))
    return { error: "Aðeins staff getur gert þetta", status: 403 };

  const primaryTeamId = prof?.team_id as string | null;
  if (!primaryTeamId) return { error: "Coach er ekki tengdur liði", status: 400 };

  if (!targetTeamId) return { userId, teamId: primaryTeamId, role };
  if (targetTeamId === primaryTeamId) return { userId, teamId: targetTeamId, role };

  const { data: coachRow } = await supabase
    .from("coach_teams")
    .select("team_id")
    .eq("coach_id", userId)
    .eq("team_id", targetTeamId)
    .maybeSingle();

  if (!coachRow)
    return { error: "Þú hefur ekki aðgang að þessu liði", status: 403 };

  return { userId, teamId: targetTeamId, role };
}

function num(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// ── GET ────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const requestedTeamId = req.nextUrl.searchParams.get("team_id") || null;
  const auth = await getCoachTeam(req, requestedTeamId);
  if ("error" in auth)
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const supabase = getSupabase();
  const category = req.nextUrl.searchParams.get("category");
  const q = req.nextUrl.searchParams.get("q");
  const mine = req.nextUrl.searchParams.get("mine");

  let query = supabase
    .from("drill_library")
    .select("*")
    .eq("team_id", auth.teamId)
    .is("deleted_at", null)
    .order("category", { ascending: true })
    .order("drill_name", { ascending: true });

  if (mine === "1" || mine === "true") {
    query = query.eq("created_by", auth.userId);
  }
  if (category && (CATEGORIES as readonly string[]).includes(category)) {
    query = query.eq("category", category);
  }
  if (q) {
    const like = `%${q}%`;
    query = query.or(`drill_name.ilike.${like},description.ilike.${like}`);
  }

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    drills: data ?? [],
    currentUserId: auth.userId,
    isAdmin: auth.role === "ADMIN",
  });
}

// ── POST ───────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  const requestedTeamId = (body.team_id ?? "").trim() || null;
  const auth = await getCoachTeam(req, requestedTeamId);
  if ("error" in auth)
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const category = String(body.category ?? "");
  const drill_name = String(body.drill_name ?? "").trim();

  if (!drill_name)
    return NextResponse.json({ ok: false, error: "drill_name vantar" }, { status: 400 });
  if (!(CATEGORIES as readonly string[]).includes(category))
    return NextResponse.json(
      { ok: false, error: `category verður að vera eitt af: ${CATEGORIES.join(", ")}` },
      { status: 400 }
    );

  const payload = {
    team_id: auth.teamId,
    category,
    drill_name,
    description: body.description ?? null,
    drill_format: body.drill_format ?? null,
    field_length_m: num(body.field_length_m),
    field_width_m: num(body.field_width_m),
    total_players:
      body.total_players === "" || body.total_players == null
        ? null
        : parseInt(body.total_players, 10),
    reps: body.reps ?? null,
    duration_min: num(body.duration_min),
    distance_m: num(body.distance_m),
    vel_b5: num(body.vel_b5),
    vel_b6: num(body.vel_b6),
    hir_total: num(body.hir_total),
    player_load: num(body.player_load),
    player_load_per_min: num(body.player_load_per_min),
    accel_b23: num(body.accel_b23),
    decel_b23: num(body.decel_b23),
    accel_total: num(body.accel_total),
    decel_total: num(body.decel_total),
    metabolic_power_avg: num(body.metabolic_power_avg),
    metabolic_power_peak: num(body.metabolic_power_peak),
    hmld_m: num(body.hmld_m),
    time_above_threshold_s: num(body.time_above_threshold_s),
    jump_count: num(body.jump_count),
    ima_cod_total: num(body.ima_cod_total),
    high_ima: num(body.high_ima),
    source: "coach" as const,
    created_by: auth.userId,
  };

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("drill_library")
    .insert(payload)
    .select()
    .single();

  if (error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, drill: data }, { status: 201 });
}

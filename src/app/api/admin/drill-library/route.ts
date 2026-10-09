export const runtime = "nodejs";

/**
 * POST /api/admin/drill-library — an ADMIN creates a drill INSIDE another coach's
 * library (or that coach's team library). Mirrors the insert shape of the coach
 * POST (/api/coach/drill-library) exactly, but the owner is the TARGET coach, not
 * the caller. source='admin_upload' records the provenance.
 *
 * Strictly ADMIN-gated (403 for non-admin / missing token). Uses the service-role
 * server client (bypasses RLS) like the other routes.
 *
 * Load columns stay null unless provided — measured load fills from the team's own
 * GPS over time, never from an admin's manual entry.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { resolveTeamSport } from "@/lib/micropulse/weekSetup/resolveSport";
import { normalizeDrillName } from "@/lib/micropulse/drillLibrary/normalizeDrillName";

// Same category list as the coach POST (football + basketball + shared).
const CATEGORIES = [
  "possession",
  "ssg",
  "transition",
  "running",
  "finishing",
  "shooting",
  "fast_break",
  "half_court_offense",
  "defense",
  "conditioning",
  "warmup",
  "other",
] as const;

async function requireAdmin(req: NextRequest) {
  const sb = getSupabaseServer();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 as const };

  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 as const };

  const { data: prof } = await sb
    .from("profiles")
    .select("role, is_admin")
    .eq("id", userRes.user.id)
    .maybeSingle();

  // Admin = the canonical `is_admin` flag (what the /admin layout gates on) OR role='ADMIN'.
  const p = (prof as { role?: string; is_admin?: boolean } | null) ?? {};
  const isAdmin = p.is_admin === true || String(p.role ?? "").toUpperCase() === "ADMIN";
  if (!isAdmin) return { error: "Admin only", status: 403 as const };

  return { sb, uid: userRes.user.id };
}

function num(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin)
    return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
  const { sb, uid } = admin;

  const body = await req.json().catch(() => null);
  if (!body)
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });

  const targetCoachId = String(body.target_coach_id ?? "").trim();
  if (!targetCoachId)
    return NextResponse.json({ ok: false, error: "target_coach_id vantar" }, { status: 400 });

  // Resolve the target coach → their team (the target team).
  const { data: targetProf } = await sb
    .from("profiles")
    .select("id, team_id, role")
    .eq("id", targetCoachId)
    .maybeSingle();
  const target = targetProf as { id?: string; team_id?: string | null } | null;
  if (!target?.id)
    return NextResponse.json({ ok: false, error: "Target coach not found" }, { status: 404 });

  const targetTeamId = target.team_id ?? null;
  if (!targetTeamId)
    return NextResponse.json({ ok: false, error: "Target coach has no team" }, { status: 400 });

  const category = String(body.category ?? "");
  const drill_name = normalizeDrillName(String(body.drill_name ?? "").trim());
  if (!drill_name)
    return NextResponse.json({ ok: false, error: "drill_name vantar" }, { status: 400 });
  if (!(CATEGORIES as readonly string[]).includes(category))
    return NextResponse.json(
      { ok: false, error: `category verður að vera eitt af: ${CATEGORIES.join(", ")}` },
      { status: 400 },
    );

  // owner_scope: 'coach' (default — Emil's personal library, matches scope=my) or 'team'.
  const owner_scope = body.owner_scope === "team" ? "team" : "coach";
  const owner_type = owner_scope;
  const owner_coach_id = owner_scope === "coach" ? targetCoachId : null;
  const owner_team_id = owner_scope === "team" ? targetTeamId : null;

  // Stamp the target team's sport so the drill surfaces only for that sport.
  const sport = await resolveTeamSport(sb, targetTeamId);

  const payload = {
    team_id: owner_team_id,
    owner_type,
    owner_coach_id,
    sport,
    category,
    drill_name,
    description: body.description ?? null,
    drill_format: body.drill_format ?? null,
    field_length_m: num(body.field_length_m),
    field_width_m: num(body.field_width_m),
    total_players:
      body.total_players === "" || body.total_players == null
        ? null
        : parseInt(String(body.total_players), 10),
    reps: body.reps ?? null,
    stimulus_type: ["mechanical", "locomotive", "mixed", "technical"].includes(body.stimulus_type)
      ? body.stimulus_type
      : null,
    video_url: body.video_url ? String(body.video_url).trim() : null,
    cup_principle: ["collective", "unit", "positional"].includes(body.cup_principle)
      ? body.cup_principle
      : null,
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
    source: "admin_upload" as const,
    created_by: uid,
  };

  // DEDUPE/UPSERT: re-uploading the same name for the same owner updates the existing
  // row instead of creating a duplicate. Match on ownership + sport + normalized name,
  // and only among non-deleted rows.
  let existingQuery = sb
    .from("drill_library")
    .select("id")
    .is("deleted_at", null)
    .eq("owner_type", owner_type)
    .eq("sport", sport)
    .eq("drill_name", drill_name);
  existingQuery =
    owner_scope === "coach"
      ? existingQuery.eq("owner_coach_id", targetCoachId)
      : existingQuery.eq("team_id", targetTeamId);

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing?.id) {
    const { data, error } = await sb
      .from("drill_library")
      .update(payload)
      .eq("id", existing.id as string)
      .select()
      .single();
    if (error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, drill: data });
  }

  const { data, error } = await sb
    .from("drill_library")
    .insert(payload)
    .select()
    .single();
  if (error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, drill: data }, { status: 201 });
}

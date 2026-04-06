export const runtime = "nodejs";

/**
 * POST /api/coach/drill-library/from-template
 *
 * Body: { team_id?: string, template_id: string }
 *
 * Copies a public template into the coach's team drill_library with
 * source='public_template' and parent_template_id set.
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

  if (!targetTeamId) return { userId, teamId: primaryTeamId };
  if (targetTeamId === primaryTeamId) return { userId, teamId: targetTeamId };

  const { data: coachRow } = await supabase
    .from("coach_teams")
    .select("team_id")
    .eq("coach_id", userId)
    .eq("team_id", targetTeamId)
    .maybeSingle();

  if (!coachRow)
    return { error: "Þú hefur ekki aðgang að þessu liði", status: 403 };

  return { userId, teamId: targetTeamId };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const requestedTeamId = (body.team_id ?? "").trim() || null;
  const template_id = (body.template_id ?? "").trim();

  if (!template_id)
    return NextResponse.json({ ok: false, error: "template_id vantar" }, { status: 400 });

  const auth = await getCoachTeam(req, requestedTeamId);
  if ("error" in auth)
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const supabase = getSupabase();

  const { data: template, error: tErr } = await supabase
    .from("drill_library_public")
    .select("*")
    .eq("id", template_id)
    .maybeSingle();

  if (tErr)
    return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });
  if (!template)
    return NextResponse.json({ ok: false, error: "Template fannst ekki" }, { status: 404 });

  const payload = {
    team_id: auth.teamId,
    category: template.category,
    drill_name: template.drill_name,
    description: template.description,
    drill_format: template.drill_format,
    field_length_m: template.field_length_m,
    field_width_m: template.field_width_m,
    total_players: template.total_players,
    reps: template.reps,
    duration_min: template.duration_min,
    distance_m: template.distance_m,
    vel_b5: template.vel_b5,
    vel_b6: template.vel_b6,
    hir_total: template.hir_total,
    player_load: template.player_load,
    player_load_per_min: template.player_load_per_min,
    accel_b23: template.accel_b23,
    decel_b23: template.decel_b23,
    accel_total: (template as { accel_total?: number | null }).accel_total ?? null,
    decel_total: (template as { decel_total?: number | null }).decel_total ?? null,
    metabolic_power_avg: (template as { metabolic_power_avg?: number | null }).metabolic_power_avg ?? null,
    metabolic_power_peak: (template as { metabolic_power_peak?: number | null }).metabolic_power_peak ?? null,
    hmld_m: (template as { hmld_m?: number | null }).hmld_m ?? null,
    time_above_threshold_s: (template as { time_above_threshold_s?: number | null }).time_above_threshold_s ?? null,
    source: "public_template" as const,
    parent_template_id: template.id,
    created_by: auth.userId,
  };

  const { data: inserted, error: iErr } = await supabase
    .from("drill_library")
    .insert(payload)
    .select()
    .single();

  if (iErr)
    return NextResponse.json({ ok: false, error: iErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, drill: inserted }, { status: 201 });
}

export const runtime = "nodejs";

/**
 * /api/coach/drill-library/[id]
 *
 * PATCH  — update editable fields on a drill (team-scoped)
 * DELETE — soft delete (sets deleted_at)
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

const NUMERIC_FIELDS = [
  "field_length_m",
  "field_width_m",
  "duration_min",
  "distance_m",
  "vel_b5",
  "vel_b6",
  "hir_total",
  "player_load",
  "player_load_per_min",
  "accel_b23",
  "decel_b23",
  "accel_total",
  "decel_total",
  "metabolic_power_avg",
  "metabolic_power_peak",
  "hmld_m",
  "time_above_threshold_s",
  "jump_count",
  "ima_cod_total",
  "high_ima",
] as const;

const EDITABLE_FIELDS = [
  "category",
  "drill_name",
  "description",
  "drill_format",
  "field_length_m",
  "field_width_m",
  "total_players",
  "reps",
  ...NUMERIC_FIELDS,
] as const;

async function authAndGetTeam(req: NextRequest) {
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

  return { userId, primaryTeamId: prof?.team_id as string | null, role };
}

async function ensureDrillAccess(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  primaryTeamId: string | null,
  role: string,
  drillId: string,
  requireOwnership: boolean
) {
  const { data: drill, error } = await supabase
    .from("drill_library")
    .select("id, team_id, created_by")
    .eq("id", drillId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { error: error.message, status: 500 };
  if (!drill) return { error: "Drilla fannst ekki", status: 404 };

  // Team access check
  if (primaryTeamId !== drill.team_id) {
    const { data: coachRow } = await supabase
      .from("coach_teams")
      .select("team_id")
      .eq("coach_id", userId)
      .eq("team_id", drill.team_id)
      .maybeSingle();

    if (!coachRow)
      return { error: "Þú hefur ekki aðgang að þessari drillu", status: 403 };
  }

  // Ownership check for edit/delete — only the creator or ADMIN can modify
  if (requireOwnership && role !== "ADMIN" && drill.created_by !== userId) {
    return {
      error:
        "Þú getur aðeins breytt/eytt þínum eigin drillum. Afritaðu drilluna í Mitt Library til að breyta.",
      status: 403,
    };
  }

  return { teamId: drill.team_id as string };
}

// ── PATCH ──────────────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authRes = await authAndGetTeam(req);
  if ("error" in authRes)
    return NextResponse.json({ ok: false, error: authRes.error }, { status: authRes.status });

  const supabase = getSupabase();
  const access = await ensureDrillAccess(supabase, authRes.userId, authRes.primaryTeamId, authRes.role, id, true);
  if ("error" in access)
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  const body = await req.json();
  const patch: Record<string, unknown> = {};

  for (const key of EDITABLE_FIELDS) {
    if (key in body) {
      const v = body[key];
      if (key === "category") {
        if (!(CATEGORIES as readonly string[]).includes(v))
          return NextResponse.json(
            { ok: false, error: `category verður að vera eitt af: ${CATEGORIES.join(", ")}` },
            { status: 400 }
          );
        patch[key] = v;
      } else if (key === "total_players") {
        patch[key] = v === "" || v == null ? null : parseInt(v, 10);
      } else if ((NUMERIC_FIELDS as readonly string[]).includes(key)) {
        patch[key] = v === "" || v == null ? null : Number(v);
      } else {
        patch[key] = v === "" ? null : v;
      }
    }
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ ok: false, error: "Ekkert að uppfæra" }, { status: 400 });

  const { data, error } = await supabase
    .from("drill_library")
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .single();

  if (error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, drill: data });
}

// ── DELETE (soft) ──────────────────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authRes = await authAndGetTeam(req);
  if ("error" in authRes)
    return NextResponse.json({ ok: false, error: authRes.error }, { status: authRes.status });

  const supabase = getSupabase();
  const access = await ensureDrillAccess(supabase, authRes.userId, authRes.primaryTeamId, authRes.role, id, true);
  if ("error" in access)
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  const { error } = await supabase
    .from("drill_library")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

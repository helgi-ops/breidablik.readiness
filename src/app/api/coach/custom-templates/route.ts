export const runtime = "nodejs";

/**
 * /api/coach/custom-templates
 *
 * GET  — list all custom template sets for the authenticated coach's team
 * POST — create a new template set (creates dynamic table + saves records)
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

/**
 * Authenticate the coach and resolve which team to operate on.
 *
 * If `targetTeamId` is supplied (non-null), we verify the coach has access to
 * that team (either via profiles.team_id OR a coach_teams row).
 * If `targetTeamId` is null we fall back to profiles.team_id (primary team).
 */
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

  // If no specific team requested, use primary
  if (!targetTeamId) return { userId, teamId: primaryTeamId };

  // Requested team is same as primary — fine
  if (targetTeamId === primaryTeamId) return { userId, teamId: targetTeamId };

  // Check coach_teams for access to the requested team
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

// ── GET ────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Optional ?team_id= so multi-team coaches can list sets for a specific team
  const requestedTeamId = req.nextUrl.searchParams.get("team_id") || null;
  const auth = await getCoachTeam(req, requestedTeamId);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const supabase = getSupabase();

  // ?table_name=xxx  →  return GREEN records for that table (for editing)
  const table_name = req.nextUrl.searchParams.get("table_name");
  if (table_name) {
    if (!/^[a-z][a-z0-9_]*$/.test(table_name))
      return NextResponse.json({ ok: false, error: "Ógilt table_name" }, { status: 400 });

    const { data: records, error: rErr } = await supabase.rpc("read_custom_template_records", {
      p_table_name: table_name,
      p_team_id:    auth.teamId,
    });
    if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 });

    // Return only GREEN records so UI can pre-populate the builder
    const green = (records ?? []).filter((r: { readiness_level: string }) => r.readiness_level === "GREEN");
    return NextResponse.json({ ok: true, records: green });
  }

  // No table_name  →  list all sets (metadata only)
  const { data, error } = await supabase
    .from("custom_template_sets")
    .select("id, set_name, sport, gender, season_phase, table_name, md_days, created_at")
    .eq("team_id", auth.teamId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sets: data ?? [] });
}

// ── POST ───────────────────────────────────────────────────────────────────────
type PostBody = {
  team_id?: string | null;  // optional — for multi-team coaches
  set_name: string;
  sport: string;
  gender?: string | null;
  season_phase?: string | null;
  table_name: string;   // pre-computed slug from client
  md_days: string[];
  records: Array<{
    md_day: string;
    readiness_level: string;
    title: string;
    description?: string;
    structure: unknown[];
    variant: string;
  }>;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<PostBody>;
  // Allow multi-team coaches to save for a specific team
  const requestedTeamId = (body.team_id ?? "").trim() || null;
  const auth = await getCoachTeam(req, requestedTeamId);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const set_name     = (body.set_name   ?? "").trim();
  const sport        = (body.sport      ?? "").trim();
  const gender       = body.gender === "M" || body.gender === "F" ? body.gender : null;
  const table_name   = (body.table_name ?? "").trim().toLowerCase();
  const md_days      = Array.isArray(body.md_days) ? body.md_days : [];
  const records      = Array.isArray(body.records) ? body.records : [];
  const VALID_PHASES = ["preseason", "inseason", "playoffs", "offseason"] as const;
  const season_phase = VALID_PHASES.includes(body.season_phase as typeof VALID_PHASES[number])
    ? body.season_phase as string
    : null;

  if (!set_name || !sport || !table_name)
    return NextResponse.json({ ok: false, error: "set_name, sport og table_name vantar" }, { status: 400 });

  if (!/^[a-z][a-z0-9_]*$/.test(table_name))
    return NextResponse.json({ ok: false, error: "Ógilt table_name — aðeins lágstafir, tölur og _" }, { status: 400 });

  if (records.length === 0)
    return NextResponse.json({ ok: false, error: "Engar færslur til að vista" }, { status: 400 });

  const supabase = getSupabase();

  // 1) Create the dynamic table
  const { error: createErr } = await supabase.rpc("create_custom_microdose_table", {
    p_table_name: table_name,
  });
  if (createErr) return NextResponse.json({ ok: false, error: createErr.message }, { status: 500 });

  // 2) Save records
  const { error: saveErr } = await supabase.rpc("save_custom_template_records", {
    p_table_name: table_name,
    p_team_id:    auth.teamId,
    p_records:    records as unknown as string,
  });
  if (saveErr) return NextResponse.json({ ok: false, error: saveErr.message }, { status: 500 });

  // 3) Upsert metadata — merge md_days so existing days are preserved
  // First read current md_days if set already exists
  const { data: existing } = await supabase
    .from("custom_template_sets")
    .select("md_days")
    .eq("team_id", auth.teamId)
    .eq("table_name", table_name)
    .maybeSingle();

  const existingDays: string[] = Array.isArray(existing?.md_days) ? existing.md_days : [];
  const mergedDays = Array.from(new Set([...existingDays, ...md_days]));

  const { error: metaErr } = await supabase
    .from("custom_template_sets")
    .upsert(
      {
        team_id:      auth.teamId,
        set_name,
        sport,
        gender,
        season_phase,
        table_name,
        md_days:      mergedDays,
        created_by:   auth.userId,
      },
      { onConflict: "team_id,set_name,sport" }
    );
  if (metaErr) return NextResponse.json({ ok: false, error: metaErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    table_name,
    records_saved: records.length,
    md_days_total: mergedDays,
  });
}

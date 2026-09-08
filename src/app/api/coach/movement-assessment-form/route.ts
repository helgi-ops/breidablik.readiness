/**
 * Movement Screening Assessment Form — GET the latest saved form for a player;
 * POST a new one (consent-gated, team-scoped). The form records structured
 * observations across a battery (observation → hypothesis → confirmation) which
 * feed the deficit ledger. Screening/training only — never a diagnosis, never the
 * readiness colour; pain / red flags → clinician.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Ctx = { sb: SupabaseClient; uid: string; teamId: string | null; role: string };

async function requireCoach(req: NextRequest): Promise<Ctx | { error: string; status: number }> {
  const sb = getSupabaseServer();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 };
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 };
  const uid = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", uid).maybeSingle();
  const p = (prof ?? {}) as { role?: string; team_id?: string | null };
  const role = String(p.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 };
  return { sb, uid, teamId: p.team_id ?? null, role };
}

async function resolvePlayerTeam(ctx: Ctx, playerId: string): Promise<string> {
  const { data } = await ctx.sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
  return (data as { team_id?: string } | null)?.team_id ?? ctx.teamId ?? "";
}
async function coachCanAccessTeam(ctx: Ctx, teamId: string): Promise<boolean> {
  if (ctx.role === "ADMIN") return true;
  if (ctx.teamId && ctx.teamId === teamId) return true;
  const { data } = await ctx.sb.from("coach_teams").select("team_id").eq("coach_id", ctx.uid).eq("team_id", teamId).maybeSingle();
  return !!data;
}
async function hasActiveConsent(ctx: Ctx, playerId: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data } = await ctx.sb
    .from("player_consents").select("id")
    .eq("player_id", playerId).eq("consent_type", "data_processing")
    .is("revoked_at", null).or(`valid_to.is.null,valid_to.gt.${nowIso}`)
    .limit(1).maybeSingle();
  return !!data;
}

export async function GET(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const playerId = new URL(req.url).searchParams.get("player_id") ?? "";
  if (!playerId) return NextResponse.json({ error: "player_id required" }, { status: 400 });
  const teamId = await resolvePlayerTeam(ctx, playerId);
  if (!teamId || !(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data } = await ctx.sb
    .from("movement_assessment_forms")
    .select("id, assessment_date, battery, results, fired, created_at")
    .eq("player_id", playerId)
    .order("assessment_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ ok: true, form: data ?? null });
}

export async function POST(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => ({}));
  const b = body as { player_id?: string; assessment_date?: string; battery?: unknown; results?: unknown; fired?: unknown };
  const playerId = String(b.player_id ?? "");
  if (!playerId) return NextResponse.json({ error: "player_id required" }, { status: 400 });
  const teamId = await resolvePlayerTeam(ctx, playerId);
  if (!teamId || !(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await hasActiveConsent(ctx, playerId))) {
    return NextResponse.json({ error: "Player consent (data_processing) is required before storing an assessment for this player." }, { status: 403 });
  }

  const battery = Array.isArray(b.battery) ? (b.battery as unknown[]).map(String) : [];
  const results = b.results && typeof b.results === "object" ? b.results : {};
  const fired = Array.isArray(b.fired) ? b.fired : [];
  const assessmentDate = String(b.assessment_date ?? new Date().toISOString().slice(0, 10));

  const { data, error } = await ctx.sb.from("movement_assessment_forms").insert({
    team_id: teamId,
    player_id: playerId,
    assessment_date: assessmentDate,
    battery,
    results,
    fired,
    created_by: ctx.uid,
  }).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: (data as { id?: string } | null)?.id ?? null });
}

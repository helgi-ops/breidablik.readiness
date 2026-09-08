/**
 * Clinical assessment (King "Initial Ax") — GET the latest record; POST a new one
 * (consent-gated, team-scoped). A CLINICIAN records ROM / strength (0-5) / global
 * movement, R/L + pain; its flagged fields write CONFIRMED deficits into the
 * unified ledger. Screening / rehab-support only — never the readiness colour;
 * pain / red flags stay with the clinician.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { KING_ASSESSMENT_BY_ID } from "@/lib/micropulse/movementScreen/king/assessment";

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
  const { data } = await ctx.sb.from("player_consents").select("id")
    .eq("player_id", playerId).eq("consent_type", "data_processing")
    .is("revoked_at", null).or(`valid_to.is.null,valid_to.gt.${nowIso}`).limit(1).maybeSingle();
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
    .from("player_clinical_assessments")
    .select("id, assessment_date, fields, pain_reported, created_at")
    .eq("player_id", playerId).order("assessment_date", { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({ ok: true, assessment: data ?? null });
}

export async function POST(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => ({}));
  const b = body as { player_id?: string; assessment_date?: string; fields?: unknown };
  const playerId = String(b.player_id ?? "");
  if (!playerId) return NextResponse.json({ error: "player_id required" }, { status: 400 });
  const teamId = await resolvePlayerTeam(ctx, playerId);
  if (!teamId || !(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await hasActiveConsent(ctx, playerId))) {
    return NextResponse.json({ error: "Player consent (data_processing) is required before storing a clinical assessment." }, { status: 403 });
  }

  // Keep only known Initial-Ax fields with a value / pain / flag.
  const raw = Array.isArray(b.fields) ? (b.fields as Array<Record<string, unknown>>) : [];
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
  const fields = raw
    .filter((f) => typeof f.fieldId === "string" && KING_ASSESSMENT_BY_ID[String(f.fieldId)])
    .map((f) => ({ fieldId: String(f.fieldId), scoreR: num(f.scoreR), scoreL: num(f.scoreL), pain: num(f.pain), flag: f.flag === true }))
    .filter((f) => f.scoreR != null || f.scoreL != null || f.pain != null || f.flag);
  const painReported = fields.some((f) => (f.pain ?? 0) >= 1);

  const { data, error } = await ctx.sb.from("player_clinical_assessments").insert({
    team_id: teamId, player_id: playerId,
    assessment_date: String(b.assessment_date ?? new Date().toISOString().slice(0, 10)),
    fields, pain_reported: painReported, created_by: ctx.uid,
  }).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: (data as { id?: string } | null)?.id ?? null, saved: fields.length });
}

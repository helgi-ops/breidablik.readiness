/**
 * /api/coach/team/periodization-model — the coach's own periodization principles for a team.
 *
 *   GET  [?team_id=]                              → { ok, source, days } (days only when source='custom')
 *   PUT  { teamId?, source, days? }               → upsert the team's chosen model
 *   POST { teamId?, sessionDate?, mdDay?, modelSource?, verdict?, warnings?, reason? }
 *                                                 → append an advisory-override log row
 *
 * The model drives the Session Builder MD-fit advisory (sessionFitCheck). Descriptive planning
 * layer — it never reads or writes a readiness colour or the daily decision. Advisory only: the
 * POST records that a coach kept a session the advisory flagged; it never blocked anything.
 *
 * Auth: coach/admin/staff. Non-admins may only touch their own team (or a coach_teams team).
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const SOURCES = new Set(["default_md", "tactical_periodization", "custom"]);

async function requireCoachTeam(req: Request, requestedTeamId?: string | null) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return { error: "Unauthorized", status: 401 } as const;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Forbidden", status: 403 } as const;

  const ownTeam = (prof as { team_id?: string | null } | null)?.team_id ?? null;
  const teamId = requestedTeamId || ownTeam;
  if (!teamId) return { error: "No team context", status: 400 } as const;

  if (role !== "ADMIN" && teamId !== ownTeam) {
    const { data: ct } = await sb.from("coach_teams").select("team_id")
      .eq("coach_id", userId).eq("team_id", teamId).maybeSingle();
    if (!ct) return { error: "Forbidden", status: 403 } as const;
  }
  return { sb, userId, teamId } as const;
}

export async function GET(req: Request) {
  const requested = new URL(req.url).searchParams.get("team_id");
  const ctx = await requireCoachTeam(req, requested);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { data } = await ctx.sb
    .from("team_periodization_model")
    .select("source, model, updated_at")
    .eq("team_id", ctx.teamId)
    .maybeSingle();

  const row = data as { source?: string; model?: unknown; updated_at?: string } | null;
  const source = row?.source && SOURCES.has(row.source) ? row.source : "default_md";
  const days = source === "custom" && Array.isArray(row?.model) ? row!.model : null;
  return NextResponse.json({ ok: true, source, days, updatedAt: row?.updated_at ?? null });
}

export async function PUT(req: Request) {
  let body: { teamId?: string; source?: string; days?: unknown } = {};
  try { body = await req.json(); } catch { /* empty */ }

  const ctx = await requireCoachTeam(req, body.teamId ?? null);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const source = String(body.source ?? "");
  if (!SOURCES.has(source)) return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  const days = source === "custom" ? (Array.isArray(body.days) ? body.days : []) : null;

  const { error } = await ctx.sb
    .from("team_periodization_model")
    .upsert({ team_id: ctx.teamId, source, model: days, updated_by: ctx.userId, updated_at: new Date().toISOString() }, { onConflict: "team_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, source, days });
}

export async function POST(req: Request) {
  let body: {
    teamId?: string; sessionDate?: string | null; mdDay?: string | null;
    modelSource?: string | null; verdict?: string | null;
    warnings?: Array<{ kind?: string; level?: string }> | null; reason?: string | null;
  } = {};
  try { body = await req.json(); } catch { /* empty */ }

  const ctx = await requireCoachTeam(req, body.teamId ?? null);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  // Keep only { kind, level } from each warning — a compact, non-identifying snapshot.
  const warnings = Array.isArray(body.warnings)
    ? body.warnings.map((w) => ({ kind: String(w?.kind ?? ""), level: String(w?.level ?? "") })).slice(0, 10)
    : null;

  const { error } = await ctx.sb.from("session_fit_override_log").insert({
    team_id: ctx.teamId,
    session_date: body.sessionDate ?? null,
    md_day: body.mdDay ?? null,
    model_source: body.modelSource ?? null,
    verdict: body.verdict ?? null,
    warnings,
    reason: body.reason ? String(body.reason).slice(0, 2000) : null,
    created_by: ctx.userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

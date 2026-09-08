/**
 * Unified deficit ledger — GET the reconciled per-player deficit summary (every
 * source aggregated into one ranked list with confidence + provenance + status +
 * feeds), POST a coach override (dismiss / confirm a quality). Descriptive/
 * advisory — never the readiness colour; pain / red flags → clinician.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectDeficits } from "@/lib/micropulse/unifiedDeficits/collect";
import { reconcile, planCompensations } from "@/lib/micropulse/unifiedDeficits/reconcile";

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

export async function GET(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const playerId = new URL(req.url).searchParams.get("player_id") ?? "";
  if (!playerId) return NextResponse.json({ error: "player_id required" }, { status: 400 });
  const teamId = await resolvePlayerTeam(ctx, playerId);
  if (!teamId || !(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { rows, overrides } = await collectDeficits(ctx.sb, playerId);
  const summary = reconcile(rows, overrides);
  const corrective = planCompensations(summary);
  return NextResponse.json({
    ok: true,
    summary,
    planCompensations: corrective,
    correctiveCount: summary.filter((d) => !d.medicalReferral && d.overridden !== "dismiss" && d.feeds.includes("corrective")).length,
    strengthCount: summary.filter((d) => !d.medicalReferral && d.overridden !== "dismiss" && d.feeds.includes("strength")).length,
  });
}

export async function POST(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => ({}));
  const b = body as { player_id?: string; quality?: string; action?: string; note?: string };
  const playerId = String(b.player_id ?? "");
  const quality = String(b.quality ?? "");
  const action = b.action === "dismiss" || b.action === "confirm" ? b.action : b.action === "clear" ? "clear" : "";
  if (!playerId || !quality || !action) return NextResponse.json({ error: "player_id, quality and action (dismiss|confirm|clear) required" }, { status: 400 });
  const teamId = await resolvePlayerTeam(ctx, playerId);
  if (!teamId || !(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // One active override per (player, quality): clear the old, then insert if not "clear".
  await ctx.sb.from("player_deficits").delete().eq("player_id", playerId).eq("quality", quality).eq("source", "coach_override");
  if (action !== "clear") {
    const { error } = await ctx.sb.from("player_deficits").insert({
      team_id: teamId, player_id: playerId, quality, source: "coach_override",
      status: action === "confirm" ? "confirmed" : "resolved", coach_override: action,
      note: b.note ? String(b.note) : null, created_by: ctx.uid,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

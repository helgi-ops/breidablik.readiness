/**
 * /api/coach/asymmetry-review — the coach's one tap on a left/right asymmetry (strength-day-rules brief §4b).
 *
 *   GET  [?team_id=]                                         → { ok, items } players with a gap ≥ 10% + decision in force
 *   POST { teamId?, playerId, decision: "swap"|"keep", reason? } → append the decision, rebuild today's auto session
 *
 * A gap no longer swaps the lift on its own: "swap" lets the engine use one leg at a time for 28 days, "keep" keeps
 * the two-leg lift. Every decision is a new row (who, when, %, why). Not a Today writer itself: today's automatic
 * session is rebuilt with the check-in rebuild (untouched auto rows only, no push). Never the readiness colour.
 *
 * Auth: coach/admin/staff. Non-admins only their own team (or a coach_teams team); the player must be on that team.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";
import { loadTeamAsymmetryQueue, recordAsymmetryReview } from "@/lib/micropulse/strengthProgramming/asymmetryReviewStore";

export const runtime = "nodejs";
export const maxDuration = 60;

const icelandToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik" }).format(new Date());

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
    const { data: ct } = await sb.from("coach_teams").select("team_id").eq("coach_id", userId).eq("team_id", teamId).maybeSingle();
    if (!ct) return { error: "Forbidden", status: 403 } as const;
  }
  return { sb, userId, teamId } as const;
}

export async function GET(req: Request) {
  const ctx = await requireCoachTeam(req, new URL(req.url).searchParams.get("team_id"));
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const items = await loadTeamAsymmetryQueue(ctx.sb, ctx.teamId, icelandToday());
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  let body: { teamId?: string; playerId?: string; decision?: string; reason?: string; asymPct?: number | null; source?: string | null } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const ctx = await requireCoachTeam(req, body.teamId ?? null);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const decision = body.decision === "swap" || body.decision === "keep" ? body.decision : null;
  if (!body.playerId || !decision) return NextResponse.json({ error: "playerId and decision (swap | keep) are required" }, { status: 400 });

  const { data: player } = await ctx.sb.from("players").select("id").eq("id", body.playerId).eq("team_id", ctx.teamId).maybeSingle();
  if (!player) return NextResponse.json({ error: "Player not on this team" }, { status: 403 });

  const pct = typeof body.asymPct === "number" && Number.isFinite(body.asymPct) ? body.asymPct : null;
  const source = body.source === "VALD" || body.source === "IMA CoD" ? body.source : null;
  const res = await recordAsymmetryReview(ctx.sb, {
    teamId: ctx.teamId, playerId: body.playerId, decision, asymPct: pct, source,
    reason: typeof body.reason === "string" ? body.reason.trim() : null, decidedBy: ctx.userId, todayIso: icelandToday(),
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true, refreshed: res.refreshed });
}

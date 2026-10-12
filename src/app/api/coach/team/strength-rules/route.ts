/**
 * /api/coach/team/strength-rules — the strength coach's build rules for a team.
 *
 *   GET [?team_id=]        → { ok, rules }         (the sparse override map; {} when none)
 *   PUT { teamId?, rules } → upsert the team's sparse rules map
 *
 * `rules` overrides the evidence-based scheme defaults in seasonPhaseStrength.ts, per block×phase
 * and per phase config. Descriptive planning layer — never reads or writes a readiness colour or the
 * daily decision, and NOT a player-delivery writer (it only edits team config).
 *
 * Auth: coach/admin/staff. Non-admins may only touch their own team (or a coach_teams team).
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";
import type { CoachStrengthRules } from "@/lib/micropulse/strengthProgramming/seasonPhaseStrength";

export const runtime = "nodejs";

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
    .from("coach_strength_rules")
    .select("rules, updated_at")
    .eq("team_id", ctx.teamId)
    .maybeSingle();

  const row = data as { rules?: CoachStrengthRules; updated_at?: string } | null;
  return NextResponse.json({ ok: true, rules: row?.rules ?? {}, updatedAt: row?.updated_at ?? null });
}

export async function PUT(req: Request) {
  let body: { teamId?: string; rules?: CoachStrengthRules } = {};
  try { body = await req.json(); } catch { /* empty */ }

  const ctx = await requireCoachTeam(req, body.teamId ?? null);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const rules = body.rules && typeof body.rules === "object" ? body.rules : {};

  const { error } = await ctx.sb
    .from("coach_strength_rules")
    .upsert({ team_id: ctx.teamId, rules, updated_by: ctx.userId, updated_at: new Date().toISOString() }, { onConflict: "team_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, rules });
}

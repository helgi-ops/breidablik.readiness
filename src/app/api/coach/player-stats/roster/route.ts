export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never statically cache — always read live DB

/**
 * /api/coach/player-stats/roster
 *   GET → this team's ACTIVE roster (id, name, position) for import pickers.
 *
 * The per-player Match Stats importer needs the WHOLE active squad — including a
 * goalkeeper who has no season stats yet — so it can't rely on the overview's
 * "players who already have imported stats" list. Coach-scoped, descriptive only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

async function authTeam(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error } = await supabase.auth.getUser(token);
  if (error || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { teamId, supabase } as const;
}

export async function GET(req: NextRequest) {
  const ctx = await authTeam(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { data } = await ctx.supabase
    .from("players").select("id, full_name, position").eq("team_id", ctx.teamId).eq("is_active", true);
  const isGk = (pos: string | null) => /goal\s?keeper|^gk$|^mv$|markv/i.test((pos ?? "").trim());
  const players = ((data ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>)
    .map((p) => ({ playerId: p.id, name: p.full_name ?? "—", isGoalkeeper: isGk(p.position) }))
    // outfielders first, keepers last (so the default pick isn't a GK), then by name
    .sort((a, b) => Number(a.isGoalkeeper) - Number(b.isGoalkeeper) || a.name.localeCompare(b.name));
  return NextResponse.json({ players });
}

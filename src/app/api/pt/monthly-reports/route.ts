/**
 * /api/pt/monthly-reports — monthly client reports (built on the 1st by
 * /api/trainer/monthly-reports/cron, stored in pt_monthly_reports).
 *
 *   GET  ?player_id=…   coach: every month for that client · client: only the months sent to them
 *   POST { id }         coach: "Send to client" — makes that month visible in the client's app
 *
 * Nothing is emailed; sending only sets sent_at. The PDF is drawn in the browser.
 */

import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Ctx = { sb: SupabaseClient; uid: string; role: string; teamId: string | null; selfPlayerId: string | null };

async function authenticate(req: NextRequest): Promise<Ctx | { error: string; status: number }> {
  const sb = getSupabase();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 };
  const { data: userRes } = await sb.auth.getUser(token);
  const uid = userRes?.user?.id;
  if (!uid) return { error: "Unauthorized", status: 401 };
  const { data: prof } = await sb.from("profiles").select("role, team_id, player_id").eq("id", uid).maybeSingle();
  const p = (prof ?? {}) as { role?: string | null; team_id?: string | null; player_id?: string | null };
  let selfPlayerId = p.player_id ?? null;
  if (!selfPlayerId) {
    const { data: pl } = await sb.from("players").select("id").eq("user_id", uid).maybeSingle();
    selfPlayerId = (pl as { id?: string } | null)?.id ?? null;
  }
  return { sb, uid, role: String(p.role ?? "").toUpperCase(), teamId: p.team_id ?? null, selfPlayerId };
}

const isCoach = (role: string) => ["COACH", "ADMIN", "STAFF"].includes(role);

/** A coach may act on a client of a team they hold (profile team or coach_teams); admins anywhere. */
async function coachCanSee(ctx: Ctx, playerTeamId: string | null): Promise<boolean> {
  if (ctx.role === "ADMIN") return true;
  if (!playerTeamId) return false;
  if (playerTeamId === ctx.teamId) return true;
  const { data } = await ctx.sb.from("coach_teams").select("team_id").eq("coach_id", ctx.uid).eq("team_id", playerTeamId).maybeSingle();
  return !!data;
}

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  let playerId: string;
  let sentOnly: boolean;
  if (isCoach(ctx.role)) {
    const requested = new URL(req.url).searchParams.get("player_id");
    if (!requested) return NextResponse.json({ error: "player_id required" }, { status: 400 });
    const { data: pl } = await ctx.sb.from("players").select("team_id").eq("id", requested).maybeSingle();
    if (!pl || !(await coachCanSee(ctx, (pl as { team_id: string | null }).team_id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    playerId = requested;
    sentOnly = false;
  } else {
    if (!ctx.selfPlayerId) return NextResponse.json({ error: "Not a player account" }, { status: 403 });
    playerId = ctx.selfPlayerId;
    sentOnly = true;
  }

  let q = ctx.sb.from("pt_monthly_reports")
    .select("id, month, report, generated_at, sent_at")
    .eq("player_id", playerId)
    .order("month", { ascending: false })
    .limit(12);
  if (sentOnly) q = q.not("sent_at", "is", null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reports: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!isCoach(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: row } = await ctx.sb.from("pt_monthly_reports").select("id, team_id, sent_at").eq("id", body.id).maybeSingle();
  const r = row as { id: string; team_id: string; sent_at: string | null } | null;
  if (!r || !(await coachCanSee(ctx, r.team_id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (r.sent_at) return NextResponse.json({ ok: true, sentAt: r.sent_at });

  const sentAt = new Date().toISOString();
  const { error } = await ctx.sb.from("pt_monthly_reports").update({ sent_at: sentAt, sent_by: ctx.uid }).eq("id", r.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sentAt });
}

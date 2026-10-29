export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/coach/scouting/share — send an opponent scouting briefing to the team's players. Stores a
 * snapshot of the report's plain-language aspects (the client assembles it from what it shows) and
 * notifies active players; they read it in the player app, where the tagged clips are joined live.
 *
 * Informational/descriptive — never a readiness verdict, load, or a training action.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { sendWebPush, isSubscriptionGone } from "@/lib/push/webPush";

const foldName = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

async function authTeam(req: NextRequest) {
  const supabase = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { supabase, teamId, userId: userRes.user.id } as const;
}

/** Fire-and-forget push to active players that a new scout has landed. */
async function notify(supabase: ReturnType<typeof getSupabase>, teamId: string, opponent: string) {
  try {
    const { data: players } = await supabase.from("players").select("id").eq("team_id", teamId).eq("status", "ACTIVE");
    const ids = (players ?? []).map((p) => (p as { id: string }).id);
    if (!ids.length) return;
    const { data: subs } = await supabase.from("player_push_subscriptions").select("id, endpoint, p256dh, auth").in("player_id", ids).eq("is_active", true);
    const payload = { title: "Þjálfari", body: `Skátaskýrsla: ${opponent}`.slice(0, 100), url: "/player" };
    for (const sub of (subs ?? []) as Array<{ id: string; endpoint: string | null; p256dh: string | null; auth: string | null }>) {
      if (!sub.endpoint || !sub.p256dh || !sub.auth) continue;
      try { await sendWebPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload); }
      catch (err) { if (isSubscriptionGone(err)) await supabase.from("player_push_subscriptions").update({ is_active: false }).eq("id", sub.id); }
    }
  } catch { /* push is best-effort */ }
}

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const opponent = String(body?.opponent ?? "").trim();
  if (!opponent) return NextResponse.json({ ok: false, error: "opponent is required" }, { status: 400 });
  const snapshot = body?.snapshot && typeof body.snapshot === "object" ? body.snapshot : {};
  const title = body?.title ? String(body.title).slice(0, 200) : null;

  const { data, error } = await auth.supabase.from("opponent_scout_shares").insert({
    team_id: auth.teamId, opponent, opponent_key: foldName(opponent), title, snapshot, created_by: auth.userId,
  } as never).select("id").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  void notify(auth.supabase, auth.teamId, opponent);
  return NextResponse.json({ ok: true, id: (data as { id?: string } | null)?.id ?? null });
}

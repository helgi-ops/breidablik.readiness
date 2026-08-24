/**
 * /api/coach/player/[id]/robustness-watch
 *
 * GET - the player's robustness watch (fusion #5): a LABELLED injury early-warning
 * read that sits NEXT TO the readiness colour and never becomes it. Surfaces the
 * signals (personal-norm, cited, confidence-rated, each with a counterfactual) as a
 * "steady" / "watch" / "elevated" WORD level, plus the ranked "why" contributors,
 * the neuromuscular fatigue type, and the forward trajectory.
 *
 * Descriptive / advisory only. It never reads or writes the readiness colour, the
 * load target, or the daily decision. No single injury-probability number — the ML
 * literature is decisive that a classifier over-flags at this squad size (Haller
 * 2023 / Leckey 2024); we surface signals + confidence + counterfactual instead.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { loadRobustnessWatch } from "@/lib/micropulse/robustnessWatch/loader";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  const sb = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = prof?.team_id as string | null;
  if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const { data: player } = await sb.from("players").select("id, full_name").eq("id", playerId).eq("team_id", teamId).maybeSingle();
  if (!player) return NextResponse.json({ error: "Player not on your team" }, { status: 403 });
  const p = player as { id: string; full_name: string | null };

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const asOf = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

  const watch = await loadRobustnessWatch(sb, teamId, playerId, p.full_name ?? "Player", asOf);

  return NextResponse.json({
    ok: true,
    player_id: playerId,
    name: p.full_name,
    watch,
    note: "Robustness watch is a labelled, descriptive early-warning read (personal-norm, cited, confidence-rated). It sits next to the readiness colour and never changes it, the load target, or the daily plan.",
  });
}

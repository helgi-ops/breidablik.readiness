/**
 * /api/coach/goal-plans/[id]/preview
 *
 * GET — what MicroPulse WOULD suggest if this player asked to improve top speed, acceleration, braking or vertical
 * jump: four 8-week add-on plans built by rules from the player's own data (`buildGoalPlan`). Coach-only preview.
 *
 * Lota 1 (Nov 2026): read-only. Nothing is stored, nothing reaches the player, no notification. It never reads or
 * writes the readiness colour, "Today's session" (`player_today_strength_override`), a load target or the daily
 * decision. No AI. FREE-locked teams get 402 (freeLockApi).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { loadGoalPlanPreview } from "@/lib/micropulse/goalPlan/loader";

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

  const { data: player } = await sb.from("players").select("id").eq("id", playerId).eq("team_id", teamId).maybeSingle();
  if (!player) return NextResponse.json({ error: "Player not on your team" }, { status: 403 });

  const todayIso = new Date().toISOString().slice(0, 10);
  try {
    const preview = await loadGoalPlanPreview(sb, teamId, playerId, todayIso);
    return NextResponse.json({
      ok: true,
      ...preview,
      note: "Preview only: nothing is saved or sent to the player. Rules decide, no AI. Never changes the readiness colour or Today's session.",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not build the preview" }, { status: 500 });
  }
}

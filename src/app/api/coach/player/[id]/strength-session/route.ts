/**
 * /api/coach/player/[id]/strength-session
 *
 * Returns the individualized strength session for one player, based on
 * MD-context (auto-detected from week_plans or overridden via ?md=4)
 * and live player signals (Sprint Speed Drop, Sprint Exposure, CoD
 * asymmetry, decel burden, VBT, wellness, verdict, congestion).
 *
 * Query params:
 *   ?md=4|3|2|1  — override MD-context (default: auto from week_plans)
 *
 * Auth: coach token; player must be on coach's team.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadPlayerStrengthSnapshot, loadCoachOverrides } from "@/lib/micropulse/strengthProgramming/loader";
import { buildStrengthSession } from "@/lib/micropulse/strengthProgramming";
import type { MdContext } from "@/lib/micropulse/strengthProgramming/types";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getCoachTeam(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles").select("team_id, role").eq("id", userId).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return { error: "Coach role required", status: 403 } as const;
  }
  const teamId = (prof?.team_id as string | null) ?? null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { userId, teamId } as const;
}

function parseMdOverride(raw: string | null): MdContext | null {
  if (!raw) return null;
  const v = raw.toUpperCase().trim();
  switch (v) {
    case "4": case "MD-4": return "MD-4";
    case "3": case "MD-3": return "MD-3";
    case "2": case "MD-2": return "MD-2";
    case "1": case "MD-1": return "MD-1";
    case "MD+1": case "+1": return "MD+1";
    case "MD+2": case "+2": return "MD+2";
    case "OFF": return "OFF";
    default: return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: playerId } = await params;
  if (!playerId) {
    return NextResponse.json({ error: "Missing player id" }, { status: 400 });
  }
  const auth = await getCoachTeam(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = getSupabase();

  // Confirm player is on this team and grab their name for display.
  const { data: playerRow } = await supabase
    .from("players").select("id, team_id, full_name").eq("id", playerId).maybeSingle();
  if (!playerRow || (playerRow as { team_id: string }).team_id !== auth.teamId) {
    return NextResponse.json({ error: "Player not in your team" }, { status: 403 });
  }

  const mdOverride = parseMdOverride(req.nextUrl.searchParams.get("md"));
  const todayIso = new Date().toISOString().slice(0, 10);

  const [snapshot, coachOverrides] = await Promise.all([
    loadPlayerStrengthSnapshot(supabase, {
      playerId,
      playerName: (playerRow as { full_name: string | null }).full_name ?? undefined,
      teamId: auth.teamId,
      todayIso,
      mdContextOverride: mdOverride,
    }),
    loadCoachOverrides(supabase, { playerId, dateIso: todayIso }),
  ]);

  const session = buildStrengthSession(snapshot, coachOverrides);

  return NextResponse.json({
    ok: true,
    playerId,
    date: todayIso,
    snapshot,
    session,
  });
}

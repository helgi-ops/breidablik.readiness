/**
 * /api/coach/player/[id]/sprint-exposure
 *
 * Returns the weekly sprint exposure payload: GPS sprint distance in
 * training over the last 7 days vs the player's average per-match sprint
 * distance (28-day window). VOLUME-side companion to Sprint Speed Drop
 * (QUALITY-side).
 *
 * Source is GPS (`sprint_distance`, else `velocity_band6_total_distance`).
 * It used to be IMA Free Running bands 5–8, which are long continuous runs
 * (≥18 s), not sprinting — see docs/ima-free-running-bands.md. Indoor days
 * have no GPS and are reported as "no sprint reading" (`payload.noGpsDays7d`,
 * `payload.todayNoGps`), never filled from IMA.
 *
 * JSON shape unchanged: { ok, playerId, date, payload, flag, text }.
 * `payload.acuteSum7d` / `payload.matchDayDemand` are now METRES; new
 * optional keys `payload.metric` ("gps_sprint_distance_m"), `noGpsDays7d`,
 * `todayNoGps`.
 *
 * Auth: coach token, player must belong to coach's team.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { loadSprintExposure } from "@/lib/micropulse/sprintExposure/loader";
import {
  buildSprintExposureFlag,
  formatSprintExposureReason,
} from "@/lib/micropulse/sprintExposure";

export const runtime = "nodejs";


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

  const { data: playerCheck } = await supabase
    .from("players").select("id, team_id").eq("id", playerId).maybeSingle();
  if (!playerCheck || playerCheck.team_id !== auth.teamId) {
    return NextResponse.json({ error: "Player not in your team" }, { status: 403 });
  }

  const langParam = (req.nextUrl.searchParams.get("lang") ?? "EN").toUpperCase();
  const lang: "IS" | "EN" = langParam === "IS" ? "IS" : "EN";

  const todayIso = new Date().toISOString().slice(0, 10);
  const payload = await loadSprintExposure(supabase, { playerId, todayIso });
  const flag = buildSprintExposureFlag(payload);
  const text = flag ? formatSprintExposureReason(flag, lang) : "";

  return NextResponse.json({
    ok: true,
    playerId,
    date: todayIso,
    payload,
    flag,
    text,
  });
}

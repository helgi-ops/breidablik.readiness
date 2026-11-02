/**
 * /api/trainer/vbt — manual VBT for a PT client (or team athlete).
 *
 *   GET    ?clientId=<uuid>&date=YYYY-MM-DD → VBT dashboard for that client
 *   POST   { clientId, exercise_name, set_index, weight_kg?, reps?, mean_velocity?, peak_velocity?, session_date?, exercise_id? }
 *            → upsert one velocity set into player_strength_set_log (source "coach")
 *   DELETE ?clientId&session_date&exercise_id&set_index → remove one logged set
 *
 * Auth: trainer/coach (COACH/ADMIN/STAFF). Client must be on the trainer's team
 * (coach_teams or profiles.team_id); admins/staff are not team-restricted. The
 * velocity data feeds the SAME analytics as GymAware (see fetchVbtSets).
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";
import { fetchVbtSets, computeVbtDashboard } from "@/lib/micropulse/vbtReadiness/fetchVbtSets";
import { canonicalLift } from "@/lib/client/oneRepMax";

export const runtime = "nodejs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() && Number.isFinite(Number(v))
      ? Number(v)
      : null;

type TrainerAuth =
  | { userId: string; sb: SupabaseClient; teamId: string | null }
  | { error: string; status: number };

async function requireTrainerForClient(req: Request, clientId: string): Promise<TrainerAuth> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!token) return { error: "Unauthorized", status: 401 };
  const sb = getAdmin();
  const { data: userRes } = await sb.auth.getUser(token);
  const userId = userRes?.user?.id;
  if (!userId) return { error: "Unauthorized", status: 401 };
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Forbidden", status: 403 };

  const { data: client } = await sb.from("players").select("team_id").eq("id", clientId).maybeSingle();
  const clientTeam = (client as { team_id?: string | null } | null)?.team_id ?? null;
  if (!clientTeam) return { error: "Client not found", status: 404 };

  if (role !== "ADMIN" && role !== "STAFF") {
    const profTeam = (prof as { team_id?: string | null } | null)?.team_id ?? null;
    let ok = profTeam != null && profTeam === clientTeam;
    if (!ok) {
      const { data: ct } = await sb
        .from("coach_teams")
        .select("team_id")
        .eq("coach_id", userId)
        .eq("team_id", clientTeam)
        .maybeSingle();
      ok = !!ct;
    }
    if (!ok) return { error: "Client not on your team", status: 403 };
  }
  return { userId, sb, teamId: clientTeam };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  const auth = await requireTrainerForClient(req, clientId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const merged = await fetchVbtSets(auth.sb, clientId);
  return NextResponse.json(computeVbtDashboard(merged, date, clientId));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const clientId = String(body?.clientId ?? "").trim();
  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  const auth = await requireTrainerForClient(req, clientId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const exerciseName = String(body?.exercise_name ?? "").trim();
  const exerciseId = String(body?.exercise_id ?? "").trim() || exerciseName.toLowerCase().replace(/\s+/g, "_");
  const setIndex = Number(body?.set_index);
  if (!exerciseName || !Number.isInteger(setIndex) || setIndex < 0) {
    return NextResponse.json({ error: "exercise_name and a valid set_index are required." }, { status: 400 });
  }
  const sessionDate = ISO.test(String(body?.session_date)) ? String(body.session_date) : new Date().toISOString().slice(0, 10);
  const weight = numOrNull(body?.weight_kg);
  if (weight != null && (weight < 0 || weight > 700)) return NextResponse.json({ error: "weight_kg out of range." }, { status: 400 });
  const reps = numOrNull(body?.reps);
  const meanVel = numOrNull(body?.mean_velocity);
  if (meanVel != null && (meanVel <= 0 || meanVel > 3)) return NextResponse.json({ error: "mean_velocity must be 0–3 m/s." }, { status: 400 });
  const peakVel = numOrNull(body?.peak_velocity);
  if (peakVel != null && (peakVel <= 0 || peakVel > 5)) return NextResponse.json({ error: "peak_velocity out of range." }, { status: 400 });
  const rpe = numOrNull(body?.rpe);

  const { error } = await auth.sb.from("player_strength_set_log").upsert(
    {
      player_id: clientId,
      team_id: auth.teamId,
      session_date: sessionDate,
      exercise_id: exerciseId,
      exercise_name: exerciseName,
      canonical_lift: canonicalLift(exerciseName),
      set_index: setIndex,
      weight_kg: weight,
      reps: reps != null ? Math.round(reps) : null,
      rpe,
      mean_velocity: meanVel,
      peak_velocity: peakVel,
      is_warmup: body?.is_warmup === true,
      source: "coach",
    },
    { onConflict: "player_id,session_date,exercise_id,set_index" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const sessionDate = url.searchParams.get("session_date");
  const exerciseId = url.searchParams.get("exercise_id");
  const setIndex = url.searchParams.get("set_index");
  if (!clientId || !sessionDate || !exerciseId || setIndex == null) {
    return NextResponse.json({ error: "Missing clientId, session_date, exercise_id or set_index" }, { status: 400 });
  }
  const auth = await requireTrainerForClient(req, clientId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { error } = await auth.sb
    .from("player_strength_set_log")
    .delete()
    .eq("player_id", clientId)
    .eq("session_date", sessionDate)
    .eq("exercise_id", exerciseId)
    .eq("set_index", Number(setIndex));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

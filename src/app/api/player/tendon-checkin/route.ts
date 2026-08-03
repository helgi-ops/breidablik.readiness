/**
 * /api/player/tendon-checkin
 *
 * Daily player-reported markers for the Jumper's Knee (patellar tendinopathy)
 * protocol: single-leg decline-squat pain (VAS 0-10) + morning stiffness (0-10).
 *
 * GET  — today's check-in for the current player (null if none yet).
 * POST — upsert today's check-in ({ declineSquatVas?, morningStiffnessVas?, note? }).
 *
 * DESCRIPTIVE ONLY — writes to patellar_tendon_checkins, never readiness_entries.
 * The value informs the coach pain-monitoring gate; it never moves the verdict.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getPlayer(req: NextRequest, supabase: ReturnType<typeof getSupabase>) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: player } = await supabase
    .from("players")
    .select("id, team_id")
    .eq("user_id", userRes.user.id)
    .maybeSingle();
  if (!player?.id) return { error: "Player not found", status: 403 } as const;
  return { playerId: player.id as string, teamId: (player.team_id as string | null) ?? null } as const;
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const who = await getPlayer(req, supabase);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });

  const { data } = await supabase
    .from("patellar_tendon_checkins")
    .select("entry_date, decline_squat_vas, morning_stiffness_vas, note")
    .eq("player_id", who.playerId)
    .eq("entry_date", todayUtc())
    .maybeSingle();

  return NextResponse.json({ ok: true, checkin: data ?? null });
}

function clampVas(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  return n;
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const who = await getPlayer(req, supabase);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });

  let body: { declineSquatVas?: unknown; morningStiffnessVas?: unknown; note?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const declineSquatVas = clampVas(body.declineSquatVas);
  const morningStiffnessVas = clampVas(body.morningStiffnessVas);
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;

  if (declineSquatVas === null && morningStiffnessVas === null && !note) {
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  }

  const { error } = await supabase
    .from("patellar_tendon_checkins")
    .upsert(
      {
        player_id: who.playerId,
        team_id: who.teamId,
        entry_date: todayUtc(),
        decline_squat_vas: declineSquatVas,
        morning_stiffness_vas: morningStiffnessVas,
        note,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_id,entry_date" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

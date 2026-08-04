/**
 * /api/player/tendon-checkin
 *
 * Daily player-reported markers for the staged tendon-loading modules — the
 * daily provocation-test pain (VAS 0-10) + morning stiffness (0-10). The
 * provocation test differs by `region`: 'patellar' = single-leg decline-squat
 * (Jumper's Knee), 'achilles' = single-leg heel-raise.
 *
 * GET  — today's check-in for the current player + region (null if none yet).
 *        ?region=patellar|achilles (default patellar).
 * POST — upsert today's check-in ({ provocationVas?, morningStiffnessVas?, note?, region? }).
 *
 * DESCRIPTIVE ONLY — writes to tendon_checkins, never readiness_entries.
 * The value informs the coach pain-monitoring gate; it never moves the verdict.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// Only known tendon regions; anything else falls back to 'patellar'.
const REGIONS = new Set(["patellar", "achilles", "adductor"]);
function normRegion(v: unknown): string {
  return typeof v === "string" && REGIONS.has(v) ? v : "patellar";
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

  const region = normRegion(req.nextUrl.searchParams.get("region"));

  const { data } = await supabase
    .from("tendon_checkins")
    .select("entry_date, provocation_vas, morning_stiffness_vas, note, region")
    .eq("player_id", who.playerId)
    .eq("region", region)
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

  let body: { provocationVas?: unknown; morningStiffnessVas?: unknown; note?: unknown; region?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const provocationVas = clampVas(body.provocationVas);
  const morningStiffnessVas = clampVas(body.morningStiffnessVas);
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;
  const region = normRegion(body.region);

  if (provocationVas === null && morningStiffnessVas === null && !note) {
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  }

  const { error } = await supabase
    .from("tendon_checkins")
    .upsert(
      {
        player_id: who.playerId,
        team_id: who.teamId,
        entry_date: todayUtc(),
        region,
        provocation_vas: provocationVas,
        morning_stiffness_vas: morningStiffnessVas,
        note,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_id,entry_date,region" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

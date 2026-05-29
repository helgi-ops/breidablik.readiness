/**
 * /api/client/sport-session
 *
 * Lets a PT client log a sport / other session as Foster sRPE (RPE × duration).
 * Writes a session_rpe_entries row (source 'client') so the session feeds the
 * same total-load / ACWR / monotony machinery as gym sessions.
 *
 *   POST   { session_date, session_name, session_type?, duration_minutes, rpe, notes? }
 *          Idempotent per (player, date, session_name): re-posting the same
 *          activity for the day replaces it instead of duplicating. The gym
 *          strength entry (session_type 'individual', no name) is never touched.
 *
 *   DELETE ?id=<entryId>  — remove one of the caller's own sport sessions.
 *
 * Auth: caller must be a player (players.user_id = auth.uid).
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Mirror of SESSION_TYPES in src/lib/session-rpe/types.ts — kept local so this
// route doesn't pull in client-side modules.
const SPORT_SESSION_TYPES = ["match", "team_training", "gym", "recovery", "individual", "other"] as const;

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function getAdmin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

async function requirePlayer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return { error: "Unauthorized", status: 401 } as const;
  const { data: player } = await sb
    .from("players").select("id, team_id").eq("user_id", userId).maybeSingle();
  if (!player) return { error: "Not a player account", status: 403 } as const;
  const p = player as { id: string; team_id: string };
  return { sb, playerId: p.id, teamId: p.team_id } as const;
}

export async function POST(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, playerId, teamId } = a;

  let body: {
    session_date?: string; session_name?: string; session_type?: string;
    duration_minutes?: number | null; rpe?: number | null; notes?: string | null;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const sessionDate = (body.session_date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return NextResponse.json({ error: "session_date YYYY-MM-DD required" }, { status: 400 });
  }
  const sessionName = String(body.session_name ?? "").trim();
  if (!sessionName) return NextResponse.json({ error: "session_name (activity) required" }, { status: 400 });

  const sessionType = SPORT_SESSION_TYPES.includes((body.session_type ?? "") as typeof SPORT_SESSION_TYPES[number])
    ? (body.session_type as string)
    : "team_training";

  const duration = Number(body.duration_minutes);
  const rpe = Number(body.rpe);
  if (!Number.isFinite(duration) || duration < 1 || duration > 300) {
    return NextResponse.json({ error: "duration_minutes must be 1-300" }, { status: 400 });
  }
  if (!Number.isFinite(rpe) || rpe < 0 || rpe > 10) {
    return NextResponse.json({ error: "rpe must be 0-10" }, { status: 400 });
  }

  // Replace the same activity for the day (never the gym 'individual' row).
  const { error: delErr } = await sb
    .from("session_rpe_entries")
    .delete()
    .eq("player_id", playerId)
    .eq("session_date", sessionDate)
    .eq("source", "client")
    .eq("session_name", sessionName);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { data, error } = await sb
    .from("session_rpe_entries")
    .insert({
      player_id: playerId,
      team_id: teamId,
      session_date: sessionDate,
      session_type: sessionType,
      session_name: sessionName,
      duration_minutes: Math.round(duration),
      rpe: Math.round(rpe * 10) / 10,
      notes: (body.notes ?? "").toString().trim() || null,
      source: "client",
    })
    .select("id, session_date, session_type, session_name, duration_minutes, rpe, session_load")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, entry: data });
}

export async function DELETE(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, playerId } = a;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await sb
    .from("session_rpe_entries")
    .delete()
    .eq("id", id)
    .eq("player_id", playerId)
    .eq("source", "client");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

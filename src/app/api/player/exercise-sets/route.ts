/**
 * /api/player/exercise-sets
 *
 *   POST  — log one OR many sets for a session in a single batch.
 *           Body: { session_date: "YYYY-MM-DD", exercises: [{ name, sets: [{weight_kg, reps, rpe?, notes?}] }] }
 *           Replaces any existing rows for the same (player, session_date)
 *           so submitting twice doesn't double-count — typical UX is "edit
 *           today's session" then re-save.
 *
 *   GET    — list sets for the calling player. Optional ?days=14 narrows
 *           the window. Returned grouped by session_date for UI rendering.
 *
 *   DELETE ?id=<setId>  — remove one set (in case of mis-entry).
 *
 * Auth: caller must be a player (resolved via players.user_id = auth.uid).
 * Coaches use a separate trainer-side endpoint to read on behalf of clients.
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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
  return { sb, userId, playerId: p.id, teamId: p.team_id } as const;
}

type SetIn = { weight_kg?: number | null; reps?: number | null; rpe?: number | null; notes?: string | null };
type ExerciseIn = { name: string; sets: SetIn[] };

function isFiniteNumOrNull(v: unknown): v is number | null {
  return v === null || typeof v === "undefined" || (typeof v === "number" && Number.isFinite(v));
}

export async function POST(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, playerId, teamId } = a;

  let body: { session_date?: string; exercises?: ExerciseIn[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const sessionDate = (body.session_date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return NextResponse.json({ error: "session_date YYYY-MM-DD required" }, { status: 400 });
  }
  const exercises = Array.isArray(body.exercises) ? body.exercises : [];
  if (exercises.length === 0) {
    return NextResponse.json({ error: "At least one exercise required" }, { status: 400 });
  }

  // Build the row payload, validating each set.
  const rows: Array<{
    player_id: string; team_id: string; session_date: string;
    exercise_name: string; set_number: number;
    weight_kg: number | null; reps: number | null; rpe: number | null; notes: string | null;
    source: "client";
  }> = [];

  for (const ex of exercises) {
    const name = String(ex.name ?? "").trim();
    if (!name) continue;
    const sets = Array.isArray(ex.sets) ? ex.sets : [];
    for (let i = 0; i < sets.length; i++) {
      const s = sets[i] ?? {};
      if (!isFiniteNumOrNull(s.weight_kg)) return NextResponse.json({ error: `Invalid weight on ${name} set ${i + 1}` }, { status: 400 });
      if (!isFiniteNumOrNull(s.reps))      return NextResponse.json({ error: `Invalid reps on ${name} set ${i + 1}` }, { status: 400 });
      if (!isFiniteNumOrNull(s.rpe))       return NextResponse.json({ error: `Invalid RPE on ${name} set ${i + 1}` }, { status: 400 });
      if (s.rpe != null && (s.rpe < 1 || s.rpe > 10)) {
        return NextResponse.json({ error: `RPE must be 1-10 (${name} set ${i + 1})` }, { status: 400 });
      }
      rows.push({
        player_id: playerId, team_id: teamId, session_date: sessionDate,
        exercise_name: name, set_number: i + 1,
        weight_kg: s.weight_kg ?? null, reps: s.reps ?? null, rpe: s.rpe ?? null,
        notes: (s.notes ?? "").toString().trim() || null,
        source: "client",
      });
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid sets to save" }, { status: 400 });
  }

  // Replace existing rows for this (player, date) so re-submits don't
  // double-count. This matches typical "edit today's session" UX.
  const { error: delErr } = await sb
    .from("pt_exercise_set_logs")
    .delete()
    .eq("player_id", playerId)
    .eq("session_date", sessionDate);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { error: insErr } = await sb.from("pt_exercise_set_logs").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, saved: rows.length, session_date: sessionDate });
}

export async function GET(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, playerId } = a;

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(180, Number(url.searchParams.get("days") ?? "30")));
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data, error } = await sb
    .from("pt_exercise_set_logs")
    .select("*")
    .eq("player_id", playerId)
    .gte("session_date", sinceIso)
    .order("session_date", { ascending: false })
    .order("exercise_name", { ascending: true })
    .order("set_number", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sets: data ?? [] });
}

export async function DELETE(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, playerId } = a;
  const url = new URL(req.url);
  const setId = url.searchParams.get("id");
  if (!setId) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await sb
    .from("pt_exercise_set_logs")
    .delete()
    .eq("id", setId)
    .eq("player_id", playerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

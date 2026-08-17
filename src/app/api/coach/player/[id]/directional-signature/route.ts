/**
 * /api/coach/player/[id]/directional-signature
 *
 * GET — the player's IMA directional movement fingerprint (12 clock directions)
 * and its drift vs his own usual shape (Unfamiliar Load, Phase 5). Reads the
 * ima_clock_gen2 grids and runs computeDirectionalSignature. "Is he still
 * moving like himself?" at the directional level (Virtanen / Catapult 2026).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { computeDirectionalSignature, directionalMechLoad, type ClockGrid } from "@/lib/micropulse/directionalSignature";

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

  const { data: player } = await sb.from("players").select("id, full_name, position").eq("id", playerId).eq("team_id", teamId).maybeSingle();
  if (!player) return NextResponse.json({ error: "Player not on your team" }, { status: 403 });
  const p = player as { id: string; full_name: string | null; position: string | null };

  const today = new Date().toISOString().slice(0, 10);
  const windowStart = new Date(Date.parse(today + "T00:00:00Z") - 40 * 86_400_000).toISOString().slice(0, 10);

  const { data: rows } = await sb
    .from("player_external_load_daily")
    .select("date, ima_clock_gen2, session_duration_minutes, total_player_load, player_load_per_minute")
    .eq("player_id", playerId)
    .gte("date", windowStart)
    .lte("date", today)
    .order("date", { ascending: false }); // most-recent-first

  type Row = { date: string; ima_clock_gen2: ClockGrid | null; session_duration_minutes: number | string | null; total_player_load: number | string | null; player_load_per_minute: number | string | null };
  const all = (rows ?? []) as Row[];
  const grids = all.map((r) => r.ima_clock_gen2 ?? null);
  const daysWithClock = grids.filter((g) => g != null).length;
  const refDate = all.length ? String(all[0].date) : today;

  if (daysWithClock === 0) {
    return NextResponse.json({ ok: true, player_id: playerId, name: p.full_name, position: p.position, hasData: false, signature: null });
  }

  const signature = computeDirectionalSignature(grids, refDate);

  // Mechanical load per direction over the recent block (last ~14 days) — the intensity-weighted
  // cost view: where he spends the most change-of-direction work (AU proxy, not W/kg). Minutes
  // (session_duration, else total_player_load ÷ per-minute) give per-minute load, comparable
  // across players regardless of playing time.
  const minutesFor = (r: Row): number => {
    const d = Number(r.session_duration_minutes);
    if (Number.isFinite(d) && d > 0) return d;
    const pl = Number(r.total_player_load), plm = Number(r.player_load_per_minute);
    return Number.isFinite(pl) && Number.isFinite(plm) && plm > 0 ? pl / plm : 0;
  };
  const recentCut = new Date(Date.parse(refDate + "T00:00:00Z") - 14 * 86_400_000).toISOString().slice(0, 10);
  const recentRows = all.filter((r) => String(r.date) >= recentCut && r.ima_clock_gen2 != null);
  const useRows = recentRows.length ? recentRows : all.filter((r) => r.ima_clock_gen2 != null);
  const useMinutes = useRows.reduce((s, r) => s + minutesFor(r), 0);
  const mechLoad = directionalMechLoad(useRows.map((r) => r.ima_clock_gen2 ?? null), useMinutes || null);

  return NextResponse.json({
    ok: true,
    player_id: playerId,
    name: p.full_name,
    position: p.position,
    hasData: true,
    daysWithClock,
    signature,
    mechLoad,
    note: "IMA directional fingerprint (12 clock positions) vs the player's own usual shape. Descriptive movement-behaviour signal, not an injury prediction.",
  });
}

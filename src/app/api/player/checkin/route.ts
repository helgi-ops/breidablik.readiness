export const runtime = "nodejs";

/**
 * POST /api/player/checkin
 *
 * Saves the player's daily readiness check-in (the 5 sub-scores + optional note).
 *
 * Why this runs server-side: inserting into `readiness_entries` fires a large
 * cascade of readiness-engine triggers (hybrid readiness, performance
 * intelligence, baseline-z, plan lock, audit…). Warm that's ~0.3s, but on a COLD
 * cache (the morning's first DB hit) the cumulative cost can exceed the
 * `authenticated` role's 8s statement timeout, so the client-side upsert failed
 * with "canceling statement due to statement timeout". The admin (service_role)
 * client has no statement timeout, so the save always completes. The readiness
 * logic itself is untouched — this only changes WHO runs the write.
 *
 * Ownership: the player id is resolved from the caller's token (never trusted
 * from the body), so a player can only write their own entry.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

const isIsoDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const SCORE_FIELDS = ["fatigue_energy", "sleep_quality", "sleep_duration", "stress_mood", "muscle_soreness"] as const;

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();

  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const scores: Record<string, number> = {};
  for (const k of SCORE_FIELDS) {
    const v = Number(body[k]);
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      return NextResponse.json({ ok: false, error: `Invalid or missing ${k}` }, { status: 400 });
    }
    scores[k] = v;
  }

  const entry_date = isIsoDate(body.entry_date) ? body.entry_date : new Date().toISOString().slice(0, 10);
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  // Core upsert — idempotent (guards double-tap). Triggers compute the colour/
  // decision; service_role has no statement timeout so a cold cascade completes.
  const { data, error } = await sb
    .from("readiness_entries")
    .upsert({ player_id: playerId, entry_date, ...scores }, { onConflict: "player_id,entry_date" })
    .select("id, entry_date")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data?.id) {
    return NextResponse.json({ ok: false, error: "Save returned no row" }, { status: 500 });
  }

  // Note saved separately + best-effort (some environments may lack the column),
  // mirroring the previous client behaviour.
  if (notes) {
    const { error: noteErr } = await sb.from("readiness_entries").update({ notes }).eq("id", data.id);
    if (noteErr) console.warn("CHECKIN note update failed (column may not exist):", noteErr.message);
  }

  return NextResponse.json({ ok: true, id: data.id, entry_date: data.entry_date });
}

/**
 * /api/player/robustness
 *
 * GET — the robustness drills a coach has assigned to the logged-in player,
 * resolved against the catalog for full details (name, cue, dose). These are
 * keyed to the player's own load demands — "drills to make you better at
 * handling your load". Self-scoped, read-only.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { drillById } from "@/lib/micropulse/robustness/catalog";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try { ({ playerId } = await requireAuthedPlayerId(sb, req)); }
  catch (e) { const m = e instanceof Error ? e.message : "Unauthorized"; return NextResponse.json({ error: m }, { status: 401 }); }

  const { data, error } = await sb
    .from("player_robustness_assignments")
    .select("drill_id, quality, reason, created_at")
    .eq("player_id", playerId)
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const drills = ((data ?? []) as Array<{ drill_id: string; quality: string | null; reason: string | null }>)
    .map((a) => {
      const d = drillById(a.drill_id);
      if (!d) return null;
      return {
        id: d.id, quality: a.quality ?? d.quality,
        name: d.name, cue: d.cue, dose: d.dose, evidence: d.evidence,
        reason: a.reason,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  return NextResponse.json({ ok: true, drills });
}

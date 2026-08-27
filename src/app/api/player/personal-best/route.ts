/**
 * GET /api/player/personal-best — the player's most recent personal best (last
 * ~14 days), for the celebratory in-app card. Self-scoped. Silent (null) when
 * there's no recent PB.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const since = new Date(); since.setUTCDate(since.getUTCDate() - 14);
  const { data } = await sb
    .from("player_test_personal_bests")
    .select("id, metric, value, unit, prior_best, improvement, achieved_at")
    .eq("player_id", playerId)
    .gte("achieved_at", since.toISOString())
    .order("achieved_at", { ascending: false })
    .limit(1);

  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ ok: true, pb: null });

  return NextResponse.json({
    ok: true,
    pb: {
      id: String(row.id),
      metric: String(row.metric),
      value: Number(row.value),
      unit: (row.unit as string | null) ?? "cm",
      priorBest: row.prior_best != null ? Number(row.prior_best) : null,
      improvement: row.improvement != null ? Number(row.improvement) : null,
      achievedAt: String(row.achieved_at),
    },
  });
}

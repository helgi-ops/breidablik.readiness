/**
 * /api/player/hr-zones?date=YYYY-MM-DD
 *
 * GET — a PLAYER-facing view of their OWN HR-belt session intensity: how the
 * session's time was spread across Catapult's 8 HR bands (1 low … 8 high). Uses
 * the ref-date row if it carried a belt, else the most recent HR session in the
 * window, so it reads as "your last session's intensity". Self-scoped: a player
 * only ever sees their own row. No HR (no belt) → hasData:false, and the card
 * hides — never a fabricated distribution.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { hrZoneDistribution } from "@/lib/micropulse/hrLoad";

export const runtime = "nodejs";

const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = (v: unknown): number | null => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
function addDaysISO(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const SELECT =
  "date, hr_zone_1_time_s, hr_zone_2_time_s, hr_zone_3_time_s, hr_zone_4_time_s, hr_zone_5_time_s, hr_zone_6_time_s, hr_zone_7_time_s, hr_zone_8_time_s, " +
  "hr_zone_1_avg_bpm, hr_zone_2_avg_bpm, hr_zone_3_avg_bpm, hr_zone_4_avg_bpm, hr_zone_5_avg_bpm, hr_zone_6_avg_bpm, hr_zone_7_avg_bpm, hr_zone_8_avg_bpm";

type Row = Record<string, unknown> & { date: string };

function zonesOf(r: Row) {
  return [1, 2, 3, 4, 5, 6, 7, 8].map((b) => num(r[`hr_zone_${b}_time_s`]));
}
function bpmOf(r: Row) {
  return [1, 2, 3, 4, 5, 6, 7, 8].map((b) => num(r[`hr_zone_${b}_avg_bpm`]));
}
const hasHr = (r: Row) => zonesOf(r).some((v) => v !== null && v > 0);

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    const m = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: m }, { status: 401 });
  }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const today = new Date().toISOString().slice(0, 10);
  const refDate = dateParam && isIso(dateParam) ? dateParam : today;
  const windowStart = addDaysISO(refDate, -34);

  const { data, error } = await sb
    .from("player_external_load_daily")
    .select(SELECT)
    .eq("player_id", playerId)
    .gte("date", windowStart)
    .lte("date", refDate)
    .order("date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as Row[];
  // Prefer the ref-date session; else the most recent belt session in the window.
  const row = (rows.find((r) => String(r.date) === refDate && hasHr(r)) ?? rows.find(hasHr)) ?? null;
  if (!row) return NextResponse.json({ ok: true, hasData: false, date: null, totalMinutes: null, bands: [] });

  const bands = hrZoneDistribution(zonesOf(row), bpmOf(row));
  const totalSec = bands.reduce((a, b) => a + (b.timeS ?? 0), 0);
  return NextResponse.json({
    ok: true,
    hasData: true,
    date: String(row.date),
    totalMinutes: totalSec > 0 ? Math.round(totalSec / 60) : null,
    bands,
  });
}

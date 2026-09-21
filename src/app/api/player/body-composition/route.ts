/**
 * GET /api/player/body-composition — the AUTHENTICATED player's OWN body-composition trend.
 *
 * Read-only and self-scoped: a player sees only their own rows (resolved from their token via
 * requireAuthedPlayerId; the service client is scoped to that player_id in code). Players never
 * record skinfolds here — a practitioner does that on the coach side; this is the athlete's window
 * onto their own trend.
 *
 * Wellbeing: individual-trend only — no ideal %, no target, no judgement. The ±3–5 % estimate error
 * and a method/tester-CHANGE flag ride with every read. Descriptive — never touches readiness.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sb = getSupabase();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const { data } = await sb.from("player_body_metrics")
    .select("measured_on, body_fat_pct, bf_method, sum_skinfolds_mm, lean_mass_kg, mass_kg, created_by")
    .eq("player_id", playerId).not("body_fat_pct", "is", null).order("measured_on", { ascending: false });

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const createdByOf = (m: Record<string, unknown>) => (m.created_by as string) ?? null;

  // Consistency flag from the two most recent rows (tester ids stay server-side — the player only
  // learns WHETHER the tester/method changed, never who tested).
  let consistency: { methodChanged: boolean; testerChanged: boolean } | null = null;
  if (rows.length >= 2) {
    consistency = {
      methodChanged: ((rows[0].bf_method as string) ?? null) !== ((rows[1].bf_method as string) ?? null),
      testerChanged: !!createdByOf(rows[0]) && createdByOf(rows[0]) !== createdByOf(rows[1]),
    };
  }

  // Player payload — no tester id leaked.
  const bodyComp = rows.map((m) => ({
    measuredOn: String(m.measured_on), bodyFatPct: Number(m.body_fat_pct), method: (m.bf_method as string) ?? null,
    sumSkinfoldsMm: Number.isFinite(Number(m.sum_skinfolds_mm)) ? Number(m.sum_skinfolds_mm) : null,
    leanKg: Number.isFinite(Number(m.lean_mass_kg)) ? Number(m.lean_mass_kg) : null,
    massKg: Number.isFinite(Number(m.mass_kg)) ? Number(m.mass_kg) : null,
  }));
  return NextResponse.json({ ok: true, bodyComp, consistency });
}

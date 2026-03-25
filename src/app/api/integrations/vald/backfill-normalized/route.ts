import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { normalizeForceDecksResult, normalizeForceFrameResult, normalizeNordBordResult } from "@/lib/integrations/vald/normalizers";

export const runtime = "nodejs";

async function requireCoach(req: Request): Promise<{ teamId: string; userId: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const sb = getSupabaseServer();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");
  const { data: profile } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  const role = String((profile as Record<string, unknown> | null)?.role ?? "").toUpperCase();
  const teamId = String((profile as Record<string, unknown> | null)?.team_id ?? "");
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!teamId) throw new Error("No team context");
  return { teamId, userId: userRes.user.id };
}

export async function POST(req: Request) {
  try {
    const { teamId } = await requireCoach(req);
    const sb = getSupabaseServer();

    // Load all raw tests for this team
    const { data: rawTests, error: rawErr } = await sb
      .from("vald_raw_tests")
      .select("id, vald_athlete_id, product, payload")
      .eq("team_id", teamId)
      .order("id");
    if (rawErr) throw rawErr;

    // Load all active athlete mappings for this team into a lookup map
    const { data: mappings, error: mapErr } = await sb
      .from("integrations_vald_athlete_map")
      .select("vald_athlete_id, microplayer_id")
      .eq("team_id", teamId)
      .eq("is_active", true);
    if (mapErr) throw mapErr;

    const athleteToPlayer = new Map<string, string>(
      ((mappings ?? []) as Array<Record<string, unknown>>)
        .filter((m) => m.microplayer_id)
        .map((m) => [String(m.vald_athlete_id), String(m.microplayer_id)])
    );

    const summary = {
      total: (rawTests ?? []).length,
      forcedecks: 0,
      nordbord: 0,
      forceframe: 0,
      skipped: 0,
      errors: 0,
    };

    for (const row of rawTests ?? []) {
      const rawTestId = String((row as Record<string, unknown>).id);
      const valdAthleteId = String((row as Record<string, unknown>).vald_athlete_id ?? "");
      const product = String((row as Record<string, unknown>).product ?? "");
      const payload = (row as Record<string, unknown>).payload;
      const microplayerId = athleteToPlayer.get(valdAthleteId) ?? null;

      const base = {
        team_id: teamId,
        microplayer_id: microplayerId,
        vald_athlete_id: valdAthleteId,
        raw_test_id: rawTestId,
        is_valid: false,
      };

      try {
        if (product === "forcedecks") {
          const n = normalizeForceDecksResult(payload);
          await sb.from("vald_forcedecks_results").upsert({
            ...base,
            test_timestamp: n.testTimestamp,
            test_type: n.testType ?? null,
            is_valid: n.isValid,
            jump_height_cm: n.jumpHeightCm ?? null,
            rsi_mod: n.rsiMod ?? null,
            eccentric_duration_ms: n.eccentricDurationMs ?? null,
            concentric_duration_ms: n.concentricDurationMs ?? null,
            peak_power_w: n.peakPowerW ?? null,
            relative_peak_power_w_kg: n.relativePeakPowerWKg ?? null,
            peak_force_n: n.peakForceN ?? null,
            concentric_impulse_n_s: n.concentricImpulseNS ?? null,
            time_to_takeoff_ms: n.timeToTakeoffMs ?? null,
            left_value: n.leftValue ?? null,
            right_value: n.rightValue ?? null,
            asymmetry_percent: n.asymmetryPercent ?? null,
            asymmetry_side: n.asymmetrySide ?? null,
          }, { onConflict: "raw_test_id" });
          summary.forcedecks += 1;
        } else if (product === "nordbord") {
          const n = normalizeNordBordResult(payload);
          await sb.from("vald_nordbord_results").upsert({
            ...base,
            test_timestamp: n.testTimestamp,
            test_type: n.testType ?? null,
            is_valid: n.isValid,
            left_peak_force_n: n.leftPeakForceN ?? null,
            right_peak_force_n: n.rightPeakForceN ?? null,
            left_avg_force_n: n.leftAvgForceN ?? null,
            right_avg_force_n: n.rightAvgForceN ?? null,
            asymmetry_percent: n.asymmetryPercent ?? null,
            asymmetry_side: n.asymmetrySide ?? null,
          }, { onConflict: "raw_test_id" });
          summary.nordbord += 1;
        } else if (product === "forceframe") {
          const n = normalizeForceFrameResult(payload);
          await sb.from("vald_forceframe_results").upsert({
            ...base,
            test_timestamp: n.testTimestamp,
            test_type: n.testType ?? null,
            is_valid: n.isValid,
            body_region: n.bodyRegion ?? null,
            movement_pattern: n.movementPattern ?? null,
            left_peak_force_n: n.leftPeakForceN ?? null,
            right_peak_force_n: n.rightPeakForceN ?? null,
            left_relative_force: n.leftRelativeForce ?? null,
            right_relative_force: n.rightRelativeForce ?? null,
            asymmetry_percent: n.asymmetryPercent ?? null,
            asymmetry_side: n.asymmetrySide ?? null,
          }, { onConflict: "raw_test_id" });
          summary.forceframe += 1;
        } else {
          summary.skipped += 1;
        }
      } catch {
        summary.errors += 1;
      }
    }

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Backfill failed." },
      { status: 400 }
    );
  }
}

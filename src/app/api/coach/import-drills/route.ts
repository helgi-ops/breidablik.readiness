/**
 * POST /api/coach/import-drills
 *
 * Accepts pre-parsed drill data (parsed client-side from Catapult PDF)
 * and upserts into the drill_library table.
 *
 * Request (JSON):
 *   {
 *     team_id: string,
 *     drills: Array<{
 *       drill_name: string,
 *       category?: string,
 *       distance_m?: number,
 *       vel_b5?: number,
 *       vel_b6?: number,
 *       hir_total?: number,
 *       player_load?: number,
 *       accel_b23?: number,
 *       decel_b23?: number,
 *       accel_total?: number,
 *       decel_total?: number,
 *       max_velocity?: number,
 *     }>
 *   }
 *
 * Response:
 *   { ok: true, imported: number, errors: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

interface DrillInput {
  drill_name: string;
  category?: string;
  distance_m?: number | null;
  vel_b5?: number | null;
  vel_b6?: number | null;
  vel_b5_avg?: number | null;
  vel_b6_avg?: number | null;
  hir_total?: number | null;
  player_load?: number | null;
  accel_b23?: number | null;
  decel_b23?: number | null;
  accel_b23_avg?: number | null;
  decel_b23_avg?: number | null;
  accel_total?: number | null;
  decel_total?: number | null;
  max_velocity?: number | null;
}

export async function POST(req: NextRequest) {
  try {
    const sb = getSupabaseAdmin();

    const body = await req.json();
    const { team_id: teamIdParam, drills } = body as {
      team_id?: string;
      drills?: DrillInput[];
    };

    if (!drills || !Array.isArray(drills) || drills.length === 0) {
      return NextResponse.json(
        { error: "drills array is required" },
        { status: 400 }
      );
    }

    // Authenticate coach
    const { teamId } = await requireCoachAccessForTeam(
      sb,
      req,
      teamIdParam?.trim() || null
    );

    if (!teamId) {
      return NextResponse.json(
        { error: "team_id is required" },
        { status: 400 }
      );
    }

    let importedCount = 0;
    const errors: string[] = [];

    for (const drill of drills) {
      if (!drill.drill_name?.trim()) {
        errors.push("Drill missing name — skipped");
        continue;
      }

      try {
        const payload = {
          team_id: teamId,
          category: drill.category || "other",
          drill_name: drill.drill_name.trim(),
          description: null,
          drill_format: null,
          distance_m: drill.distance_m ?? null,
          vel_b5: drill.vel_b5 ?? null,
          vel_b6: drill.vel_b6 ?? null,
          vel_b5_avg: drill.vel_b5_avg ?? null,
          vel_b6_avg: drill.vel_b6_avg ?? null,
          hir_total: drill.hir_total ?? null,
          player_load: drill.player_load ?? null,
          player_load_per_min:
            drill.player_load && drill.distance_m
              ? Math.round(
                  (drill.player_load / (drill.distance_m / 100)) * 10
                ) / 10
              : null,
          accel_b23: drill.accel_b23 ?? null,
          decel_b23: drill.decel_b23 ?? null,
          accel_b23_avg: drill.accel_b23_avg ?? null,
          decel_b23_avg: drill.decel_b23_avg ?? null,
          accel_total: drill.accel_total ?? null,
          decel_total: drill.decel_total ?? null,
          max_velocity: drill.max_velocity ?? null,
          metabolic_power_avg: null,
          metabolic_power_peak: null,
          hmld_m: null,
          time_above_threshold_s: null,
          jump_count: null,
          ima_cod_total: null,
          high_ima: null,
          source: "catapult" as const,
          created_by: null,
        };

        const { error } = await sb
          .from("drill_library")
          .upsert(payload, {
            onConflict: "team_id,drill_name,source",
          })
          .select()
          .single();

        if (error) {
          errors.push(`${drill.drill_name}: ${error.message}`);
        } else {
          importedCount++;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${drill.drill_name}: ${message}`);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        imported: importedCount,
        errors,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("import-drills error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

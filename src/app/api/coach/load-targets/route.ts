/**
 * Coach endpoint — read/write team_load_targets config.
 *
 *   GET /api/coach/load-targets?teamId=<uuid>
 *     → returns current config (with defaults filled in), plus diagnostic
 *       data: recent match dates used, computed match-demand average per KPI,
 *       matches sampled.
 *
 *   PUT /api/coach/load-targets
 *     body: { teamId, mode?, corridor_pct?, mesocycle_phase?,
 *             mesocycle_multiplier?, coach_weekly_targets?,
 *             match_demand_lookback_days?, match_day_detection_min_td?,
 *             match_demand_template?, match_demand_overrides? }
 *     → upserts the row and returns the updated config.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import {
  computeWeeklyTarget,
  getTeamLoadTargetConfig,
  type LoadTargetMode,
} from "@/lib/micropulse/externalLoad/loadTargets";

export const runtime = "nodejs";

function toMessage(e: unknown) {
  return e instanceof Error ? e.message : "Unknown error";
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const VALID_MODES: LoadTargetMode[] = ["baseline", "match_demand", "coach_weekly"];
const VALID_PHASES = ["build", "maintain", "taper"] as const;

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const url = new URL(req.url);
    const requestedTeamId = (url.searchParams.get("teamId") || "").trim() || null;
    const { teamId } = await requireCoachAccessForTeam(sb, req, requestedTeamId);

    if (!teamId) {
      return NextResponse.json({ ok: false, error: "Team context is required" }, { status: 400 });
    }

    const config = await getTeamLoadTargetConfig(teamId);

    // Also compute the current target preview so the coach can see what the
    // card will actually show with the current settings.
    let preview: Awaited<ReturnType<typeof computeWeeklyTarget>> | null = null;
    try {
      preview = await computeWeeklyTarget({ teamId, referenceDate: todayISO() });
    } catch {
      preview = null;
    }

    return NextResponse.json({ ok: true, config, preview });
  } catch (e: unknown) {
    const msg = toMessage(e);
    const code = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}

// ─── PUT ────────────────────────────────────────────────────────────────────

type PutBody = {
  teamId?: string;
  mode?: string;
  corridor_pct?: number;
  mesocycle_phase?: string | null;
  mesocycle_multiplier?: number;
  coach_weekly_targets?: Record<string, number>;
  match_demand_lookback_days?: number;
  match_day_detection_min_td?: number;
  match_day_detection_min_player_load?: number;
  match_demand_min_minutes?: number;
  match_demand_template?: Record<string, Record<string, number>>;
  match_demand_overrides?: Record<string, number>;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export async function PUT(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const body = (await req.json().catch(() => ({}))) as PutBody;
    const requestedTeamId = (body.teamId ?? "").trim() || null;
    const { teamId, coachUserId } = await requireCoachAccessForTeam(sb, req, requestedTeamId);

    if (!teamId) {
      return NextResponse.json({ ok: false, error: "Team context is required" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      team_id: teamId,
      updated_at: new Date().toISOString(),
      updated_by: coachUserId ?? null,
    };

    if (body.mode !== undefined) {
      if (!VALID_MODES.includes(body.mode as LoadTargetMode)) {
        return NextResponse.json({ ok: false, error: "Invalid mode" }, { status: 400 });
      }
      patch.mode = body.mode;
    }

    if (body.corridor_pct !== undefined) {
      const n = Number(body.corridor_pct);
      if (!Number.isFinite(n)) {
        return NextResponse.json({ ok: false, error: "corridor_pct must be numeric" }, { status: 400 });
      }
      patch.corridor_pct = clamp(n, 0, 0.5);
    }

    if (body.mesocycle_phase !== undefined) {
      if (body.mesocycle_phase === null || body.mesocycle_phase === "") {
        patch.mesocycle_phase = null;
      } else if (!VALID_PHASES.includes(body.mesocycle_phase as (typeof VALID_PHASES)[number])) {
        return NextResponse.json({ ok: false, error: "Invalid mesocycle_phase" }, { status: 400 });
      } else {
        patch.mesocycle_phase = body.mesocycle_phase;
      }
    }

    if (body.mesocycle_multiplier !== undefined) {
      const n = Number(body.mesocycle_multiplier);
      if (!Number.isFinite(n)) {
        return NextResponse.json({ ok: false, error: "mesocycle_multiplier must be numeric" }, { status: 400 });
      }
      patch.mesocycle_multiplier = clamp(n, 0.3, 2.0);
    }

    if (body.coach_weekly_targets !== undefined) {
      if (typeof body.coach_weekly_targets !== "object" || body.coach_weekly_targets === null) {
        return NextResponse.json({ ok: false, error: "coach_weekly_targets must be object" }, { status: 400 });
      }
      // Coerce all values to finite numbers, drop others
      const cleaned: Record<string, number> = {};
      for (const [k, v] of Object.entries(body.coach_weekly_targets)) {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) cleaned[k] = n;
      }
      patch.coach_weekly_targets = cleaned;
    }

    if (body.match_demand_lookback_days !== undefined) {
      const n = Math.round(Number(body.match_demand_lookback_days));
      if (!Number.isFinite(n)) {
        return NextResponse.json({ ok: false, error: "match_demand_lookback_days must be numeric" }, { status: 400 });
      }
      patch.match_demand_lookback_days = clamp(n, 14, 365);
    }

    if (body.match_day_detection_min_td !== undefined) {
      const n = Math.round(Number(body.match_day_detection_min_td));
      if (!Number.isFinite(n)) {
        return NextResponse.json({ ok: false, error: "match_day_detection_min_td must be numeric" }, { status: 400 });
      }
      patch.match_day_detection_min_td = clamp(n, 0, 15000);
    }

    if (body.match_day_detection_min_player_load !== undefined) {
      const n = Math.round(Number(body.match_day_detection_min_player_load));
      if (!Number.isFinite(n)) {
        return NextResponse.json(
          { ok: false, error: "match_day_detection_min_player_load must be numeric" },
          { status: 400 },
        );
      }
      patch.match_day_detection_min_player_load = clamp(n, 0, 2000);
    }

    if (body.match_demand_min_minutes !== undefined) {
      const n = Math.round(Number(body.match_demand_min_minutes));
      if (!Number.isFinite(n)) {
        return NextResponse.json({ ok: false, error: "match_demand_min_minutes must be numeric" }, { status: 400 });
      }
      patch.match_demand_min_minutes = clamp(n, 0, 120);
    }

    if (body.match_demand_template !== undefined) {
      if (typeof body.match_demand_template !== "object" || body.match_demand_template === null) {
        return NextResponse.json({ ok: false, error: "match_demand_template must be object" }, { status: 400 });
      }
      // Clean template: ensure all inner values are finite numbers ≥ 0
      const cleaned: Record<string, Record<string, number>> = {};
      for (const [day, inner] of Object.entries(body.match_demand_template)) {
        if (typeof inner !== "object" || inner === null) continue;
        const innerClean: Record<string, number> = {};
        for (const [k, v] of Object.entries(inner)) {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0) innerClean[k] = n;
        }
        cleaned[day] = innerClean;
      }
      patch.match_demand_template = cleaned;
    }

    if (body.match_demand_overrides !== undefined) {
      if (typeof body.match_demand_overrides !== "object" || body.match_demand_overrides === null) {
        return NextResponse.json({ ok: false, error: "match_demand_overrides must be object" }, { status: 400 });
      }
      const cleaned: Record<string, number> = {};
      for (const [k, v] of Object.entries(body.match_demand_overrides)) {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) cleaned[k] = n;
      }
      patch.match_demand_overrides = cleaned;
    }

    const { error: upsertErr } = await sb
      .from("team_load_targets")
      .upsert(patch, { onConflict: "team_id" });

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    const config = await getTeamLoadTargetConfig(teamId);
    let preview: Awaited<ReturnType<typeof computeWeeklyTarget>> | null = null;
    try {
      preview = await computeWeeklyTarget({ teamId, referenceDate: todayISO() });
    } catch {
      preview = null;
    }

    return NextResponse.json({ ok: true, config, preview });
  } catch (e: unknown) {
    const msg = toMessage(e);
    const code = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}

/**
 * /api/trainer/lv-profile
 *
 *   GET    ?clientId=<uuid>          → tests + addon status for that client
 *   POST                              → create or update a test (body below)
 *   DELETE ?testId=<uuid>             → delete one test
 *
 * Auth: trainer (COACH/ADMIN/STAFF role) — RLS enforces trainer_id = auth.uid().
 * Addon gate: POST refuses to save a test unless the trainer has flagged
 *   trainer_client_addons (trainer_id, client_id, addon_key='lv_profile',
 *   enabled=true). Use /api/trainer/lv-profile/addon to toggle.
 */

import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";
import { computeLvProfile, computeDsi, LV_EXERCISES, type LvDatapoint, type LvExerciseKey } from "@/lib/lvProfile";

export const runtime = "nodejs";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}


async function requireTrainer(req: Request): Promise<{ userId: string; sb: SupabaseClient } | { error: string; status: number }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 };
  const sb = getAdmin();
  const { data: userRes, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userRes?.user?.id) return { error: "Unauthorized", status: 401 };
  const userId = userRes.user.id;
  const { data: prof } = await sb
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) {
    return { error: "Forbidden", status: 403 };
  }
  return { userId, sb };
}

/**
 * Resolve whether the LV-profile feature is available for this trainer+client.
 *
 * Two paths to "yes":
 *   1. **Team-wide ELITE access.** If the user's team is on the ELITE plan
 *      AND is NOT a personal-trainer team, LV Profile is included in the
 *      plan — no per-client toggle. This is the regular MicroPulse coach
 *      experience (Breiðablik, Þór, etc.).
 *   2. **Per-client add-on.** Personal-trainer teams use the per-client
 *      paid model — trainer flips a flag in trainer_client_addons when a
 *      client opts into the ELITE LV-profile package.
 */
async function hasLvAddon(sb: SupabaseClient, trainerId: string, clientId: string): Promise<boolean> {
  // Path 1: team-wide ELITE. Look up the trainer's team plan + type.
  const { data: prof } = await sb
    .from("profiles")
    .select("team_id")
    .eq("id", trainerId)
    .maybeSingle();
  const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
  if (teamId) {
    const { data: team } = await sb
      .from("teams")
      .select("plan_tier, team_type")
      .eq("id", teamId)
      .maybeSingle();
    const t = team as { plan_tier?: string | null; team_type?: string | null } | null;
    const planUpper = String(t?.plan_tier ?? "").toUpperCase();
    const isPt = String(t?.team_type ?? "").toLowerCase() === "personal_trainer";
    if (planUpper === "ELITE" && !isPt) {
      // Also verify the client belongs to this team — prevents a trainer
      // from accessing a client outside their team via URL fiddling.
      const { data: client } = await sb
        .from("players")
        .select("team_id")
        .eq("id", clientId)
        .maybeSingle();
      if ((client as { team_id?: string | null } | null)?.team_id === teamId) {
        return true;
      }
    }
  }

  // Path 2: per-client add-on (PT-style).
  const { data, error } = await sb
    .from("trainer_client_addons")
    .select("id")
    .eq("trainer_id", trainerId)
    .eq("client_id", clientId)
    .eq("addon_key", "lv_profile")
    .eq("enabled", true)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/* ─── GET ──────────────────────────────────────────────────────────── */
export async function GET(req: Request) {
  const auth = await requireTrainer(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { userId, sb } = auth;

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });

  const addonEnabled = await hasLvAddon(sb, userId, clientId);

  const { data: tests, error: tErr } = await sb
    .from("lv_profile_tests")
    .select("*")
    .eq("trainer_id", userId)
    .eq("client_id", clientId)
    .order("test_date", { ascending: false })
    .limit(50);

  if (tErr) {
    return NextResponse.json({ error: tErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    clientId,
    addonEnabled,
    tests: tests ?? [],
    exercises: Object.values(LV_EXERCISES),
  });
}

/* ─── POST ─────────────────────────────────────────────────────────── */
type PostBody = {
  clientId: string;
  testId?: string;                  // omit for new, include to update
  testDate?: string;                 // YYYY-MM-DD
  exerciseKey: LvExerciseKey;
  exerciseLabel?: string;
  mvt?: number;
  datapoints: LvDatapoint[];
  dsiBallisticPeakN?: number;
  dsiIsoPeakN?: number;
  notes?: string;
};

export async function POST(req: Request) {
  const auth = await requireTrainer(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { userId, sb } = auth;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  if (!body.exerciseKey || !(body.exerciseKey in LV_EXERCISES)) {
    return NextResponse.json({ error: "Invalid exerciseKey" }, { status: 400 });
  }
  if (!Array.isArray(body.datapoints) || body.datapoints.length < 2) {
    return NextResponse.json({ error: "Need at least 2 datapoints" }, { status: 400 });
  }

  // ── Gate: client must have the lv_profile add-on enabled ─────────────
  const enabled = await hasLvAddon(sb, userId, body.clientId);
  if (!enabled) {
    return NextResponse.json(
      { error: "ADDON_NOT_ENABLED", message: "Enable the Load-Velocity Profile add-on for this client first." },
      { status: 402 }, // Payment Required
    );
  }

  const spec = LV_EXERCISES[body.exerciseKey];
  const mvt = Number.isFinite(body.mvt) ? Number(body.mvt) : spec.mvt;

  // Compute regression server-side so cached fields always match the math.
  const result = computeLvProfile(body.datapoints, mvt);
  if (!result) {
    return NextResponse.json(
      { error: "REGRESSION_FAILED", message: "Could not fit a load-velocity line — check the datapoints (need varied loads and positive velocities)." },
      { status: 400 },
    );
  }

  const dsi =
    Number.isFinite(body.dsiBallisticPeakN) && Number.isFinite(body.dsiIsoPeakN)
      ? computeDsi(Number(body.dsiBallisticPeakN), Number(body.dsiIsoPeakN))
      : null;

  const row = {
    trainer_id: userId,
    client_id: body.clientId,
    test_date: body.testDate ?? new Date().toISOString().slice(0, 10),
    exercise_key: body.exerciseKey,
    exercise_label: body.exerciseLabel ?? spec.label,
    datapoints: body.datapoints,
    mvt,
    slope: result.slope,
    intercept: result.intercept,
    see: result.see,
    r_squared: result.rSquared,
    y_offset_velocity: result.yOffsetVelocity,
    x_offset_load: result.xOffsetLoad,
    zero_velocity_load: result.zeroVelocityLoad,
    est_one_rm: result.estOneRm,
    est_one_rm_high: result.estOneRmHigh,
    est_one_rm_low: result.estOneRmLow,
    profile_type: result.profile,
    profile_reason: result.profileReason,
    dsi_ballistic_peak_n: body.dsiBallisticPeakN ?? null,
    dsi_iso_peak_n: body.dsiIsoPeakN ?? null,
    dsi_ratio: dsi?.ratio ?? null,
    dsi_tier: dsi?.tier ?? null,
    notes: body.notes ?? null,
    updated_at: new Date().toISOString(),
  };

  // Use service-role client so RLS doesn't fight us; we've already
  // validated trainer ownership via auth.uid().
  const query = body.testId
    ? sb.from("lv_profile_tests").update(row).eq("id", body.testId).eq("trainer_id", userId)
    : sb.from("lv_profile_tests").insert(row);

  const { data, error } = await query.select().maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, test: data, result, dsi });
}

/* ─── DELETE ───────────────────────────────────────────────────────── */
export async function DELETE(req: Request) {
  const auth = await requireTrainer(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { userId, sb } = auth;

  const url = new URL(req.url);
  const testId = url.searchParams.get("testId");
  if (!testId) return NextResponse.json({ error: "Missing testId" }, { status: 400 });

  const { error } = await sb
    .from("lv_profile_tests")
    .delete()
    .eq("id", testId)
    .eq("trainer_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

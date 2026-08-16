import { NextResponse } from "next/server";
import { getSupabaseServer as getAdminClient } from "@/lib/supabaseServer";
import {
  fetchActivitiesForDate,
  fetchActivityStats,
  probePeakPeriodParameters,
  getConfigForTeam,
  setActiveCatapultConfig,
} from "@/lib/integrations/catapult/api";

export const runtime = "nodejs";

/**
 * Diagnostic: can the Catapult v6 /stats API return a ROLLING PEAK-PERIOD read for
 * this org (worst 1/3/5-min window per metric — the power curve), so the daily sync
 * could pull it automatically instead of the manual OpenField "Peak Period" export?
 *
 * The /stats endpoint has no time axis in group_by (only athlete / period), so it can
 * only surface a peak-window value if the org has the matching "Peak/Max N-min"
 * parameter enabled in its OpenField Reporting_Parameters. This probes a set of
 * candidate parameter names AND scans the default parameter group's raw keys for any
 * peak/rolling/per-minute field, then returns a plain verdict.
 *
 *   GET /api/integrations/catapult/debug-peak-period?date=YYYY-MM-DD[&teamId=...][&activityId=...]
 *
 * Coach/admin only (or the cron secret). On a local dev server it is open for convenience.
 */

async function isAuthorizedCoach(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  const sb = getAdminClient();
  const { data: userRes, error } = await sb.auth.getUser(token);
  if (error || !userRes?.user?.id) return false;
  const { data: prof } = await sb.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  return role === "COACH" || role === "ADMIN" || role === "STAFF";
}

function isAuthorizedByCronSecret(request: Request): boolean {
  // Dev convenience: on a local dev server (never in production) allow a direct
  // browser hit so the probe can be run without grabbing a token.
  if (process.env.NODE_ENV !== "production") return true;
  const expected = process.env.CATAPULT_CRON_SECRET?.trim();
  if (!expected) return true;
  const url = new URL(request.url);
  const provided = request.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";
  return provided === expected;
}

/** Best-effort row extraction from a Catapult stats payload (mirrors debug-fields). */
function extractRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x));
  }
  if (payload && typeof payload === "object") {
    const rec = payload as Record<string, unknown>;
    for (const key of ["stats", "athletes", "data", "results", "items"]) {
      const v = rec[key];
      if (Array.isArray(v)) return v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
      if (v && typeof v === "object") {
        const sub = extractRows(v);
        if (sub.length) return sub;
      }
    }
  }
  return [];
}

// A raw key that looks like a rolling peak-period / per-minute window.
const PEAK_KEY = /(peak|max|rolling).*(min|sec|window|per.?min|60s|_1m|_3m|_5m)|per_?minute|_(1|2|3|5|10)[_ ]?min/i;

export async function GET(request: Request) {
  if (!isAuthorizedByCronSecret(request) && !(await isAuthorizedCoach(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let teamOverride: string | null = null;
  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const teamId = url.searchParams.get("teamId");
    if (teamId) {
      const cfg = await getConfigForTeam(teamId);
      if (!cfg) return NextResponse.json({ ok: false, error: `No Catapult config for team ${teamId}` }, { status: 404 });
      setActiveCatapultConfig(cfg);
      teamOverride = teamId;
    }

    const activities = await fetchActivitiesForDate(date);
    const activityId = url.searchParams.get("activityId") ?? activities[0]?.id ?? null;
    if (!activityId) {
      return NextResponse.json({ ok: false, date, error: `No Catapult activity for ${date}. Try ?date=YYYY-MM-DD`, activitiesForDate: activities.length });
    }

    // 1) Probe candidate rolling peak-period parameter names.
    const probe = await probePeakPeriodParameters(activityId);
    const available = probe.filter((r) => r.success && r.nonZeroAthletes > 0);
    const acceptedButEmpty = probe.filter((r) => r.success && r.nonZeroAthletes === 0);
    const rejected = probe.filter((r) => !r.success);

    // 2) Scan the org's DEFAULT parameter group for any peak/rolling/per-minute key
    //    already flowing through the normal sync (requested_only:false base fetch).
    const base = await fetchActivityStats(activityId);
    const baseRows = extractRows(base);
    const rawKeys = Array.from(new Set(baseRows.flatMap((r) => Object.keys(r)))).sort();
    const rawKeyMatches = rawKeys.filter((k) => PEAK_KEY.test(k));
    const rawKeyMatchSamples: Record<string, unknown> = {};
    for (const k of rawKeyMatches) rawKeyMatchSamples[k] = baseRows[0]?.[k];

    const canAutoSync = available.length > 0 || rawKeyMatches.length > 0;

    return NextResponse.json({
      ok: true,
      date,
      teamTargeted: teamOverride,
      activityId,
      athleteRows: baseRows.length,
      // ── READ THIS FIRST ──────────────────────────────────────────────
      verdict: canAutoSync
        ? "AVAILABLE — the org exposes a rolling peak-period/per-minute parameter; the daily sync CAN be wired to populate the power curve automatically. Send me `availableParameters` + `rawKeyMatches` and I'll map them into the sync."
        : "NOT AVAILABLE — no rolling peak-period parameter is enabled for this org, and /stats cannot compute a rolling window on demand. The OpenField \"Peak Period\" export stays the only source (manual upload). To change this, enable a \"Peak/Max N-min\" parameter in OpenField Reporting_Parameters, then re-run this probe.",
      canAutoSync,
      // Parameters the org ACCEPTS and returns data for (these are wireable):
      availableParameters: available.map((r) => ({ parameter: r.parameter, returnedKeys: r.returnedKeys, maxValue: r.maxValue, nonZeroAthletes: r.nonZeroAthletes, sampleValues: r.sampleValues })),
      // Names accepted but empty (schema knows them; org records nothing):
      acceptedButEmptyParameters: acceptedButEmpty.map((r) => r.parameter),
      // Names the API rejected outright (unknown for this org):
      rejectedParameters: rejected.map((r) => ({ parameter: r.parameter, error: r.error })),
      // Any peak/rolling/per-minute key already in the DEFAULT parameter group:
      rawKeyMatches,
      rawKeyMatchSamples,
      probedNames: probe.length,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    if (teamOverride) setActiveCatapultConfig(null);
  }
}

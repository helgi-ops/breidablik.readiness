import { NextResponse } from "next/server";
import { getSupabaseServer as getAdminClient } from "@/lib/supabaseServer";
import {
  fetchActivitiesForDate,
  fetchActivityStats,
  probePeakPeriodParameters,
  fetchParameterCatalog,
  fetchNamedStatsRaw,
  probeNamedStatsIndividually,
  getConfigForTeam,
  setActiveCatapultConfig,
} from "@/lib/integrations/catapult/api";
import { syncCatapultDailyMetrics } from "@/lib/integrations/catapult";

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

// A TRUE rolling peak-period window needs BOTH a peak/max/rolling/worst token AND a
// window token (a specific N-min/N-sec span). A plain `*_per_minute` key is a session
// AVERAGE rate, NOT a rolling peak, so it must NOT match — that over-match produced a
// false "AVAILABLE" on the first pass.
const ROLLING_PEAK_KEY = /(peak|max|rolling|worst).*(_(1|2|3|5|10)[_ ]?min|_(30|60|90|120|300)[_ ]?s(ec)?|window|per.?epoch)|peak[_ ]?period/i;
// A per-minute AVERAGE rate — reported for context, explicitly excluded from the verdict.
const PER_MINUTE_AVG_KEY = /per_?minute/i;

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

    // ?commit=1 → run the REAL daily sync for this date (idempotent upserts; no push,
    // that lives in the outer route) so the new MII→peak-period write actually runs and
    // populates player_load_peak_period. Returns the peak-period row count.
    if (url.searchParams.get("commit") === "1") {
      const result = await syncCatapultDailyMetrics(date);
      return NextResponse.json({
        ok: true, date, committed: true,
        peakPeriodCount: result.peakPeriodCount ?? 0,
        storedCount: result.storedCount, normalizedCount: result.normalizedCount,
      });
    }

    // ?raw=1 → fast path: probe the real MII / Peak names INDIVIDUALLY with
    // requested_only:false (the config the working fetches use) and report which
    // carry data. Skips the 38-name probe + 1614-param catalog scan.
    if (url.searchParams.get("raw") === "1") {
      const names = [
        "Peak Meta Power", "Peak Player Load",
        "MII Player Load Interval 1", "MII Player Load Interval 2", "MII Player Load Interval 3",
        "MII Distance Interval 1", "MII Distance Interval 2", "MII Distance Interval 3",
        "MII Player Load Interval 1 Start Time", "MII Player Load Interval 1 End Time",
        "MII Player Load Interval 2 Start Time", "MII Player Load Interval 2 End Time",
      ];
      const results = await probeNamedStatsIndividually(activityId, names);
      return NextResponse.json({ ok: true, date, activityId, results });
    }

    // 1) Probe candidate rolling peak-period parameter names.
    const probe = await probePeakPeriodParameters(activityId);
    const available = probe.filter((r) => r.success && r.nonZeroAthletes > 0);
    const acceptedButEmpty = probe.filter((r) => r.success && r.nonZeroAthletes === 0);
    const rejected = probe.filter((r) => !r.success);

    // 2) Scan the org's DEFAULT parameter group for any key already flowing through
    //    the normal sync (requested_only:false base fetch). Separate TRUE rolling-peak
    //    keys from per-minute AVERAGES — only the former proves auto-sync is possible.
    const base = await fetchActivityStats(activityId);
    const baseRows = extractRows(base);
    const rawKeys = Array.from(new Set(baseRows.flatMap((r) => Object.keys(r)))).sort();
    const rollingPeakKeys = rawKeys.filter((k) => ROLLING_PEAK_KEY.test(k));
    const perMinuteAverageKeys = rawKeys.filter((k) => PER_MINUTE_AVG_KEY.test(k) && !ROLLING_PEAK_KEY.test(k));
    const rollingPeakSamples: Record<string, unknown> = {};
    for (const k of rollingPeakKeys) rollingPeakSamples[k] = baseRows[0]?.[k];

    // 3) Authoritative check: does a rolling peak parameter EXIST in the org catalog?
    //    (The display-name probe can't tell — Catapult silently swallows unknown names.)
    const catalog = await fetchParameterCatalog();
    const catalogRollingPeak = catalog.filter((p) => ROLLING_PEAK_KEY.test(p.name) || ROLLING_PEAK_KEY.test(p.slug));
    // LOOSE scan — any catalog entry mentioning peak/max/rolling/worst/epoch/period, so a
    // peak-period parameter under an unexpected naming convention can't hide from the verdict.
    const LOOSE = /peak|max|rolling|worst|epoch|period|\bband\b.*\bmin\b|_(1|3|5)m(in)?\b/i;
    const catalogLooseMatches = catalog.filter((p) => LOOSE.test(p.name) || LOOSE.test(p.slug)).map((p) => p.name || p.slug);

    // Auto-sync is only real if a TRUE rolling-window metric surfaces — via a probed
    // parameter that returned data, a rolling-peak raw key, or a catalog entry.
    // 4) GROUND TRUTH: fetch the real catalog names verbatim (Peak Meta Power is a
    //    known-populated control) so we see the exact keys/values the org returns —
    //    independent of the probe's value-extraction.
    let rawTruthSample: Record<string, unknown>[] = [];
    let rawTruthError: string | null = null;
    try {
      const rows = await fetchNamedStatsRaw(activityId, [
        "Peak Meta Power", "Peak Player Load",
        "MII Player Load Interval 1", "MII Player Load Interval 2", "MII Player Load Interval 3",
        "MII Distance Interval 1",
        "MII Player Load Interval 1 Start Time", "MII Player Load Interval 1 End Time",
      ]);
      // Return the first 2 non-empty rows verbatim (trimmed to the interesting keys).
      rawTruthSample = rows.slice(0, 2).map((r) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
          if (/mii|peak|meta|player_load|athlete/i.test(k)) out[k] = v;
        }
        return out;
      });
    } catch (e) {
      rawTruthError = e instanceof Error ? e.message : String(e);
    }

    // A real MII/Peak value in the ground-truth sample also proves auto-sync is possible.
    const rawTruthHasMiiOrPeak = rawTruthSample.some((r) =>
      Object.entries(r).some(([k, v]) => /mii|peak/i.test(k) && typeof v === "number" && v > 0),
    );

    const canAutoSync = available.length > 0 || rollingPeakKeys.length > 0 || catalogRollingPeak.length > 0 || rawTruthHasMiiOrPeak;

    return NextResponse.json({
      ok: true,
      date,
      teamTargeted: teamOverride,
      activityId,
      athleteRows: baseRows.length,
      // ── READ THIS FIRST ──────────────────────────────────────────────
      verdict: canAutoSync
        ? "AVAILABLE — the org exposes a TRUE rolling peak-period metric; the daily sync CAN be wired to populate the power curve automatically. Send me `availableParameters` + `rollingPeakKeys` + `catalogRollingPeak` and I'll map them into the sync."
        : "NOT AVAILABLE — the /stats output contains only session totals and per-minute AVERAGES (e.g. player_load_per_minute), no rolling worst-window metric, and the parameter catalog lists no peak-period parameter. /stats has no time axis (group_by athlete/period only) so it cannot compute a rolling window on demand. The OpenField \"Peak Period\" report/export stays the only source (manual upload).",
      canAutoSync,
      catalogParameterCount: catalog.length,
      // Ground-truth verbatim rows for the real MII / Peak names (Peak Meta Power = control):
      rawTruthSample,
      rawTruthError,
      rawTruthHasMiiOrPeak,
      // Catalog entries whose NAME is a true rolling peak (authoritative existence check):
      catalogRollingPeak,
      // Loose scan (peak/max/rolling/epoch/period) — eyeball that nothing hid from the verdict:
      catalogLooseMatches,
      // Probed parameters the org ACCEPTS and returns data for (wireable):
      availableParameters: available.map((r) => ({ parameter: r.parameter, returnedKeys: r.returnedKeys, maxValue: r.maxValue, nonZeroAthletes: r.nonZeroAthletes, sampleValues: r.sampleValues })),
      // TRUE rolling-window keys in the default group (peak/max + a window span):
      rollingPeakKeys,
      rollingPeakSamples,
      // Per-minute AVERAGE keys — NOT peaks; shown so it's clear what /stats does expose:
      perMinuteAverageKeys,
      // Probe bookkeeping — Catapult silently accepts unknown names, so "acceptedButEmpty"
      // here means "name ignored", not "real-but-zero". The catalog above is the truth.
      acceptedButEmptyParameters: acceptedButEmpty.map((r) => r.parameter),
      rejectedParameters: rejected.map((r) => ({ parameter: r.parameter, error: r.error })),
      probedNames: probe.length,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    if (teamOverride) setActiveCatapultConfig(null);
  }
}

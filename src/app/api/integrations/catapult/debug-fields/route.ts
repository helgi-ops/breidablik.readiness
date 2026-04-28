import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchActivitiesForDate, fetchActivityStatsDetailed } from "@/lib/integrations/catapult/api";
import {
  extractInterestingMetricKeys,
  flattenMetricRecord,
  normalizeCatapultActivityStats,
} from "@/lib/integrations/catapult/normalize";

export const runtime = "nodejs";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function getAdminClient() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

async function isAuthorizedCoach(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  const sb = getAdminClient();
  const { data: userRes, error } = await sb.auth.getUser(token);
  if (error || !userRes?.user?.id) return false;
  const { data: prof } = await sb
    .from("profiles")
    .select("role")
    .eq("id", userRes.user.id)
    .maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  return role === "COACH" || role === "ADMIN" || role === "STAFF";
}

function extractRows(payload: unknown): Record<string, unknown>[] {
  // If the payload itself is an array, each item may be a row directly,
  // or a wrapper that contains rows at a known sub-path.
  if (Array.isArray(payload)) {
    // Try to dig into each array item for a known sub-structure first.
    const nested = payload.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const rec = item as Record<string, unknown>;
      // Item already looks like an athlete row (has athlete_id / id)
      if (rec.athlete_id || rec.id || rec.athleteId) return [rec];
      // Item is a wrapper — try sub-paths
      const sub = extractRows(rec);
      return sub.length ? sub : [rec];
    });
    if (nested.length) return nested;
    return [];
  }

  if (payload && typeof payload === "object") {
    const rec = payload as Record<string, unknown>;
    if (Array.isArray(rec.stats)) return rec.stats as Record<string, unknown>[];
    const statsRecord = rec.stats && typeof rec.stats === "object" ? (rec.stats as Record<string, unknown>) : null;
    if (statsRecord?.athletes && Array.isArray(statsRecord.athletes)) return statsRecord.athletes as Record<string, unknown>[];
    const athletesRecord =
      statsRecord?.athletes && typeof statsRecord.athletes === "object"
        ? (statsRecord.athletes as Record<string, unknown>)
        : null;
    if (athletesRecord?.data && Array.isArray(athletesRecord.data)) return athletesRecord.data as Record<string, unknown>[];

    if (Array.isArray(rec.athletes)) return rec.athletes as Record<string, unknown>[];
    if (Array.isArray(rec.data)) return rec.data as Record<string, unknown>[];
    const dataRecord = rec.data && typeof rec.data === "object" ? (rec.data as Record<string, unknown>) : null;
    if (dataRecord?.results && Array.isArray(dataRecord.results)) return dataRecord.results as Record<string, unknown>[];
    const resultsRecord =
      dataRecord?.results && typeof dataRecord.results === "object"
        ? (dataRecord.results as Record<string, unknown>)
        : null;
    if (resultsRecord?.items && Array.isArray(resultsRecord.items)) return resultsRecord.items as Record<string, unknown>[];

    if (Array.isArray(rec.results)) return rec.results as Record<string, unknown>[];
    if (rec.results && typeof rec.results === "object" && Array.isArray((rec.results as Record<string, unknown>).items)) {
      return (rec.results as Record<string, unknown>).items as Record<string, unknown>[];
    }
  }
  return [];
}

function isAuthorizedByCronSecret(request: Request): boolean {
  const expected = process.env.CATAPULT_CRON_SECRET?.trim();
  if (!expected) return true;
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-cron-secret") ||
    url.searchParams.get("secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return provided?.trim() === expected;
}

export async function GET(request: Request) {
  const authed = isAuthorizedByCronSecret(request) || (await isAuthorizedCoach(request));
  if (!authed) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

    const activities = await fetchActivitiesForDate(date);
    if (!activities.length) {
      return NextResponse.json({
        ok: false,
        error: `No activities for ${date}. Try ?date=YYYY-MM-DD`,
      });
    }

    const activity = activities[0];
    const details = await fetchActivityStatsDetailed(activity.id);
    const rowsBase = extractRows(details.basePayload);
    const rowsImaOnly = extractRows(details.imaOnlyPayload);
    const rowsMetabolicOnly = extractRows(details.metabolicOnlyPayload);
    const rowsFmpOnly = extractRows(details.fmpOnlyPayload);
    const rowsMerged = extractRows(details.mergedPayload);
    const normalized = normalizeCatapultActivityStats({
      activityId: activity.id,
      date,
      payload: details.mergedPayload,
    });

    const firstBaseRow = rowsBase[0] ?? {};
    const firstImaOnlyRow = rowsImaOnly[0] ?? {};
    const firstMetabolicOnlyRow = rowsMetabolicOnly[0] ?? {};
    const firstMergedRow = rowsMerged[0] ?? {};
    const firstBaseFlat = Object.keys(firstBaseRow).length ? flattenMetricRecord(firstBaseRow) : {};
    const firstImaOnlyFlat = Object.keys(firstImaOnlyRow).length ? flattenMetricRecord(firstImaOnlyRow) : {};
    const firstMetabolicOnlyFlat = Object.keys(firstMetabolicOnlyRow).length ? flattenMetricRecord(firstMetabolicOnlyRow) : {};
    const firstMergedFlat = Object.keys(firstMergedRow).length ? flattenMetricRecord(firstMergedRow) : {};
    const allRawKeys = Object.keys(firstMergedFlat).sort();
    const interestingKeys = extractInterestingMetricKeys(firstMergedFlat);
    const imaKeys = allRawKeys.filter((k) =>
      ["ima", "accel", "decel", "cod", "impact", "playerload"].some((token) => k.toLowerCase().includes(token)),
    );
    const metabolicKeys = allRawKeys.filter((k) =>
      ["metabolic", "hmld", "hml", "energy", "fmp", "meta"].some((token) => k.toLowerCase().includes(token)),
    );

    const imaValues: Record<string, unknown> = {};
    for (const k of imaKeys) imaValues[k] = firstMergedFlat[k];

    const metabolicValues: Record<string, unknown> = {};
    for (const k of metabolicKeys) metabolicValues[k] = firstMergedFlat[k];

    // FMP dedicated payload analysis
    const firstFmpOnlyRow = rowsFmpOnly[0] ?? {};
    const firstFmpOnlyFlat = Object.keys(firstFmpOnlyRow).length ? flattenMetricRecord(firstFmpOnlyRow) : {};
    const allFmpOnlyKeys = Object.keys(firstFmpOnlyRow).sort();
    const allFmpOnlyFlatKeys = Object.keys(firstFmpOnlyFlat).sort();

    // Unlimited fmp_* key scan across all payloads (not capped by sample limits)
    const allBaseKeys = Object.keys(firstBaseRow).sort();
    const allMetabolicOnlyKeys = Object.keys(firstMetabolicOnlyRow).sort();
    const allMergedKeys = Object.keys(firstMergedRow).sort();
    const fmpBaseKeys = allBaseKeys.filter((k) => k.toLowerCase().startsWith("fmp"));
    const fmpMetabolicKeys = allMetabolicOnlyKeys.filter((k) => k.toLowerCase().startsWith("fmp"));
    const fmpMergedKeys = allMergedKeys.filter((k) => k.toLowerCase().startsWith("fmp"));
    const fmpMergedValues: Record<string, unknown> = {};
    for (const k of fmpMergedKeys) fmpMergedValues[k] = firstMergedRow[k];
    const fmpMetabolicValues: Record<string, unknown> = {};
    for (const k of fmpMetabolicKeys) fmpMetabolicValues[k] = firstMetabolicOnlyRow[k];

    const normalizedFirst = normalized[0] ?? null;

    // Surface sprint-count probe results — these tell us EXACTLY which display-name
    // Catapult accepts and what raw key name it sends back.
    const sprintProbeAccepted = details.sprintCountProbeResults.filter((r) => r.success);
    const sprintProbeRejected = details.sprintCountProbeResults.filter((r) => !r.success);
    // Find any new keys the sprint probe revealed beyond the base/IMA/metabolic/FMP fields
    const sprintRevealedKeys = Array.from(
      new Set(sprintProbeAccepted.flatMap((r) => r.returnedKeys)),
    )
      .filter((k) => !allRawKeys.includes(k))
      .sort();

    // Same diagnostic surfacing for Decel B3 probe — added when McBurnie engine
    // refused to upgrade from b2-3 fallback even after coach enabled
    // "Deceleration B3 Efforts (Gen 2)" in OpenField. Probe tells us whether
    // Catapult accepted ANY of our parameter name variants AND what raw key
    // it returned the data under (so we can update normalize.ts aliases).
    const decelB3PlusProbeAccepted = details.decelB3PlusProbeResults.filter((r) => r.success);
    const decelB3PlusProbeRejected = details.decelB3PlusProbeResults.filter((r) => !r.success);
    const decelB3PlusRevealedKeys = Array.from(
      new Set(decelB3PlusProbeAccepted.flatMap((r) => r.returnedKeys)),
    )
      .filter((k) => !allRawKeys.includes(k))
      .sort();
    // Also surface ALL decel-related keys in the merged payload so we can spot
    // fields the probe didn't isolate (e.g. if the param landed in basePayload).
    const decelKeys = allRawKeys.filter((k) =>
      ["decel", "deceleration", "brake"].some((token) => k.toLowerCase().includes(token)),
    );
    const decelKeysWithSamples: Record<string, unknown> = {};
    for (const k of decelKeys) decelKeysWithSamples[k] = firstMergedFlat[k];

    // ── Aggregate stats across ALL 18 athletes ─────────────────────
    // The "sample" fields above only show row[0] which may be a goalkeeper or someone
    // who didn't participate. These aggregates tell us if data exists for ANY athlete.
    function aggregateField(rows: Record<string, unknown>[], fieldNames: string[]) {
      let nonZeroCount = 0;
      let maxValue = 0;
      let sumValue = 0;
      const samplesPerAthlete: Array<{ athleteId: string | null; value: number | null }> = [];
      for (const row of rows) {
        const athleteId =
          (typeof row.athlete_id === "string" ? row.athlete_id : null) ??
          (typeof row.athleteId === "string" ? row.athleteId : null) ??
          (typeof row.id === "string" ? row.id : null);
        let val: number | null = null;
        for (const fname of fieldNames) {
          const raw = row[fname];
          const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : null;
          if (parsed != null && Number.isFinite(parsed)) {
            val = parsed;
            break;
          }
        }
        samplesPerAthlete.push({ athleteId, value: val });
        if (val != null && val > 0) {
          nonZeroCount += 1;
          sumValue += val;
          if (val > maxValue) maxValue = val;
        }
      }
      return {
        nonZeroAthletes: nonZeroCount,
        totalAthletes: rows.length,
        maxValue,
        avgValue: nonZeroCount > 0 ? sumValue / nonZeroCount : 0,
        topAthlete:
          samplesPerAthlete
            .filter((s) => s.value != null && s.value > 0)
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0] ?? null,
      };
    }

    const imaAggregates = {
      imaAccelHigh: aggregateField(rowsImaOnly, ["IMA Accel High", "ima_accel_high", "imaAccelHigh"]),
      imaDecelHigh: aggregateField(rowsImaOnly, ["IMA Decel High", "ima_decel_high", "imaDecelHigh"]),
      imaCodLeftHigh: aggregateField(rowsImaOnly, ["IMA CoD Left High", "ima_cod_left_high"]),
      imaCodRightHigh: aggregateField(rowsImaOnly, ["IMA CoD Right High", "ima_cod_right_high"]),
    };
    const baseAggregates = {
      totalDistance: aggregateField(rowsBase, ["total_distance", "totalDistance"]),
      maxVelocity: aggregateField(rowsBase, ["max_vel", "max_velocity", "maxVelocity"]),
      velocityBand6Distance: aggregateField(rowsBase, ["velocity_band6_total_distance", "velocityBand6TotalDistance"]),
      totalPlayerLoad: aggregateField(rowsBase, ["total_player_load", "totalPlayerLoad"]),
    };
    const metabolicAggregates = {
      peakMetaPower: aggregateField(rowsMetabolicOnly, ["Peak Meta Power", "Peak Metabolic Power", "Max Metabolic Power"]),
      hmldM: aggregateField(rowsMetabolicOnly, ["High Metabolic Load Dist (m)", "High Metabolic Load Dist", "High Metabolic Load Distance"]),
    };
    const fmpAggregates = {
      fmpDynamicHighDuration: aggregateField(rowsFmpOnly, ["FMP Dynamic High Duration", "fmp_dynamic_high_duration"]),
      fmpRunningHighDuration: aggregateField(rowsFmpOnly, ["FMP Running High Duration", "fmp_running_high_duration"]),
    };

    // ── Pattern-based key dumps (the truth, no guessing) ──────────────
    // Find ALL raw keys in the merged Catapult response matching specific patterns.
    // This is how we discover the EXACT field name Catapult uses for sprint count
    // and avg/peak metabolic power.
    function dumpKeys(allKeys: string[], pattern: RegExp): string[] {
      return allKeys.filter((k) => pattern.test(k.toLowerCase())).sort();
    }
    function dumpKeysWithSampleValues(rows: Record<string, unknown>[], allKeys: string[], pattern: RegExp) {
      const matchingKeys = dumpKeys(allKeys, pattern);
      const result: Array<{
        key: string;
        nonZeroAthletes: number;
        maxValue: number;
        sampleAthlete: { athleteId: string | null; value: number | null } | null;
      }> = [];
      for (const key of matchingKeys) {
        const agg = aggregateField(rows, [key]);
        result.push({
          key,
          nonZeroAthletes: agg.nonZeroAthletes,
          maxValue: agg.maxValue,
          sampleAthlete: agg.topAthlete,
        });
      }
      return result;
    }

    // Sprint count: any key with "velocity_band" / "vb_" / "sprint" + "effort" / "count"
    const sprintCountCandidateKeys = dumpKeysWithSampleValues(
      rowsMerged,
      allRawKeys,
      /(velocity_band[_ ]?[4-6]|vb[4-6]|sprint).*(effort|count|set_?2|gen[_ ]?2)/i,
    );
    // Catapult sometimes names them differently — also dump anything containing "band_6" or "b6"
    const sprintCountVelocityBand6 = dumpKeysWithSampleValues(
      rowsMerged,
      allRawKeys,
      /(velocity[_ ]?band[_ ]?6|vb6|band[_ ]6\+|band_6_plus)/i,
    );

    // Metabolic power: avg / peak / max
    const metabolicPowerCandidateKeys = dumpKeysWithSampleValues(
      rowsMerged,
      allRawKeys,
      /(metabolic|meta).*(power|w_kg|wkg)/i,
    );
    // Also include any avg/peak metabolic of any kind
    const metabolicAvgPeakCandidateKeys = dumpKeysWithSampleValues(
      rowsMerged,
      allRawKeys,
      /(avg|average|peak|max|mean).*(metabolic|meta|power)/i,
    );

    return NextResponse.json({
      ok: true,
      date,
      activity: { id: activity.id, name: activity.name },
      athleteCount: rowsMerged.length,
      baseRowCount: rowsBase.length,
      imaOnlyRowCount: rowsImaOnly.length,
      metabolicOnlyRowCount: rowsMetabolicOnly.length,
      imaOnlyError: details.imaOnlyError,
      metabolicOnlyError: details.metabolicOnlyError,
      imaOnlyParameters: details.imaOnlyParameters,
      metabolicOnlyParameters: details.metabolicOnlyParameters,
      // ── Sprint count probe results ──────────────────────────────
      // sprintCountAcceptedParameters: display-names Catapult ACCEPTED
      // sprintCountRejectedParameters: display-names Catapult REJECTED with error
      // sprintRevealedKeys: NEW keys returned by sprint probe that weren't in merged payload
      sprintCountParameters: details.sprintCountParameters,
      sprintCountAcceptedParameters: sprintProbeAccepted.map((r) => ({
        parameter: r.parameter,
        returnedKeys: r.returnedKeys,
        sampleValues: r.sampleValues,
      })),
      sprintCountRejectedParameters: sprintProbeRejected.map((r) => ({
        parameter: r.parameter,
        error: r.error,
      })),
      sprintRevealedKeys,
      // ── Decel B3 probe — McBurnie high-intensity decel diagnostic ─────
      decelB3PlusParameters: details.decelB3PlusParameters,
      decelB3PlusAcceptedParameters: decelB3PlusProbeAccepted.map((r) => ({
        parameter: r.parameter,
        returnedKeys: r.returnedKeys,
        sampleValues: r.sampleValues,
      })),
      decelB3PlusRejectedParameters: decelB3PlusProbeRejected.map((r) => ({
        parameter: r.parameter,
        error: r.error,
      })),
      decelB3PlusRevealedKeys,
      // All decel-related keys in the merged payload — useful when the probe
      // returned no NEW keys but a decel-named field exists in the base payload
      decelKeys,
      decelKeysWithSamples,
      // ── IMA Free Running probe results ───────────────────────────────
      // freeRunningBatchSucceeded: true if Catapult accepted all 24 in one call
      // freeRunningProbeResults: per-parameter success/error
      // freeRunningAcceptedCount: how many of 24 names Catapult accepted
      freeRunningParameters: details.freeRunningParameters,
      freeRunningBatchSucceeded: details.freeRunningBatchSucceeded,
      freeRunningOnlyError: details.freeRunningOnlyError,
      freeRunningAcceptedCount: details.freeRunningProbeResults.filter((r) => r.success).length,
      freeRunningRejectedParameters: details.freeRunningProbeResults
        .filter((r) => !r.success)
        .map((r) => ({ parameter: r.parameter, error: r.error })),
      // Find any keys in merged payload matching free running pattern
      freeRunningRevealedKeys: allRawKeys.filter((k) => {
        const lower = k.toLowerCase();
        return lower.includes("free_running") || lower.includes("freerunning") ||
          (lower.includes("stride") && (lower.includes("count") || lower.includes("rate")));
      }).sort(),
      // ── Aggregate stats across ALL athletes (not just first row) ──────
      // If nonZeroAthletes = 0 across all 18, the metric truly isn't being captured.
      // If nonZeroAthletes > 0, the data IS coming through — first row was just a low-activity athlete.
      imaAggregates,
      baseAggregates,
      metabolicAggregates,
      fmpAggregates,
      // ── Pattern-based dumps to discover the EXACT Catapult key name ──────
      // Each entry shows: { key, nonZeroAthletes (out of all athletes), maxValue, sampleAthlete }
      // Look for entries with nonZeroAthletes > 0 and maxValue > 0 — those are populated.
      sprintCountCandidateKeys,
      sprintCountVelocityBand6,
      metabolicPowerCandidateKeys,
      metabolicAvgPeakCandidateKeys,
      basePayloadTopKeys: Object.keys((details.basePayload as Record<string, unknown>) ?? {}).sort(),
      imaOnlyPayloadTopKeys: Object.keys((details.imaOnlyPayload as Record<string, unknown>) ?? {}).sort(),
      metabolicOnlyPayloadTopKeys: Object.keys((details.metabolicOnlyPayload as Record<string, unknown>) ?? {}).sort(),
      allRawKeys,
      interestingKeys,
      imaKeys,
      imaValues,
      metabolicKeys,
      metabolicValues,
      fmpBaseKeys,
      fmpMetabolicKeys,
      fmpMergedKeys,
      fmpMergedValues,
      fmpMetabolicValues,
      fmpOnlyError: details.fmpOnlyError,
      fmpOnlyRowCount: rowsFmpOnly.length,
      fmpOnlyRawKeys: allFmpOnlyKeys,
      fmpOnlyFlatKeys: allFmpOnlyFlatKeys,
      fmpOnlyFlatSample: Object.fromEntries(Object.entries(firstFmpOnlyFlat).slice(0, 80)),
      allBaseKeyCount: allBaseKeys.length,
      allMetabolicOnlyKeyCount: allMetabolicOnlyKeys.length,
      allMergedKeyCount: allMergedKeys.length,
      normalizedFirst,
      normalizedImaDebug: normalizedFirst?.imaDebug ?? null,
      sampleBaseFlat: Object.fromEntries(Object.entries(firstBaseFlat).slice(0, 80)),
      sampleImaOnlyFlat: Object.fromEntries(Object.entries(firstImaOnlyFlat).slice(0, 80)),
      sampleMetabolicOnlyFlat: Object.fromEntries(Object.entries(firstMetabolicOnlyFlat).slice(0, 80)),
      sampleMergedFlat: Object.fromEntries(Object.entries(firstMergedFlat).slice(0, 120)),
      sampleBaseRow: Object.fromEntries(Object.entries(firstBaseRow).slice(0, 50)),
      sampleImaOnlyRow: Object.fromEntries(Object.entries(firstImaOnlyRow).slice(0, 50)),
      sampleMetabolicOnlyRow: Object.fromEntries(Object.entries(firstMetabolicOnlyRow).slice(0, 20)),
      sampleMergedRow: Object.fromEntries(Object.entries(firstMergedRow).slice(0, 80)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Debug failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

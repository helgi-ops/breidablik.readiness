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

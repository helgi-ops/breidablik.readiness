import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchActivitiesForDate, fetchActivityStatsDetailed } from "@/lib/integrations/catapult/api";
import { normalizeCatapultActivityStats } from "@/lib/integrations/catapult/normalize";

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
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => extractRows(item));
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
    const rowsMerged = extractRows(details.mergedPayload);
    const normalized = normalizeCatapultActivityStats({
      activityId: activity.id,
      date,
      payload: details.mergedPayload,
    });

    const firstBaseRow = rowsBase[0] ?? {};
    const firstImaOnlyRow = rowsImaOnly[0] ?? {};
    const firstMergedRow = rowsMerged[0] ?? {};
    const allRawKeys = Object.keys(firstMergedRow).sort();
    const imaKeys = allRawKeys.filter((k) =>
      ["ima", "accel", "decel", "cod", "impact", "playerload"].some((token) => k.toLowerCase().includes(token)),
    );

    const imaValues: Record<string, unknown> = {};
    for (const k of imaKeys) {
      imaValues[k] = firstMergedRow[k];
    }

    const normalizedFirst = normalized[0] ?? null;

    return NextResponse.json({
      ok: true,
      date,
      activity: { id: activity.id, name: activity.name },
      athleteCount: rowsMerged.length,
      baseRowCount: rowsBase.length,
      imaOnlyRowCount: rowsImaOnly.length,
      imaOnlyError: details.imaOnlyError,
      allRawKeys,
      imaKeys,
      imaValues,
      normalizedFirst,
      normalizedImaDebug: normalizedFirst?.imaDebug ?? null,
      sampleBaseRow: Object.fromEntries(Object.entries(firstBaseRow).slice(0, 50)),
      sampleImaOnlyRow: Object.fromEntries(Object.entries(firstImaOnlyRow).slice(0, 50)),
      sampleMergedRow: Object.fromEntries(Object.entries(firstMergedRow).slice(0, 80)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Debug failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

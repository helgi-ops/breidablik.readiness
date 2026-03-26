import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchActivitiesForDate, fetchActivityStats } from "@/lib/integrations/catapult/api";
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
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object") {
    const rec = payload as Record<string, unknown>;
    for (const key of ["data", "stats", "athletes", "results", "items"]) {
      if (Array.isArray(rec[key])) return rec[key] as Record<string, unknown>[];
    }
  }
  return [];
}

export async function GET(request: Request) {
  if (!(await isAuthorizedCoach(request))) {
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
    const payloadAll = await fetchActivityStats(activity.id);
    const rowsAll = extractRows(payloadAll);
    const normalized = normalizeCatapultActivityStats({
      activityId: activity.id,
      date,
      payload: payloadAll,
    });

    // Extract all field names from call 1 (the "all fields" call)
    const firstRow = rowsAll[0] ?? {};
    const allRawKeys = Object.keys(firstRow).sort();
    const imaKeys = allRawKeys.filter((k) => k.toLowerCase().includes("ima"));

    // Show first athlete values for IMA keys
    const imaValues: Record<string, unknown> = {};
    for (const k of imaKeys) {
      imaValues[k] = firstRow[k];
    }

    const normalizedFirst = normalized[0] ?? null;

    return NextResponse.json({
      ok: true,
      date,
      activity: { id: activity.id, name: activity.name },
      athleteCount: rowsAll.length,
      // All field names returned by Catapult
      allRawKeys,
      // Only IMA-related keys
      imaKeys,
      // IMA key→value for first athlete
      imaValues,
      normalizedFirst,
      normalizedImaDebug: normalizedFirst?.imaDebug ?? null,
      // Raw first row (truncated to 50 keys for readability)
      sampleRow: Object.fromEntries(Object.entries(firstRow).slice(0, 50)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Debug failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

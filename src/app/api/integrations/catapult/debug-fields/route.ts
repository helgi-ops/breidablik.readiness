import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchActivitiesForDate } from "@/lib/integrations/catapult/api";

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

async function statsCall(activityId: string, parameters: string[], requestedOnly: boolean): Promise<unknown> {
  const config = {
    baseUrl: (process.env.CATAPULT_API_BASE?.trim() || "https://backend-eu.openfield.catapultsports.com").replace(/\/+$/, ""),
    apiKey: env("CATAPULT_API_KEY"),
    orgId: env("CATAPULT_ORG_ID"),
  };

  const url = new URL(`${config.baseUrl}/api/v6/stats`);
  url.searchParams.set("org_id", config.orgId);

  const body: Record<string, unknown> = {
    group_by: ["athlete"],
    filters: [{ name: "activity_id", comparison: "=", values: [activityId] }],
    requested_only: requestedOnly,
  };
  if (parameters.length > 0) {
    body.parameters = parameters;
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "x-api-key": config.apiKey,
      "x-org-id": config.orgId,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { rawText: text.slice(0, 2000) };
  }
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

    // Call 1: known-good params only, requested_only: false → should return ALL fields Catapult has
    const payloadAll = await statsCall(activity.id, ["total_distance"], false);
    const rowsAll = extractRows(payloadAll);

    // Call 2: just IMA display names, requested_only: true → see if display names work
    const payloadIma = await statsCall(
      activity.id,
      ["IMA Accel High", "IMA Accel Medium", "IMA Accel Low",
       "IMA Decel High", "IMA Decel Medium", "IMA Decel Low",
       "IMA CoD Left High", "IMA CoD Right High"],
      true,
    );
    const rowsIma = extractRows(payloadIma);

    // Extract all field names from call 1 (the "all fields" call)
    const firstRow = rowsAll[0] ?? {};
    const allRawKeys = Object.keys(firstRow).sort();
    const imaKeys = allRawKeys.filter((k) => k.toLowerCase().includes("ima"));

    // Show first athlete values for IMA keys
    const imaValues: Record<string, unknown> = {};
    for (const k of imaKeys) {
      imaValues[k] = firstRow[k];
    }

    // From call 2 — what came back for display name params?
    const imaDisplayValues: Record<string, unknown> = {};
    const firstImaRow = rowsIma[0] ?? {};
    for (const k of Object.keys(firstImaRow)) {
      if (k.toLowerCase().includes("ima") || k.startsWith("IMA")) {
        imaDisplayValues[k] = firstImaRow[k];
      }
    }

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
      // What came back when requesting display names
      imaDisplayValues,
      // Raw first row (truncated to 50 keys for readability)
      sampleRow: Object.fromEntries(Object.entries(firstRow).slice(0, 50)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Debug failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

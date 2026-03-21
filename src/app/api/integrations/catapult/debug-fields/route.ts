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
  const { data: prof } = await sb.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  return role === "COACH" || role === "ADMIN" || role === "STAFF";
}

async function fetchRawStats(activityId: string): Promise<unknown> {
  const config = {
    baseUrl: (process.env.CATAPULT_API_BASE?.trim() || "https://backend-eu.openfield.catapultsports.com").replace(/\/+$/, ""),
    apiKey: env("CATAPULT_API_KEY"),
    orgId: env("CATAPULT_ORG_ID"),
  };

  const url = new URL(`${config.baseUrl}/api/v6/stats`);
  url.searchParams.set("org_id", config.orgId);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "x-api-key": config.apiKey,
      "x-org-id": config.orgId,
    },
    body: JSON.stringify({
      group_by: ["athlete"],
      filters: [{ name: "activity_id", comparison: "=", values: [activityId] }],
      // No parameters filter — let Catapult return everything available
      requested_only: false,
    }),
    cache: "no-store",
  });

  return response.json().catch(() => null);
}

export async function GET(request: Request) {
  if (!(await isAuthorizedCoach(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

    // Fetch activities for the given date
    const activities = await fetchActivitiesForDate(date);
    if (!activities.length) {
      return NextResponse.json({ ok: false, error: `No activities found for ${date}` });
    }

    const activity = activities[0];
    const rawPayload = await fetchRawStats(activity.id);

    // Extract all field names from the first athlete row
    let fieldNames: string[] = [];
    let sampleRow: Record<string, unknown> | null = null;

    const rows = Array.isArray(rawPayload)
      ? rawPayload
      : Array.isArray((rawPayload as Record<string, unknown>)?.data)
        ? ((rawPayload as Record<string, unknown>).data as unknown[])
        : [];

    if (rows.length > 0) {
      const first = rows[0];
      if (first && typeof first === "object" && !Array.isArray(first)) {
        sampleRow = first as Record<string, unknown>;
        fieldNames = Object.keys(sampleRow).sort();
      }
    }

    // Filter to IMA-related fields for easy reading
    const imaFields = fieldNames.filter((k) => k.toLowerCase().includes("ima"));
    const allFields = fieldNames;

    return NextResponse.json({
      ok: true,
      date,
      activity: { id: activity.id, name: activity.name },
      athleteCount: rows.length,
      imaFields,
      allFields,
      sampleRow,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Debug failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

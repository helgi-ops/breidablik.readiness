import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchActivitiesForDateRange, fetchActivityStats } from "@/lib/integrations/catapult/api";
import { normalizeCatapultActivityStats } from "@/lib/integrations/catapult/normalize";

export const runtime = "nodejs";
export const maxDuration = 300;

type ProfileRoleRow = { role: string | null };
type PatchEntry = { date: string; status: string; patched?: number; athletes?: number; noActivities?: boolean; warning?: string };

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

function isAuthorizedByCronSecret(request: Request): boolean {
  const expected = process.env.CATAPULT_CRON_SECRET?.trim();
  if (!expected) return true;
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-cron-secret") ||
    url.searchParams.get("secret") ||
    "";
  return provided === expected;
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
  const role = String((prof as ProfileRoleRow | null)?.role ?? "").toUpperCase();
  return role === "COACH" || role === "ADMIN" || role === "STAFF";
}

function eachDateInRange(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${dateTo}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function handle(request: Request) {
  if (!isAuthorizedByCronSecret(request) && !(await isAuthorizedCoach(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return NextResponse.json(
      { ok: false, error: "dateFrom and dateTo required (YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  const dates = eachDateInRange(dateFrom, dateTo);
  if (dates.length > 90) {
    return NextResponse.json({ ok: false, error: "Max 90 days per run" }, { status: 400 });
  }

  // Fetch ALL Catapult activities for the date range in one paginated scan
  // (the activities API ignores server-side date filters, so we scan all and filter client-side)
  const activitiesByDate = await fetchActivitiesForDateRange(dateFrom, dateTo);

  // Load athlete→player mapping once
  const sb = getAdminClient();
  const { data: mappings } = await sb
    .from("catapult_athlete_map")
    .select("catapult_athlete_id, micropulse_player_id");

  const playerByAthlete = new Map(
    (mappings ?? []).map((m) => [
      m.catapult_athlete_id as string,
      m.micropulse_player_id as string,
    ]),
  );

  const results: PatchEntry[] = [];

  for (const date of dates) {
    const activities = activitiesByDate.get(date) ?? [];

    if (!activities.length) {
      results.push({ date, status: "ok", patched: 0, athletes: 0, noActivities: true });
      continue;
    }

    try {
      // Fetch stats for all activities on this date and merge
      const statsPayloads = await Promise.all(activities.map((a) => fetchActivityStats(a.id)));
      const mergedPayload = statsPayloads.flatMap((p) => (Array.isArray(p) ? p : [p]));

      const metrics = normalizeCatapultActivityStats({ date, payload: mergedPayload });
      const imaMetrics = metrics.filter(
        (m) => m.imaAccel != null || m.imaDecel != null || m.imaCod != null || m.impacts != null,
      );

      let patched = 0;
      for (const metric of imaMetrics) {
        const playerId = playerByAthlete.get(metric.athleteId);
        if (!playerId) continue;

        const { error } = await sb
          .from("player_external_load_daily")
          .update({
            ima_accel: metric.imaAccel,
            ima_decel: metric.imaDecel,
            ima_cod: metric.imaCod,
            ima_total: metric.imaTotal,
            impacts: metric.impacts,
          })
          .eq("player_id", playerId)
          .eq("date", date)
          .eq("source", "catapult");

        if (!error) patched++;
      }

      results.push({ date, status: "ok", patched, athletes: imaMetrics.length });
    } catch (err) {
      const warning = err instanceof Error ? err.message : String(err);
      results.push({ date, status: "error", warning });
    }
  }

  const errors = results.filter((r) => r.status === "error");
  const totalPatched = results.reduce((s, r) => s + (r.patched ?? 0), 0);
  const datesWithActivities = results.filter((r) => !r.noActivities).length;

  return NextResponse.json({
    ok: errors.length === 0,
    datesProcessed: results.length,
    datesWithActivities,
    totalPatched,
    errors: errors.length,
    results,
  });
}

export const GET = handle;
export const POST = handle;

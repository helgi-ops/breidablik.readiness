import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchActivitiesForDate, fetchActivityPeriodStats } from "@/lib/integrations/catapult/api";
import { normalizeCatapultPeriodStats } from "@/lib/integrations/catapult/normalize";

export const runtime = "nodejs";

/**
 * Diagnostic: does the Catapult stats API return PER-PERIOD rows (with a period
 * name) when grouped by athlete + period? Confirms the per-drill actuals API
 * path before we rely on it. Coach/admin only.
 *
 *   GET /api/integrations/catapult/debug-periods?date=YYYY-MM-DD[&activityId=...]
 */

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
  // Dev convenience: on a local dev server (never in production) allow a direct
  // browser hit so the probe can be run without grabbing a token.
  if (process.env.NODE_ENV !== "production") return true;
  const expected = process.env.CATAPULT_CRON_SECRET?.trim();
  if (!expected) return true;
  const url = new URL(request.url);
  const provided = request.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";
  return provided === expected;
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

function firstRows(payload: unknown): Record<string, unknown>[] {
  const rec = payload as Record<string, unknown> | null;
  const arr =
    (Array.isArray(payload) ? payload : null) ??
    (rec?.stats as unknown[]) ??
    (rec?.athletes as unknown[]) ??
    (rec?.periods as unknown[]) ??
    (rec?.data as unknown[]) ??
    (rec?.results as unknown[]) ??
    (rec?.items as unknown[]) ??
    [];
  return (Array.isArray(arr) ? arr : []).filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
}

export async function GET(request: Request) {
  if (!isAuthorizedByCronSecret(request) && !(await isAuthorizedCoach(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  try {
    const activities = await fetchActivitiesForDate(date);
    const activityId = url.searchParams.get("activityId") ?? activities[0]?.id ?? null;
    if (!activityId) {
      return NextResponse.json({ ok: false, date, error: "No Catapult activity found for this date", activities: activities.length });
    }

    const payload = await fetchActivityPeriodStats(activityId);
    const rows = firstRows(payload);
    const topLevelKeys = payload && typeof payload === "object" && !Array.isArray(payload)
      ? Object.keys(payload as Record<string, unknown>).sort()
      : ["<array>"];

    // Which keys on a row look like a period name / period id?
    const rowKeys = rows[0] ? Object.keys(rows[0]).sort() : [];
    const periodNameCandidates = rowKeys.filter((k) => /period|name|tag|title|drill/i.test(k));

    // Does my normalizer pull any periods out of this real payload?
    const periodRows = normalizeCatapultPeriodStats({ payload });
    const distinctPeriods = Array.from(new Set(periodRows.map((r) => r.periodName)));

    return NextResponse.json({
      ok: true,
      date,
      activityId,
      activitiesForDate: activities.length,
      rowCount: rows.length,
      topLevelKeys,
      rowKeys,
      periodNameCandidates,
      sampleRow: rows[0] ?? null,
      normalizer: {
        periodRowsExtracted: periodRows.length,
        distinctPeriods,
        sample: periodRows.slice(0, 3),
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, date, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

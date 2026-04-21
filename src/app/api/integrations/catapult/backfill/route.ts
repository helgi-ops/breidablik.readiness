import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncCatapultDailyMetrics } from "@/lib/integrations/catapult";
import { getConfigForTeam } from "@/lib/integrations/catapult/api";
import type { CatapultConfig } from "@/lib/integrations/catapult/api";

export const runtime = "nodejs";
export const maxDuration = 300;

type ProfileRow = { role: string | null; team_id: string | null };
type BackfillEntry = { date: string; status: string; stored?: number; warning?: string };

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

async function getCoachContext(request: Request): Promise<{ teamId: string } | null> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const sb = getAdminClient();
  const { data: userRes, error } = await sb.auth.getUser(token);
  if (error || !userRes?.user?.id) return null;
  const { data: prof } = await sb
    .from("profiles")
    .select("role, team_id")
    .eq("id", userRes.user.id)
    .maybeSingle();
  const profile = prof as ProfileRow | null;
  const role = String(profile?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) return null;
  if (!profile?.team_id) return null;
  return { teamId: profile.team_id };
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

async function runBackfill(dateFrom: string, dateTo: string, config?: CatapultConfig) {
  const dates = eachDateInRange(dateFrom, dateTo);
  const results: BackfillEntry[] = [];

  for (const date of dates) {
    try {
      const result = await syncCatapultDailyMetrics(date, { config });
      results.push({ date, status: "ok", stored: result.storedCount });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ date, status: "error", warning: message });
    }
  }

  return results;
}

async function handle(request: Request) {
  // Auth: cron secret OR coach token
  const coachCtx = await getCoachContext(request);
  if (!coachCtx && !isAuthorizedByCronSecret(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return NextResponse.json(
      { ok: false, error: "dateFrom and dateTo are required (YYYY-MM-DD format)" },
      { status: 400 }
    );
  }

  if (dateFrom > dateTo) {
    return NextResponse.json(
      { ok: false, error: "dateFrom must be <= dateTo" },
      { status: 400 }
    );
  }

  const dates = eachDateInRange(dateFrom, dateTo);
  if (dates.length > 90) {
    return NextResponse.json(
      { ok: false, error: "Date range too large — max 90 days per backfill run" },
      { status: 400 }
    );
  }

  // Resolve per-team Catapult config when called by a coach
  let config: CatapultConfig | undefined;
  if (coachCtx) {
    const teamConfig = await getConfigForTeam(coachCtx.teamId);
    if (teamConfig) {
      config = teamConfig;
    }
  }

  const results = await runBackfill(dateFrom, dateTo, config);
  const errors = results.filter((r) => r.status === "error");

  return NextResponse.json({
    ok: errors.length === 0,
    datesProcessed: results.length,
    errors: errors.length,
    results,
  });
}

export const GET = handle;
export const POST = handle;

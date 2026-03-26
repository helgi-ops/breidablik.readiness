import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncCatapultDailyMetrics } from "@/lib/integrations/catapult";

export const runtime = "nodejs";
export const maxDuration = 300;

type ProfileRoleRow = { role: string | null };

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

async function runBackfill(dateFrom: string, dateTo: string) {
  const dates = eachDateInRange(dateFrom, dateTo);
  const results: Array<{ date: string; status: string; warning?: string }> = [];

  for (const date of dates) {
    try {
      const result = await syncCatapultDailyMetrics(date);
      results.push({ date, status: result.status ?? "ok" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ date, status: "error", warning: message });
    }
  }

  return results;
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

  const results = await runBackfill(dateFrom, dateTo);
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

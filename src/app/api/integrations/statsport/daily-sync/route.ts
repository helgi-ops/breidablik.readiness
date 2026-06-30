import { NextResponse } from "next/server";
import { getSupabaseServer as getAdminClient } from "@/lib/supabaseServer";
import { syncStatSportDailyMetrics } from "@/lib/integrations/statsport";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const expected = process.env.STATSPORT_CRON_SECRET?.trim();
  if (!expected) return true; // No cron secret → allow (dev mode)
  const url = new URL(request.url);
  const provided = request.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";
  return provided === expected;
}

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}


type ProfileRoleRow = { role: string | null };

async function isAuthorizedCoach(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;

  const sb = getAdminClient();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) return false;

  const { data: prof, error: pErr } = await sb.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
  if (pErr) return false;

  const role = String((prof as ProfileRoleRow | null)?.role ?? "").toUpperCase();
  return role === "COACH" || role === "ADMIN" || role === "STAFF";
}

async function runSync(request: Request, explicitDate?: string | null) {
  if (!isAuthorized(request) && !(await isAuthorizedCoach(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const date = explicitDate ?? url.searchParams.get("date");
    const result = await syncStatSportDailyMetrics(date);

    return NextResponse.json({
      ok: true,
      result,
      notified: false,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[statsport/daily-sync]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return runSync(request);
}

export async function POST(request: Request) {
  let explicitDate: string | null = null;
  try {
    const body = await request.json();
    explicitDate = body?.date ?? null;
  } catch {
    // No body or invalid JSON — use query params
  }
  return runSync(request, explicitDate);
}

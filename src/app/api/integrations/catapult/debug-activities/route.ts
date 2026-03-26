import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  return role === "COACH" || role === "ADMIN" || role === "STAFF";
}

function getConfig() {
  return {
    baseUrl: (process.env.CATAPULT_API_BASE?.trim() || "https://backend-eu.openfield.catapultsports.com").replace(/\/+$/, ""),
    apiKey: env("CATAPULT_API_KEY"),
    orgId: env("CATAPULT_ORG_ID"),
  };
}

export async function GET(request: Request) {
  if (!isAuthorizedByCronSecret(request) && !(await isAuthorizedCoach(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const config = getConfig();

  // Try 1: with start_time / end_time GET params
  const withFilter = new URL(`${config.baseUrl}/api/v6/activities`);
  withFilter.searchParams.set("org_id", config.orgId);
  withFilter.searchParams.set("start_time", `${date}T00:00:00Z`);
  withFilter.searchParams.set("end_time", `${date}T23:59:59Z`);

  // Try 2: without any date filter (just first page)
  const noFilter = new URL(`${config.baseUrl}/api/v6/activities`);
  noFilter.searchParams.set("org_id", config.orgId);

  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${config.apiKey}`,
    "x-api-key": config.apiKey,
    "x-org-id": config.orgId,
  };

  const [r1, r2] = await Promise.all([
    fetch(withFilter.toString(), { method: "GET", headers, cache: "no-store" }),
    fetch(noFilter.toString(), { method: "GET", headers, cache: "no-store" }),
  ]);

  const [p1, p2] = await Promise.all([r1.json().catch(() => null), r2.json().catch(() => null)]);

  // Extract first item keys from both responses to see date field names
  function firstItemKeys(payload: unknown): { keys: string[]; sample: Record<string, unknown> | null } {
    const candidates = [
      ...(Array.isArray(payload) ? payload : []),
      ...((payload as Record<string, unknown>)?.activities as unknown[] ?? []),
      ...((payload as Record<string, unknown>)?.data as unknown[] ?? []),
      ...((payload as Record<string, unknown>)?.results as unknown[] ?? []),
      ...((payload as Record<string, unknown>)?.items as unknown[] ?? []),
    ];
    const first = candidates.find(Boolean) as Record<string, unknown> | null;
    return {
      keys: first ? Object.keys(first).sort() : [],
      sample: first ?? null,
    };
  }

  return NextResponse.json({
    date,
    withFilter: {
      status: r1.status,
      totalCount: (p1 as Record<string, unknown>)?.total ?? (p1 as Record<string, unknown>)?.count ?? null,
      arrayLength: Array.isArray(p1)
        ? p1.length
        : Object.values(p1 as object ?? {}).find(Array.isArray)?.length ?? null,
      ...firstItemKeys(p1),
    },
    noFilter: {
      status: r2.status,
      totalCount: (p2 as Record<string, unknown>)?.total ?? (p2 as Record<string, unknown>)?.count ?? null,
      arrayLength: Array.isArray(p2)
        ? p2.length
        : Object.values(p2 as object ?? {}).find(Array.isArray)?.length ?? null,
      ...firstItemKeys(p2),
    },
  });
}

import { NextResponse } from "next/server";
import { getSupabaseServer as getAdminClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const DEFAULT_BASE_URL = "https://backend-eu.openfield.catapultsports.com";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}


type AuthProfile = { role: string; team_id: string | null };

async function requireCoachContext(req: Request): Promise<{ teamId: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");

  const sb = getAdminClient();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");

  const { data: prof, error: profErr } = await sb
    .from("profiles")
    .select("role, team_id")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profErr) throw new Error(profErr.message);

  const profile = prof as AuthProfile | null;
  const role = String(profile?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!profile?.team_id) throw new Error("No team context");
  return { teamId: profile.team_id };
}

/**
 * POST /api/integrations/catapult/test-connection
 * Body: { apiKey, orgId, apiBase? }
 * Tests the credentials by fetching the athlete list from Catapult.
 */
export async function POST(req: Request) {
  try {
    await requireCoachContext(req);

    const body = await req.json();
    const apiKey = String(body.apiKey ?? "").trim();
    const orgId = String(body.orgId ?? "").trim();
    const apiBase = String(body.apiBase ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, "") || DEFAULT_BASE_URL;

    if (!apiKey || !orgId) {
      return NextResponse.json({ ok: false, error: "API key and Org ID are required." }, { status: 400 });
    }

    // Try fetching athletes to verify credentials
    const url = new URL(`${apiBase}/api/v6/athletes`);
    url.searchParams.set("org_id", orgId);
    url.searchParams.set("page_size", "5");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
        "x-org-id": orgId,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message =
        (payload as Record<string, unknown> | null)?.message ??
        (payload as Record<string, unknown> | null)?.error ??
        `Catapult returned ${response.status}`;
      return NextResponse.json({
        ok: false,
        error: `Connection failed: ${String(message)}`,
        status: response.status,
      });
    }

    const payload = await response.json().catch(() => null);
    // Count athletes in the response
    const athletes = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as Record<string, unknown> | null)?.athletes)
        ? (payload as Record<string, unknown>).athletes as unknown[]
        : Array.isArray((payload as Record<string, unknown> | null)?.data)
          ? (payload as Record<string, unknown>).data as unknown[]
          : [];

    return NextResponse.json({
      ok: true,
      athleteCount: (athletes as unknown[]).length,
      message: `Connected successfully. Found ${(athletes as unknown[]).length} athletes.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Test failed";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

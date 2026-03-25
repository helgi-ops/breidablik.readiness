import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { resolveValdAccessToken } from "@/lib/integrations/vald/auth";
import { valdRequestJson } from "@/lib/integrations/vald/client";
import { getValdAccountState } from "@/lib/integrations/vald";
import { getDefaultValdConnectionConfig, decryptValdSecret } from "@/lib/integrations/vald/config";
import type { ValdConnectionConfig, ValdRegion } from "@/lib/integrations/vald/types";
import { getValdProductBaseUrl } from "@/lib/integrations/vald/config";

export const runtime = "nodejs";

async function requireCoach(req: Request): Promise<{ teamId: string; userId: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const sb = getSupabaseServer();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");
  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("role, team_id")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profileErr) throw profileErr;
  const role = String((profile as Record<string, unknown> | null)?.role ?? "").toUpperCase();
  const teamId = String((profile as Record<string, unknown> | null)?.team_id ?? "");
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!teamId) throw new Error("No team context");
  return { teamId, userId: userRes.user.id };
}

/**
 * GET /api/integrations/vald/teams
 * Returns the list of VALD teams (squads) available for the configured account.
 * Used by the settings UI to show a team selector.
 */
export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoach(req);
    const account = await getValdAccountState(teamId);
    if (!account) {
      return NextResponse.json({ ok: false, error: "No VALD account configured." }, { status: 400 });
    }

    const fallback = getDefaultValdConnectionConfig();
    const config: ValdConnectionConfig = {
      ...fallback,
      baseUrl: account.base_url ?? fallback.baseUrl,
      authMode: (account.auth_mode as ValdConnectionConfig["authMode"]) ?? fallback.authMode,
      clientId: decryptValdSecret(account.encrypted_client_id),
      clientSecret: decryptValdSecret(account.encrypted_client_secret),
      apiKey: decryptValdSecret(account.encrypted_api_key),
      orgId: account.org_id ?? fallback.orgId,
      region: (account.region as ValdRegion) ?? fallback.region,
      tokenUrl: account.token_url ?? fallback.tokenUrl,
      tenantId: account.tenant_id ?? fallback.tenantId,
    };

    const resolved = await resolveValdAccessToken(config);
    const headers: Record<string, string> = {};
    if (resolved.authMode === "api_key" && resolved.apiKey) {
      headers["x-api-key"] = resolved.apiKey;
    } else if (resolved.authMode === "oauth" && resolved.accessToken) {
      headers["authorization"] = `Bearer ${resolved.accessToken}`;
    }

    // GET /v2019q3/teams — lists all teams for the authenticated account
    const base = config.baseUrl || getValdProductBaseUrl((config.region ?? "euw") as ValdRegion, "forcedecks");
    const teamsUrl = new URL("/v2019q3/teams", base).toString();
    const payload = await valdRequestJson<unknown[]>(teamsUrl, { headers, timeoutMs: 10_000 });

    const teams = Array.isArray(payload)
      ? payload.map((t: unknown) => {
          const r = t && typeof t === "object" ? (t as Record<string, unknown>) : {};
          return { id: String(r.id ?? ""), name: String(r.name ?? r.id ?? "") };
        }).filter(t => t.id)
      : [];

    return NextResponse.json({ ok: true, teams });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list VALD teams." },
      { status: 400 },
    );
  }
}

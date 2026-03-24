import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { createValdProvider, getDefaultValdConnectionConfig, saveValdAccount } from "@/lib/integrations/vald";

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

export async function POST(req: Request) {
  try {
    const { teamId } = await requireCoach(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const persist = body.persist === true;
    const defaults = getDefaultValdConnectionConfig();
    const config = {
      ...defaults,
      baseUrl: typeof body.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl.trim() : defaults.baseUrl,
      authMode: (typeof body.authMode === "string" ? body.authMode : defaults.authMode) as
        | "api_key"
        | "oauth"
        | "unknown",
      clientId: typeof body.clientId === "string" ? body.clientId : null,
      clientSecret: typeof body.clientSecret === "string" ? body.clientSecret : null,
      apiKey: typeof body.apiKey === "string" ? body.apiKey : null,
      accessToken: typeof body.accessToken === "string" ? body.accessToken : null,
      refreshToken: typeof body.refreshToken === "string" ? body.refreshToken : null,
      orgId: typeof body.orgId === "string" ? body.orgId : (defaults.orgId ?? null),
      region: typeof body.region === "string" ? body.region as import("@/lib/integrations/vald/types").ValdRegion : (defaults.region ?? null),
      tenantId: typeof body.tenantId === "string" ? body.tenantId : (defaults.tenantId ?? null),
      tokenUrl: typeof body.tokenUrl === "string" ? body.tokenUrl : (defaults.tokenUrl ?? null),
    };
    const provider = createValdProvider(config);
    const result = await provider.testConnection();

    if (persist) {
      await saveValdAccount({
        teamId,
        orgId: config.orgId ?? null,
        baseUrl: config.baseUrl,
        authMode: config.authMode,
        clientId: config.clientId ?? null,
        clientSecret: config.clientSecret ?? null,
        apiKey: config.apiKey ?? null,
        accessToken: config.accessToken ?? null,
        refreshToken: config.refreshToken ?? null,
        region: config.region ?? null,
        tenantId: config.tenantId ?? null,
        tokenUrl: config.tokenUrl ?? null,
        isEnabled: body.isEnabled === true,
      });
    }

    return NextResponse.json({ ok: true, diagnostics: result.diagnostics ?? {} });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "VALD test failed." }, { status: 400 });
  }
}

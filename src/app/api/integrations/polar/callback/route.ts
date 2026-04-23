import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  computePolarTokenExpiresAt,
  exchangePolarCodeForToken,
} from "@/lib/integrations/polar/oauth";
import { upsertPolarIntegration } from "@/lib/server/integrations/polarStore";

export const runtime = "nodejs";

const OAUTH_STATE_COOKIE = "polar_oauth_state";
const OAUTH_TEAM_COOKIE = "polar_oauth_team";

function buildRedirect(path: string, query: Record<string, string>): URL {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(
      buildRedirect("/coach/integrations", { polar: "error", reason: errorParam })
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      buildRedirect("/coach/integrations", { polar: "error", reason: "missing_code_or_state" })
    );
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  const teamId = cookieStore.get(OAUTH_TEAM_COOKIE)?.value;

  if (!expectedState || expectedState !== state) {
    return NextResponse.redirect(
      buildRedirect("/coach/integrations", { polar: "error", reason: "state_mismatch" })
    );
  }
  if (!teamId) {
    return NextResponse.redirect(
      buildRedirect("/coach/integrations", { polar: "error", reason: "team_cookie_missing" })
    );
  }

  try {
    const token = await exchangePolarCodeForToken(code);
    const externalTeamId =
      token.x_team_id != null ? String(token.x_team_id) : null;

    await upsertPolarIntegration({
      team_id: teamId,
      status: "active",
      external_team_id: externalTeamId,
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
      token_type: token.token_type ?? null,
      scopes: token.scope ? token.scope.split(/\s+/).filter(Boolean) : null,
      access_token_expires_at: computePolarTokenExpiresAt(token),
      last_sync_status: "never",
      last_sync_error: null,
    });

    const response = NextResponse.redirect(
      buildRedirect("/coach/integrations", { polar: "connected" })
    );
    response.cookies.delete(OAUTH_STATE_COOKIE);
    response.cookies.delete(OAUTH_TEAM_COOKIE);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "token_exchange_failed";
    return NextResponse.redirect(
      buildRedirect("/coach/integrations", {
        polar: "error",
        reason: message.slice(0, 100),
      })
    );
  }
}

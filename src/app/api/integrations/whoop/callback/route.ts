import { NextRequest, NextResponse } from "next/server";
import { exchangeWhoopCodeForToken, redactWhoopSensitive } from "@/lib/integrations/whoop/oauth";
import { getWhoopProfile } from "@/lib/integrations/whoop/client";
import { syncWhoopInitialBackfill } from "@/lib/integrations/whoop/sync";
import {
  resolveOwnedAthleteIdForPlayerUser,
  upsertWhoopIntegration,
  updateWhoopIntegrationTokens,
} from "@/lib/server/integrations/whoopStore";
import { resolveWhoopRouteUserId } from "../_auth";

export const runtime = "nodejs";

const OAUTH_STATE_COOKIE = "whoop_oauth_state";

function appBaseUrl(request: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit;
  return `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}

export async function GET(request: NextRequest) {
  const base = appBaseUrl(request);
  const failRedirect = (reason: string) =>
    NextResponse.redirect(new URL(`/player/settings/integrations?whoop=error&reason=${encodeURIComponent(reason)}`, base));

  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    if (!code) return failRedirect("missing_code");
    if (!state) return failRedirect("missing_state");

    const cookie = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
    if (!cookie) return failRedirect("missing_state_cookie");

    if (cookie !== state) return failRedirect("invalid_state");

    const userId = await resolveWhoopRouteUserId(request);
    if (!userId) return NextResponse.redirect(new URL("/login?next=/player/settings/integrations", base));

    const athleteId = await resolveOwnedAthleteIdForPlayerUser(userId);
    const token = await exchangeWhoopCodeForToken(code);
    const tokenRecord = await updateWhoopIntegrationTokens({ athleteId, token });

    const profile = await getWhoopProfile(tokenRecord.access_token || token.access_token);
    await upsertWhoopIntegration({
      athlete_id: athleteId,
      provider: "whoop",
      status: "active",
      external_user_id: profile.user_id ?? null,
      external_email: profile.email ?? null,
      external_first_name: profile.first_name ?? null,
      external_last_name: profile.last_name ?? null,
      scopes: token.scope ? token.scope.split(" ").filter(Boolean) : null,
      last_sync_status: "never",
      last_sync_error: null,
    });

    await syncWhoopInitialBackfill({ athleteId, days: 7 });

    const response = NextResponse.redirect(new URL("/player/settings/integrations?whoop=connected", base));
    response.cookies.set({
      name: OAUTH_STATE_COOKIE,
      value: "",
      path: "/api/integrations/whoop",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "WHOOP callback failed";
    console.error("WHOOP callback error:", redactWhoopSensitive(message));
    return failRedirect("callback_failed");
  }
}

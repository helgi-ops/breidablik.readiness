import { NextResponse } from "next/server";
import { buildWhoopAuthorizeUrl, createWhoopOauthState } from "@/lib/integrations/whoop/oauth";
import { resolveOwnedAthleteIdForPlayerUser, upsertWhoopIntegration } from "@/lib/server/integrations/whoopStore";
import { resolveWhoopRouteUserId } from "../_auth";

export const runtime = "nodejs";

const OAUTH_STATE_COOKIE = "whoop_oauth_state";

export async function GET(req: Request) {
  try {
    const userId = await resolveWhoopRouteUserId(req);
    if (!userId) {
      return NextResponse.redirect(
        new URL("/login?next=/player/settings/integrations", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
      );
    }

    const athleteId = await resolveOwnedAthleteIdForPlayerUser(userId);
    const state = createWhoopOauthState();
    const redirectUrl = buildWhoopAuthorizeUrl({ state });
    await upsertWhoopIntegration({
      athlete_id: athleteId,
      provider: "whoop",
      status: "pending",
      last_sync_status: "never",
      last_sync_error: null,
    });

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set({
      name: OAUTH_STATE_COOKIE,
      value: state,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60,
      path: "/api/integrations/whoop",
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to initialize WHOOP OAuth.";
    const code = message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await resolveWhoopRouteUserId(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const athleteId = await resolveOwnedAthleteIdForPlayerUser(userId);
    const state = createWhoopOauthState();
    const redirectUrl = buildWhoopAuthorizeUrl({ state });
    await upsertWhoopIntegration({
      athlete_id: athleteId,
      provider: "whoop",
      status: "pending",
      last_sync_status: "never",
      last_sync_error: null,
    });

    const response = NextResponse.json({ ok: true, redirectUrl });
    response.cookies.set({
      name: OAUTH_STATE_COOKIE,
      value: state,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60,
      path: "/api/integrations/whoop",
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to initialize WHOOP OAuth.";
    const code = message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}

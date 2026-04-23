import { NextResponse } from "next/server";
import { buildPolarAuthorizeUrl, createPolarOauthState } from "@/lib/integrations/polar/oauth";
import { resolveCoachTeamId, upsertPolarIntegration } from "@/lib/server/integrations/polarStore";
import { resolvePolarRouteUserId } from "../_auth";

export const runtime = "nodejs";

const OAUTH_STATE_COOKIE = "polar_oauth_state";
const OAUTH_TEAM_COOKIE = "polar_oauth_team";

function toPolarConnectError(error: unknown): { message: string; code: number } {
  const raw = error instanceof Error ? error.message : "Unable to initialize POLAR OAuth.";
  if (raw.includes("POLAR env vars missing")) {
    return {
      message: "Polar integration is not configured for this environment yet.",
      code: 503,
    };
  }
  return {
    message: raw,
    code: raw.includes("Forbidden") ? 403 : 500,
  };
}

async function startFlow(userId: string) {
  const teamId = await resolveCoachTeamId(userId);
  if (!teamId) {
    throw new Error("Coach is not assigned to any team — cannot connect Polar.");
  }
  const state = createPolarOauthState();
  const redirectUrl = buildPolarAuthorizeUrl({ state });
  await upsertPolarIntegration({
    team_id: teamId,
    status: "pending",
    last_sync_status: "never",
    last_sync_error: null,
    connected_by_user_id: userId,
  });
  return { teamId, state, redirectUrl };
}

function setOauthCookies(response: NextResponse, state: string, teamId: string) {
  const baseCookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
    path: "/api/integrations/polar",
  };
  response.cookies.set({ name: OAUTH_STATE_COOKIE, value: state, ...baseCookie });
  response.cookies.set({ name: OAUTH_TEAM_COOKIE, value: teamId, ...baseCookie });
}

export async function GET(req: Request) {
  try {
    const userId = await resolvePolarRouteUserId(req);
    if (!userId) {
      return NextResponse.redirect(
        new URL("/login?next=/coach/integrations", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
      );
    }
    const { teamId, state, redirectUrl } = await startFlow(userId);
    const response = NextResponse.redirect(redirectUrl);
    setOauthCookies(response, state, teamId);
    return response;
  } catch (error) {
    const { message, code } = toPolarConnectError(error);
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await resolvePolarRouteUserId(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const { teamId, state, redirectUrl } = await startFlow(userId);
    const response = NextResponse.json({ ok: true, redirectUrl });
    setOauthCookies(response, state, teamId);
    return response;
  } catch (error) {
    const { message, code } = toPolarConnectError(error);
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}

import { NextResponse } from "next/server";

/**
 * Turns the errors thrown by requireCoachAccessForTeam / requireCoachUserId into a response.
 * Anything else returns null, so the route handles it as a real failure.
 */
export function authErrorToResponse(err: unknown): NextResponse | null {
  const message = err instanceof Error ? err.message : "";
  if (message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (message === "Team context is required") return NextResponse.json({ error: message }, { status: 400 });
  return null;
}

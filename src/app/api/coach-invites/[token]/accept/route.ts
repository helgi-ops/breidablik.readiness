import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/coach-invites/[token]/accept
 * Authed call. Invokes accept_coach_invitation(token) which:
 *   - validates status/expiry/email
 *   - creates coach_teams row
 *   - marks invite accepted
 * Returns { teamId, role } on success.
 */

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const auth = req.headers.get("authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!jwt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Call RPC as the user (so auth.uid() inside the function resolves)
  const sb = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await sb.rpc("accept_coach_invitation", { p_token: token });

  if (error) {
    const code = error.message;
    let status = 400;
    if (code.includes("not_authenticated")) status = 401;
    else if (code.includes("invite_not_found")) status = 404;
    else if (code.includes("invite_email_mismatch")) status = 403;
    else if (code.includes("invite_expired") || code.includes("invite_not_pending")) status = 409;
    return NextResponse.json({ error: code }, { status });
  }

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    success: true,
    teamId: row?.team_id ?? null,
    role: row?.role ?? "coach",
  });
}

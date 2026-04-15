import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/coach-invites/[token]
 * Returns public-safe invite info for the accept page.
 *
 * Anonymous access OK — token IS the secret. We only expose team name + email.
 */

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getAdmin() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const sb = getAdmin();
  const { data: invite, error } = await sb
    .from("coach_invitations")
    .select("id, team_id, coach_email, coach_name, role, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!invite) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Fetch team public info
  const { data: team } = await sb
    .from("teams")
    .select("id, name, sport, gender, team_type")
    .eq("id", invite.team_id)
    .maybeSingle();

  const expired = new Date(invite.expires_at).getTime() < Date.now();
  const effectiveStatus =
    invite.status === "pending" && expired ? "expired" : invite.status;

  return NextResponse.json({
    invite: {
      team_id: invite.team_id,
      coach_email: invite.coach_email,
      coach_name: invite.coach_name,
      role: invite.role,
      status: effectiveStatus,
      expires_at: invite.expires_at,
    },
    team,
  });
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/client-invites/[token]
 *
 * Returns public-safe invite info for the `/invite/client/[token]` accept
 * page. Anonymous access OK — the token IS the secret. Only minimal
 * disclosure: trainer team name, client email + name, status, expiry.
 *
 * Mirrors /api/coach-invites/[token] but reads from client_invitations
 * (PT client onboarding) rather than coach_invitations (staff onboarding).
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
    .from("client_invitations")
    .select("id, team_id, client_email, client_name, status, expires_at, notes")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!invite) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Trainer / team public info (PT team_type=personal_trainer; name = trainer's
  // display name on PT teams, club name on football teams).
  const { data: team } = await sb
    .from("teams")
    .select("id, name, team_type, club_short_name, club_logo_url")
    .eq("id", invite.team_id)
    .maybeSingle();

  const expired = new Date(invite.expires_at).getTime() < Date.now();
  const effectiveStatus =
    invite.status === "pending" && expired ? "expired" : invite.status;

  return NextResponse.json({
    invite: {
      team_id: invite.team_id,
      client_email: invite.client_email,
      client_name: invite.client_name,
      status: effectiveStatus,
      expires_at: invite.expires_at,
      notes: invite.notes,
    },
    team,
  });
}

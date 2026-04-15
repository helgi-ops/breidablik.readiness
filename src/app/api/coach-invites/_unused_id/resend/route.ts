import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendCoachInviteEmail } from "@/lib/email/coachInviteEmail";

/**
 * POST /api/coach-invites/[id]/resend
 * Re-sends the invite email for a pending invitation. Must be caller on the team or staff.
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

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://app.micropulse.is";
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const auth = req.headers.get("authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getAdmin();
  const { data: userRes } = await sb.auth.getUser(jwt);
  const userId = userRes?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: invite } = await sb
    .from("coach_invitations")
    .select("id, team_id, token, coach_email, coach_name, status, expires_at, invited_by")
    .eq("id", id)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invite.status !== "pending") {
    return NextResponse.json({ error: "Not pending" }, { status: 409 });
  }

  // Access: staff OR coach on the team OR original inviter
  const { data: staff } = await sb.from("staff_users").select("user_id").eq("user_id", userId).maybeSingle();
  if (!staff && invite.invited_by !== userId) {
    const { data: access } = await sb
      .from("coach_teams")
      .select("team_id")
      .eq("coach_id", userId)
      .eq("team_id", invite.team_id)
      .maybeSingle();
    if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [{ data: team }, { data: inviter }] = await Promise.all([
    sb.from("teams").select("name, sport, gender").eq("id", invite.team_id).maybeSingle(),
    sb.from("profiles").select("full_name").eq("id", invite.invited_by).maybeSingle(),
  ]);

  const parts: string[] = [];
  if (team?.name) parts.push(team.name);
  if (team?.sport) parts.push(team.sport);
  if (team?.gender) parts.push(team.gender);
  const teamLabel = parts.join(" · ") || "MicroPulse";

  const acceptUrl = `${appBaseUrl()}/invite/coach/${invite.token}`;

  try {
    await sendCoachInviteEmail({
      to: invite.coach_email,
      coachName: invite.coach_name,
      teamLabel,
      inviterName: (inviter as { full_name?: string } | null)?.full_name ?? null,
      acceptUrl,
      expiresAt: new Date(invite.expires_at),
    });
    await sb
      .from("coach_invitations")
      .update({ email_sent_at: new Date().toISOString(), email_error: null })
      .eq("id", invite.id);
    return NextResponse.json({ success: true, emailSent: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "email_send_failed";
    await sb
      .from("coach_invitations")
      .update({ email_error: msg })
      .eq("id", invite.id);
    return NextResponse.json({ success: false, error: msg }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendCoachInviteEmail } from "@/lib/email/coachInviteEmail";

/**
 * Coach invitation management.
 *   GET    ?team_id=...  -> list invites for a team
 *   POST   { teamId, email, name?, role?, notes? } -> create invite
 *   DELETE ?id=...       -> revoke a pending invite
 *
 * Only staff or coaches already on the target team can call these.
 * On success POST returns { invitation, acceptUrl } — acceptUrl is what goes in the email.
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

async function requireTeamAccess(req: Request, teamId: string | null | undefined) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");

  const sb = getAdmin();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");
  const userId = userRes.user.id;

  if (!teamId) throw new Error("team_id required");

  // staff bypass
  const { data: staff } = await sb
    .from("staff_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!staff) {
    const { data: access } = await sb
      .from("coach_teams")
      .select("team_id")
      .eq("coach_id", userId)
      .eq("team_id", teamId)
      .maybeSingle();
    if (!access) throw new Error("Forbidden");
  }

  return { userId, teamId };
}

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://app.micropulse.is";
}

function errorStatus(msg: string) {
  if (msg === "Unauthorized") return 401;
  if (msg === "Forbidden") return 403;
  if (msg === "team_id required") return 400;
  return 500;
}

/* ── GET: list invites for a team ──────────────────── */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get("team_id");
    await requireTeamAccess(req, teamId);

    const sb = getAdmin();
    const { data, error } = await sb
      .from("coach_invitations")
      .select(
        "id, team_id, coach_email, coach_name, role, status, token, expires_at, accepted_at, created_at, notes, email_sent_at, email_error"
      )
      .eq("team_id", teamId!)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json({ invitations: data ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: errorStatus(msg) });
  }
}

/* ── POST: create invite ───────────────────────────── */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      teamId?: string;
      email?: string;
      name?: string;
      role?: string;
      notes?: string;
    };
    const teamId = body.teamId?.trim();
    const { userId } = await requireTeamAccess(req, teamId);

    const email = body.email?.trim().toLowerCase() ?? "";
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const sb = getAdmin();

    // Prevent duplicate pending invite
    const { data: existing } = await sb
      .from("coach_invitations")
      .select("id, token")
      .eq("team_id", teamId!)
      .eq("coach_email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Pending invitation already exists for this email" },
        { status: 409 }
      );
    }

    const { data: invite, error } = await sb
      .from("coach_invitations")
      .insert({
        team_id: teamId!,
        invited_by: userId,
        coach_email: email,
        coach_name: body.name?.trim() || null,
        role: body.role?.trim() || "coach",
        notes: body.notes?.trim() || null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    const acceptUrl = `${appBaseUrl()}/invite/coach/${invite.token}`;

    // Look up team label + inviter name for the email body
    const [{ data: team }, { data: inviter }] = await Promise.all([
      sb.from("teams").select("name, sport, gender").eq("id", teamId!).maybeSingle(),
      sb.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    ]);

    const teamLabelParts: string[] = [];
    if (team?.name) teamLabelParts.push(team.name);
    if (team?.sport) teamLabelParts.push(team.sport);
    if (team?.gender) teamLabelParts.push(team.gender);
    const teamLabel = teamLabelParts.join(" · ") || "MicroPulse";

    let emailSent = false;
    let emailError: string | null = null;
    try {
      await sendCoachInviteEmail({
        to: email,
        coachName: invite.coach_name,
        teamLabel,
        inviterName: (inviter as { full_name?: string } | null)?.full_name ?? null,
        acceptUrl,
        expiresAt: new Date(invite.expires_at),
      });
      emailSent = true;
    } catch (err: unknown) {
      emailError = err instanceof Error ? err.message : "email_send_failed";
    }

    await sb
      .from("coach_invitations")
      .update({
        email_sent_at: emailSent ? new Date().toISOString() : null,
        email_error: emailError,
      })
      .eq("id", invite.id);

    return NextResponse.json({
      invitation: { ...invite, email_sent_at: emailSent ? new Date().toISOString() : null, email_error: emailError },
      acceptUrl,
      emailSent,
      emailError,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: errorStatus(msg) });
  }
}

/* ── DELETE: revoke invite ─────────────────────────── */
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const inviteId = url.searchParams.get("id");
    if (!inviteId) {
      return NextResponse.json({ error: "Invitation id required" }, { status: 400 });
    }

    const sb = getAdmin();
    const { data: invite } = await sb
      .from("coach_invitations")
      .select("team_id")
      .eq("id", inviteId)
      .maybeSingle();

    if (!invite) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await requireTeamAccess(req, invite.team_id);

    const { error } = await sb
      .from("coach_invitations")
      .update({ status: "revoked" })
      .eq("id", inviteId)
      .eq("status", "pending");

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: errorStatus(msg) });
  }
}

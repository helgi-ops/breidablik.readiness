import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";
import { sendTransactionalEmail } from "@/lib/email/sendTransactionalEmail";
import { buildClientInviteEmail } from "@/lib/email/clientInviteEmail";

const INVITE_DAYS = 30;

function inviteUrl(token: string) {
  // /invite/client/[token] (NOT the legacy /signup?invite=… path, which went through the
  // coach signup form and created the account with role=COACH — 2026-05-14). The dedicated
  // page handles signup + accept inline and writes role=PLAYER throughout.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.micropulse.is";
  return `${baseUrl}/invite/client/${token}`;
}

/** A pending invitation past its expiry is shown (and treated) as expired. */
function effectiveStatus(row: { status: string; expires_at: string | null }, now = Date.now()) {
  if (row.status === "pending" && row.expires_at && new Date(row.expires_at).getTime() < now) return "expired";
  return row.status;
}

type InviteRow = { id: string; token: string; client_email: string; client_name: string | null; expires_at: string };

/**
 * Email the invitation to the client, from the practice, replies to the trainer.
 * Never throws: when email isn't configured or the provider refuses, the trainer is told
 * and copies the link instead.
 */
async function emailInvite(sb: SupabaseClient, teamId: string, userId: string, invite: InviteRow, lang: "EN" | "IS") {
  try {
    const [{ data: team }, { data: prof }, { data: u }] = await Promise.all([
      sb.from("teams").select("name").eq("id", teamId).maybeSingle(),
      sb.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      sb.auth.admin.getUserById(userId),
    ]);
    const email = buildClientInviteEmail({
      lang,
      clientName: invite.client_name,
      practiceName: String((team as { name?: string } | null)?.name ?? ""),
      trainerName: (prof as { full_name?: string | null } | null)?.full_name ?? null,
      acceptUrl: inviteUrl(invite.token),
      expiresAt: new Date(invite.expires_at),
    });
    await sendTransactionalEmail({ to: invite.client_email, ...email, replyTo: u?.user?.email ?? undefined });
    return { emailed: true as const };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[client-invite] email not sent", invite.id, msg);
    return { emailed: false as const, emailError: msg.startsWith("Missing env") ? "not_configured" : "send_failed" };
  }
}


async function requireCoach(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");

  const sb = getAdmin();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");

  const userId = userRes.user.id;

  const { data: prof } = await sb
    .from("profiles")
    .select("role, team_id")
    .eq("id", userId)
    .maybeSingle();

  const role = String((prof as { role?: string })?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");

  // Accept team_id from query string (frontend sends it when switching teams)
  const url = new URL(req.url);
  const requestedTeamId = url.searchParams.get("team_id");
  const profileTeamId = (prof as { team_id?: string })?.team_id;
  const effectiveTeamId = requestedTeamId || profileTeamId;
  if (!effectiveTeamId) throw new Error("No team context");

  // Verify the coach has access to this team via coach_teams
  if (requestedTeamId && requestedTeamId !== profileTeamId) {
    const { data: access } = await sb
      .from("coach_teams")
      .select("team_id")
      .eq("coach_id", userId)
      .eq("team_id", requestedTeamId)
      .maybeSingle();
    if (!access) throw new Error("Forbidden: no access to this team");
  }

  return { userId, teamId: effectiveTeamId };
}

/* ── GET: list invitations ─────────────────────────── */

export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoach(req);
    const sb = getAdmin();

    const { data, error } = await sb
      .from("client_invitations")
      .select("id, client_email, client_name, status, token, expires_at, accepted_at, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    const now = Date.now();
    const invitations = ((data ?? []) as Array<{ status: string; expires_at: string | null }>).map((r) => ({ ...r, status: effectiveStatus(r, now) }));
    return NextResponse.json({ invitations });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/* ── POST: create invitation ───────────────────────── */

export async function POST(req: Request) {
  try {
    const { userId, teamId } = await requireCoach(req);
    const sb = getAdmin();
    const body = await req.json();

    const { clientEmail, clientName, notes } = body as {
      clientEmail: string;
      clientName?: string;
      notes?: string;
      lang?: string;
    };
    const lang = body?.lang === "IS" ? "IS" : "EN";

    if (!clientEmail || !clientEmail.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    // Check for existing pending invitation
    const { data: existing } = await sb
      .from("client_invitations")
      .select("id, status, expires_at")
      .eq("team_id", teamId)
      .eq("client_email", clientEmail.toLowerCase().trim())
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      const ex = existing as { id: string; status: string; expires_at: string | null };
      if (effectiveStatus(ex) !== "expired") {
        return NextResponse.json({ error: "Pending invitation already exists for this email — use Resend" }, { status: 409 });
      }
      // The old one ran out: close it and make a fresh one.
      await sb.from("client_invitations").update({ status: "expired" }).eq("id", ex.id);
    }

    const { data: invite, error } = await sb
      .from("client_invitations")
      .insert({
        team_id: teamId,
        invited_by: userId,
        client_email: clientEmail.toLowerCase().trim(),
        client_name: clientName?.trim() || null,
        notes: notes?.trim() || null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    const sent = await emailInvite(sb, teamId, userId, invite as InviteRow, lang);
    return NextResponse.json({ invitation: invite, signupUrl: inviteUrl(invite.token), ...sent });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/* ── PATCH: resend (?id=) — revives an expired invitation for another 30 days ── */

export async function PATCH(req: Request) {
  try {
    const { userId, teamId } = await requireCoach(req);
    const sb = getAdmin();
    const inviteId = new URL(req.url).searchParams.get("id");
    if (!inviteId) return NextResponse.json({ error: "Invitation id required" }, { status: 400 });
    const body = (await req.json().catch(() => ({}))) as { lang?: string };
    const lang = body?.lang === "IS" ? "IS" : "EN";

    const { data: row } = await sb
      .from("client_invitations")
      .select("id, token, client_email, client_name, status, expires_at")
      .eq("id", inviteId)
      .eq("team_id", teamId)
      .maybeSingle();
    const inv = row as (InviteRow & { status: string }) | null;
    if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (inv.status === "accepted" || inv.status === "revoked") {
      return NextResponse.json({ error: `Invitation is ${inv.status}` }, { status: 400 });
    }

    let invite: InviteRow = inv;
    if (effectiveStatus(inv) === "expired") {
      const expiresAt = new Date(Date.now() + INVITE_DAYS * 86400000).toISOString();
      const { data: revived, error } = await sb
        .from("client_invitations")
        .update({ status: "pending", expires_at: expiresAt, updated_at: new Date().toISOString() })
        .eq("id", inv.id)
        .select("id, token, client_email, client_name, expires_at")
        .single();
      if (error) throw new Error(error.message);
      invite = revived as InviteRow;
    }

    const sent = await emailInvite(sb, teamId, userId, invite, lang);
    return NextResponse.json({ ok: true, signupUrl: inviteUrl(invite.token), expiresAt: invite.expires_at, ...sent });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/* ── DELETE: revoke invitation ─────────────────────── */

export async function DELETE(req: Request) {
  try {
    const { teamId } = await requireCoach(req);
    const sb = getAdmin();
    const url = new URL(req.url);
    const inviteId = url.searchParams.get("id");

    if (!inviteId) {
      return NextResponse.json({ error: "Invitation id required" }, { status: 400 });
    }

    const { error } = await sb
      .from("client_invitations")
      .update({ status: "revoked" })
      .eq("id", inviteId)
      .eq("team_id", teamId)
      .eq("status", "pending");

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

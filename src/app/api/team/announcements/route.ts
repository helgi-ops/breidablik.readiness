export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendAnnouncementNotification } from "@/lib/notifications/sendAnnouncementNotification";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing authentication" };

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, team_id, player_id")
    .eq("id", userRes.user.id)
    .maybeSingle();

  if (!profile) return { error: "Profile not found" };

  return { uid: userRes.user.id, profile, supabase };
}

/**
 * POST /api/team/announcements
 * Create a new announcement.
 * Body: { teamId, title, body, pinned? }
 */
export async function POST(req: NextRequest) {
  const result = await authenticate(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { uid, profile, supabase } = result;

  // Verify coach/admin role
  const role = profile.role?.toUpperCase();
  if (role !== "COACH" && role !== "ADMIN") {
    return NextResponse.json({ error: "Only coaches and admins can create announcements" }, { status: 403 });
  }

  const body = await req.json();
  const { teamId, title, body: announcementBody, pinned } = body;

  if (!teamId || !title || !announcementBody?.trim()) {
    return NextResponse.json({ error: "Missing teamId, title, or body" }, { status: 400 });
  }

  // Verify user is on the specified team
  if (profile.team_id !== teamId) {
    return NextResponse.json({ error: "Not authorized for this team" }, { status: 403 });
  }

  try {
    const { data: announcement, error } = await supabase
      .from("team_announcements")
      .insert({
        team_id: teamId,
        title: title.trim().slice(0, 500),
        body: announcementBody.trim().slice(0, 5000),
        pinned: pinned ?? false,
        author_id: uid,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating announcement:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Send push notifications to all team players (fire-and-forget)
    sendAnnouncementNotification(supabase, {
      teamId,
      title: title.trim(),
      body: announcementBody.trim(),
    }).catch((err) => {
      console.error("Failed to send announcement push notifications:", err);
    });

    return NextResponse.json({ announcement }, { status: 201 });
  } catch (err) {
    console.error("Unexpected error in POST /api/team/announcements:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/team/announcements?id=...
 * Delete an announcement.
 */
export async function DELETE(req: NextRequest) {
  const result = await authenticate(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { profile, supabase } = result;

  // Verify coach/admin role
  const role = profile.role?.toUpperCase();
  if (role !== "COACH" && role !== "ADMIN") {
    return NextResponse.json({ error: "Only coaches and admins can delete announcements" }, { status: 403 });
  }

  const url = new URL(req.url);
  const announcementId = url.searchParams.get("id");

  if (!announcementId) {
    return NextResponse.json({ error: "Missing announcement id" }, { status: 400 });
  }

  try {
    // Verify the announcement belongs to user's team
    const { data: announcement } = await supabase
      .from("team_announcements")
      .select("team_id")
      .eq("id", announcementId)
      .maybeSingle();

    if (!announcement) {
      return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
    }

    if (announcement.team_id !== profile.team_id) {
      return NextResponse.json({ error: "Not authorized to delete this announcement" }, { status: 403 });
    }

    const { error } = await supabase
      .from("team_announcements")
      .delete()
      .eq("id", announcementId);

    if (error) {
      console.error("Error deleting announcement:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Unexpected error in DELETE /api/team/announcements:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

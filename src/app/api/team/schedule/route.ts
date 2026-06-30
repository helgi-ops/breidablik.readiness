export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";


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
 * POST /api/team/schedule
 * Create a new schedule event.
 * Body: { teamId, event_date, event_time?, event_type, title, description?, location? }
 */
export async function POST(req: NextRequest) {
  const result = await authenticate(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { uid, profile, supabase } = result;

  // Verify coach/admin role
  const role = profile.role?.toUpperCase();
  if (role !== "COACH" && role !== "ADMIN") {
    return NextResponse.json({ error: "Only coaches and admins can create schedule events" }, { status: 403 });
  }

  const body = await req.json();
  const { teamId, event_date, event_time, event_type, title, description, location } = body;

  if (!teamId || !event_date || !event_type || !title?.trim()) {
    return NextResponse.json(
      { error: "Missing required fields: teamId, event_date, event_type, title" },
      { status: 400 }
    );
  }

  // Verify user is on the specified team
  if (profile.team_id !== teamId) {
    return NextResponse.json({ error: "Not authorized for this team" }, { status: 403 });
  }

  try {
    const { data: event, error } = await supabase
      .from("team_schedule_events")
      .insert({
        team_id: teamId,
        event_date,
        event_time: event_time || null,
        event_type: event_type.trim().slice(0, 100),
        title: title.trim().slice(0, 500),
        description: description ? description.trim().slice(0, 2000) : null,
        location: location ? location.trim().slice(0, 500) : null,
        // created_by is NOT NULL with no default — manual inserts must
        // populate it explicitly, otherwise Postgres rejects with 23502
        // and the UI surfaces a generic "Failed to create event".
        created_by: uid,
        // source defaults to 'manual' but be explicit so deletes from the
        // sync-sheet path don't accidentally wipe these out (sync-sheet
        // only deletes WHERE source = 'google_sheet').
        source: "manual",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating schedule event:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    console.error("Unexpected error in POST /api/team/schedule:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/team/schedule?id=...
 * Delete a schedule event.
 */
export async function DELETE(req: NextRequest) {
  const result = await authenticate(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { profile, supabase } = result;

  // Verify coach/admin role
  const role = profile.role?.toUpperCase();
  if (role !== "COACH" && role !== "ADMIN") {
    return NextResponse.json({ error: "Only coaches and admins can delete schedule events" }, { status: 403 });
  }

  const url = new URL(req.url);
  // Accept both `id` (canonical) and `eventId` (legacy client name) so
  // older callers keep working — saves a future "looks fine but doesn't
  // work" round-trip if the param drifts again.
  const eventId = url.searchParams.get("id") ?? url.searchParams.get("eventId");

  if (!eventId) {
    return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  }

  try {
    // Verify the event belongs to user's team
    const { data: event } = await supabase
      .from("team_schedule_events")
      .select("team_id")
      .eq("id", eventId)
      .maybeSingle();

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (event.team_id !== profile.team_id) {
      return NextResponse.json({ error: "Not authorized to delete this event" }, { status: 403 });
    }

    const { error } = await supabase.from("team_schedule_events").delete().eq("id", eventId);

    if (error) {
      console.error("Error deleting schedule event:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Unexpected error in DELETE /api/team/schedule:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
 * GET /api/team/page?teamId=...
 * Fetch all data needed to render the team page hub.
 */
export async function GET(req: NextRequest) {
  const result = await authenticate(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { profile, supabase } = result;

  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId");

  if (!teamId) {
    return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
  }

  // Verify user is on the specified team
  if (profile.team_id !== teamId) {
    return NextResponse.json({ error: "Not authorized for this team" }, { status: 403 });
  }

  try {
    // 1. Fetch team info
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select(
        "id, name, sport, gender, club_theme_color, club_logo_url, club_short_name, plan_tier, gps_provider"
      )
      .eq("id", teamId)
      .maybeSingle();

    if (teamError || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Get today's date in Iceland timezone
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" });

    // 2. Fetch announcements with author info
    const { data: announcements, error: announcementsError } = await supabase
      .from("team_announcements")
      .select(
        `
        id,
        title,
        body,
        pinned,
        created_at,
        author_id
      `
      )
      .eq("team_id", teamId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);

    if (announcementsError) {
      console.error("Announcements error:", announcementsError);
      return NextResponse.json({ error: announcementsError.message }, { status: 500 });
    }

    // Fetch author names for announcements
    const authorIds = announcements?.map((a) => a.author_id).filter(Boolean) ?? [];
    let authorMap: Record<string, string> = {};
    if (authorIds.length > 0) {
      const { data: authors } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", authorIds);
      authorMap = Object.fromEntries(authors?.map((a) => [a.id, a.display_name]) ?? []);
    }

    const announcementsWithAuthor = announcements?.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      pinned: a.pinned,
      author_name: authorMap[a.author_id] || "Unknown",
      created_at: a.created_at,
    })) ?? [];

    // 3. Fetch schedule events
    const { data: schedule, error: scheduleError } = await supabase
      .from("team_schedule_events")
      .select("id, event_date, event_time, event_type, title, description, location")
      .eq("team_id", teamId)
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true })
      .limit(14);

    if (scheduleError) {
      console.error("Schedule error:", scheduleError);
      return NextResponse.json({ error: scheduleError.message }, { status: 500 });
    }

    // 4. Fetch active players (roster)
    const { data: roster, error: rosterError } = await supabase
      .from("players")
      .select("id, full_name, position, status")
      .eq("team_id", teamId)
      .eq("status", "ACTIVE")
      .order("full_name", { ascending: true });

    if (rosterError) {
      console.error("Roster error:", rosterError);
      return NextResponse.json({ error: rosterError.message }, { status: 500 });
    }

    // 5. Fetch coaches
    const { data: coaches, error: coachesError } = await supabase
      .from("profiles")
      .select("id, display_name, role")
      .eq("team_id", teamId)
      .in("role", ["COACH", "coach", "ADMIN", "admin"]);

    if (coachesError) {
      console.error("Coaches error:", coachesError);
      return NextResponse.json({ error: coachesError.message }, { status: 500 });
    }

    // 6. Calculate stats
    const totalPlayers = roster?.length ?? 0;

    // Count today's check-ins
    const { data: checkins, error: checkinsError } = await supabase
      .from("wellness_checkins")
      .select("id")
      .eq("team_id", teamId)
      .eq("entry_date", today);

    if (checkinsError) {
      console.error("Check-ins error:", checkinsError);
    }

    const checkedInToday = checkins?.length ?? 0;

    // Average readiness score from v_coach_readiness_today_v8
    const { data: readinessData, error: readinessError } = await supabase
      .from("v_coach_readiness_today_v8")
      .select("readiness_status")
      .eq("team_id", teamId);

    if (readinessError) {
      console.error("Readiness error:", readinessError);
    }

    // Calculate average: GREEN=3, YELLOW=2, RED=1
    let avgReadinessScore = 0;
    if (readinessData && readinessData.length > 0) {
      const scores: number[] = readinessData.map((r) => {
        const status = r.readiness_status?.toUpperCase();
        if (status === "GREEN") return 3;
        if (status === "YELLOW") return 2;
        if (status === "RED") return 1;
        return 0;
      });
      avgReadinessScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    }

    const stats = {
      total_players: totalPlayers,
      checked_in_today: checkedInToday,
      avg_readiness_score: Math.round(avgReadinessScore * 100) / 100,
    };

    return NextResponse.json({
      team,
      announcements: announcementsWithAuthor,
      schedule: schedule ?? [],
      roster: roster ?? [],
      coaches: coaches ?? [],
      stats,
    });
  } catch (err) {
    console.error("Unexpected error in GET /api/team/page:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

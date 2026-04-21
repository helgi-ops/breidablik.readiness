export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ── helpers ─────────────────────────────────────────────────────────────── */

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
    .select("role, team_id")
    .eq("id", userRes.user.id)
    .maybeSingle();

  if (!profile) return { error: "Profile not found" };
  return { uid: userRes.user.id, profile, supabase };
}

/* ── Icelandic weekday map (0=Sun … 6=Sat) ──────────────────────────────── */

const IS_WEEKDAY: Record<string, number> = {
  sunnudagur: 0,
  mánudagur: 1,
  þriðjudagur: 2,
  miðvikudagur: 3,
  fimmtudagur: 4,
  föstudagur: 5,
  laugardagur: 6,
};

/* ── Sheet config (per-team from team_settings, fallback to legacy Breiðablik) ── */

const LEGACY_SHEET_ID = "1ag3rCwMO8JE0Qn8ptJ2AlaaIuMBBLp9mK4STTtcx7cQ";
const LEGACY_MONTH_GIDS: Record<string, string> = {
  "2026-02": "0",
  "2026-03": "1",
  "2026-04": "530492931",
};
const BREIDABLIK_TEAM_ID = "94b52a06-0b83-48da-8664-639ec3486a0c";

/**
 * Reads schedule sheet config from team_settings.
 * Expected JSON in settings column: { schedule_sheet_id: "...", schedule_month_gids: { "2026-04": "..." } }
 * Falls back to hardcoded config for Breiðablik.
 */
async function getSheetConfig(supabase: ReturnType<typeof getSupabase>, teamId: string): Promise<{ sheetId: string; monthGids: Record<string, string> } | null> {
  const { data } = await supabase
    .from("team_settings")
    .select("settings")
    .eq("team_id", teamId)
    .maybeSingle();

  const s = (data as any)?.settings;
  if (s?.schedule_sheet_id) {
    return {
      sheetId: s.schedule_sheet_id,
      monthGids: s.schedule_month_gids ?? {},
    };
  }

  // Legacy fallback for Breiðablik
  if (teamId === BREIDABLIK_TEAM_ID) {
    return { sheetId: LEGACY_SHEET_ID, monthGids: LEGACY_MONTH_GIDS };
  }

  return null;
}

/* ── CSV parsing ─────────────────────────────────────────────────────────── */

function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  cells.push(current.trim());
  return cells;
}

interface SheetRow {
  weekday: string;
  eventType: string;
  timeInfo: string;
  competition: string;
  location: string;
  subType: string;
}

function parseSheet(csv: string): SheetRow[] {
  return csv
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      const c = parseCSVLine(line);
      return {
        weekday: (c[0] ?? "").toLowerCase(),
        eventType: (c[1] ?? "").toUpperCase(),
        timeInfo: c[2] ?? "",
        competition: c[3] ?? "",
        location: c[4] ?? "",
        subType: c[5] ?? "",
      };
    });
}

/* ── Map rows to calendar events ─────────────────────────────────────────── */

function resolveMonthStart(year: number, month: number): Date {
  // month is 1-indexed
  return new Date(year, month - 1, 1);
}

function mapRowsToEvents(
  rows: SheetRow[],
  year: number,
  month: number, // 1-indexed
  teamId: string,
  createdBy: string,
) {
  const start = resolveMonthStart(year, month);
  const events: Array<{
    team_id: string;
    event_date: string;
    event_time: string | null;
    event_type: string;
    title: string;
    description: string | null;
    location: string | null;
    created_by: string;
    source: string;
  }> = [];

  // Walk through rows; each row is a consecutive day starting from day 1 of the month
  let currentDate = new Date(start);

  for (const row of rows) {
    if (!row.weekday || !IS_WEEKDAY.hasOwnProperty(row.weekday)) continue;

    // Verify weekday matches (safety check)
    const expectedDow = currentDate.getDay();
    const sheetDow = IS_WEEKDAY[row.weekday];
    if (expectedDow !== sheetDow) {
      // If mismatch, advance date to the next occurrence of this weekday
      while (currentDate.getDay() !== sheetDow) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    const dateStr = currentDate.toISOString().slice(0, 10);

    // Skip FRÍ (day off) — or include as day_off type
    if (row.eventType === "FRÍ") {
      events.push({
        team_id: teamId,
        event_date: dateStr,
        event_time: null,
        event_type: "day_off",
        title: "Frí",
        description: null,
        location: null,
        created_by: createdBy,
        source: "google_sheet",
      });
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    // Parse time
    let eventTime: string | null = null;
    let title = "";
    let description: string | null = null;

    if (row.eventType === "LEIKUR") {
      // Match — time is in col C (e.g. "16:00" or "19:15")
      eventTime = row.timeInfo.match(/^\d{1,2}:\d{2}$/) ? row.timeInfo : null;
      // Title: subType has match description like "Blikar-Hvöt"
      title = row.subType || "Leikur";
      description = row.competition || null; // "Bikar", "Ísl. mót"
    } else if (row.eventType === "ÆFING") {
      // Training — parse "Mæting HH:MM - Æfing HH:MM"
      const match = row.timeInfo.match(/Æfing\s+(\d{1,2}:\d{2})/i);
      eventTime = match ? match[1] : null;

      // Check if it's recovery
      if (row.subType.toUpperCase() === "RECOVERY") {
        title = "Recovery";
      } else {
        title = "Æfing";
      }
      // Include full time info as description
      if (row.timeInfo) {
        description = row.timeInfo;
      }
    }

    // Map event_type
    let eventType = "training";
    if (row.eventType === "LEIKUR") eventType = "match";
    else if (row.subType.toUpperCase() === "RECOVERY") eventType = "recovery";

    events.push({
      team_id: teamId,
      event_date: dateStr,
      event_time: eventTime,
      event_type: eventType,
      title,
      description,
      location: row.location || null,
      created_by: createdBy,
      source: "google_sheet",
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return events;
}

/* ── API ─────────────────────────────────────────────────────────────────── */

/**
 * POST /api/team/schedule/sync-sheet
 * Body: { teamId, year, month }
 * Fetches the Google Sheet tab for the given month and syncs events.
 */
export async function POST(req: NextRequest) {
  const result = await authenticate(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { uid, profile, supabase } = result;

  const role = profile.role?.toUpperCase();
  if (role !== "COACH" && role !== "ADMIN") {
    return NextResponse.json({ error: "Only coaches/admins can sync" }, { status: 403 });
  }

  const body = await req.json();
  const teamId = body.teamId ?? profile.team_id;
  const year = body.year ?? new Date().getFullYear();
  const month = body.month ?? new Date().getMonth() + 1;

  if (profile.team_id !== teamId) {
    return NextResponse.json({ error: "Not authorized for this team" }, { status: 403 });
  }

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  const sheetConfig = await getSheetConfig(supabase, teamId);
  if (!sheetConfig) {
    return NextResponse.json(
      { error: "Ekkert dagatal tengt þessu liði. Biðdu admin um að setja upp Google Sheet í team settings." },
      { status: 400 },
    );
  }

  const gid = sheetConfig.monthGids[monthKey];
  if (!gid) {
    return NextResponse.json(
      { error: `Enginn flipi stilltur fyrir ${monthKey}. Stilltu schedule_month_gids í team settings.` },
      { status: 400 },
    );
  }

  try {
    // Fetch CSV from Google Sheets
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetConfig.sheetId}/gviz/tq?tqx=out:csv&gid=${gid}&headers=0`;
    const csvResp = await fetch(csvUrl);
    if (!csvResp.ok) {
      return NextResponse.json({ error: "Failed to fetch Google Sheet" }, { status: 502 });
    }
    const csv = await csvResp.text();
    const rows = parseSheet(csv);
    const events = mapRowsToEvents(rows, year, month, teamId, uid);

    if (events.length === 0) {
      return NextResponse.json({ message: "No events found in sheet", synced: 0 });
    }

    // Delete existing sheet-sourced events for this month
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    // Only delete sheet-sourced events; keep manually created ones
    await supabase
      .from("team_schedule_events")
      .delete()
      .eq("team_id", teamId)
      .eq("source", "google_sheet")
      .gte("event_date", monthStart)
      .lt("event_date", nextMonth);

    // Insert new events
    const { error: insertErr } = await supabase
      .from("team_schedule_events")
      .insert(events);

    if (insertErr) {
      console.error("Insert error:", insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Sync complete", synced: events.length, month: monthKey });
  } catch (err) {
    console.error("Sync error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

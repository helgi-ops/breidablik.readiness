import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

type EntryRow = {
  id: string;
  player_id: string;
  team_id: string | null;
  session_date: string;
  session_type: string;
  session_name: string | null;
  duration_minutes: number;
  rpe: number;
  session_load: number;
  source: string;
  notes: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
};

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

type DbLikeError = {
  code?: string;
  message?: string;
  details?: string;
};

function isMissingSessionRpeTableError(error: DbLikeError | null | undefined): boolean {
  const code = String(error?.code ?? "");
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  if (code === "42P01") return true;
  return text.includes("session_rpe_entries") && (text.includes("schema cache") || text.includes("does not exist"));
}

function schemaMissingResponse(details?: string) {
  return NextResponse.json(
    {
      ok: false,
      code: "SESSION_RPE_SCHEMA_MISSING",
      error: "Session RPE database table is missing or not applied yet.",
      ...(process.env.NODE_ENV !== "production"
        ? {
            details: details ?? null,
            fix: "Run Supabase migrations (for example: supabase db push) and refresh schema cache.",
          }
        : {}),
    },
    { status: 500 }
  );
}

function todayInTz(timeZone: string) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateMinusDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const { playerId } = await requireAuthedPlayerId(sb, req);

    const timeZone = process.env.APP_TIMEZONE || "Atlantic/Reykjavik";
    const toDate = todayInTz(timeZone);
    const fromDate = dateMinusDays(toDate, 13);

    const { data, error } = await sb
      .from("session_rpe_entries")
      .select("id, player_id, team_id, session_date, session_type, session_name, duration_minutes, rpe, session_load, source, notes, submitted_at, created_at, updated_at")
      .eq("player_id", playerId)
      .gte("session_date", fromDate)
      .lte("session_date", toDate)
      .order("session_date", { ascending: false })
      .order("submitted_at", { ascending: false });

    if (error) {
      if (isMissingSessionRpeTableError(error)) {
        return schemaMissingResponse(error.message);
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const entries = (data ?? []) as EntryRow[];
    const byDate = new Map<string, { session_count: number; daily_load_total: number; total_duration_minutes: number; avg_rpe_sum: number }>();

    for (const entry of entries) {
      const cur = byDate.get(entry.session_date) ?? {
        session_count: 0,
        daily_load_total: 0,
        total_duration_minutes: 0,
        avg_rpe_sum: 0,
      };
      cur.session_count += 1;
      cur.daily_load_total += Number(entry.session_load ?? 0);
      cur.total_duration_minutes += Number(entry.duration_minutes ?? 0);
      cur.avg_rpe_sum += Number(entry.rpe ?? 0);
      byDate.set(entry.session_date, cur);
    }

    const dailyTotals = Array.from(byDate.entries())
      .map(([session_date, agg]) => ({
        session_date,
        total_sessions: agg.session_count,
        daily_load_total: agg.daily_load_total,
        total_duration_minutes: agg.total_duration_minutes,
        avg_rpe: agg.session_count > 0 ? Math.round((agg.avg_rpe_sum / agg.session_count) * 10) / 10 : null,
      }))
      .sort((a, b) => b.session_date.localeCompare(a.session_date));

    return NextResponse.json({ ok: true, entries, dailyTotals, fromDate, toDate });
  } catch (error: unknown) {
    if (isMissingSessionRpeTableError(error as DbLikeError)) {
      return schemaMissingResponse(toMessage(error));
    }
    const message = toMessage(error);
    const code = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}

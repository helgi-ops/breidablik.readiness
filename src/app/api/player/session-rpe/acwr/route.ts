import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

type DbLikeError = {
  code?: string;
  message?: string;
  details?: string;
};

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function isMissingTableError(error: DbLikeError | null | undefined): boolean {
  const code = String(error?.code ?? "");
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  if (code === "42P01") return true;
  return text.includes("session_rpe_entries") && (text.includes("schema cache") || text.includes("does not exist"));
}

function todayInTz(timeZone: string): string {
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
    const fromDate = dateMinusDays(toDate, 27); // 28 days inclusive

    const { data, error } = await sb
      .from("session_rpe_entries")
      .select("session_date, session_load")
      .eq("player_id", playerId)
      .gte("session_date", fromDate)
      .lte("session_date", toDate)
      .order("session_date", { ascending: true });

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ ok: false, error: "Session RPE table missing." }, { status: 500 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const entries = (data ?? []) as { session_date: string; session_load: number }[];

    // Aggregate load per day
    const loadByDate = new Map<string, number>();
    for (const e of entries) {
      const prev = loadByDate.get(e.session_date) ?? 0;
      loadByDate.set(e.session_date, prev + Number(e.session_load ?? 0));
    }

    // Build daily load array for last 28 days
    const allDays: { date: string; load: number }[] = [];
    for (let i = 27; i >= 0; i--) {
      const d = dateMinusDays(toDate, i);
      allDays.push({ date: d, load: loadByDate.get(d) ?? 0 });
    }

    // Acute: sum of last 7 days (days 21–27 in 0-indexed from start = last 7)
    const acute7 = allDays.slice(-7).reduce((s, d) => s + d.load, 0);

    // Chronic: average weekly load over 28 days = total / 4
    const total28 = allDays.reduce((s, d) => s + d.load, 0);
    const chronic28 = total28 / 4;

    // ACWR = acute / chronic (guard division by zero)
    const acwr = chronic28 > 0 ? Math.round((acute7 / chronic28) * 100) / 100 : null;

    // Zone classification
    let zone: "undertrain" | "optimal" | "caution" | "high_risk" | "insufficient" = "insufficient";
    if (acwr != null) {
      if (acwr < 0.8) zone = "undertrain";
      else if (acwr <= 1.3) zone = "optimal";
      else if (acwr <= 1.5) zone = "caution";
      else zone = "high_risk";
    }

    return NextResponse.json({
      ok: true,
      acute7,
      chronic28: Math.round(chronic28),
      acwr,
      zone,
      fromDate,
      toDate,
      dailyLoads: allDays,
    });
  } catch (error: unknown) {
    const message = toMessage(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

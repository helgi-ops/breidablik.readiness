/**
 * /api/trainer/monthly-reports/cron — on the 1st of each month, one progress report per
 * active client of every personal-trainer practice, for the month that just ended.
 * Stored in pt_monthly_reports; the trainer shares it with "Send to client". Nothing is
 * sent or emailed from here. Idempotent: a month already stored is left as it is.
 *
 *   ?month=YYYY-MM  (manual runs only) — build that month instead of last month.
 *
 * Auth: Vercel Cron sends "Authorization: Bearer $CRON_SECRET"; REMINDER_CRON_SECRET
 * (bearer or ?secret=) is accepted for manual calls — same as /api/notifications/pt-cron.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { buildClientProgressReport } from "@/lib/trainer/clientProgressReport";
import { monthPeriod, monthlyReportClients, previousMonth, type ReportCandidate } from "@/lib/trainer/monthlyReports";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET || "";
  const reminderSecret = process.env.REMINDER_CRON_SECRET || "";
  const auth = req.headers.get("authorization") || "";
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (reminderSecret && auth === `Bearer ${reminderSecret}`) return true;
  const querySecret = new URL(req.url).searchParams.get("secret") || "";
  return !!reminderSecret && querySecret === reminderSecret;
}

async function run(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const monthParam = new URL(req.url).searchParams.get("month");
  let period;
  try {
    period = monthParam ? monthPeriod(monthParam) : previousMonth(new Date().toISOString().slice(0, 10));
  } catch {
    return NextResponse.json({ ok: false, error: "month must be YYYY-MM" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data: teams } = await sb.from("teams").select("id").eq("team_type", "personal_trainer");
  const teamIds = ((teams ?? []) as Array<{ id: string }>).map((t) => t.id);
  if (teamIds.length === 0) return NextResponse.json({ ok: true, month: period.month, created: 0, skipped: 0, failed: 0 });

  const { data: players } = await sb
    .from("players")
    .select("id, team_id, user_id, is_active, is_demo")
    .in("team_id", teamIds);
  const clients = monthlyReportClients((players ?? []) as Array<ReportCandidate & { team_id: string }>);

  const { data: existing } = await sb
    .from("pt_monthly_reports")
    .select("player_id")
    .eq("month", period.month)
    .in("player_id", clients.length ? clients.map((c) => c.id) : ["00000000-0000-0000-0000-000000000000"]);
  const done = new Set(((existing ?? []) as Array<{ player_id: string }>).map((r) => r.player_id));

  let created = 0;
  let failed = 0;
  for (const c of clients) {
    if (done.has(c.id)) continue;
    try {
      const report = await buildClientProgressReport(sb, c.id, period);
      const { error } = await sb.from("pt_monthly_reports").upsert(
        { team_id: c.team_id, player_id: c.id, month: period.month, report },
        { onConflict: "player_id,month", ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message);
      created++;
    } catch (err) {
      failed++;
      console.error("[pt-monthly-reports] failed", c.id, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ ok: true, month: period.month, clients: clients.length, created, skipped: done.size, failed });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

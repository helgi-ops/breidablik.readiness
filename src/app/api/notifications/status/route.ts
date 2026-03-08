import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachUserId } from "@/lib/notifications/auth";
import { getCheckinComplianceSummary } from "@/lib/notifications/checkins";
import { getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import { getReminderSlotsForDateKey } from "@/lib/session-rpe/reminderConfig";

export const runtime = "nodejs";

function isMissingRpeNotificationLogError(input: unknown) {
  const err = input as { code?: string; message?: string; details?: string } | null | undefined;
  const code = String(err?.code ?? "");
  const text = `${err?.message ?? ""} ${err?.details ?? ""}`.toLowerCase();
  if (code === "42P01") return true;
  return text.includes("rpe_notification_log") && (text.includes("schema cache") || text.includes("does not exist"));
}

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    await requireCoachUserId(sb, req);

    const url = new URL(req.url);
    const timeZone = getOperationalTimezone();
    const dateKey = url.searchParams.get("dateKey") || getDateKeyInTimezone(new Date(), timeZone);

    const summary = await getCheckinComplianceSummary(sb, { dateKey, timeZone });

    const { data: rpeRows, error: rpeErr } = await sb
      .from("rpe_notification_log")
      .select("status, sent_at")
      .eq("reminder_date", dateKey)
      .eq("notification_type", "session_rpe_missing")
      .order("sent_at", { ascending: false })
      .limit(50);
    if (rpeErr && !isMissingRpeNotificationLogError(rpeErr)) {
      throw new Error(rpeErr.message);
    }
    const rpeLog = (rpeRows ?? []) as Array<{ status: "sent" | "skipped" | "failed"; sent_at: string | null }>;
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of rpeLog) {
      if (row.status === "sent") sent += 1;
      else if (row.status === "skipped") skipped += 1;
      else if (row.status === "failed") failed += 1;
    }

    return NextResponse.json({
      ok: true,
      summary,
      rpe: {
        pushConfigured: Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY),
        dateKey,
        slots: getReminderSlotsForDateKey(dateKey, timeZone).map((slot) => slot.slotKey),
        sent,
        skipped,
        failed,
        lastRunAt: rpeLog[0]?.sent_at ?? null,
        schemaPending: Boolean(rpeErr && isMissingRpeNotificationLogError(rpeErr)),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

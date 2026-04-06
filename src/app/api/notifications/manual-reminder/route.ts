import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachUserId } from "@/lib/notifications/auth";
import { getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import { sendReminderToMissingPlayers } from "@/lib/notifications/sendReminder";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    await requireCoachUserId(sb, req);

    const timeZone = getOperationalTimezone();
    const dateKey = getDateKeyInTimezone(new Date(), timeZone);

    const result = await sendReminderToMissingPlayers(sb, {
      reminderType: "manual",
      scheduledSlot: "manual",
      dateKey,
      timeZone,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachUserId } from "@/lib/notifications/auth";
import { getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import { runReadinessEmailReminders } from "@/lib/reminders/emailReminders";

export const runtime = "nodejs";

type Body = { date?: string; teamId?: string | null };

function normalizeDate(v: string | undefined): string | null {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function POST(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    await requireCoachUserId(sb, req);

    const body = (await req.json().catch(() => ({}))) as Body;
    const timeZone = getOperationalTimezone();
    const dateKey = normalizeDate(body.date) ?? getDateKeyInTimezone(new Date(), timeZone);

    const result = await runReadinessEmailReminders(sb, {
      dateKey,
      timeZone,
      teamId: body.teamId ?? null,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
}

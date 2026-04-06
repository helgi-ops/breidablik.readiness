import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncCatapultDailyMetrics } from "@/lib/integrations/catapult";
import { sendTrainingDataReadyNotification } from "@/lib/push/sendTrainingDataReady";
import { sendRpeReminderToMissingPlayers } from "@/lib/notifications/sendRpeReminder";
import { getOperationalTimezone } from "@/lib/notifications/schedule";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const expected = process.env.CATAPULT_CRON_SECRET?.trim();
  if (!expected) return true;
  const url = new URL(request.url);
  const provided = request.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";
  return provided === expected;
}

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function getAdminClient() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

type ProfileRoleRow = {
  role: string | null;
};

async function isAuthorizedCoach(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;

  const sb = getAdminClient();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) return false;

  const { data: prof, error: pErr } = await sb.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
  if (pErr) return false;

  const role = String((prof as ProfileRoleRow | null)?.role ?? "").toUpperCase();
  return role === "COACH" || role === "ADMIN" || role === "STAFF";
}

async function runSync(request: Request, explicitDate?: string | null) {
  if (!isAuthorized(request) && !(await isAuthorizedCoach(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const date = explicitDate ?? url.searchParams.get("date");
    const debugIma = url.searchParams.get("debugIma") === "1";
    // skipPush=1 suppresses notifications (useful for backfills and manual re-syncs)
    const skipPush = url.searchParams.get("skipPush") === "1";
    const result = await syncCatapultDailyMetrics(date, { debugIma });

    const todayKey = new Date().toISOString().slice(0, 10);
    const dateKey = date ?? todayKey;

    // Only send push notifications when syncing today's data and not explicitly suppressed.
    // Backfilling old dates must never trigger notifications.
    const shouldNotify = !skipPush && dateKey === todayKey;

    let pushResult: Awaited<ReturnType<typeof sendTrainingDataReadyNotification>> | null = null;
    let rpeReminderResult: Awaited<ReturnType<typeof sendRpeReminderToMissingPlayers>> | null = null;

    if (shouldNotify) {
      const sb = getAdminClient();
      const timeZone = getOperationalTimezone();

      try {
        pushResult = await sendTrainingDataReadyNotification(dateKey);
      } catch {
        // Intentionally ignored – push is best-effort
      }

      try {
        rpeReminderResult = await sendRpeReminderToMissingPlayers(sb, {
          reminderType: "first",
          scheduledSlot: `catapult_${dateKey}`,
          dateKey,
          timeZone,
          teamId: null,
        });
      } catch {
        // Intentionally ignored – push is best-effort
      }
    }

    return NextResponse.json({ ok: true, result, push: pushResult, rpeReminder: rpeReminderResult, notified: shouldNotify });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catapult sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return runSync(request, null);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const date = typeof body?.date === "string" && body.date.trim().length ? body.date.trim() : null;
  return runSync(request, date);
}

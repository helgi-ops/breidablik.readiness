import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncCatapultDailyMetrics } from "@/lib/integrations/catapult";
import { getTeamsWithCatapultCredentials, getConfigFromEnv } from "@/lib/integrations/catapult/api";
import type { CatapultConfig } from "@/lib/integrations/catapult/api";
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

async function syncOneTeam(
  date: string,
  config: CatapultConfig | undefined,
  debugIma: boolean
) {
  const result = await syncCatapultDailyMetrics(date, { debugIma, config });
  return { teamId: config?.teamId ?? "env-default", result };
}

async function runSync(request: Request, explicitDate?: string | null) {
  if (!isAuthorized(request) && !(await isAuthorizedCoach(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const date = explicitDate ?? url.searchParams.get("date");
    const debugIma = url.searchParams.get("debugIma") === "1";
    const skipPush = url.searchParams.get("skipPush") === "1";
    const targetDate = date ?? new Date().toISOString().slice(0, 10);

    // ── Collect all Catapult configs to sync ──────────────────────
    const teamConfigs = await getTeamsWithCatapultCredentials();
    const configs: (CatapultConfig | undefined)[] = [];

    // Always include env-var config if present (backward compat for Breidablik)
    try {
      const envConfig = getConfigFromEnv();
      // Avoid duplicate if Breidablik is also in team_settings
      const alreadyInDb = teamConfigs.some(tc => tc.orgId === envConfig.orgId);
      if (!alreadyInDb) {
        configs.push(undefined); // undefined = use env vars (legacy path)
      }
    } catch {
      // No env vars set — skip legacy path
    }

    // Add all DB-configured teams
    configs.push(...teamConfigs);

    if (configs.length === 0) {
      return NextResponse.json({ ok: false, error: "No Catapult credentials configured" }, { status: 400 });
    }

    // ── Sync each team sequentially ──────────────────────────────
    const results: Array<{ teamId: string; result: unknown; error?: string }> = [];
    for (const config of configs) {
      try {
        const r = await syncOneTeam(targetDate, config, debugIma);
        results.push(r);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sync failed";
        results.push({ teamId: config?.teamId ?? "env-default", result: null, error: message });
      }
    }

    // ── Notifications (only for today's data) ────────────────────
    const todayKey = new Date().toISOString().slice(0, 10);
    const shouldNotify = !skipPush && targetDate === todayKey;

    let pushResult: Awaited<ReturnType<typeof sendTrainingDataReadyNotification>> | null = null;
    let rpeReminderResult: Awaited<ReturnType<typeof sendRpeReminderToMissingPlayers>> | null = null;

    if (shouldNotify) {
      const sb = getAdminClient();
      const timeZone = getOperationalTimezone();

      try {
        pushResult = await sendTrainingDataReadyNotification(targetDate);
      } catch {
        // Best-effort
      }

      try {
        rpeReminderResult = await sendRpeReminderToMissingPlayers(sb, {
          reminderType: "first",
          scheduledSlot: `catapult_${targetDate}`,
          dateKey: targetDate,
          timeZone,
          teamId: null,
        });
      } catch {
        // Best-effort
      }
    }

    // Single team? Return flat response for backward compatibility
    if (results.length === 1 && !results[0].error) {
      return NextResponse.json({
        ok: true,
        result: results[0].result,
        push: pushResult,
        rpeReminder: rpeReminderResult,
        notified: shouldNotify,
      });
    }

    return NextResponse.json({
      ok: results.every(r => !r.error),
      results,
      push: pushResult,
      rpeReminder: rpeReminderResult,
      notified: shouldNotify,
    });
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

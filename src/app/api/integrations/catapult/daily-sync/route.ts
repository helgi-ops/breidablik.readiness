import { NextResponse } from "next/server";
import { getSupabaseServer as getAdminClient } from "@/lib/supabaseServer";
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

function dateMinusDaysIso(refIso: string, n: number): string {
  const d = new Date(`${refIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

type SyncAnomaly = { teamId: string; dates: string[]; unmatched: number; sampleWarning: string | null };

/**
 * A silent-failure detector for EVERY team, not just the env path: if a team
 * fetched a session (activities/stats) but stored 0 rows, athlete matching
 * failed (unmatched athletes, or no source team resolved) and the GPS quietly
 * never lands. This is exactly the class of bug that hid a missing
 * CATAPULT_TEAM_ID for days — surface it loudly so it can't recur unnoticed.
 */
function detectSyncAnomalies(
  results: Array<{ teamId: string; date: string; result: unknown; error?: string }>,
): SyncAnomaly[] {
  const byTeam = new Map<string, SyncAnomaly>();
  for (const r of results) {
    if (r.error) continue;
    const inner = (r.result ?? {}) as { activitiesFetched?: number; statsFetched?: number; storedCount?: number; unmatchedCount?: number; warnings?: string[] };
    const fetchedSomething = Number(inner.activitiesFetched ?? 0) > 0 || Number(inner.statsFetched ?? 0) > 0;
    if (!fetchedSomething || Number(inner.storedCount ?? 0) !== 0) continue; // rest day (0 activities) is NOT an anomaly
    const cur = byTeam.get(r.teamId) ?? { teamId: r.teamId, dates: [], unmatched: 0, sampleWarning: null };
    cur.dates.push(r.date);
    cur.unmatched = Math.max(cur.unmatched, Number(inner.unmatchedCount ?? 0));
    if (!cur.sampleWarning && Array.isArray(inner.warnings) && inner.warnings.length) cur.sampleWarning = inner.warnings[0];
    byTeam.set(r.teamId, cur);
  }
  return [...byTeam.values()];
}

/** Loud alarm for a silent GPS-sync failure: server log + a push to all admins. Best-effort. */
async function alertSyncAnomalies(anomalies: SyncAnomaly[]): Promise<void> {
  for (const a of anomalies) {
    console.error(`[catapult daily-sync] ⚠️ ANOMALY team=${a.teamId} dates=${a.dates.join(",")} — fetched a session but stored 0 rows (${a.unmatched} unmatched). ${a.sampleWarning ?? ""}`);
  }
  try {
    const sb = getAdminClient();
    const { data: admins } = await sb.from("profiles").select("id, role");
    const adminIds = ((admins ?? []) as Array<{ id: string; role: string | null }>)
      .filter((p) => String(p.role ?? "").toLowerCase() === "admin")
      .map((p) => p.id);
    if (!adminIds.length) return;
    const { data: subs } = await sb
      .from("coach_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("profile_id", adminIds)
      .eq("is_active", true);
    const subRows = (subs ?? []) as Array<{ id: string; endpoint: string | null; p256dh: string | null; auth: string | null }>;
    if (!subRows.length) return;
    const { sendWebPush, isSubscriptionGone } = await import("@/lib/push/webPush");
    const teams = anomalies.map((a) => (a.teamId === "env-default" ? "env-default" : a.teamId)).join(", ");
    const payload = {
      title: "⚠️ GPS sync issue",
      body: `A Catapult session was found but 0 rows stored (${teams}). Athletes unmatched — check the integration.`,
      url: "/coach/integrations",
    };
    for (const sub of subRows) {
      if (!sub.endpoint || !sub.p256dh || !sub.auth) continue;
      try {
        await sendWebPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);
      } catch (err) {
        if (isSubscriptionGone(err)) await sb.from("coach_push_subscriptions").update({ is_active: false }).eq("id", sub.id);
      }
    }
  } catch (err) {
    console.error("[catapult daily-sync] anomaly alert failed", err);
  }
}

async function runSync(
  request: Request,
  explicitDate?: string | null,
  explicitDaysBack?: number | null,
) {
  if (!isAuthorized(request) && !(await isAuthorizedCoach(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const date = explicitDate ?? url.searchParams.get("date");
    const debugIma = url.searchParams.get("debugIma") === "1";
    const skipPush = url.searchParams.get("skipPush") === "1";
    const targetDate = date ?? new Date().toISOString().slice(0, 10);

    // daysBack lets a coach catch matches/sessions that were uploaded to
    // Catapult AFTER the day they were played. Common case: a Saturday
    // match isn't downloaded from the vest until Sunday morning. Without
    // a backward window the Sunday Sync button would only ask Catapult
    // for Sunday-dated activities and miss the Saturday match. With
    // daysBack: 2 the route sweeps targetDate, targetDate-1, targetDate-2.
    // Capped at 14 to bound the API call count per sync.
    const daysBackParam =
      explicitDaysBack ??
      (url.searchParams.get("daysBack") != null
        ? Number(url.searchParams.get("daysBack"))
        : null);
    const daysBack = Math.max(0, Math.min(14, Number.isFinite(daysBackParam) ? Number(daysBackParam) : 0));

    // Build the list of dates to sync. Order: oldest → newest, so the
    // most recent date's notification push fires last (after the freshest
    // data has landed in the table).
    const datesToSync: string[] = [];
    for (let i = daysBack; i >= 0; i--) {
      datesToSync.push(dateMinusDaysIso(targetDate, i));
    }

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

    // ── Sync each team for each date sequentially ────────────────
    // When daysBack=0 (default cron path) datesToSync is just [targetDate]
    // and behaviour is identical to before. When daysBack>0 (Sync button
    // on Today) we also sweep prior days so late-uploaded sessions get
    // picked up. results[] retains the targetDate row at the END so the
    // single-team flat-response path below still returns the most recent
    // sync outcome.
    const results: Array<{ teamId: string; date: string; result: unknown; error?: string }> = [];
    const syncedTeamIds = new Set<string>();
    for (const config of configs) {
      for (const syncDate of datesToSync) {
        try {
          const r = await syncOneTeam(syncDate, config, debugIma);
          results.push({ ...r, date: syncDate });
          if (config?.teamId) syncedTeamIds.add(config.teamId);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Sync failed";
          results.push({
            teamId: config?.teamId ?? "env-default",
            date: syncDate,
            result: null,
            error: message,
          });
        }
      }
    }

    // ── Silent-failure guard (all teams) ───────────────────────────
    // Any team that fetched a session but stored 0 rows failed athlete
    // matching — alert loudly (log + admin push) so a broken sync can never
    // sit unnoticed for days again (this is what hid the missing
    // CATAPULT_TEAM_ID). Best-effort; never blocks the sync response.
    const syncAnomalies = detectSyncAnomalies(results);
    if (syncAnomalies.length > 0) {
      if (!skipPush) {
        await alertSyncAnomalies(syncAnomalies);
      } else {
        for (const a of syncAnomalies) {
          console.error(`[catapult daily-sync] ⚠️ ANOMALY (push suppressed) team=${a.teamId} dates=${a.dates.join(",")} stored 0 (${a.unmatched} unmatched)`);
        }
      }
    }

    // ── Coach notifications detection + push ────────────────────────
    // Run threshold-crossing detection per team after sync so coaches see
    // brand-new alerts within minutes of the data arriving, then push the
    // newly-fired ones to subscribed coaches via PWA push.
    const notifResults: Array<{ teamId: string; new_count: number; pushed: number; auto_sent?: number; error?: string }> = [];
    if (syncedTeamIds.size > 0 && targetDate === new Date().toISOString().slice(0, 10)) {
      const sbAdmin = getAdminClient();
      const { pushNewCoachNotifications } = await import("@/lib/notifications/push");
      const { autoSendPendingForTeam } = await import("@/lib/notifications/autoSendRecoveryMessages");
      for (const teamId of syncedTeamIds) {
        try {
          const { data: newCount, error: detectErr } = await sbAdmin.rpc(
            "detect_coach_notifications",
            { p_team_id: teamId },
          );
          if (detectErr) throw detectErr;
          let pushed = 0;
          if (Number(newCount ?? 0) > 0 && !skipPush) {
            pushed = await pushNewCoachNotifications(sbAdmin, teamId);
          }
          // Stig 2 — auto-send AI recovery messages for opted-in ELITE
          // teams. Best-effort: errors per notification are absorbed by
          // the orchestrator; we only log a top-level failure here.
          let autoSent = 0;
          try {
            const r = await autoSendPendingForTeam(sbAdmin, teamId);
            autoSent = r.sent;
          } catch (err) {
            console.error("[catapult daily-sync] auto-send failed", teamId, err);
          }
          notifResults.push({ teamId, new_count: Number(newCount ?? 0), pushed, auto_sent: autoSent });
        } catch (err) {
          notifResults.push({
            teamId,
            new_count: 0,
            pushed: 0,
            error: err instanceof Error ? err.message : "detection failed",
          });
        }
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

    // Single team? Return flat response for backward compatibility.
    // When multiple dates were synced for a single team (daysBack > 0)
    // we aggregate storedCount / unmatchedCount across the date sweep so
    // the Sync button toast shows the total, not just one day.
    const distinctTeamCount = new Set(
      configs.map((c) => c?.teamId ?? "env-default"),
    ).size;
    if (distinctTeamCount === 1 && results.every((r) => !r.error)) {
      const aggregated = {
        storedCount: 0,
        unmatchedCount: 0,
        datesSynced: results.length,
      } as Record<string, number>;
      for (const r of results) {
        const inner = (r.result ?? {}) as Record<string, unknown>;
        aggregated.storedCount += Number(inner.storedCount ?? 0);
        aggregated.unmatchedCount += Number(inner.unmatchedCount ?? 0);
      }
      return NextResponse.json({
        ok: true,
        // When daysBack=0 keep returning the original single-result shape
        // so callers that read `result.storedCount` still work.
        result: results.length === 1 ? results[0].result : aggregated,
        // Per-date breakdown for callers that want it.
        perDate: results.length > 1 ? results : undefined,
        push: pushResult,
        rpeReminder: rpeReminderResult,
        notified: shouldNotify,
        coachNotifications: notifResults,
        syncAnomalies,
      });
    }

    return NextResponse.json({
      ok: results.every(r => !r.error),
      results,
      push: pushResult,
      rpeReminder: rpeReminderResult,
      notified: shouldNotify,
      coachNotifications: notifResults,
      syncAnomalies,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catapult sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return runSync(request, null, null);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const date = typeof body?.date === "string" && body.date.trim().length ? body.date.trim() : null;
  const daysBack = typeof body?.daysBack === "number" && Number.isFinite(body.daysBack)
    ? body.daysBack
    : null;
  return runSync(request, date, daysBack);
}

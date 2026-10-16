/**
 * GET /api/admin/health/cron   (daily, e.g. 0 6 * * *)
 *
 * Runs the pipeline-health registry over every team and ALERTS on any new/worsened
 * amber or red. Deduped via pipeline_health_log (shouldAlert) so a persistent issue
 * alerts once, not every morning, and a recurrence after a clear re-alerts. This is
 * what turns "silent for 3.5 weeks" into "known next morning."
 *
 * Cron-gated (Bearer CRON_SECRET), read-only on the monitored tables; the only write
 * is the dedup log (service role). Alerts: email the operator recipient(s) in
 * HEALTH_ALERT_EMAIL (comma-separated) when Resend is configured, and always
 * console.error the red/amber set as the floor so the signal survives with no email.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendTransactionalEmail } from "@/lib/email/sendTransactionalEmail";
import { loadAllTeamHealth } from "@/lib/micropulse/pipelineHealth/load";
import { evaluateTeamHealth, isActionableHealth, shouldAlert, type HealthStatus } from "@/lib/micropulse/pipelineHealth/checks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isCronCall(req: Request): boolean {
  const authz = req.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  const reminder = process.env.REMINDER_CRON_SECRET;
  return (!!secret && authz === `Bearer ${secret}`) || (!!reminder && authz === `Bearer ${reminder}`);
}

type Alert = { teamId: string; teamName: string; checkId: string; status: HealthStatus; en: string };

export async function GET(req: Request) {
  try {
    if (!isCronCall(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const sb = getSupabaseAdmin();
    const facts = await loadAllTeamHealth(sb);
    const nowIso = new Date().toISOString();
    const today = facts[0]?.today ?? nowIso.slice(0, 10);

    // Previous statuses for dedup.
    const teamIds = facts.map((f) => f.teamId);
    const prev = new Map<string, { status: HealthStatus; last_alerted_at: string | null }>();
    if (teamIds.length) {
      const { data: logRows } = await sb.from("pipeline_health_log").select("team_id, check_id, status, last_alerted_at").in("team_id", teamIds);
      for (const r of (logRows ?? []) as Array<{ team_id: string; check_id: string; status: string; last_alerted_at: string | null }>) {
        prev.set(`${r.team_id}:${r.check_id}`, { status: r.status as HealthStatus, last_alerted_at: r.last_alerted_at });
      }
    }

    const alerts: Alert[] = [];
    const rows: Array<Record<string, unknown>> = [];
    for (const f of facts) {
      for (const r of evaluateTeamHealth(f)) {
        const key = `${f.teamId}:${r.id}`;
        const was = prev.get(key) ?? null;
        const alerting = shouldAlert(was?.status ?? null, r.status);
        if (alerting) alerts.push({ teamId: f.teamId, teamName: f.teamName, checkId: r.id, status: r.status, en: r.detail.en });
        rows.push({
          team_id: f.teamId, check_id: r.id, status: r.status, detail: r.detail.en, as_of: today,
          last_alerted_at: alerting ? nowIso : (was?.last_alerted_at ?? null),
          updated_at: nowIso,
        });
      }
    }

    if (rows.length) await sb.from("pipeline_health_log").upsert(rows, { onConflict: "team_id,check_id" });

    if (alerts.length) {
      const reds = alerts.filter((a) => a.status === "red");
      const lines = alerts.map((a) => `[${a.status.toUpperCase()}] ${a.teamName} · ${a.checkId}: ${a.en}`);
      // Floor: always log, so the signal survives even with no email configured.
      console.error(`[pipeline-health] ${reds.length} red, ${alerts.length - reds.length} amber:\n${lines.join("\n")}`);
      await notifyOperators(alerts, lines).catch((e) => console.error("[pipeline-health] email failed", e));
    }

    const all = facts.flatMap((f) => evaluateTeamHealth(f));
    return NextResponse.json({
      ok: true, asOf: today,
      redCount: all.filter((r) => r.status === "red").length,
      amberCount: all.filter((r) => r.status === "amber").length,
      actionableCount: all.filter(isActionableHealth).length,
      alerted: alerts.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error("[pipeline-health] cron failed", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

async function notifyOperators(alerts: Alert[], lines: string[]): Promise<void> {
  // Email is best-effort on top of the console.error floor. Recipient(s) are
  // operator-controlled (HEALTH_ALERT_EMAIL, comma-separated) — not derived from a
  // user table, so the pager is explicit and never a fragile auth-schema join.
  if (!process.env.RESEND_API_KEY || !process.env.REMINDER_EMAIL_FROM || !process.env.HEALTH_ALERT_EMAIL) return;
  const emails = [...new Set(process.env.HEALTH_ALERT_EMAIL.split(",").map((e) => e.trim()).filter(Boolean))];
  if (emails.length === 0) return;
  const reds = alerts.filter((a) => a.status === "red").length;
  const subject = `MicroPulse health: ${reds} red, ${alerts.length - reds} amber`;
  const text = `The pipeline-health monitor found ${alerts.length} issue(s) this morning:\n\n${lines.join("\n")}\n\nOpen /coach/admin/health for the full grid.`;
  await Promise.all(emails.map((to) => sendTransactionalEmail({ to, subject, text })));
}

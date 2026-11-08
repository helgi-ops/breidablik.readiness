/**
 * Nightly tenant-isolation audit, database half. Source checks run in CI, so this route only reads the live catalog:
 * row-level security, policies, grants, definer functions and new admin accounts.
 *
 * GET /api/admin/security-audit/cron   (secret-protected)
 *
 * Every run writes a row to security_audit_runs. A HIGH finding missing from security/tenant-audit.baseline.json goes
 * to console.error and to HEALTH_ALERT_EMAIL when Resend is configured. It repeats nightly until fixed or reviewed.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { isCronCall } from "@/lib/auth/cron";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendTransactionalEmail } from "@/lib/email/sendTransactionalEmail";
import { runDbChecks } from "@/lib/security/tenantAudit/dbChecks";
import { buildResult } from "@/lib/security/tenantAudit/baseline";
import type { AllowlistEntry, Baseline, Finding } from "@/lib/security/tenantAudit/types";
import allowlistJson from "../../../../../../security/tenant-audit.allowlist.json";
import baselineJson from "../../../../../../security/tenant-audit.baseline.json";

async function alertNewHigh(newHigh: Finding[]) {
  const text = [
    "The nightly tenant audit found something that could let one team reach another team's data.",
    "",
    ...newHigh.map((f) => `- ${f.check} ${f.file}: ${f.message}`),
    "",
    "See docs/security/tenant-isolation.md.",
  ].join("\n");
  console.error(`[security-audit] ${newHigh.length} new high finding(s)\n${text}`);

  if (!process.env.RESEND_API_KEY || !process.env.REMINDER_EMAIL_FROM || !process.env.HEALTH_ALERT_EMAIL) return;
  const emails = [...new Set(process.env.HEALTH_ALERT_EMAIL.split(",").map((e) => e.trim()).filter(Boolean))];
  const subject = `MicroPulse security: ${newHigh.length} new team-isolation finding(s)`;
  await Promise.all(emails.map((to) => sendTransactionalEmail({ to, subject, text })));
}

export async function GET(req: Request) {
  if (!isCronCall(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sb = getSupabaseAdmin();
    const findings = await runDbChecks(sb);
    const result = buildResult(findings, allowlistJson as AllowlistEntry[], baselineJson as Baseline);
    const high = result.findings.filter((f) => f.severity === "HIGH");

    const { error } = await sb.from("security_audit_runs").insert({
      high_count: high.length,
      new_high_count: result.newHigh.length,
      findings: result.findings,
    });
    if (error) console.error(`[security-audit] could not save the run: ${error.message}`);

    if (result.newHigh.length > 0) {
      await alertNewHigh(result.newHigh).catch((e) => console.error("[security-audit] alert failed", e));
    }

    return NextResponse.json({ ok: true, high: high.length, newHigh: result.newHigh.length, allowed: result.allowed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(`[security-audit] the audit could not run: ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

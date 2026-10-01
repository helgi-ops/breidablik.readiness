/**
 * POST /api/recovery/auto-trigger
 *
 * Cron-only endpoint. Scans today's Catapult Player Load rows and
 * auto-assigns Post-Match VST Reset (this evening) + MD+1 Recovery Bundle
 * (tomorrow morning) for any player whose match-day load exceeded their
 * 28-day chronic mean by the configured multiplier.
 *
 * Auth: Bearer token must equal CRON_SECRET (or REMINDER_CRON_SECRET as
 * fallback). Hourly Vercel cron is appropriate, since assignments are
 * idempotent per protocol+player+day.
 *
 * curl -X POST "http://localhost:3000/api/recovery/auto-trigger" \
 *   -H "Authorization: Bearer $CRON_SECRET"
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { runRecoveryAutoTrigger } from "@/lib/recovery/autoTrigger";
import { runMinutesRecoveryTrigger } from "@/lib/recovery/minutesRecoveryTrigger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const expected =
    process.env.CRON_SECRET ?? process.env.REMINDER_CRON_SECRET ?? "";
  if (!expected) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }
  if (!token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  // Load-based trigger (Catapult, MD+1) + minutes-based trigger (works GPS-less, MD+1 & MD+3).
  // Both idempotent per protocol+player+day, so running together never double-assigns.
  const [result, minutes] = await Promise.all([
    runRecoveryAutoTrigger(sb),
    runMinutesRecoveryTrigger(sb),
  ]);
  return NextResponse.json({ ok: true, ...result, minutes });
}

// Allow GET-with-secret for easy cron pings from Vercel.
export async function GET(req: NextRequest) {
  return POST(req);
}

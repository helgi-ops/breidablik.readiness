/**
 * POST /api/illness/auto-clear
 *
 * Cron-only endpoint. Closes stale illness flags when the player has
 * clearly returned to training and resolved symptoms. See
 * runIllnessAutoClear for the full decision rule.
 *
 * Auth: Bearer CRON_SECRET (or REMINDER_CRON_SECRET).
 *
 * Optional ?dryRun=1 to preview without writing.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { runIllnessAutoClear } from "@/lib/micropulse/illnessAutoClear";

export const runtime = "nodejs";

async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const expected = process.env.CRON_SECRET ?? process.env.REMINDER_CRON_SECRET ?? "";
  if (!expected) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }
  if (!token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const sb = getSupabaseAdmin();
  const result = await runIllnessAutoClear(sb, { dryRun });
  return NextResponse.json({ ok: true, dryRun, ...result });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}

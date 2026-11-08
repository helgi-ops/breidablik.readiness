import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCoachReminderStatus, getReminderContext } from "@/lib/reminders/checkinReminders";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";

export const runtime = "nodejs";

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

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unknown error";
}

export async function GET(req: Request) {
  try {
    const sb = getAdminClient();
    const url = new URL(req.url);
    const { teamId } = await requireCoachAccessForTeam(sb, req, url.searchParams.get("teamId"));
    if (!teamId) throw new Error("Team context is required");
    const dateKey = url.searchParams.get("dateKey") || getReminderContext().dateKey;

    const status = await getCoachReminderStatus(sb, {
      dateKey,
      teamId,
    });

    return NextResponse.json({ ok: true, status });
  } catch (e: unknown) {
    const mapped = authErrorToResponse(e);
    if (mapped) return mapped;
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}

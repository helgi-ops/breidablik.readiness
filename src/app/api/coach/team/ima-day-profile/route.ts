/**
 * /api/coach/team/ima-day-profile?date=YYYY-MM-DD&lang=EN|IS
 *
 * GET — biomechanical (IMA) view of a single training day for the
 * authenticated coach's team. Returns the team session profile plus a
 * per-player breakdown of 8-band stride distribution, sprint-stride
 * volume vs personal 14-day baseline, and high-intensity CoD asymmetry.
 *
 * Powers the /coach/ima-intelligence page.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { loadImaDayProfile } from "@/lib/micropulse/imaDayProfile/loader";

export const runtime = "nodejs";


async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 };
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 };
  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles").select("team_id, role").eq("id", userId).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 };
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 };
  return { userId, teamId, supabase };
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const langParam = url.searchParams.get("lang");
  const lang: "IS" | "EN" = langParam === "IS" ? "IS" : "EN";

  // Default to today (UTC) when no date is provided
  const today = new Date().toISOString().slice(0, 10);
  const dateIso = dateParam && isIsoDate(dateParam) ? dateParam : today;

  try {
    const profile = await loadImaDayProfile(ctx.supabase, {
      teamId: ctx.teamId,
      dateIso,
      lang,
    });
    return NextResponse.json({ profile });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "load_failed", detail: msg }, { status: 500 });
  }
}

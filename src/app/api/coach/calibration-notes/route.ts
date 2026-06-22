/**
 * /api/coach/calibration-notes — decision-moment calibration context.
 *
 * This is the READ-ONLY half of the learning loop, surfaced beside the verdict
 * (never as the verdict — see CLAUDE.md "canonical verdict source": the colour is
 * sacred; trajectory/calibration insight is a distinct labelled signal next to it).
 *
 * For the coach's team it cross-references:
 *   - vw_decision_calibration_summary (last 30d per-colour next-day outcomes), and
 *   - v_coach_readiness_today_v8.final_color (today's canonical colours),
 * and returns a plain-language note ONLY when a colour is BOTH (a) statistically
 * over-sensitive for this squad — most verdicts of that colour recovered next day,
 * on a usable sample — AND (b) actually present today. The note is context for the
 * coach's call; it does NOT change any colour.
 *
 * GET → 200 { ok, date, notes: [{ color, playersToday, recoveredPct, sampleN, en, is }] }
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// A colour is flagged over-sensitive only with a usable own-sample and a clear
// majority recovering next day — same guardrails as the team calibration headline.
const MIN_SAMPLE = 10;
const RECOVERED_PCT_FLAG = 60;

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

async function requireCoachContext(req: Request): Promise<{ teamId: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");

  const sb = getAdminClient();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");

  const { data: prof, error: profErr } = await sb
    .from("profiles")
    .select("role, team_id")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profErr) throw new Error(profErr.message);

  const profile = prof as { role: string | null; team_id: string | null } | null;
  const role = String(profile?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!profile?.team_id) throw new Error("No team context");
  return { teamId: profile.team_id };
}

type SummaryRow = {
  predicted_state: string;
  total_verdicts: number;
  recovered_count: number;
  unknown_count: number;
};

const COLOR_LABEL: Record<string, { en: string; is: string }> = {
  RED: { en: "RED", is: "RAUTT" },
  YELLOW: { en: "YELLOW", is: "GULT" },
};

export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoachContext(req);
    const sb = getAdminClient();

    // v_coach_readiness_today_v8 is historical (one row per player per day) despite
    // its name, so scope to today's entries — the colours the coach is acting on now.
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik" }).format(new Date());

    const [calRes, todayRes] = await Promise.all([
      sb.from("vw_decision_calibration_summary")
        .select("predicted_state, total_verdicts, recovered_count, unknown_count")
        .eq("team_id", teamId),
      sb.from("v_coach_readiness_today_v8")
        .select("final_color")
        .eq("team_id", teamId)
        .eq("entry_date", date),
    ]);
    if (calRes.error) return NextResponse.json({ error: calRes.error.message }, { status: 500 });
    if (todayRes.error) return NextResponse.json({ error: todayRes.error.message }, { status: 500 });

    // Count today's players per canonical colour (uppercased for matching).
    const todayByColor = new Map<string, number>();
    for (const r of (todayRes.data ?? []) as Array<{ final_color: string | null }>) {
      const c = String(r.final_color ?? "").toUpperCase();
      if (c) todayByColor.set(c, (todayByColor.get(c) ?? 0) + 1);
    }

    const calByState = new Map<string, SummaryRow>();
    for (const r of (calRes.data ?? []) as SummaryRow[]) {
      calByState.set(String(r.predicted_state).toUpperCase(), r);
    }

    const notes: Array<{
      color: string; playersToday: number; recoveredPct: number; sampleN: number; en: string; is: string;
    }> = [];

    // Only RED and YELLOW can be "over-sensitive" (a recovered GREEN is the
    // expected, healthy case — no advisory needed).
    for (const color of ["RED", "YELLOW"] as const) {
      const playersToday = todayByColor.get(color) ?? 0;
      if (playersToday < 1) continue;
      const row = calByState.get(color);
      if (!row) continue;
      const scoreable = (row.total_verdicts ?? 0) - (row.unknown_count ?? 0);
      if (scoreable < MIN_SAMPLE) continue;
      const recoveredPct = Math.round((100 * (row.recovered_count ?? 0)) / scoreable);
      if (recoveredPct < RECOVERED_PCT_FLAG) continue;

      const lbl = COLOR_LABEL[color];
      const np = playersToday;
      const enWho = np === 1 ? "1 player is" : `${np} players are`;
      const isWho = np === 1 ? "1 leikmaður er" : `${np} leikmenn eru`;
      notes.push({
        color, playersToday: np, recoveredPct, sampleN: scoreable,
        en: `${enWho} ${lbl.en} today. Over the last 30 days, ${lbl.en} verdicts recovered the next day ${recoveredPct}% of the time for your squad — context for today's calls, not a downgrade.`,
        is: `${isWho} ${lbl.is} í dag. Síðustu 30 daga hafa ${lbl.is} dómar náð sér daginn eftir í ${recoveredPct}% tilfella hjá þínum hóp — samhengi fyrir daginn, ekki niðurfærsla.`,
      });
    }

    return NextResponse.json({ ok: true, date, notes });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message === "Unauthorized") return NextResponse.json({ error: message }, { status: 401 });
    if (message === "Forbidden") return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { loadWeekRuleRead } from "@/lib/micropulse/weekSetup/weekRulesServer";


function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function computePlannedLoad(systemKey: string, dayType: string, intensityTarget: number) {
  if (dayType === "OFF") return 1;
  if (dayType === "RECOVERY") return Math.max(2, Math.min(4, intensityTarget - 3));
  if (dayType === "GAME") return 9;

  switch (systemKey) {
    case "RECOVERY":
      return 3;
    case "POWER":
      return Math.max(6, Math.min(8, intensityTarget));
    case "STRENGTH":
      return Math.max(7, Math.min(9, intensityTarget + 1));
    default:
      return Math.max(5, Math.min(8, intensityTarget));
  }
}

// Hjálpar: tekur day_index hvort sem "1" eða 1 og day_type í uppercase
type DayOverride = { day_index: number; day_type?: string; focus?: string | null; notes?: string | null; day_intent?: string | null };
function normalizeOverrides(days: Array<Record<string, unknown>> | undefined) {
  const map = new Map<number, DayOverride>();
  for (const d of days ?? []) {
    const idxRaw = d?.day_index;
    const idx =
      typeof idxRaw === "number"
        ? idxRaw
        : typeof idxRaw === "string"
          ? parseInt(idxRaw, 10)
          : NaN;

    if (!Number.isFinite(idx)) continue;

    const day_type =
      typeof d?.day_type === "string" ? d.day_type.toUpperCase() : d?.day_type;

    map.set(idx, { ...d, day_index: idx, day_type } as DayOverride);
  }
  return map;
}

export async function POST(req: Request) {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? "Supabase env vars missing at runtime" },
      { status: 500 }
    );
  }

  const body = await req.json();
  const { team_id, week_start, system_key, intensity_target, notes, days } = body;
  // "Confirm week → players" (Micro, lota 4): the same save, plus the week is marked confirmed (when + by whom).
  const confirm = body?.confirm === true;

  if (!team_id || !week_start || !system_key || intensity_target == null) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Debug: sjá hvað UI er að senda inn
  let coachUserId: string | null = null;
  try {
    coachUserId = (await requireCoachAccessForTeam(supabase, req, team_id)).coachUserId;
  } catch (err) {
    const auth = authErrorToResponse(err);
    if (auth) return auth;
    throw err;
  }

  // 1) Upsert week_setups (ok)
  const { error: setupErr } = await supabase
    .from("week_setups")
    .upsert(
      {
        team_id,
        week_start,
        system_key,
        intensity_target,
        notes: notes ?? null,
      },
      { onConflict: "team_id,week_start" }
    );

  if (setupErr) {
    return NextResponse.json({ error: setupErr.message }, { status: 500 });
  }

  // 2) Build 7 rows og OVERWRITE-a með upsert (team_id,day_date)
  const start = new Date(week_start + "T00:00:00Z");
  const overrides = normalizeOverrides(days);

  const planRows = Array.from({ length: 7 }).map((_, i) => {
    const day_index = i + 1;
    const day_date = toISODate(addDays(start, i));
    const override = overrides.get(day_index);

    const finalDayType =
      (override?.day_type as string | undefined) ??
      (day_index === 7 ? "OFF" : "TRAIN");

    const planned_load = computePlannedLoad(system_key, finalDayType, intensity_target);

    return {
      team_id,
      week_start,
      day_date,
      day_index,
      day_type: finalDayType,
      focus: override?.focus ?? null,
      planned_load,
      system_key,
      notes: override?.notes ?? null,

      // Ef week_plans hefur day_intent dálk, þá færðu intents inn líka.
      // Ef þú færð villu "column day_intent does not exist", kommentaðu næstu línu út.
      day_intent: override?.day_intent ?? null,
    };
  });

  // Declared team breaks OWN their days — force any day inside a break to OFF before we
  // persist, so week_plans (the source every reader trusts: Build Session, nudges,
  // reminders, RPE, load-plan) never carries training on a frí day. Same inclusive rule
  // as the Week Setup grid lock (start_date <= date <= end_date).
  const { data: breakRows } = await supabase
    .from("team_breaks")
    .select("start_date, end_date")
    .eq("team_id", team_id)
    .gte("end_date", week_start);
  const breaks = (breakRows ?? []) as Array<{ start_date: string; end_date: string }>;
  const onBreak = (d: string) => breaks.some((b) => b.start_date <= d && d <= b.end_date);
  const finalRows = planRows.map((r) =>
    onBreak(r.day_date) ? { ...r, day_type: "OFF", focus: "OFF", planned_load: 1, day_intent: null } : r
  );

  const { error: planErr } = await supabase
    .from("week_plans")
    .upsert(finalRows, { onConflict: "team_id,day_date" });

  if (planErr) {
    return NextResponse.json({ error: planErr.message }, { status: 500 });
  }

  // The confirmation is stamped AFTER the days are written, so a week confirmed now never reads "changed since".
  let confirmedAt: string | null = null;
  if (confirm) {
    // updated_at is set by the DB clock; never stamp the confirmation before the week's last edit (clock skew).
    const weekEnd = new Date(Date.parse(`${week_start}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
    const [{ data: wpEd }, { data: cwEd }] = await Promise.all([
      supabase.from("week_plans").select("updated_at").eq("team_id", team_id).gte("day_date", week_start).lte("day_date", weekEnd),
      supabase.from("coach_week_setup").select("updated_at").eq("team_id", team_id).eq("week_start_date", week_start),
    ]);
    const lastEdit = [...(wpEd ?? []), ...(cwEd ?? [])].reduce((mx, r) => { const t = Date.parse(String((r as { updated_at?: string | null }).updated_at ?? "")); return Number.isFinite(t) && t > mx ? t : mx; }, 0);
    confirmedAt = new Date(Math.max(Date.now(), lastEdit + 1)).toISOString();
    const { error: cErr } = await supabase.from("week_setups")
      .update({ confirmed_at: confirmedAt, confirmed_by: coachUserId })
      .eq("team_id", team_id).eq("week_start", week_start);
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  // Week rules (brief §5): in season never three training days in a row. Advice only — the week is already saved;
  // the coach gets the run, the nearest fix and the choice to keep it (logged with a reason). Never fails the apply.
  let weekRule: Awaited<ReturnType<typeof loadWeekRuleRead>> | null = null;
  try { weekRule = await loadWeekRuleRead(supabase, team_id, week_start); } catch { weekRule = null; }

  return NextResponse.json({ ok: true, weekRule, confirmedAt });
}

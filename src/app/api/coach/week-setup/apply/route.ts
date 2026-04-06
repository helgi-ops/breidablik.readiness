export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || // recommended for server writes
    process.env.SUPABASE_SERVICE_ROLE ||     // fallback naming
    process.env.SUPABASE_ANON_KEY ||         // last-resort server key (not ideal)
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      `Supabase env vars missing at runtime. url=${Boolean(url)} key=${Boolean(key)}`
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

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
function normalizeOverrides(days: any[] | undefined) {
  const map = new Map<number, any>();
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

    map.set(idx, { ...d, day_index: idx, day_type });
  }
  return map;
}

export async function POST(req: Request) {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Supabase env vars missing at runtime" },
      { status: 500 }
    );
  }

  const body = await req.json();
  const { team_id, week_start, system_key, intensity_target, notes, days } = body;

  if (!team_id || !week_start || !system_key || intensity_target == null) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Debug: sjá hvað UI er að senda inn
  console.log("[week-setup/apply] payload", {
    team_id,
    week_start,
    system_key,
    intensity_target,
    notes: notes ?? null,
    days_count: Array.isArray(days) ? days.length : 0,
    days_sample: Array.isArray(days) ? days.slice(0, 3) : null,
  });

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

  console.log("[week-setup/apply] planRows", planRows);

  const { error: planErr } = await supabase
    .from("week_plans")
    .upsert(planRows, { onConflict: "team_id,day_date" });

  if (planErr) {
    return NextResponse.json({ error: planErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

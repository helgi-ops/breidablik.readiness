export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase env vars missing at runtime");
  }

  return createClient(url, key);
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

export async function POST(req: Request) {
  const supabase = getSupabase();

  const body = await req.json();
  const {
    team_id,
    week_start,
    system_key,
    intensity_target,
    notes,
    days,
  } = body;

  if (!team_id || !week_start || !system_key || !intensity_target) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

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

  const start = new Date(week_start + "T00:00:00Z");

  const planRows = Array.from({ length: 7 }).map((_, i) => {
    const day_index = i + 1;
    const day_date = toISODate(addDays(start, i));
    const override = days?.find((d: any) => d.day_index === day_index);

    return {
      team_id,
      week_start,
      day_date,
      day_index,
      day_type: override?.day_type ?? (day_index === 7 ? "OFF" : "TRAIN"),
      focus: override?.focus ?? null,
      planned_load: computePlannedLoad(system_key, override?.day_type ?? "TRAIN", intensity_target),
      system_key,
      notes: override?.notes ?? null,
    };
  });

  const { error: planErr } = await supabase
    .from("week_plans")
    .upsert(planRows, { onConflict: "team_id,day_date" });

  if (planErr) {
    return NextResponse.json({ error: planErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

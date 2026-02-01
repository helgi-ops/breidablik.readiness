export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only
);

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Basic, pro defaults (þú getur fínstillt seinna)
function computePlannedLoad(systemKey: string, dayType: string, intensityTarget: number) {
  if (dayType === "OFF") return 1;
  if (dayType === "RECOVERY") return Math.max(2, Math.min(4, intensityTarget - 3));
  if (dayType === "GAME") return 9;

  // TRAIN
  switch (systemKey) {
    case "RECOVERY":
      return 3;
    case "POWER":
      return Math.max(6, Math.min(8, intensityTarget));
    case "STRENGTH":
      return Math.max(7, Math.min(9, intensityTarget + 1));
    default:
      // METABOLIC_BASE / GENERAL / etc
      return Math.max(5, Math.min(8, intensityTarget));
  }
}

export async function POST(req: Request) {
  const body = await req.json();

  const {
    team_id,
    week_start,       // YYYY-MM-DD (mánudagur)
    system_key,
    intensity_target, // 1-10
    notes,
    days,             // optional edits: [{day_index, day_type, focus, notes}]
  } = body as {
    team_id: string;
    week_start: string;
    system_key: string;
    intensity_target: number;
    notes?: string | null;
    days?: Array<{ day_index: number; day_type: string; focus?: string | null; notes?: string | null }>;
  };

  if (!team_id || !week_start || !system_key || !intensity_target) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 1) Week setup (decision)
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

  if (setupErr) return NextResponse.json({ error: setupErr.message }, { status: 500 });

  // 2) Build 7-day plan (consequence)
  const start = new Date(week_start + "T00:00:00Z");

  const planRows = Array.from({ length: 7 }).map((_, i) => {
    const day_index = i + 1;
    const day_date = toISODate(addDays(start, i));

    const override = days?.find((d) => d.day_index === day_index);
    const day_type = override?.day_type ?? (day_index === 7 ? "OFF" : "TRAIN");
    const focus = override?.focus ?? null;

    return {
      team_id,
      week_start,
      day_date,
      day_index,
      day_type,
      focus,
      planned_load: computePlannedLoad(system_key, day_type, intensity_target),
      system_key,
      notes: override?.notes ?? null,
    };
  });

  const { error: planErr } = await supabase
    .from("week_plans")
    .upsert(planRows, { onConflict: "team_id,day_date" });

  if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

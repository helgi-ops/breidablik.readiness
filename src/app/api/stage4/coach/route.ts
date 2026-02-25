import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req: Request) {
  const body = await req.json();

  const {
    player_id,
    entry_date,
    coach_decision,
    coach_note,
    locked,
    coach_user_id,
  } = body;

  const ensured = await supabaseAdmin.rpc("stage4_ensure_decision", {
    p_player_id: player_id,
    p_entry_date: entry_date,
  });

  if (ensured.error) {
    return NextResponse.json(
      { error: ensured.error.message },
      { status: 400 }
    );
  }

  const row = Array.isArray(ensured.data)
    ? ensured.data[0]
    : ensured.data;

  if (row?.locked) {
    return NextResponse.json(
      { error: "Day is locked." },
      { status: 423 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("stage4_decisions")
    .update({
      coach_decision: coach_decision ?? null,
      coach_note: coach_note ?? null,
      coach_user_id: coach_user_id ?? null,
      locked: typeof locked === "boolean" ? locked : row.locked,
    })
    .eq("player_id", player_id)
    .eq("entry_date", entry_date)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ row: data });
}
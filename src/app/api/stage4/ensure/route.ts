// src/app/api/stage4/ensure/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key);
}

export async function POST(req: Request) {
  const supabaseAdmin = getAdminClient();

  const body = await req.json().catch(() => ({}));
  const player_id = String(body?.player_id ?? "");
  const entry_date = String(body?.entry_date ?? "");

  if (!player_id) {
    return NextResponse.json({ error: "player_id is required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry_date)) {
    return NextResponse.json({ error: "entry_date must be YYYY-MM-DD" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("stage4_ensure_decision", {
    p_player_id: player_id,
    p_entry_date: entry_date,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ row: Array.isArray(data) ? data[0] : data });
}
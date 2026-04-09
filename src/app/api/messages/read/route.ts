export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * POST /api/messages/read
 * Mark messages as read. Body: { messageIds: string[] } or { playerId, date }
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Vantar auðkenningu" }, { status: 401 });

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return NextResponse.json({ error: "Ógilt token" }, { status: 401 });

  const body = await req.json();
  const { messageIds, playerId, date } = body;

  const now = new Date().toISOString();

  if (messageIds?.length) {
    const { error } = await supabase
      .from("player_coach_messages")
      .update({ read_at: now })
      .in("id", messageIds)
      .is("read_at", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (playerId && date) {
    const { error } = await supabase
      .from("player_coach_messages")
      .update({ read_at: now })
      .eq("player_id", playerId)
      .eq("entry_date", date)
      .is("read_at", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: "Missing messageIds or playerId+date" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/messages/read
 * Mark messages as read. Body: { messageIds: string[] } or { playerId, date }
 */
export async function POST(req: NextRequest) {
  const { getSupabaseServer } = await import("@/lib/supabaseServer");
  const supabase = getSupabaseServer();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    // Mark all unread in a thread as read
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

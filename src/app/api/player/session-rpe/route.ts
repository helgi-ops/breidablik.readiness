import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId, getPlayerTeamId } from "@/lib/session-rpe/server";
import { validateSessionRpePayload } from "@/lib/session-rpe/validators";

export const runtime = "nodejs";

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function POST(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const { playerId } = await requireAuthedPlayerId(sb, req);

    const body = await req.json().catch(() => null);
    const validated = validateSessionRpePayload(body);
    if (!validated.ok) {
      return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
    }

    const payload = validated.data;
    const teamId = await getPlayerTeamId(sb, playerId);

    const { data, error } = await sb
      .from("session_rpe_entries")
      .insert({
        player_id: playerId,
        team_id: teamId,
        session_date: payload.session_date,
        session_type: payload.session_type,
        session_name: payload.session_name ?? null,
        duration_minutes: payload.duration_minutes,
        rpe: payload.rpe,
        notes: payload.notes ?? null,
        source: "player",
      })
      .select("id, player_id, team_id, session_date, session_type, session_name, duration_minutes, rpe, session_load, source, notes, submitted_at, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, entry: data }, { status: 201 });
  } catch (error: unknown) {
    const message = toMessage(error);
    const code = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
}

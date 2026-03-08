import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { validateSessionRpePayload } from "@/lib/session-rpe/validators";

export const runtime = "nodejs";

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function todayDateKey(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const sb = getSupabaseAdmin();
    const { playerId } = await requireAuthedPlayerId(sb, req);
    const { id } = await context.params;
    const entryId = String(id ?? "").trim();

    if (!entryId) {
      return NextResponse.json({ ok: false, error: "Entry id is required" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const validated = validateSessionRpePayload(body);
    if (!validated.ok) {
      return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
    }

    const payload = validated.data;

    const { data: existing, error: existingErr } = await sb
      .from("session_rpe_entries")
      .select("id, player_id, session_date")
      .eq("id", entryId)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json({ ok: false, error: existingErr.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Entry not found" }, { status: 404 });
    }

    if (String((existing as { player_id?: string }).player_id ?? "") !== playerId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const tz = process.env.APP_TIMEZONE || "Atlantic/Reykjavik";
    const today = todayDateKey(tz);
    const existingDate = String((existing as { session_date?: string }).session_date ?? "");
    if (existingDate !== today) {
      return NextResponse.json({ ok: false, error: "Edits are only allowed on the same day" }, { status: 403 });
    }

    const { data, error } = await sb
      .from("session_rpe_entries")
      .update({
        session_date: payload.session_date,
        session_type: payload.session_type,
        session_name: payload.session_name ?? null,
        duration_minutes: payload.duration_minutes,
        rpe: payload.rpe,
        notes: payload.notes ?? null,
      })
      .eq("id", entryId)
      .eq("player_id", playerId)
      .select("id, player_id, team_id, session_date, session_type, session_name, duration_minutes, rpe, session_load, source, notes, submitted_at, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, entry: data });
  } catch (error: unknown) {
    const message = toMessage(error);
    const code = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
}

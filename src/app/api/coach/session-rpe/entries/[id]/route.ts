import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

const ALLOWED_SESSION_TYPES = new Set([
  "match",
  "team_training",
  "gym",
  "recovery",
  "individual",
  "other",
]);

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

type ExistingEntry = {
  id: string;
  player_id: string;
  team_id: string | null;
  session_date: string;
  session_type: string;
  session_name: string | null;
  duration_minutes: number;
  rpe: number;
};

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const sb = getSupabaseAdmin();
    const { id } = await context.params;
    const entryId = String(id ?? "").trim();

    if (!entryId) {
      return NextResponse.json({ ok: false, error: "Entry id is required" }, { status: 400 });
    }

    // Fetch the existing entry to learn its team_id, then check coach access.
    const { data: existingData, error: existingErr } = await sb
      .from("session_rpe_entries")
      .select("id, player_id, team_id, session_date, session_type, session_name, duration_minutes, rpe")
      .eq("id", entryId)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json({ ok: false, error: existingErr.message }, { status: 500 });
    }

    const existing = (existingData ?? null) as ExistingEntry | null;
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Entry not found" }, { status: 404 });
    }

    // Verify the coach has access to the team this entry belongs to.
    await requireCoachAccessForTeam(sb, req, existing.team_id ?? null);

    const body = (await req.json().catch(() => null)) as {
      session_date?: string;
      session_type?: string;
      session_name?: string | null;
      duration_minutes?: number;
      rpe?: number;
    } | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};

    if (body.session_date !== undefined) {
      const d = String(body.session_date).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        return NextResponse.json({ ok: false, error: "Invalid session_date (expected YYYY-MM-DD)" }, { status: 400 });
      }
      update.session_date = d;
    }

    if (body.session_type !== undefined) {
      const t = String(body.session_type).trim();
      if (!ALLOWED_SESSION_TYPES.has(t)) {
        return NextResponse.json({ ok: false, error: `Invalid session_type: ${t}` }, { status: 400 });
      }
      update.session_type = t;
    }

    if (body.session_name !== undefined) {
      const n = body.session_name === null ? null : String(body.session_name).trim();
      update.session_name = n && n.length > 0 ? n : null;
    }

    if (body.duration_minutes !== undefined) {
      const dm = Number(body.duration_minutes);
      if (!Number.isFinite(dm) || dm < 1 || dm > 600) {
        return NextResponse.json({ ok: false, error: "duration_minutes must be between 1 and 600" }, { status: 400 });
      }
      update.duration_minutes = Math.round(dm);
    }

    if (body.rpe !== undefined) {
      const r = Number(body.rpe);
      if (!Number.isFinite(r) || r < 1 || r > 10) {
        return NextResponse.json({ ok: false, error: "rpe must be between 1 and 10" }, { status: 400 });
      }
      update.rpe = Math.round(r);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
    }

    // Mark as coach-edited so we can audit later if needed.
    update.source = "coach_edit";
    update.updated_at = new Date().toISOString();

    const { data, error } = await sb
      .from("session_rpe_entries")
      .update(update)
      .eq("id", entryId)
      .select("id, player_id, team_id, session_date, session_type, session_name, duration_minutes, rpe, session_load, source, submitted_at, updated_at")
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

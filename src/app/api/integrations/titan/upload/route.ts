export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/integrations/titan/upload
 *
 * Stores a coach's parsed Titan (Integrated Bionics / Hudl) indoor `_synced_data` export into
 * player_external_load_daily. The browser parses the CSV/XLSX (parseTitanSyncedData runs client-side),
 * then POSTs the typed rows here. We resolve each Titan player name to a MicroPulse player on the
 * COACH'S OWN team (never another team) and upsert with source="titan" — the shared ingest path the
 * Google-Sheet auto-sync also uses. GPS stays null (indoor). Coach/staff only; never the readiness colour.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ingestTitanRows } from "@/lib/integrations/titan/ingestServer";
import type { TitanRow } from "@/lib/integrations/titan";

const MAX_ROWS = 10_000;

export async function POST(req: Request) {
  try {
    const authz = req.headers.get("authorization") ?? "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const sbUser = getSupabaseServer();
    const { data: userRes } = await sbUser.auth.getUser(token);
    if (!userRes?.user?.id) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const { data: prof } = await sbUser.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
    const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
    if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ ok: false, error: "Coach role required" }, { status: 403 });
    const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
    if (!teamId) return NextResponse.json({ ok: false, error: "No team context" }, { status: 400 });

    const body = await req.json().catch(() => null);
    const incoming = (body?.rows ?? []) as TitanRow[];
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return NextResponse.json({ ok: false, error: "No rows to store." }, { status: 400 });
    }
    if (incoming.length > MAX_ROWS) {
      return NextResponse.json({ ok: false, error: `Too many rows (${incoming.length} > ${MAX_ROWS}).` }, { status: 400 });
    }

    const result = await ingestTitanRows(getSupabaseAdmin(), teamId, incoming);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/integrations/titan/upload
 *
 * Stores a coach's parsed Titan (Integrated Bionics / Hudl) indoor `_synced_data` export into
 * player_external_load_daily. The browser parses the CSV/XLSX (parseTitanSyncedData runs client-side),
 * then POSTs the typed rows here. This route resolves each Titan player name to a MicroPulse player on
 * the COACH'S OWN team (never another team), maps the IMU KPIs (Player Load / Jumps / Impacts /
 * duration) to the shared load columns, and upserts with source="titan" — the same table Catapult and
 * WIMU write to, so baselines / ACWR / the load surfaces treat it identically. GPS stays null (indoor).
 *
 * Coach/staff only. Descriptive external-load data — never the readiness colour.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { titanRowToExternalLoad } from "@/lib/integrations/titan";
import type { TitanRow } from "@/lib/integrations/titan";

const MAX_ROWS = 10_000;

/** Case/spacing/punctuation-insensitive name key (keeps Icelandic letters intact). */
const normName = (s: string): string => s.toLowerCase().replace(/[,._]/g, " ").replace(/\s+/g, " ").trim();
/** Word-order-independent key so "Jón Ari" matches "Ari, Jón". */
const tokenKey = (s: string): string => normName(s).split(" ").filter(Boolean).sort().join(" ");

export async function POST(req: Request) {
  try {
    // ── Auth: coach/staff on a team ──
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

    // ── Body: parsed Titan rows ──
    const body = await req.json().catch(() => null);
    const incoming = (body?.rows ?? []) as TitanRow[];
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return NextResponse.json({ ok: false, error: "No rows to store." }, { status: 400 });
    }
    if (incoming.length > MAX_ROWS) {
      return NextResponse.json({ ok: false, error: `Too many rows (${incoming.length} > ${MAX_ROWS}).` }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // ── Roster name → player_id (own team only; include inactive so historical sessions match) ──
    const { data: roster } = await sb.from("players").select("id, full_name").eq("team_id", teamId);
    const byNorm = new Map<string, string>();
    const byToken = new Map<string, string>();
    const ambiguousToken = new Set<string>();
    for (const p of (roster ?? []) as Array<{ id: string; full_name: string | null }>) {
      const full = (p.full_name ?? "").trim();
      if (!full) continue;
      byNorm.set(normName(full), String(p.id));
      const tk = tokenKey(full);
      if (byToken.has(tk) && byToken.get(tk) !== String(p.id)) ambiguousToken.add(tk);
      else byToken.set(tk, String(p.id));
    }
    const resolve = (name: string): string | null => {
      const exact = byNorm.get(normName(name));
      if (exact) return exact;
      const tk = tokenKey(name);
      if (ambiguousToken.has(tk)) return null; // two players share these words → don't guess
      return byToken.get(tk) ?? null;
    };

    // ── Build rows, tracking unmatched names ──
    const unmatched = new Set<string>();
    const matchedPlayers = new Set<string>();
    const dates: string[] = [];
    let skipped = 0;
    const toUpsert: ReturnType<typeof titanRowToExternalLoad>[] = [];
    for (const r of incoming) {
      const name = String(r?.playerName ?? "").trim();
      if (!name || !r?.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))) { skipped++; continue; }
      const playerId = resolve(name);
      if (!playerId) { unmatched.add(name); continue; }
      const row = titanRowToExternalLoad(r, playerId, teamId);
      if (!row) { skipped++; continue; }
      matchedPlayers.add(playerId);
      dates.push(row.date);
      toUpsert.push(row);
    }

    // ── Upsert (source="titan") ──
    let stored = 0;
    const warnings: string[] = [];
    for (const row of toUpsert) {
      if (!row) continue;
      const { error } = await sb.from("player_external_load_daily").upsert(row, { onConflict: "player_id,date,source" });
      if (error) warnings.push(`Upsert failed for ${row.external_athlete_id} on ${row.date}: ${error.message}`);
      else stored++;
    }

    dates.sort();
    return NextResponse.json({
      ok: true,
      result: {
        rowsParsed: incoming.length,
        athletesMatched: matchedPlayers.size,
        athletesUnmatched: [...unmatched].sort(),
        sessionsStored: stored,
        skipped,
        storedCount: stored,
        unmatchedCount: unmatched.size,
        earliestDate: dates[0] ?? null,
        latestDate: dates[dates.length - 1] ?? null,
        warnings,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * /api/coach/team/ima-run-distance?date=YYYY-MM-DD
 *
 * GET — IMA Free Running distance per player for one day, split by cadence
 * band (5-8) plus the total. Powers the IMA Running Distance card on the
 * /coach/ima-intelligence page. Coach-scoped to the authenticated team.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeImaRunningLoad, type ImaDayRow } from "@/lib/micropulse/imaRunningLoad";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase
    .from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { teamId, supabase } as const;
}

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date") ?? "";
  const dateIso = /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : new Date().toISOString().slice(0, 10);

  // 28-day window so we can compute the acute:chronic spike ratio per player.
  const startIso = new Date(Date.parse(dateIso + "T00:00:00Z") - 27 * 86_400_000)
    .toISOString().slice(0, 10);

  const { data, error } = await ctx.supabase
    .from("player_external_load_daily")
    .select(
      "player_id, date, ima_fr_band5_total_distance, ima_fr_band6_total_distance, " +
        "ima_fr_band7_total_distance, ima_fr_band8_total_distance, ima_fr_band58_total_distance, " +
        "players!inner(full_name, team_id)",
    )
    .gte("date", startIso)
    .lte("date", dateIso)
    .eq("source", "catapult")
    .eq("players.team_id", ctx.teamId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    player_id: string;
    date: string;
    ima_fr_band5_total_distance: number | null;
    ima_fr_band6_total_distance: number | null;
    ima_fr_band7_total_distance: number | null;
    ima_fr_band8_total_distance: number | null;
    ima_fr_band58_total_distance: number | null;
    players: { full_name: string | null } | { full_name: string | null }[] | null;
  };

  // Group the window by player.
  const byPlayer = new Map<string, { name: string; rows: ImaDayRow[] }>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const p = Array.isArray(r.players) ? r.players[0] : r.players;
    if (!byPlayer.has(r.player_id)) {
      byPlayer.set(r.player_id, { name: (p?.full_name ?? "—").trim(), rows: [] });
    }
    byPlayer.get(r.player_id)!.rows.push({
      date: r.date,
      total: Number(r.ima_fr_band58_total_distance ?? 0) || 0,
      band5: Number(r.ima_fr_band5_total_distance ?? 0) || 0,
      band6: Number(r.ima_fr_band6_total_distance ?? 0) || 0,
      band7: Number(r.ima_fr_band7_total_distance ?? 0) || 0,
      band8: Number(r.ima_fr_band8_total_distance ?? 0) || 0,
    });
  }

  // Only players who actually ran high-intensity on the selected day appear in
  // the day table — each enriched with their acute:chronic spike context.
  const players = Array.from(byPlayer.entries())
    .map(([player_id, { name, rows }]) => {
      const todayRow = rows.find((x) => x.date === dateIso);
      if (!todayRow || todayRow.total <= 0) return null;
      const load = computeImaRunningLoad(rows, dateIso);
      return {
        player_id,
        full_name: name,
        band5: todayRow.band5 ?? 0,
        band6: todayRow.band6 ?? 0,
        band7: todayRow.band7 ?? 0,
        band8: todayRow.band8 ?? 0,
        total: todayRow.total,
        acwr: load.acwr,
        status: load.status,
        confident: load.confident,
        z: load.z,
        dominant_band: load.dominantBand,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  players.sort((a, b) => b.total - a.total);

  return NextResponse.json({ date: dateIso, players });
}

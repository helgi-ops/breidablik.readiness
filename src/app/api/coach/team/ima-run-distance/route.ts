/**
 * /api/coach/team/ima-run-distance?date=YYYY-MM-DD
 *
 * GET — long continuous-run distance per player for one day: IMA Free Running
 * distance in runs of 18 s or more, split by run length plus the total. The
 * bands are BOUT-DURATION bands (seconds of one continuous run), NOT speed/cadence
 * bands — so this is metres in long continuous runs (≥18 s), NOT high-speed
 * running or sprint distance (that lives in the GPS velocity columns). The ACWR on
 * it is a sustained-running volume-change descriptor only.
 *
 * Band EDGES CHANGE per team/date (legacy 0-8-12-15-18-21-24-27-100; Breiðablik
 * from 10 Nov 2026 0-2.5-5-8-12-18-24-30-1000), so nothing here reads a band
 * number as a run length:
 *   total        = ima_fr_ge18_total_distance (config-independent tier; band58 fallback)
 *   long_18_24   = metres in runs of 18–24 s (ge18 − ge24)          ← NEW, config-independent
 *   long_24_plus = metres in runs ≥24 s (ima_fr_ge24_total_distance) ← NEW, config-independent
 *   band5…band8  = legacy run-length SLOTS 18–21 / 21–24 / 24–27 / 27+ s, read by run length from
 *                  the row's own edges (sumBandsBetween). 21 s and 27 s are not edges in the
 *                  Nov-2026 config, so from 10 Nov 2026 these are 0 and so is dominant_band (null).
 * Coach-scoped to the authenticated team. JSON field names (band5…band8, total,
 * acwr, status, dominant_band) are unchanged for consumers.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { computeImaRunningLoad, type ImaDayRow } from "@/lib/micropulse/imaRunningLoad";
import { sumBandsBetween } from "@/lib/integrations/catapult/freeRunningBands";

export const runtime = "nodejs";


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
        "ima_fr_band_bounds, ima_fr_ge18_total_distance, ima_fr_ge24_total_distance, " +
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
    ima_fr_band_bounds: Array<number | string> | null;
    ima_fr_ge18_total_distance: number | null;
    ima_fr_ge24_total_distance: number | null;
    players: { full_name: string | null } | { full_name: string | null }[] | null;
  };

  // Group the window by player.
  type DayRow = ImaDayRow & { long18to24: number; long24plus: number };
  const byPlayer = new Map<string, { name: string; rows: DayRow[] }>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const p = Array.isArray(r.players) ? r.players[0] : r.players;
    if (!byPlayer.has(r.player_id)) {
      byPlayer.set(r.player_id, { name: (p?.full_name ?? "—").trim(), rows: [] });
    }
    const raw = r as unknown as Record<string, unknown>;
    const total = Number(r.ima_fr_ge18_total_distance ?? r.ima_fr_band58_total_distance ?? 0) || 0;
    const ge24 = Number(r.ima_fr_ge24_total_distance ?? 0) || 0;
    byPlayer.get(r.player_id)!.rows.push({
      date: r.date,
      total,
      // Legacy slots by run length from this row's edges (0 when not readable under its config).
      band5: sumBandsBetween(raw, "total_distance", 18, 21) ?? 0,
      band6: sumBandsBetween(raw, "total_distance", 21, 24) ?? 0,
      band7: sumBandsBetween(raw, "total_distance", 24, 27) ?? 0,
      band8: sumBandsBetween(raw, "total_distance", 27) ?? 0,
      long18to24: Math.max(0, total - ge24),
      long24plus: ge24,
    });
  }

  // Only players with any long-run distance (bouts ≥18 s) on the
  // selected day appear in the day table — each enriched with their
  // acute:chronic volume-change context.
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
        long_18_24: todayRow.long18to24,
        long_24_plus: todayRow.long24plus,
        acwr: load.acwr,
        status: load.status,
        confident: load.confident,
        z: load.z,
        dominant_run_length: load.dominantRunLength, // config-independent (run length, not band number)
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  players.sort((a, b) => b.total - a.total);

  return NextResponse.json({ date: dateIso, players });
}

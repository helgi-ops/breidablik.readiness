/**
 * Match Movement (IMA) — the "driver" companion to GPS match comparison.
 *
 * GPS volume (distance, HSR) is usually similar match-to-match; what changes is
 * HOW a player moved — the inertial-movement signature (Niklas Virtanen: GPS =
 * engine, IMA = driver). This computes a per-player, per-match "movement
 * fingerprint" from Catapult IMA, normalised per minute so matches of different
 * length compare fairly. One engine feeds all three views:
 *   1. a player vs his own match-average (how was this match different?)
 *   2. match A vs match B (side by side)
 *   3. the whole squad in one match (who moved how)
 *
 * All five dimensions are movement TYPE, not volume:
 *   • totalPerMin       — overall IMA work rate
 *   • accelDecelRatio   — accelerate-heavy (>1) vs brake-heavy (<1)
 *   • codPerMin         — change-of-direction volume
 *   • codLeftPct        — directional balance (L/R asymmetry)
 *   • hiCadencePerMin   — high-cadence (sprint-type) stride rate
 * Citations: McBurnie 2022 (decel/CoD), di Prampero 2015, Buchheit 2014 norms.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { MovementFingerprint, MatchMovementRow, MatchMovementResult } from "./types";

// Re-export the client-safe types + dimension metadata from one place. The UI
// imports directly from ./types to avoid pulling this server module in.
export * from "./types";

type RawRow = {
  player_id: string;
  date: string;
  ima_total: number | null;
  ima_accel: number | null;
  ima_decel: number | null;
  ima_cod_left_high: number | null; ima_cod_left_medium: number | null; ima_cod_left_low: number | null;
  ima_cod_right_high: number | null; ima_cod_right_medium: number | null; ima_cod_right_low: number | null;
  ima_fr_band6_stride_count: number | null; ima_fr_band7_stride_count: number | null; ima_fr_band8_stride_count: number | null;
};

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const perMin = (v: number, min: number): number | null => (min > 0 ? v / min : null);

function fingerprintOf(row: RawRow, minutes: number): { fp: MovementFingerprint; raw: MatchMovementRow["raw"] } {
  const codLeft = n(row.ima_cod_left_high) + n(row.ima_cod_left_medium) + n(row.ima_cod_left_low);
  const codRight = n(row.ima_cod_right_high) + n(row.ima_cod_right_medium) + n(row.ima_cod_right_low);
  const codTotal = codLeft + codRight;
  const hiCadence = n(row.ima_fr_band6_stride_count) + n(row.ima_fr_band7_stride_count) + n(row.ima_fr_band8_stride_count);
  return {
    fp: {
      totalPerMin: row.ima_total == null ? null : perMin(n(row.ima_total), minutes),
      accelDecelRatio: ratio(n(row.ima_accel), n(row.ima_decel)),
      codPerMin: codTotal > 0 ? perMin(codTotal, minutes) : null,
      codLeftPct: codTotal > 0 ? (100 * codLeft) / codTotal : null,
      hiCadencePerMin: perMin(hiCadence, minutes),
    },
    raw: {
      imaTotal: row.ima_total ?? null,
      codTotal: codTotal || null,
      codLeft: codTotal > 0 ? codLeft : null,
      codRight: codTotal > 0 ? codRight : null,
      hiCadence: hiCadence || null,
    },
  };
}

const IMA_COLS =
  "player_id, date, ima_total, ima_accel, ima_decel, " +
  "ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, " +
  "ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low, " +
  "ima_fr_band6_stride_count, ima_fr_band7_stride_count, ima_fr_band8_stride_count";

/** Minimum minutes for a match to count — below this the per-minute rates are noisy. */
const MIN_MINUTES = 20;

export async function computeMatchMovement(args: { teamId: string; sinceDays?: number }): Promise<MatchMovementResult> {
  const { teamId, sinceDays = 400 } = args;
  const sb = getSupabaseAdmin();

  const { data: pl } = await sb.from("players").select("id, full_name, position").eq("team_id", teamId).eq("is_active", true);
  const players = ((pl ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>);
  const nameById = new Map(players.map((p) => [p.id, { name: p.full_name ?? "—", position: p.position ?? null }]));
  const playerIds = players.map((p) => p.id);
  if (playerIds.length === 0) return { teamId, matchDates: [], rows: [], playerAverages: {}, players: [] };

  const since = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - sinceDays);
    return d.toISOString().slice(0, 10);
  })();

  // Match minutes → which (player, date) are matches + how long they played.
  const { data: mm } = await sb
    .from("match_player_minutes")
    .select("player_id, match_date, minutes_played")
    .in("player_id", playerIds)
    .gte("match_date", since)
    .gte("minutes_played", MIN_MINUTES);
  const minutesByKey = new Map<string, number>();
  const matchDateSet = new Set<string>();
  for (const r of ((mm ?? []) as Array<{ player_id: string; match_date: string; minutes_played: number | null }>)) {
    if (r.minutes_played == null) continue;
    minutesByKey.set(`${r.player_id}|${r.match_date}`, Number(r.minutes_played));
    matchDateSet.add(r.match_date);
  }
  const matchDates = Array.from(matchDateSet).sort();
  if (matchDates.length === 0) return { teamId, matchDates: [], rows: [], playerAverages: {}, players: [] };

  // IMA rows for those match dates.
  const { data: extData } = await sb
    .from("player_external_load_daily")
    .select(IMA_COLS)
    .in("player_id", playerIds)
    .in("date", matchDates);
  const ext = ((extData ?? []) as unknown as RawRow[]);

  const rows: MatchMovementRow[] = [];
  for (const row of ext) {
    const minutes = minutesByKey.get(`${row.player_id}|${row.date}`);
    if (minutes == null) continue; // has IMA that day but wasn't a match appearance
    if (row.ima_total == null) continue; // no IMA captured
    const meta = nameById.get(row.player_id);
    if (!meta) continue;
    const { fp, raw } = fingerprintOf(row, minutes);
    rows.push({ player_id: row.player_id, name: meta.name, position: meta.position, match_date: row.date, minutes, fingerprint: fp, raw });
  }

  // Per-player averages (the "norm") — mean of each dimension across their matches.
  const byPlayer = new Map<string, MatchMovementRow[]>();
  for (const r of rows) {
    const arr = byPlayer.get(r.player_id) ?? [];
    arr.push(r);
    byPlayer.set(r.player_id, arr);
  }
  const playerAverages: Record<string, MovementFingerprint> = {};
  const playerList: MatchMovementResult["players"] = [];
  for (const [pid, prs] of byPlayer) {
    const mean = (key: keyof MovementFingerprint): number | null => {
      const vals = prs.map((r) => r.fingerprint[key]).filter((v): v is number => v != null);
      return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
    };
    playerAverages[pid] = {
      totalPerMin: mean("totalPerMin"),
      accelDecelRatio: mean("accelDecelRatio"),
      codPerMin: mean("codPerMin"),
      codLeftPct: mean("codLeftPct"),
      hiCadencePerMin: mean("hiCadencePerMin"),
    };
    const meta = nameById.get(pid);
    playerList.push({ player_id: pid, name: meta?.name ?? "—", position: meta?.position ?? null, matches: prs.length });
  }
  playerList.sort((a, b) => a.name.localeCompare(b.name));

  return { teamId, matchDates, rows, playerAverages, players: playerList };
}

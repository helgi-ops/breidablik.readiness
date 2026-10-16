import "server-only";

/**
 * Control-Chaos Continuum → Today signal loader. A thin bridge that finds the
 * team's players currently on the CCC (rehab_track_progress, track_key='ccc')
 * and projects each one's current gate read onto the minimal `CccGateReadLite`
 * the coach_signals `ccc_gate` adapter consumes. Reuses the exact same math the
 * Return-to-Training page uses (`loadCccInput` + `computeCccRead`) — no new data
 * layer, no duplicated compute.
 *
 * The gate's `allMet` (cleared to progress) depends only on the phase's exit
 * criteria + the force-plate numbers, not on the injury category, so the loader
 * passes a neutral category — the category only drives the descriptive
 * considerations on the full page, never the gate.
 *
 * READ-ONLY / ADVISORY — never reads-as or writes the readiness colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCccInput } from "./loader";
import { computeCccRead } from "./bands";
import { isCccPhaseKey, type CccPhaseKey } from "./continuum";
import type { CccGateReadLite } from "@/lib/micropulse/coachSignals";

type ProgressRow = { player_id: string; current_phase_key: string; status: string };

export async function loadTeamCccGateSignals(sb: SupabaseClient, teamId: string): Promise<CccGateReadLite[]> {
  const { data: progress } = await sb.from("rehab_track_progress")
    .select("player_id, current_phase_key, status")
    .eq("team_id", teamId).eq("track_key", "ccc").in("status", ["active", "paused"]);
  const rows = (progress ?? []) as ProgressRow[];
  if (rows.length === 0) return [];

  // One current CCC phase per player (latest active wins if duplicated).
  const phaseByPlayer = new Map<string, CccPhaseKey>();
  for (const r of rows) {
    if (!phaseByPlayer.has(r.player_id)) {
      phaseByPlayer.set(r.player_id, isCccPhaseKey(r.current_phase_key) ? r.current_phase_key : "high_control");
    }
  }
  const playerIds = [...phaseByPlayer.keys()];

  const { data: pl } = await sb.from("players").select("id, full_name").in("id", playerIds);
  const nameById = new Map((((pl ?? []) as Array<{ id: string; full_name: string | null }>)).map((p) => [p.id, p.full_name ?? "—"]));

  const reads = await Promise.all(playerIds.map(async (playerId): Promise<CccGateReadLite | null> => {
    try {
      const phaseKey = phaseByPlayer.get(playerId)!;
      const input = await loadCccInput(sb, teamId, playerId, phaseKey, "general");
      const read = computeCccRead(input);
      return {
        playerId,
        name: nameById.get(playerId) ?? "—",
        phase: { en: read.phase.name.en, is: read.phase.name.is },
        nextPhase: read.nextPhase ? { en: read.nextPhase.name.en, is: read.nextPhase.name.is } : null,
        allMet: read.gate.allMet,
        evaluable: read.gate.evaluable,
      };
    } catch {
      return null;
    }
  }));

  return reads.filter((r): r is CccGateReadLite => r != null);
}

/**
 * playerContext — the shared per-player context core
 *
 * `buildPlayerContext` loads each player domain ONCE (readiness inputs, external
 * load, force-plate, wellness, injury, conditioning, microcycle, movement
 * deficits, team config), attaching a per-source `status`, and exposes GOVERNED
 * VIEWS onto it. The four legacy per-player objects (PlayerStrengthSnapshot,
 * DailyAthleteSnapshot, TotalPlayerAnalysis, the deficit ledger) are being
 * converged so each becomes a view here rather than an independent re-loader.
 *
 * Stage 1 (this file): the core + the strength view. `strengthView(ctx)`
 * reproduces `PlayerStrengthSnapshot` byte-for-byte. Later stages add
 * `readinessView` / `performanceView` / `medicalView`, and the performance ⊥
 * readiness ⊥ medical walls become view-access rules (see ./wall).
 *
 * IMPORTANT: this is the ONLY IO entry. Consumers read a view, never raw domains,
 * and never re-query these tables themselves.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MdContext, PlayerStrengthSnapshot, SessionCorrective } from "../strengthProgramming/types";
import type { PaletteSlots } from "../strengthProgramming/palette";
import type { MdStructures } from "../strengthProgramming/structures";
import { loadSprintExposure } from "@/lib/micropulse/sprintExposure/loader";
import {
  fetchTeamContext,
  fetchTeamPalette,
  fetchScreenCorrectives,
  fetchLedgerEmphases,
  fetchSprintSpeedDrop,
  fetchCodAsymmetry,
  fetchValdAsymmetry,
  fetchDecelBurden,
  fetchWellness,
  fetchVerdict,
  fetchInjury,
  fetchVbtDecrement,
  fetchFoster,
  fetchCongestion,
  fetchMdContext,
} from "./domains";
import { strengthView } from "./views/strengthView";

export { strengthView };
export { assertNoMedicalLeak } from "./wall";

/** Per-source availability + recency. Freshness is COARSE in Stage 1 (available →
 *  "fresh", missing → "missing") because the strength domains don't all carry a
 *  read date; it gains real staleness when the dated readiness domains join in
 *  Stage 1b (aligning with `domain/snapshot/sourceStatus.ts`). Not surfaced
 *  through the strength view — it enriches the substrate without changing output. */
export type SourceStatus = { available: boolean; freshness: "fresh" | "stale" | "missing" };
export type Domain<T> = { data: T; status: SourceStatus };

const statusOf = (available: boolean): SourceStatus => ({ available, freshness: available ? "fresh" : "missing" });

type Side = "L" | "R" | null;

export type PlayerContext = {
  playerId: string;
  playerName?: string;
  todayIso: string;
  teamId: string | null;
  /** Stubbed null in Stage 1 (see domains.fetchVbtDecrement). */
  vbtDecrement: number | null;
  teamConfig: Domain<{ sport: string | null; seasonPhase: string | null; palette: PaletteSlots; mdStructures: MdStructures }>;
  externalLoad: Domain<{
    sprintDropPct: number | null;
    sprintBand: PlayerStrengthSnapshot["sprintExposureBand"];
    codAsymmetryPct: number | null;
    codWeakerSide: Side;
    decelBurdenBand: PlayerStrengthSnapshot["decelBurdenBand"];
    decelBurdenHighStreakDays: number;
  }>;
  forcePlate: Domain<{ valdAsymmetryPct: number | null; valdWeakerSide: Side }>;
  wellness: Domain<PlayerStrengthSnapshot["wellness"]>;
  verdict: Domain<{ action: PlayerStrengthSnapshot["verdict"] }>;
  injury: Domain<{ status: PlayerStrengthSnapshot["injuryStatus"] }>;
  conditioning: Domain<{ fosterMonotony: number | null; fosterStrain: number | null; isCongestedWeek: boolean }>;
  microcycle: Domain<{ mdContext: MdContext }>;
  movementDeficit: Domain<{ ledgerEmphases: string[]; correctives: SessionCorrective[]; correctiveEmphases: string[] }>;
};

export type BuildPlayerContextArgs = {
  playerId: string;
  playerName?: string;
  teamId: string | null;
  todayIso: string;
  /** Coach manual override of MD-context — bypasses the week_plans lookup. */
  mdContextOverride?: MdContext | null;
};

/** The sole IO entry. Runs every domain read in parallel (they don't depend on
 *  each other) and shapes the shared context. */
export async function buildPlayerContext(
  sb: SupabaseClient,
  args: BuildPlayerContextArgs,
): Promise<PlayerContext> {
  const { playerId, playerName, teamId, todayIso } = args;

  const [
    sprintSpeedDropPct,
    sprintExposurePayload,
    cod,
    decel,
    wellness,
    verdict,
    injuryStatus,
    vbtDecrement,
    foster,
    isCongestedWeek,
    mdContext,
    ledgerEmphases,
    screenCorrectives,
    teamPalette,
    valdAsym,
    teamContext,
  ] = await Promise.all([
    fetchSprintSpeedDrop(sb, playerId, todayIso),
    loadSprintExposure(sb, { playerId, todayIso, teamId: teamId ?? undefined }),
    fetchCodAsymmetry(sb, playerId, todayIso),
    fetchDecelBurden(sb, playerId, todayIso),
    fetchWellness(sb, playerId, todayIso),
    fetchVerdict(sb, playerId, todayIso),
    fetchInjury(sb, playerId),
    fetchVbtDecrement(sb, playerId, todayIso),
    fetchFoster(sb, playerId, todayIso),
    fetchCongestion(sb, playerId, todayIso),
    fetchMdContext(sb, teamId, todayIso, args.mdContextOverride ?? null),
    fetchLedgerEmphases(sb, playerId),
    fetchScreenCorrectives(sb, playerId),
    fetchTeamPalette(sb, teamId),
    fetchValdAsymmetry(sb, playerId, todayIso),
    fetchTeamContext(sb, teamId, todayIso),
  ]);

  const wellnessAvailable =
    wellness.sleepQuality != null || wellness.muscleSoreness != null ||
    wellness.fatigueEnergy != null || wellness.stressMood != null || wellness.soreAreas.length > 0;

  return {
    playerId,
    playerName,
    todayIso,
    teamId,
    vbtDecrement,
    teamConfig: {
      data: {
        sport: teamContext.sport,
        seasonPhase: teamContext.seasonPhase,
        palette: teamPalette.slots,
        mdStructures: teamPalette.mdStructures,
      },
      status: statusOf(
        teamContext.sport != null || teamContext.seasonPhase != null || Object.keys(teamPalette.slots).length > 0,
      ),
    },
    externalLoad: {
      data: {
        sprintDropPct: sprintSpeedDropPct,
        sprintBand: sprintExposurePayload.band,
        codAsymmetryPct: cod.pct,
        codWeakerSide: cod.weakerSide,
        decelBurdenBand: decel.band,
        decelBurdenHighStreakDays: decel.highStreak,
      },
      status: statusOf(
        sprintSpeedDropPct != null || sprintExposurePayload.band != null || cod.pct != null || decel.band != null,
      ),
    },
    forcePlate: {
      data: { valdAsymmetryPct: valdAsym.pct, valdWeakerSide: valdAsym.weakerSide },
      status: statusOf(valdAsym.pct != null),
    },
    wellness: { data: wellness, status: statusOf(wellnessAvailable) },
    verdict: { data: { action: verdict }, status: statusOf(verdict != null) },
    injury: { data: { status: injuryStatus }, status: statusOf(injuryStatus != null) },
    conditioning: {
      data: { fosterMonotony: foster.monotony, fosterStrain: foster.strain, isCongestedWeek },
      status: statusOf(foster.monotony != null),
    },
    // MD context always resolves (defaults to MD-3), so it is never "missing".
    microcycle: { data: { mdContext }, status: statusOf(true) },
    movementDeficit: {
      data: {
        ledgerEmphases,
        correctives: screenCorrectives.correctives,
        correctiveEmphases: screenCorrectives.emphases,
      },
      status: statusOf(ledgerEmphases.length > 0 || screenCorrectives.correctives.length > 0),
    },
  };
}

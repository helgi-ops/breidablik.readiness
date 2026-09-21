/**
 * Server assembly (I/O) for the position fitness-requirements read: pulls the player's MAS / MSS /
 * ASR (km/h) from the fitness-test resolvers and joins them to his athlete profile + position, then
 * calls the pure `buildPositionFitnessRequirements`. Measured MSS (higher of a max-sprint test and
 * the GPS season max) is preferred — see `resolveMss`. Descriptive — never touches readiness.
 */

import { resolveMas, resolveMss } from "@/lib/micropulse/load/speedZonesData";
import { buildPositionFitnessRequirements, type PositionFitnessRead } from "@/lib/micropulse/positionFitnessRequirements";
import type { AthleteProfile, QualityId } from "@/lib/micropulse/playerAnalysis/athleteProfile";

export async function loadPositionFitness(teamId: string, input: {
  playerId: string; name: string; position: string | null; subRole?: string | null; sport?: string | null;
  profile: AthleteProfile | null;
}): Promise<PositionFitnessRead> {
  const [masMap, mssMap] = await Promise.all([resolveMas(teamId), resolveMss(teamId)]);
  const mas = masMap.get(input.playerId)?.masKmh ?? null;
  const mss = mssMap.get(input.playerId)?.mssKmh ?? null;

  const fitnessValues: Partial<Record<QualityId, { value: number; unit: string }>> = {};
  if (mas != null) fitnessValues.aerobic_endurance = { value: mas, unit: "km/h" };
  if (mss != null) fitnessValues.speed = { value: mss, unit: "km/h" };
  if (mas != null && mss != null && mss > mas) {
    fitnessValues.anaerobic_reserve = { value: Math.round((mss - mas) * 10) / 10, unit: "km/h" };
  }

  return buildPositionFitnessRequirements({
    playerId: input.playerId, name: input.name, position: input.position,
    subRole: input.subRole, sport: input.sport, profile: input.profile, fitnessValues,
  });
}

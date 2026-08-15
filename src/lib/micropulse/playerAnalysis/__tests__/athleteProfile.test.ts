import { describe, it, expect } from "vitest";
import {
  buildAthleteProfile,
  QUALITIES,
  type SquadAthleteInput,
  type SquadAthletePlayer,
  type MetricSample,
} from "../athleteProfile";

const s = (value: number | null, extra: Partial<MetricSample> = {}): MetricSample => ({
  value, unit: "", source: "GPS", date: "2026-07-01", sampleSize: 6, ...extra,
});

/** A midfield squad where the target ("t") is clearly the fastest + top work capacity,
 *  but bottom of the pack for max strength. Enough same-position peers to rank by position. */
function squad(): SquadAthleteInput {
  const peers = [0.2, 0.4, 0.6, 0.8, 1.0]; // fractional rank knobs
  const players: SquadAthletePlayer[] = peers.map((f, i) => ({
    playerId: `p${i}`,
    name: `Peer ${i}`,
    position: "CM",
    signals: {
      speed: s(30 + f * 2, { unit: "km/h", source: "GPS" }),
      max_strength: s(30 + f * 10, { unit: "N/kg", source: "IMTP" }),
      work_capacity: s(300 + f * 100, { unit: "m/90", source: "GPS" }),
      robustness: s(4 + f * 6, { unit: "%", source: "ForceDecks" }), // asymmetry: lower = better
    },
  }));
  // target: fastest, most work, LEAST strong, most symmetric (lowest asymmetry)
  players.push({
    playerId: "t", name: "Target", position: "CM",
    signals: {
      speed: s(34.5, { unit: "km/h", source: "GPS" }),
      max_strength: s(28, { unit: "N/kg", source: "IMTP" }),
      work_capacity: s(460, { unit: "m/90", source: "GPS" }),
      robustness: s(2.5, { unit: "%", source: "ForceDecks" }),
      reactive_power: s(0.45, { unit: "", source: "ForceDecks" }),
      vbt_power: s(900, { unit: "W", source: "GymAware", series: [
        { date: "2026-05-01", value: 800 }, { date: "2026-06-01", value: 850 }, { date: "2026-07-01", value: 900 },
      ] }),
    },
  });
  return { players, sport: "football" };
}

describe("buildAthleteProfile", () => {
  it("returns null for an unknown player", () => {
    expect(buildAthleteProfile(squad(), "nope")).toBeNull();
  });

  it("ranks the target: fast + high work capacity = strengths, weak max strength = weakness", () => {
    const prof = buildAthleteProfile(squad(), "t")!;
    const by = Object.fromEntries(prof.qualities.map((q) => [q.id, q]));
    expect(by.speed.verdict).toBe("strength");
    expect(by.speed.positionPercentile).toBeGreaterThanOrEqual(70);
    expect(by.work_capacity.verdict).toBe("strength");
    expect(by.max_strength.verdict).toBe("weakness");
    expect(by.max_strength.positionPercentile).toBeLessThanOrEqual(30);
  });

  it("inverts percentile for a lower-is-better quality (asymmetry → most symmetric = top)", () => {
    const prof = buildAthleteProfile(squad(), "t")!;
    const rob = prof.qualities.find((q) => q.id === "robustness")!;
    // target has the LOWEST asymmetry, so it should rank at the TOP → strength.
    expect(rob.verdict).toBe("strength");
    expect(rob.positionPercentile).toBeGreaterThanOrEqual(70);
  });

  it("orients trend to improvement and reads a rising VBT series as rising", () => {
    const prof = buildAthleteProfile(squad(), "t")!;
    const vbt = prof.qualities.find((q) => q.id === "vbt_power")!;
    expect(vbt.trend).toBe("rising");
  });

  it("surfaces coverage: which sources + how many qualities have data", () => {
    const prof = buildAthleteProfile(squad(), "t")!;
    expect(prof.coverage.totalQualities).toBe(QUALITIES.length);
    expect(prof.coverage.qualitiesWithData).toBe(6); // 6 qualities populated for target
    expect(prof.coverage.sources.sort()).toEqual(["ForceDecks", "GPS", "GymAware", "IMTP"]);
    // acceleration / deceleration / change_of_direction + the two load-layer axes
    // (mechanical_power, peak_demands) have no data in this fixture → no_data verdict
    const noData = prof.qualities.filter((q) => q.verdict === "no_data").map((q) => q.id).sort();
    expect(noData).toEqual(["acceleration", "change_of_direction", "deceleration", "mechanical_power", "peak_demands"]);
  });

  it("degrades gracefully for a GPS-only player (no VALD / VBT)", () => {
    const input = squad();
    input.players.push({
      playerId: "gpsonly", name: "GPS Only", position: "CM",
      signals: { speed: s(31, { unit: "km/h" }), work_capacity: s(350, { unit: "m/90" }) },
    });
    const prof = buildAthleteProfile(input, "gpsonly")!;
    expect(prof.coverage.qualitiesWithData).toBe(2);
    expect(prof.coverage.sources).toEqual(["GPS"]);
    expect(prof.qualities.find((q) => q.id === "reactive_power")!.verdict).toBe("no_data");
    // still a valid, non-broken profile
    expect(prof.qualities.find((q) => q.id === "speed")!.value).toBe(31);
  });

  it("falls back to squad ranking when the position pool is too small, flagging benchmark=squad", () => {
    // A lone striker among midfielders → no same-position pool → ranks vs squad.
    const input = squad();
    input.players.push({
      playerId: "lonefwd", name: "Lone FWD", position: "CF",
      signals: { speed: s(35.5, { unit: "km/h" }) },
    });
    const prof = buildAthleteProfile(input, "lonefwd")!;
    const sp = prof.qualities.find((q) => q.id === "speed")!;
    expect(sp.benchmark).toBe("squad");
    expect(sp.positionPercentile).toBe(sp.squadPercentile);
    expect(sp.confidence).not.toBe("high"); // small/other pool never reads high
  });
});

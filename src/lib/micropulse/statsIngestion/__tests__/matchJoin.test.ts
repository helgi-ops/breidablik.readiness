import { describe, it, expect } from "vitest";
import { joinMatchFootballPhysical, type MatchFootball, type MatchPhysical, type MatchMinutes } from "../matchJoin";

const fb = (over: Partial<MatchFootball> & { playerId: string; matchDate: string }): MatchFootball => ({
  opponent: null, homeAway: null, minutes: 90, goals: 0, assists: 0, xg: 0, shots: 0, shotsOnTarget: 0, passAccuracyPct: null, ...over,
});

describe("joinMatchFootballPhysical", () => {
  it("returns [] when there is no football data (the pre-Adapter-B reality)", () => {
    expect(joinMatchFootballPhysical([], [{ playerId: "p1", matchDate: "2026-05-01", distanceKm: 10, topSpeed: 30, playerLoad: 500 }], [])).toEqual([]);
  });

  it("attaches physical + minutes on (player_id, match_date)", () => {
    const football = [fb({ playerId: "p1", matchDate: "2026-05-01", goals: 1 })];
    const physical: MatchPhysical[] = [{ playerId: "p1", matchDate: "2026-05-01", distanceKm: 10.5, topSpeed: 31.2, playerLoad: 520 }];
    const minutes: MatchMinutes[] = [{ playerId: "p1", matchDate: "2026-05-01", minutes: 88 }];
    const [row] = joinMatchFootballPhysical(football, physical, minutes);
    expect(row.goals).toBe(1);
    expect(row.physical).toEqual({ distanceKm: 10.5, topSpeed: 31.2, playerLoad: 520, matchMinutes: 88 });
  });

  it("keeps a football row even with no physical match (nulls, never fabricated)", () => {
    const [row] = joinMatchFootballPhysical([fb({ playerId: "p2", matchDate: "2026-05-08" })], [], []);
    expect(row.physical).toEqual({ distanceKm: null, topSpeed: null, playerLoad: null, matchMinutes: null });
  });

  it("does not cross-match a different date", () => {
    const [row] = joinMatchFootballPhysical(
      [fb({ playerId: "p1", matchDate: "2026-05-01" })],
      [{ playerId: "p1", matchDate: "2026-05-08", distanceKm: 9, topSpeed: 29, playerLoad: 400 }],
      [],
    );
    expect(row.physical.distanceKm).toBeNull();
  });

  it("sorts newest match first", () => {
    const rows = joinMatchFootballPhysical(
      [fb({ playerId: "p1", matchDate: "2026-05-01" }), fb({ playerId: "p1", matchDate: "2026-05-15" })],
      [], [],
    );
    expect(rows.map((r) => r.matchDate)).toEqual(["2026-05-15", "2026-05-01"]);
  });
});

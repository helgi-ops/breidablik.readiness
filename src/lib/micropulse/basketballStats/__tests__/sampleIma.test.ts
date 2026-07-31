import { describe, it, expect } from "vitest";
import { isDemoTeamName, sampleImaForGame } from "../sampleIma";

describe("isDemoTeamName", () => {
  it("matches demo/sample teams, not real clubs", () => {
    expect(isDemoTeamName("MicroPulse Körfubolta-sýnilið")).toBe(true);
    expect(isDemoTeamName("Demo Team")).toBe(true);
    expect(isDemoTeamName("Tindastóll")).toBe(false);
    expect(isDemoTeamName("Breiðablik")).toBe(false);
    expect(isDemoTeamName(null)).toBe(false);
  });
});

describe("sampleImaForGame", () => {
  const base = { playerId: "p1", gameId: "g1", minutes: 30, position: "SG" };

  it("is deterministic for the same player+game", () => {
    expect(sampleImaForGame(base)).toEqual(sampleImaForGame(base));
  });

  it("differs across players and games", () => {
    expect(sampleImaForGame(base)).not.toEqual(sampleImaForGame({ ...base, playerId: "p2" }));
    expect(sampleImaForGame(base)).not.toEqual(sampleImaForGame({ ...base, gameId: "g2" }));
  });

  it("produces realistic, positive basketball IMA", () => {
    const s = sampleImaForGame(base);
    expect(s.imaTotal).toBe(s.imaAccel + s.imaDecel + s.imaCoD);
    for (const v of Object.values(s)) expect(v).toBeGreaterThan(0);
    expect(s.imaCoD).toBeGreaterThan(s.imaAccel); // CoD is the dominant basketball event
    expect(s.playerLoad).toBeGreaterThan(200);
  });

  it("gives bigs more jumps than guards, guards more CoD than bigs", () => {
    const guard = sampleImaForGame({ ...base, position: "PG" });
    const big = sampleImaForGame({ ...base, position: "C" });
    expect(big.jumps).toBeGreaterThan(guard.jumps);
    expect(guard.imaCoD).toBeGreaterThan(big.imaCoD);
  });

  it("falls back to a default minute count when minutes are missing", () => {
    expect(sampleImaForGame({ ...base, minutes: null }).playerLoad).toBeGreaterThan(0);
  });
});

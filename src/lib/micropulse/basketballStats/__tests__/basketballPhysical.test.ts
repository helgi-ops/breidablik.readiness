import { describe, it, expect } from "vitest";
import { aggregatePhysical, buildPhysical, type TitanLine } from "../basketballPhysical";

describe("basketballPhysical", () => {
  it("averages each metric per player over the sessions that reported it", () => {
    const lines: TitanLine[] = [
      { playerId: "a", playerLoad: 100, impacts: 50, jumps: 10 },
      { playerId: "a", playerLoad: 200, impacts: 70, jumps: null },
      { playerId: "b", playerLoad: 60, impacts: 20, jumps: 4 },
    ];
    const pool = aggregatePhysical(lines);
    const a = pool.find((p) => p.playerId === "a")!;
    expect(a.sessions).toBe(2);
    expect(a.playerLoad).toBe(150);   // (100+200)/2
    expect(a.impacts).toBe(60);       // (50+70)/2
    expect(a.jumps).toBe(10);         // only one session reported jumps
  });

  it("ranks a player within the squad; null when they have no sessions", () => {
    const pool = aggregatePhysical([
      { playerId: "a", playerLoad: 150, impacts: 60, jumps: 10 },
      { playerId: "b", playerLoad: 60, impacts: 20, jumps: 4 },
    ]);
    const read = buildPhysical(pool, "a")!;
    expect(read.sessions).toBe(1);
    expect(read.metrics.find((m) => m.key === "playerLoad")!.percentile).toBe(100); // top of squad
    expect(read.avgPercentile).toBe(100);
    expect(buildPhysical(pool, "zzz")).toBeNull();
  });
});

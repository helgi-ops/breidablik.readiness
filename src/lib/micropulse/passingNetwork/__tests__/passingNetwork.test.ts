import { describe, it, expect } from "vitest";
import { buildPassingNetwork, topPassingLinks, type PassingPlayer, type PassingEdge } from "../index";
import { roleBandLayout, bandOf } from "../layout";

const players: PassingPlayer[] = [
  { ref: "a", name: "A", passes: 23, obv: 0.30 },
  { ref: "b", name: "B", passes: 18, obv: -0.16 },
  { ref: "c", name: "C", passes: 17, obv: 0.29 },
];
const edges: PassingEdge[] = [
  { passerRef: "a", passerName: "A", receiverRef: "c", receiverName: "C", passes: 6, obv: 0.17 },
  { passerRef: "c", passerName: "C", receiverRef: "a", receiverName: "A", passes: 9, obv: -0.01 },
  { passerRef: "a", passerName: "A", receiverRef: "b", receiverName: "B", passes: 3, obv: 0.37 },
];

describe("buildPassingNetwork", () => {
  it("sorts players by OBV and ranks links by volume and by OBV", () => {
    const r = buildPassingNetwork(players, edges);
    expect(r.players.map((p) => p.ref)).toEqual(["a", "c", "b"]); // OBV desc
    expect(r.topByVolume[0].passes).toBe(9); // C→A most frequent
    expect(r.topByObv[0].obv).toBeCloseTo(0.37, 2); // A→B most valuable
  });
  it("computes scaling constants for the SVG", () => {
    const r = buildPassingNetwork(players, edges);
    expect(r.maxPlayerPasses).toBe(23);
    expect(r.maxEdgePasses).toBe(9);
    expect(r.obvMax).toBeCloseTo(0.37, 2);
    expect(r.obvMin).toBeLessThan(0);
    expect(r.totalPasses).toBe(58);
  });
  it("degrades on empty input", () => {
    const r = buildPassingNetwork([], []);
    expect(r.players).toHaveLength(0);
    expect(r.maxEdgePasses).toBe(0);
    expect(r.obvMin).toBe(0);
  });
});

describe("topPassingLinks", () => {
  it("splits a player's outgoing and incoming links and finds their best-value link", () => {
    const l = topPassingLinks(edges, { ref: "a" });
    expect(l.asPasser.map((e) => e.receiverRef)).toEqual(["c", "b"]); // by volume
    expect(l.asReceiver.map((e) => e.passerRef)).toEqual(["c"]);
    expect(l.bestValueOut?.receiverRef).toBe("b"); // A→B, OBV 0.37
  });
});

describe("roleBandLayout", () => {
  it("maps positions (EN + IS) to role bands", () => {
    expect(bandOf("GK")).toBe("GK");
    expect(bandOf("Markvörður")).toBe("GK");
    expect(bandOf("Centre Back")).toBe("DEF");
    expect(bandOf("Varnarmaður")).toBe("DEF");
    expect(bandOf("Central Midfield")).toBe("MID");
    expect(bandOf("Striker")).toBe("FWD");
    expect(bandOf("Framherji")).toBe("FWD");
    expect(bandOf(null)).toBe("MID");
  });
  it("places nodes in bands, spread within the pitch, GK deepest", () => {
    const nodes = roleBandLayout([
      { ref: "gk", name: "GK", position: "Goalkeeper" },
      { ref: "d1", name: "D1", position: "Left Back" },
      { ref: "d2", name: "D2", position: "Right Back" },
      { ref: "f1", name: "F1", position: "Striker" },
    ]);
    const gk = nodes.find((n) => n.ref === "gk")!;
    const f1 = nodes.find((n) => n.ref === "f1")!;
    expect(gk.band).toBe("GK");
    expect(gk.x).toBe(50); // single node centred
    expect(gk.y).toBeGreaterThan(f1.y); // GK deeper (own goal at high y)
    const d = nodes.filter((n) => n.band === "DEF");
    expect(d[0].x).not.toBe(d[1].x); // two defenders spread apart
    for (const n of nodes) { expect(n.x).toBeGreaterThanOrEqual(0); expect(n.x).toBeLessThanOrEqual(100); }
  });
});

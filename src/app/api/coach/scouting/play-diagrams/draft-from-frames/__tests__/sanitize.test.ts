import { describe, it, expect } from "vitest";
import { sanitizeDraftDiagram } from "../route";

describe("sanitizeDraftDiagram", () => {
  it("keeps a well-formed draft, clamps coords, defaults confidence to low", () => {
    const r = sanitizeDraftDiagram({
      name: "Spread ball-screen",
      playType: "pnrHandler",
      confidence: "bogus",
      note: "One broadcast angle.",
      diagram: {
        players: [
          { team: "off", x: 150, y: -5, ball: true, label: "1" }, // out of range → clamped
          { team: "off", x: 44, y: 30, label: "5" },
          { team: "def", x: 50, y: 60 },
        ],
        arrows: [
          { from: [48, 48], to: [45, 33], kind: "screen" },
          { from: [55, 22], to: [66, 46], kind: "dribble" },
        ],
      },
    }, "fallback");
    expect(r.name).toBe("Spread ball-screen");
    expect(r.playType).toBe("pnrHandler");
    expect(r.confidence).toBe("low"); // unknown confidence → low
    expect(r.diagram.players).toHaveLength(3);
    const h = r.diagram.players[0];
    expect(h.x).toBeLessThanOrEqual(98);
    expect(h.y).toBeGreaterThanOrEqual(2);
    expect(r.diagram.players.filter((p) => p.team === "off" && p.ball)).toHaveLength(1);
    expect(r.diagram.arrows).toHaveLength(2);
  });

  it("drops malformed players/arrows and invalid vocab", () => {
    const r = sanitizeDraftDiagram({
      playType: "not-a-type",
      diagram: {
        players: [{ team: "off", x: "nope", y: 30 }, { team: "off", x: 10, y: 10 }, null],
        arrows: [{ from: [1, 2] }, { from: [1, 2], to: [3, 4], kind: "teleport" }],
      },
    }, "fallback");
    expect(r.name).toBe("fallback");
    expect(r.playType).toBeNull();
    expect(r.diagram.players).toHaveLength(1);
    expect(r.diagram.arrows).toHaveLength(1);
    expect(r.diagram.arrows[0].kind).toBe("move"); // invalid kind → move
  });

  it("enforces a single ball-handler and caps counts", () => {
    const players = Array.from({ length: 20 }, (_, i) => ({ team: "off", x: 10 + i, y: 10 + i, ball: true }));
    const arrows = Array.from({ length: 30 }, () => ({ from: [1, 2], to: [3, 4], kind: "pass" }));
    const r = sanitizeDraftDiagram({ diagram: { players, arrows } }, "fallback");
    expect(r.diagram.players.length).toBeLessThanOrEqual(10);
    expect(r.diagram.arrows.length).toBeLessThanOrEqual(14);
    expect(r.diagram.players.filter((p) => p.ball)).toHaveLength(1);
  });

  it("returns an empty valid diagram for junk input (never throws)", () => {
    const r = sanitizeDraftDiagram("not an object", "fallback");
    expect(r.diagram.court).toBe("half");
    expect(r.diagram.players).toEqual([]);
    expect(r.confidence).toBe("low");
  });
});

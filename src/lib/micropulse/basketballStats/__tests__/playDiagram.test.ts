import { describe, it, expect } from "vitest";
import { buildPlayDiagram, sanitizePlayDiagram, PLAY_VIEW, playTypeLabel, type PlayColors, type PlayDiagram } from "../playDiagram";

const COLORS: PlayColors = { court: "#f4f2ec", line: "#8a93a0", off: "#de9328", def: "#5c6672", ball: "#2740e6", ink: "#14181c", arrow: "#14181c", paint: "#eef1fc" };

const FIXTURE: PlayDiagram = {
  court: "half",
  players: [
    { id: "1", team: "off", x: 53, y: 20, ball: true, label: "1" },
    { id: "5", team: "off", x: 44, y: 30, label: "5" },
    { id: "x1", team: "def", x: 50, y: 24, label: "" },
  ],
  arrows: [
    { from: [48, 48], to: [45, 33], kind: "screen" },
    { from: [55, 22], to: [66, 46], kind: "dribble", curve: 0.3 },
    { from: [44, 30], to: [52, 14], kind: "pass" },
    { from: [40, 40], to: [40, 20], kind: "move" },
  ],
};

describe("buildPlayDiagram — shared renderer (web + PDF parity)", () => {
  it("is a pure function: same JSON + colors → identical primitives", () => {
    const a = buildPlayDiagram(FIXTURE, COLORS);
    const b = buildPlayDiagram(FIXTURE, COLORS);
    expect(a).toEqual(b); // the web <svg> and the PDF <Svg> consume this exact list
    expect(a.w).toBe(PLAY_VIEW.w);
    expect(a.h).toBe(PLAY_VIEW.h);
  });

  it("draws the court, then every arrow and player", () => {
    const { prims } = buildPlayDiagram(FIXTURE, COLORS);
    // Court comes first (boundary path is the first primitive).
    expect(prims[0].t).toBe("path");
    // The ball-handler gets a filled ball dot (an extra circle filled in the ball colour).
    expect(prims.some((p) => p.t === "circle" && p.fill === COLORS.ball)).toBe(true);
    // The defender renders as an X (two crossing lines in the def colour).
    expect(prims.filter((p) => p.t === "line" && p.stroke === COLORS.def).length).toBe(2);
    // Arrowheads are polygons; move/dribble/pass each add one (screen uses a bar, no head).
    expect(prims.filter((p) => p.t === "polygon").length).toBe(3);
    // The pass arrow is dashed.
    expect(prims.some((p) => (p.t === "line" || p.t === "path") && "dash" in p && p.dash === "2 2")).toBe(true);
    // Labels render as text.
    expect(prims.filter((p) => p.t === "text").length).toBeGreaterThanOrEqual(2);
  });

  it("is empty-safe (no diagram → just the court)", () => {
    const { prims } = buildPlayDiagram(null, COLORS);
    expect(prims.length).toBeGreaterThan(0);
    expect(prims.every((p) => p.t !== "polygon")).toBe(true); // no arrows
  });

  it("play-type labels resolve bilingually", () => {
    expect(playTypeLabel("pnrHandler", "EN")).toMatch(/Pick & roll/);
    expect(playTypeLabel("pnrHandler", "IS")).toMatch(/Skýling/);
  });
});

describe("sanitizePlayDiagram", () => {
  it("clamps coords, validates vocab, caps counts and keeps one ball-handler", () => {
    const d = sanitizePlayDiagram({
      players: [
        { team: "off", x: 150, y: -5, ball: true, label: "1" },
        { team: "off", x: 50, y: 50, ball: true, label: "2" }, // second ball ignored
        { team: "weird", x: 10, y: 10 },                        // unknown team → off
        { team: "def", x: 20, y: 20, label: "X" },
      ],
      arrows: [
        { from: [0, 0], to: [200, 200], kind: "dribble" },
        { from: [10, 10], to: [20, 20], kind: "nonsense" },    // unknown kind → move
        { to: [5, 5], kind: "pass" },                          // no from → dropped
      ],
    });
    expect(d.court).toBe("half");
    expect(d.players).toHaveLength(4);
    expect(d.players[0]).toMatchObject({ team: "off", x: 100, y: 0, ball: true }); // clamped 150→100, -5→0
    expect(d.players.filter((p) => p.ball)).toHaveLength(1);                        // only the first
    expect(d.players[2].team).toBe("off");                                          // unknown → off
    expect(d.arrows).toHaveLength(2);                                               // the from-less one dropped
    expect(d.arrows[0].to).toEqual([100, 94]);                                      // clamped to court
    expect(d.arrows[1].kind).toBe("move");                                          // unknown → move
  });
  it("never throws on junk and yields an empty-but-valid diagram", () => {
    expect(sanitizePlayDiagram(null)).toEqual({ court: "half", players: [], arrows: [] });
    expect(sanitizePlayDiagram("nope")).toEqual({ court: "half", players: [], arrows: [] });
  });
});

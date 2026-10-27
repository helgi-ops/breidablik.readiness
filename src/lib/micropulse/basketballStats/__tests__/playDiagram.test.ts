import { describe, it, expect } from "vitest";
import { buildPlayDiagram, PLAY_VIEW, playTypeLabel, type PlayColors, type PlayDiagram } from "../playDiagram";

const COLORS: PlayColors = { court: "#f4f2ec", line: "#8a93a0", off: "#de9328", def: "#5c6672", ball: "#2740e6", ink: "#14181c", arrow: "#14181c" };

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
    // A ball-handler gets a highlight ring (an extra circle in the ball colour).
    expect(prims.some((p) => p.t === "circle" && p.stroke === COLORS.ball)).toBe(true);
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

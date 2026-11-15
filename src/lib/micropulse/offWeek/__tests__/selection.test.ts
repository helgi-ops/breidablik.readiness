import { describe, expect, it } from "vitest";
import { nextPicked, packFilename } from "../selection";

const ids = ["a", "b", "c", "d"];

describe("off-week pick", () => {
  it("first load picks everyone", () => {
    expect([...nextPicked(null, ids)]).toEqual(ids);
  });

  it("ticks survive a regenerate", () => {
    expect([...nextPicked(new Set(["b", "d"]), ids)]).toEqual(["b", "d"]);
  });

  it("a player no longer in the list drops out", () => {
    expect([...nextPicked(new Set(["b", "x"]), ids)]).toEqual(["b"]);
  });

  it("nothing in common (another list) picks everyone", () => {
    expect([...nextPicked(new Set(["x", "y"]), ids)]).toEqual(ids);
  });

  it("a cleared pick stays cleared", () => {
    expect(nextPicked(new Set(), ids).size).toBe(0);
  });

  it("file name: team pack when all, count otherwise", () => {
    expect(packFilename(4, 4)).toBe("off-week-team-pack.pdf");
    expect(packFilename(2, 4)).toBe("off-week-2-players.pdf");
  });
});

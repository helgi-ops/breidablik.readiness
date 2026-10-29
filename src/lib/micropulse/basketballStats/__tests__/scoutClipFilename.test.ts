import { describe, it, expect } from "vitest";
import { parseScoutClipFilename } from "../scoutClipFilename";

describe("parseScoutClipFilename", () => {
  it("reads player, quarter and start clock from an InStat clip name", () => {
    expect(parseScoutClipFilename("farhiya_abdi_-_1st_quarter_9_52_-_10_2.mp4")).toEqual({ player: "Farhiya Abdi", period: "Q1", clock: "9:52" });
  });
  it("handles q-style quarters and no player", () => {
    expect(parseScoutClipFilename("q3_05_14.mp4")).toEqual({ player: null, period: "Q3", clock: "5:14" });
  });
  it("degrades to nulls on an unrecognised name", () => {
    expect(parseScoutClipFilename("clip.mov")).toEqual({ player: "Clip", period: null, clock: null });
  });
});

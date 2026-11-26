import { describe, expect, it } from "vitest";
import { kpiGroup, kpiWhat, kpiWhatWhy, plainKpiName } from "../kpiPlainNames";

describe("kpiPlainNames", () => {
  it("the pre-season sentence is unchanged (what + why)", () => {
    // The exact strings the pre-season table showed before the split.
    expect(kpiWhatWhy("totalDistance")?.en).toBe("All the running in the week. The aerobic base: built high and early.");
    expect(kpiWhatWhy("decelB23")?.en).toBe("Hard braking: the biggest strain on muscles and tendons, so it starts a little below speed-ups.");
    expect(kpiWhatWhy("decelB23")?.is).toBe("Kröftug hemlun: mesta álagið á vöðva og sinar, svo hún byrjar aðeins undir hraðaaukningum.");
    expect(kpiWhatWhy("imaCod")?.en).toBe("Hard changes of direction. High strain on tissue, so it starts with braking.");
    expect(kpiWhatWhy("imaTotal")?.en).toBe("All hard speed-ups, brakes and turns together.");
    expect(kpiWhatWhy("nope")).toBeNull();
  });

  it("in-season: what only, closed as a sentence", () => {
    expect(kpiWhat("decelB23")?.en).toBe("Hard braking: the biggest strain on muscles and tendons.");
    expect(kpiWhat("velocityBand5")?.is).toBe("Hröð hlaup (HSR).");
  });

  it("groups, with an extra map for keys only one tab places", () => {
    expect(kpiGroup("velocityBand6")).toBe("speed");
    expect(kpiGroup("imaStrideHi")).toBe("other");
    expect(kpiGroup("imaStrideHi", { imaStrideHi: "run" })).toBe("run");
  });

  it("a second source of one action keeps its own label", () => {
    const used = new Set<string>();
    expect(plainKpiName("accelB23", { en: "Accel B2–3", is: "Hröðun B2–3" }, false, used)).toBe("Hard speed-ups");
    expect(plainKpiName("imaAccel", { en: "IMA accel", is: "IMA hröðun" }, false, used)).toBe("IMA accel");
    expect(plainKpiName("totalPlayerLoad", { en: "PlayerLoad", is: "PlayerLoad" }, true, used)).toBe("PlayerLoad");
  });
});

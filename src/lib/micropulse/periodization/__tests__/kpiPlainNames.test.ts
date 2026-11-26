import { describe, expect, it } from "vitest";
import { KPI_GROUP_OF, KPI_PLAIN, kpiGroup, kpiWhat, kpiWhatWhy, plainKpiName } from "../kpiPlainNames";

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

  it("groups — both tabs read the same map", () => {
    expect(kpiGroup("velocityBand6")).toBe("speed");
    expect(kpiGroup("somethingNew")).toBe("other");
  });

  it("the long-run stride count (imaStrideHi) has a group, a plain name and a sentence in both tabs", () => {
    expect(kpiGroup("imaStrideHi")).toBe("run");
    expect(plainKpiName("imaStrideHi", { en: "raw", is: "hrátt" }, true, new Set())).toBe("Skref í löngum hlaupum á leikhraða");
    expect(kpiWhat("imaStrideHi")?.en).toBe("Strides in long continuous runs at match pace (18 s or more, 11 km/h+). Jogs do not count.");
    expect(kpiWhatWhy("imaStrideHi")?.is).toBe("Skref í löngum samfelldum hlaupum á leikhraða (18 s eða lengur, 11 km/klst+). Skokk telst ekki með. Hlaupagrunnur, ekki hröð hlaup.");
  });

  it("every grouped variable has a plain name", () => {
    for (const k of Object.keys(KPI_GROUP_OF)) expect(KPI_PLAIN[k], k).toBeTruthy();
  });

  it("a second source of one action keeps its own label", () => {
    const used = new Set<string>();
    expect(plainKpiName("accelB23", { en: "Accel B2–3", is: "Hröðun B2–3" }, false, used)).toBe("Hard speed-ups");
    expect(plainKpiName("imaAccel", { en: "IMA accel", is: "IMA hröðun" }, false, used)).toBe("IMA accel");
    expect(plainKpiName("totalPlayerLoad", { en: "PlayerLoad", is: "PlayerLoad" }, true, used)).toBe("PlayerLoad");
  });
});

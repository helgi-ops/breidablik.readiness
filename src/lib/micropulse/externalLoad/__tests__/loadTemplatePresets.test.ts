/**
 * Every shipped MD-day preset puts the peak on MD-4 (coach's call 2026-11-24; Martín-García 2018).
 * The steep-taper preset keeps Owen's steeper fall toward the match, not his MD-3 peak.
 */
import { describe, expect, it } from "vitest";
import { LOAD_TEMPLATE_PRESETS, MARTIN_GARCIA_TEMPLATE, OWEN_CUPS_TEMPLATE } from "../loadTemplatePresets";

describe("load template presets", () => {
  it("every preset peaks on MD-4, then falls toward the match", () => {
    for (const p of Object.values(LOAD_TEMPLATE_PRESETS)) {
      const td = (d: string) => p.template[d]?.totalDistance ?? 0;
      expect(td("MD-4")).toBeGreaterThan(td("MD-3"));
      expect(td("MD-3")).toBeGreaterThan(td("MD-2"));
      expect(td("MD-2")).toBeGreaterThan(td("MD-1"));
    }
  });

  it("the steep taper ends lower than the default and says it is after Owen", () => {
    expect(OWEN_CUPS_TEMPLATE["MD-1"].totalDistance!).toBeLessThan(MARTIN_GARCIA_TEMPLATE["MD-1"].totalDistance!);
    expect(LOAD_TEMPLATE_PRESETS.owen_cups.desc.en).toMatch(/Owen put the peak on MD-3/);
  });
});

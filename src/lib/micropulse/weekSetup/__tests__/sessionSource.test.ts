import { describe, it, expect } from "vitest";
import { mapWeekSetupDayToMdContext } from "../sessionSource";
import { runWeekSetupSessionSourceValidation } from "../sessionSourceValidation";

/**
 * The Week-setup dose → MD-day mapping MUST match the canonical periodization
 * in loadPlan/forTeam.ts (MD_OF): FORCE=MD-4, NEURAL_VELOCITY=MD-3,
 * VELOCITY=MD-2, POLISH_CALM=MD-2, ACTIVATION=MD-1. This file gates that in CI
 * — the mapper previously drifted (POLISH/CALM was mislabelled MD-1, which
 * surfaced as "MD1" on the squad chip on an MD-2 day). Compact tokens: MDn = MD-n.
 */
describe("mapWeekSetupDayToMdContext — canonical periodization", () => {
  const md = (dose: string) => mapWeekSetupDayToMdContext({ doseFinal: dose });

  it("FORCE = MD-4", () => expect(md("FORCE")).toBe("MD4"));
  it("NEURAL VELOCITY = MD-3 (checked before generic VELOCITY)", () =>
    expect(md("NEURAL VELOCITY")).toBe("MD3"));
  it("VELOCITY = MD-2", () => expect(md("VELOCITY")).toBe("MD2"));
  it("POLISH / CALM = MD-2 (not MD-1)", () => expect(md("POLISH / CALM")).toBe("MD2"));
  it("ACTIVATION = MD-1 (split from POLISH/CALM)", () =>
    expect(md("ACTIVATION")).toBe("MD1"));
  it("OFF / RECOVERY = OFF", () => {
    expect(md("OFF")).toBe("OFF");
    expect(md("RECOVERY")).toBe("OFF");
  });

  it("built-in validation suite passes", () => {
    const r = runWeekSetupSessionSourceValidation();
    expect(r.failed).toBe(0);
  });
});

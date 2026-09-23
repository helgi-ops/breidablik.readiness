import { describe, it, expect } from "vitest";
import { composeWcsBrief } from "../wcsBrief";
import type { WcsTarget } from "../wcsDrillMatch";
import type { WcsTacticalRead } from "../wcsTactical";

const label = { en: "Wingers", is: "Kantmenn" };
const full: WcsTarget = { hsrPerMin: 90, accelDecelPerMin: 14, codPerMin: 4, playerLoadPerMin: 30, windowMin: 1, source: "position" };

describe("composeWcsBrief", () => {
  it("no target → an honest 'record data' headline, no demands", () => {
    const b = composeWcsBrief({ scopeLabel: label, target: null });
    expect(b.demands).toEqual([]);
    expect(b.headline.en).toMatch(/no worst-case data/i);
  });

  it("full target → a demand line + a design cue per quality present", () => {
    const b = composeWcsBrief({ scopeLabel: label, target: full });
    expect(b.demands.length).toBe(4);                    // HSR, A/D, CoD, PL
    expect(b.demands[0].en).toMatch(/90 m/);
    expect(b.designCues.some((c) => /small area/i.test(c.en))).toBe(true);   // accel/decel + CoD cue
    expect(b.designCues.some((c) => /large area/i.test(c.en))).toBe(true);   // HSR cue
    expect(b.designCues.some((c) => /tempo/i.test(c.en))).toBe(true);        // PL cue
    expect(b.headline.en).toMatch(/design a drill/i);
  });

  it("omits qualities with no data (never fabricated)", () => {
    const b = composeWcsBrief({ scopeLabel: label, target: { ...full, hsrPerMin: null, codPerMin: null } });
    expect(b.demands.length).toBe(2);                    // only A/D + PL
    expect(b.designCues.some((c) => /large area/i.test(c.en))).toBe(false); // no HSR → no HSR cue
    expect(b.confidence.en).toMatch(/2\/4/);
  });

  it("tactical situation is carried; off-ball is flagged needs-tracking", () => {
    const tac: WcsTacticalRead = { dominant: "recovery_run", dominantLabel: { en: "Recovery run", is: "Endurheimtar-hlaup" }, categories: ["transition"], offBall: true, confidence: "low", note: { en: "His worst case is an off-ball situation (Recovery run) — reliable context needs tracking data; read as a hint.", is: "x" } };
    const b = composeWcsBrief({ scopeLabel: label, target: full, tactical: tac });
    expect(b.situation).not.toBeNull();
    expect(b.situation!.en).toMatch(/hint/i);
  });

  it("group coverage line when supplied", () => {
    const b = composeWcsBrief({ scopeLabel: label, target: full, coverage: { contributing: 4, total: 6 } });
    expect(b.confidence.en).toMatch(/4\/6 players/);
  });
});

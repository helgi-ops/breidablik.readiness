import { describe, it, expect } from "vitest";
import {
  buildAvailabilityVerdict,
  buildAvailabilityBoard,
  toReadinessColor,
  toInjuryStatus,
  type AvailabilityInput,
} from "../index";

function base(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    playerId: "p1",
    name: "Test Player",
    position: "MF",
    readiness: "green",
    hasCheckinToday: true,
    injuryStatus: null,
    injuryType: null,
    bodyPart: null,
    rtpStage: null,
    estimatedReturn: null,
    minutesLast7: 0,
    matchesLast7: 0,
    acwr: null,
    ...overrides,
  };
}

describe("availabilityBoard — medical gate is authoritative", () => {
  it("injured → unavailable even when readiness is green", () => {
    const v = buildAvailabilityVerdict(base({ readiness: "green", injuryStatus: "injured", bodyPart: "hamstring" }));
    expect(v.tier).toBe("unavailable");
    expect(v.injury?.status).toBe("injured");
    expect(v.headline.EN).toMatch(/hamstring/i);
    expect(v.counterfactual?.EN).toMatch(/clearance/i);
  });

  it("rehabilitation → unavailable regardless of green readiness", () => {
    const v = buildAvailabilityVerdict(base({ readiness: "green", injuryStatus: "rehabilitation" }));
    expect(v.tier).toBe("unavailable");
    expect(v.confidence.band).toBe("high");
  });

  it("rtp_training → limited (returning, manage minutes)", () => {
    const v = buildAvailabilityVerdict(base({ readiness: "green", injuryStatus: "rtp_training", rtpStage: "running" }));
    expect(v.tier).toBe("limited");
    expect(v.injury).toBeNull(); // rtp shows as limited, injury detail lives in factors
    expect(v.factors.some((f) => f.tone === "amber")).toBe(true);
  });
});

describe("availabilityBoard — readiness gate for cleared players", () => {
  it("green + cleared → available", () => {
    const v = buildAvailabilityVerdict(base({ readiness: "green" }));
    expect(v.tier).toBe("available");
    expect(v.counterfactual).toBeNull();
  });

  it("red → limited (available but manage load)", () => {
    const v = buildAvailabilityVerdict(base({ readiness: "red" }));
    expect(v.tier).toBe("limited");
    expect(v.counterfactual?.EN).toMatch(/GREEN/);
  });

  it("yellow → limited (with adjustments)", () => {
    const v = buildAvailabilityVerdict(base({ readiness: "yellow" }));
    expect(v.tier).toBe("limited");
  });

  it("no check-in → available but low confidence, no counterfactual", () => {
    const v = buildAvailabilityVerdict(base({ readiness: "gray", hasCheckinToday: false }));
    expect(v.tier).toBe("available");
    expect(v.confidence.band).toBe("low");
    expect(v.counterfactual).toBeNull();
  });
});

describe("availabilityBoard — load advisory (never changes the tier)", () => {
  it("green + 2 matches in 7d → still available, but carries a load note", () => {
    const v = buildAvailabilityVerdict(base({ readiness: "green", matchesLast7: 2, minutesLast7: 175 }));
    expect(v.tier).toBe("available");
    expect(v.loadNote).not.toBeNull();
    expect(v.headline.EN).toMatch(/load/i);
  });

  it("acwr spike alone triggers the load note", () => {
    const v = buildAvailabilityVerdict(base({ readiness: "green", acwr: 1.6 }));
    expect(v.loadNote?.EN).toMatch(/1\.60/);
  });

  it("no congestion, no spike → no load note", () => {
    const v = buildAvailabilityVerdict(base({ readiness: "green", matchesLast7: 1, minutesLast7: 90, acwr: 1.1 }));
    expect(v.loadNote).toBeNull();
  });
});

describe("availabilityBoard — grouping + sorting", () => {
  it("groups by tier and orders limited by need (red→yellow→green)", () => {
    const board = buildAvailabilityBoard("2026-08-12", [
      base({ playerId: "a", name: "Anna", readiness: "yellow" }),
      base({ playerId: "b", name: "Bjorn", readiness: "red" }),
      base({ playerId: "c", name: "Cara", readiness: "green" }),
      base({ playerId: "d", name: "Dan", injuryStatus: "injured" }),
      base({ playerId: "e", name: "Eva", injuryStatus: "rtp_training" }),
    ]);
    expect(board.counts).toEqual({ available: 1, limited: 3, unavailable: 1 });
    // limited: red (Bjorn) first, then yellow (Anna), then rtp green (Eva)
    expect(board.limited[0].name).toBe("Bjorn");
    expect(board.available[0].name).toBe("Cara");
    expect(board.unavailable[0].name).toBe("Dan");
  });
});

describe("availabilityBoard — mappers", () => {
  it("toReadinessColor handles final_color variants", () => {
    expect(toReadinessColor("RED")).toBe("red");
    expect(toReadinessColor("Amber")).toBe("yellow");
    expect(toReadinessColor("green_plus")).toBe("green");
    expect(toReadinessColor(null)).toBe("gray");
  });

  it("toInjuryStatus normalises common spellings", () => {
    expect(toInjuryStatus("rehab")).toBe("rehabilitation");
    expect(toInjuryStatus("RTP")).toBe("rtp_training");
    expect(toInjuryStatus("cleared")).toBe("cleared");
    expect(toInjuryStatus("")).toBeNull();
  });
});

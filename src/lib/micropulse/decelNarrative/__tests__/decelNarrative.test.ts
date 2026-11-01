import { describe, it, expect } from "vitest";
import { buildDecelInterpretation, buildFallbackNarrative } from "../index";

const base = { player_name: "Player 10", position: "GUARD" as const };

describe("decelNarrative — Decel:Accel coupling direction (ratio is decel:accel)", () => {
  it("HIGH ratio (>1.2) reads as braking exceeds acceleration (decel-heavy)", () => {
    const interp = buildDecelInterpretation({
      ...base,
      accel_coupling: { flag: "yellow", recent_ratio: 1.62, healthy_range: "0.8 - 1.2" },
    });
    const phrase = interp.metrics.ad_coupling!.coach_phrase.toLowerCase();
    expect(phrase).toContain("braking exceeds acceleration");
    expect(phrase).toContain("decel-heavy");
    expect(phrase).not.toContain("acceleration exceeds braking");
  });

  it("LOW ratio (<0.8) reads as acceleration exceeds braking (accel-heavy)", () => {
    const interp = buildDecelInterpretation({
      ...base,
      accel_coupling: { flag: "yellow", recent_ratio: 0.6, healthy_range: "0.8 - 1.2" },
    });
    const phrase = interp.metrics.ad_coupling!.coach_phrase.toLowerCase();
    expect(phrase).toContain("acceleration exceeds braking");
    expect(phrase).toContain("accel-heavy");
  });
});

describe("decelNarrative — Decel:Sprint with no data (Kinexon / no IMA Free Running)", () => {
  it("flag 'unknown' → no_data, never a sprint-without-braking concern", () => {
    const interp = buildDecelInterpretation({
      ...base,
      sprint_coupling: { flag: "unknown", recent_ratio: 0, healthy_range: "0.5 - 1.5" },
    });
    const d = interp.metrics.d_sprint!;
    expect(d.direction).toBe("no_data");
    expect(d.severity).toBe("ok");
    expect(d.coach_phrase.toLowerCase()).not.toContain("sprinting without");
    // It must not drive the overall verdict…
    expect(interp.overall.has_any_red).toBe(false);
    // …and the deterministic fallback must not mention it.
    expect(buildFallbackNarrative(interp).toLowerCase()).not.toContain("sprint");
  });
});

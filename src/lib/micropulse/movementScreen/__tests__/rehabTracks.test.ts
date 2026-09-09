import { describe, it, expect } from "vitest";
import { REHAB_TRACKS, rehabTrackForCompensations } from "../correctives/rehabTracks";
import { CORRECTIVE_BY_SLUG } from "../correctives/registry";
import type { CompensationKey } from "../correctives/mapping";

describe("rehab tracks — data integrity", () => {
  it("every phase slug resolves to a real library exercise", () => {
    for (const track of Object.values(REHAB_TRACKS)) {
      for (const phase of track.phases) {
        for (const slug of phase.slugs) {
          expect(CORRECTIVE_BY_SLUG[slug], `${track.key}/${phase.key} → ${slug}`).toBeTruthy();
        }
      }
    }
  });

  it("phases are ordered 1..n and every phase has an exit criterion + citation", () => {
    for (const track of Object.values(REHAB_TRACKS)) {
      const orders = track.phases.map((p) => p.order);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
      for (const p of track.phases) {
        expect(p.exitCriteria.length).toBeGreaterThan(0);
        expect(p.citation.length).toBeGreaterThan(0);
      }
    }
  });

  it("every track has all four King principles surfaces (summary, principles, caveat, citation)", () => {
    for (const track of Object.values(REHAB_TRACKS)) {
      expect(track.summary.en.length).toBeGreaterThan(0);
      expect(track.principles.length).toBeGreaterThanOrEqual(2);
      expect(track.caveat.en).toMatch(/clinician/i);
      // King-family tracks cite King et al.; the low-back track cites the LBP
      // evidence base (Maher / Hayden / Saragiotto / McGill) honestly.
      expect(track.citation).toMatch(/King|Kotsifaki|Franklyn|Lin|Macrum|Maher|Hayden|Saragiotto|McGill/);
    }
  });

  it("the low-back track exists, carries a red-flag gate + protocol link, and honours the LBP evidence framing", () => {
    const t = REHAB_TRACKS.lumbar_spine;
    expect(t).toBeTruthy();
    expect(t.redFlags?.en).toMatch(/cauda equina/i);
    expect(t.coachPath).toBe("/coach/low-back");
    // Clinician clearance is the entry gate; plyo/cutting/RTS are later, gated phases.
    expect(t.phases[0].key).toBe("lumbar_clearance");
    expect(t.phases.map((p) => p.continuumStage)).toContain("motor_control");
    expect(t.principles.some((p) => /no single type is clearly superior/i.test(p.en))).toBe(true);
  });

  it("a trunk / lumbopelvic finding routes into the low-back track, entering at the foundation phase", () => {
    const view = rehabTrackForCompensations(["trunk_antirotation"] as CompensationKey[])!;
    expect(view.track).toBe("lumbar_spine");
    expect(view.entryPhaseKey).toBe("lumbar_foundation");
    expect(view.redFlags?.en).toMatch(/red flag/i);
    expect(view.coachPath).toBe("/coach/low-back");
  });
});

describe("rehabTrackForCompensations — screen findings → track + entry phase", () => {
  it("dynamic valgus maps into the ACL/knee strength-control phase and starts there", () => {
    const view = rehabTrackForCompensations(["dynamic_valgus"])!;
    expect(view.track).toBe("acl_knee");
    expect(view.entryPhaseKey).toBe("acl_strength_control");
    const entry = view.phases.find((p) => p.isEntry)!;
    expect(entry.indicated).toBe(true);
    expect(entry.key).toBe("acl_strength_control");
  });

  it("a reactive-strength / absorption finding indicates the plyometric phase", () => {
    const view = rehabTrackForCompensations(["low_reactive_strength"])!;
    expect(view.track).toBe("acl_knee");
    expect(view.phases.find((p) => p.key === "acl_plyometric")!.indicated).toBe(true);
  });

  it("earliest indicated phase is the entry when several fire", () => {
    const view = rehabTrackForCompensations(["poor_absorption", "dynamic_valgus"])!;
    // strength-control (order 2) precedes plyometric (order 3) → start at control
    expect(view.entryPhaseKey).toBe("acl_strength_control");
    expect(view.phases.filter((p) => p.indicated).map((p) => p.key).sort())
      .toEqual(["acl_plyometric", "acl_strength_control"]);
  });

  it("limited dorsiflexion routes to the ankle track", () => {
    const view = rehabTrackForCompensations(["limited_dorsiflexion"])!;
    expect(view.track).toBe("ankle");
    expect(view.entryPhaseKey).toBe("ankle_impairment");
  });

  it("a movement-quality-only flag (forward lean) maps to no rehab track", () => {
    expect(rehabTrackForCompensations(["forward_trunk_lean"] as CompensationKey[])).toBeNull();
  });

  it("the dominant track wins when compensations point to two tracks", () => {
    // two ACL comps vs one ankle comp → ACL/knee dominates
    const view = rehabTrackForCompensations(["dynamic_valgus", "limb_asymmetry", "limited_dorsiflexion"])!;
    expect(view.track).toBe("acl_knee");
  });

  it("no injury → the screen track is PREHAB, entered at the screen-indicated phase", () => {
    const view = rehabTrackForCompensations(["poor_absorption"])!;
    expect(view.mode).toBe("prehab");
    expect(view.entryPhaseKey).toBe("acl_plyometric"); // screen-indicated, not forced early
  });

  it("an ACTIVE injury forces its track, entered at the EARLIEST phase (clinician gates), mode = rehab", () => {
    // Screen says reactive-strength (plyometric phase) but the player is injured →
    // the injury's track wins and starts at phase 1, never the screen-advanced phase.
    const view = rehabTrackForCompensations(["low_reactive_strength"], { forceTrackKey: "acl_knee", injured: true })!;
    expect(view.track).toBe("acl_knee");
    expect(view.mode).toBe("rehab");
    expect(view.entryPhaseKey).toBe("acl_impairment"); // order 1, not acl_plyometric
  });

  it("a forced track works even when the screen maps elsewhere (injury is authoritative)", () => {
    const view = rehabTrackForCompensations(["dynamic_valgus"], { forceTrackKey: "lumbar_spine", injured: true })!;
    expect(view.track).toBe("lumbar_spine");
    expect(view.entryPhaseKey).toBe("lumbar_clearance");
  });
});

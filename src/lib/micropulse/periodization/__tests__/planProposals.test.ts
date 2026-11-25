import { describe, it, expect } from "vitest";
import { buildMacroProposal, mergeMacroDates, macroAcceptSummary, type MacroProposalInput } from "../macroProposal";
import { buildMesoProposal, mergeMesoMaps, mesoAcceptSummary, type MesoProposalInput } from "../mesoProposal";

const DAY = 86_400_000;
const add = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * DAY).toISOString().slice(0, 10);

// ── Macro ────────────────────────────────────────────────────────────────────────────────────────
const macroIn = (over: Partial<MacroProposalInput> = {}): MacroProposalInput => ({
  seasonYear: 2026, today: "2026-11-25",
  phases: [
    { key: "preseason", start: "2026-01-05", end: "2026-04-06", weeks: 13, matches: 4 },
    { key: "competitive", start: "2026-04-06", end: "2026-10-26", weeks: 29, matches: 27 },
    { key: "offseason", start: "2026-10-26", end: "2027-01-04", weeks: 10, matches: 0 },
  ],
  fixturesEstimated: false, fixtureCount: 31,
  saved: {}, edits: {}, fromScratch: false,
  ...over,
});

describe("macroProposal", () => {
  it("writes the season end once the last game has been played", () => {
    const p = buildMacroProposal(macroIn());
    expect(p.write).toEqual({ seasonEnd: "2026-10-26" });
    expect(p.confidence.level).toBe("high");
  });

  it("does not pin a season end while games are still to come", () => {
    const p = buildMacroProposal(macroIn({ today: "2026-06-01" }));
    expect(p.write.seasonEnd).toBeUndefined();
    expect(p.dates.find((d) => d.key === "seasonEnd")?.value).toBe("2026-10-26");
  });

  it("never pins an estimated season", () => {
    const p = buildMacroProposal(macroIn({ fixturesEstimated: true }));
    expect(p.write).toEqual({});
    expect(p.gaps.length).toBe(1);
    expect(p.confidence.level).toBe("moderate");
  });

  it("the coach's saved dates stand; a draft edit wins; null goes back to the rule", () => {
    const saved = { preseasonStart: "2026-01-12", seasonEnd: "2026-10-20" };
    expect(mergeMacroDates(saved, {}, false)).toEqual(saved);
    expect(mergeMacroDates(saved, { seasonEnd: "2026-10-30" }, false).seasonEnd).toBe("2026-10-30");
    expect(mergeMacroDates(saved, { preseasonStart: null }, false).preseasonStart).toBeUndefined();
    expect(mergeMacroDates(saved, {}, true)).toEqual({});
  });

  it("counts only dates that differ from what is saved", () => {
    expect(macroAcceptSummary({ seasonEnd: "2026-10-26" }, { seasonEnd: "2026-10-26" }).datesChanged).toBe(0);
    expect(macroAcceptSummary({}, { seasonEnd: "2026-10-26", preseasonStart: "2026-01-05" }).datesChanged).toBe(2);
  });

  it("flags a season with almost no games and no fixtures at all", () => {
    const few = buildMacroProposal(macroIn({ phases: [{ key: "competitive", start: "2027-04-10", end: "2027-04-10", weeks: 0, matches: 1 }], fixtureCount: 1 }));
    expect(few.gaps.some((g) => g.en.includes("Only 1 competitive game"))).toBe(true);
    expect(few.verdict.en).not.toContain("season ends");
    const none = buildMacroProposal(macroIn({ phases: [], fixtureCount: 0 }));
    expect(none.confidence.level).toBe("low");
    expect(none.write).toEqual({});
  });
});

// ── Meso ─────────────────────────────────────────────────────────────────────────────────────────
// A 20-week competitive season from Mon 5 Jan 2026 with a Saturday game every week except a 3-week gap.
const compStart = "2026-01-05";
const fixtures = Array.from({ length: 20 }, (_, w) => add(compStart, w * 7 + 5)).filter((_, w) => w < 8 || w > 10);
const mesoIn = (over: Partial<MesoProposalInput> = {}): MesoProposalInput => ({
  seasonYear: 2026, today: "2026-01-01",
  phases: [
    { key: "preseason", start: "2025-11-24", end: compStart },
    { key: "competitive", start: compStart, end: add(compStart, 20 * 7) },
  ],
  loadCurve: [], cadence: 4, matchLoad: null, fixtures, fixturesEstimated: false, breaks: [], offseasonBuildStart: null,
  saved: {}, edits: {}, fromScratch: false,
  ...over,
});

describe("mesoProposal", () => {
  it("plans only in-season blocks, never a zero-length one", () => {
    const { proposal } = buildMesoProposal(mesoIn());
    expect(proposal.blocks.length).toBeGreaterThan(0);
    for (const b of proposal.blocks) {
      expect(b.end > b.start).toBe(true);
      expect(b.start >= compStart).toBe(true);
    }
    expect(proposal.confidence.level).toBe("high");
    expect(proposal.cite.goals).toContain("Issurin 2010");
  });

  it("everything follows the rule when the coach set nothing; no automatic in-season light week", () => {
    const { proposal } = buildMesoProposal(mesoIn());
    expect(proposal.confidence.coachChoices).toBe(0);
    expect(proposal.blocks.every((b) => b.goalSource === "rule" && b.lengthSource === "rule" && b.lightWeek == null)).toBe(true);
  });

  it("a coach's goal, length and light week stand and are labelled as theirs", () => {
    const first = buildMesoProposal(mesoIn()).proposal.blocks[0];
    const light = add(first.start, 7);
    const { proposal, maps } = buildMesoProposal(mesoIn({ edits: { blockGoals: { [first.start]: "accum" }, blockWeeks: { [first.start]: 3 }, blockDeload: { [first.start]: light } } }));
    const b = proposal.blocks.find((x) => x.start === first.start)!;
    expect(b.goal).toBe("accum");
    expect(b.goalSource).toBe("coach");
    expect(b.weeks).toBe(3);
    expect(b.lengthSource).toBe("coach");
    expect(b.lightWeek).toBe(light);
    expect(b.lightSource).toBe("coach");
    expect(maps.blockGoals[first.start]).toBe("accum");
    expect(mesoAcceptSummary({}, maps)).toEqual({ lengths: 1, goals: 1, lightWeeks: 1 });
  });

  it("null in an edit sends a saved choice back to the rule; from scratch drops saved in-season choices", () => {
    const first = buildMesoProposal(mesoIn()).proposal.blocks[0];
    const saved = { blockGoals: { [first.start]: "transmute" }, blockWeeks: { "0": 6 } };
    expect(mergeMesoMaps(mesoIn({ saved, edits: { blockGoals: { [first.start]: null } } })).blockGoals[first.start]).toBeUndefined();
    const scratch = mergeMesoMaps(mesoIn({ saved: { blockGoals: { [first.start]: "transmute" } }, fromScratch: true }));
    expect(scratch.blockGoals[first.start]).toBeUndefined();
  });

  it("clamps block lengths to 2–8 weeks", () => {
    const first = buildMesoProposal(mesoIn()).proposal.blocks[0];
    expect(mergeMesoMaps(mesoIn({ edits: { blockWeeks: { [first.start]: 12 } } })).blockWeeks[first.start]).toBe(8);
    expect(mergeMesoMaps(mesoIn({ edits: { blockWeeks: { [first.start]: 1 } } })).blockWeeks[first.start]).toBe(2);
  });

  it("names a season with no competitive phase as a gap", () => {
    const { proposal } = buildMesoProposal(mesoIn({ phases: [{ key: "preseason", start: "2026-11-30", end: "2027-04-10" }, { key: "competitive", start: "2027-04-10", end: "2027-04-10" }], fixtures: ["2027-04-10"] }));
    expect(proposal.blocks).toEqual([]);
    expect(proposal.gaps[0].en).toContain("No competitive season");
  });
});

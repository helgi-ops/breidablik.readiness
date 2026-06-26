/**
 * Tests for execBriefing — the management (EXEC/GM) narrative.
 * Core guard: the verdict + briefing must NOT claim "strong" off thin coverage
 * (the bug a GM flagged), and the load trajectory bands must be correct.
 * Run: npx vitest src/lib/micropulse/__tests__/execBriefing.test.ts
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { availabilityVerdict, buildBriefing, confidenceFor, injuryNarrative, loadTrajectory, recoveryNarrative, trendPhrase } from "../execBriefing";

const avail = (cleared, managed = 0, unavailable = 0) => ({ cleared, managed, unavailable, total: cleared + managed + unavailable });

describe("availabilityVerdict — coverage honesty", () => {
  it("leads with the data gap when <50% of the squad has a reading (no false 'strong')", () => {
    const v = availabilityVerdict(avail(2), { withRead: 2, squad: 23, pct: 9 });
    expect(v.EN).toMatch(/too few to judge/i);
    expect(v.EN.toLowerCase()).not.toContain("strong");
    expect(v.IS).toMatch(/of fáir/i);
  });

  it("gives a real availability verdict once coverage is sufficient", () => {
    const v = availabilityVerdict(avail(18, 2, 0), { withRead: 20, squad: 23, pct: 87 });
    expect(v.EN).toMatch(/availability strong/i);
    expect(v.EN).toMatch(/87% checked in/);
  });

  it("says nothing's flagged when everyone assessed is cleared", () => {
    const v = availabilityVerdict(avail(20), { withRead: 20, squad: 23, pct: 87 });
    expect(v.EN).toMatch(/all assessed players cleared/i);
  });

  it("handles zero readings", () => {
    const v = availabilityVerdict(avail(0), { withRead: 0, squad: 23, pct: 0 });
    expect(v.EN).toMatch(/no readings/i);
  });
});

describe("buildBriefing — plain language + watch", () => {
  it("low coverage → briefing about the sample + watch adherence", () => {
    const { briefing, watch } = buildBriefing(avail(2), { withRead: 2, squad: 23, pct: 9 }, []);
    expect(briefing.EN).toMatch(/small sample/i);
    expect(briefing.EN).toMatch(/participation/i);
    expect(watch.EN).toMatch(/adherence/i);
  });

  it("good coverage with flags → 'being managed', not an alarm", () => {
    const { briefing, watch } = buildBriefing(avail(16, 3, 1), { withRead: 20, squad: 23, pct: 87 }, []);
    expect(briefing.EN).toMatch(/managed by the staff/i);
    expect(watch.EN).toMatch(/not an alarm/i);
  });

  it("good coverage, nobody flagged → reassuring watch line", () => {
    const { watch } = buildBriefing(avail(20), { withRead: 20, squad: 23, pct: 87 }, []);
    expect(watch.EN).toMatch(/nothing flagged/i);
  });
});

describe("trendPhrase", () => {
  it("returns null with fewer than 3 weeks", () => {
    expect(trendPhrase([{ clearedPct: 80 }, { clearedPct: 75 }])).toBeNull();
  });
  it("detects improvement / slip / steady", () => {
    expect(trendPhrase([{ clearedPct: 50 }, { clearedPct: 55 }, { clearedPct: 75 }, { clearedPct: 80 }]).EN).toMatch(/improved/i);
    expect(trendPhrase([{ clearedPct: 85 }, { clearedPct: 82 }, { clearedPct: 60 }, { clearedPct: 58 }]).EN).toMatch(/slipped/i);
    expect(trendPhrase([{ clearedPct: 78 }, { clearedPct: 80 }, { clearedPct: 79 }, { clearedPct: 81 }]).EN).toMatch(/steady/i);
  });
});

describe("loadTrajectory", () => {
  it("na when not enough days", () => {
    expect(loadTrajectory(300, 280, 3).band).toBe("na");
    expect(loadTrajectory(null, 280, 20).band).toBe("na");
  });
  it("building when acute >> chronic", () => {
    const r = loadTrajectory(345, 280, 20); // ratio 1.23
    expect(r.band).toBe("building");
    expect(r.briefing.EN).toMatch(/building/i);
  });
  it("easing when acute << chronic", () => {
    expect(loadTrajectory(220, 300, 20).band).toBe("easing");
  });
  it("sustained when acute ~ chronic", () => {
    expect(loadTrajectory(290, 300, 20).band).toBe("sustained");
  });
});

describe("injuryNarrative — aggregate, no detail", () => {
  it("none out → reassuring, no counts leaked", () => {
    const { label, briefing } = injuryNarrative({ out: 0, newRecent: 0, returnedRecent: 0, returningSoon: 0 });
    expect(label.EN).toMatch(/none/i);
    expect(briefing.EN).toMatch(/no players are currently sidelined/i);
  });
  it("summarises out + new + returned + expected-back in plain language", () => {
    const { label, briefing } = injuryNarrative({ out: 3, newRecent: 1, returnedRecent: 2, returningSoon: 1 });
    expect(label.EN).toBe("3 out");
    expect(briefing.EN).toMatch(/3 players are currently out through injury/i);
    expect(briefing.EN).toMatch(/1 new in the last two weeks/i);
    expect(briefing.EN).toMatch(/2 returned recently/i);
    expect(briefing.EN).toMatch(/1 expected back within a week/i);
  });
  it("singular grammar for one player", () => {
    expect(injuryNarrative({ out: 1, newRecent: 0, returnedRecent: 0, returningSoon: 0 }).briefing.EN).toMatch(/1 player is currently out/i);
  });
});

describe("recoveryNarrative — post-match rebound", () => {
  it("unavailable when no recent match (or match too old)", () => {
    expect(recoveryNarrative({ rebounded: 0, carrying: 0, assessed: 0, matchDate: null, daysAgo: null }).available).toBe(false);
    expect(recoveryNarrative({ rebounded: 5, carrying: 1, assessed: 6, matchDate: "2026-06-01", daysAgo: 20 }).available).toBe(false);
  });
  it("recovered well when most rebounded", () => {
    const r = recoveryNarrative({ rebounded: 16, carrying: 2, assessed: 18, matchDate: "2026-06-23", daysAgo: 2 });
    expect(r.available).toBe(true);
    expect(r.label.EN).toMatch(/recovered well/i);
    expect(r.briefing.EN).toMatch(/16 of 18 have rebounded to green/i);
    expect(r.briefing.EN).toMatch(/2 still carrying fatigue/i);
  });
  it("still recovering when many carry fatigue", () => {
    expect(recoveryNarrative({ rebounded: 4, carrying: 10, assessed: 14, matchDate: "2026-06-23", daysAgo: 2 }).label.EN).toMatch(/still recovering/i);
  });
});

describe("confidenceFor", () => {
  it("scales with coverage", () => {
    expect(confidenceFor(20, 23).level).toBe("high");
    expect(confidenceFor(13, 23).level).toBe("moderate");
    expect(confidenceFor(2, 23).level).toBe("low");
  });
});

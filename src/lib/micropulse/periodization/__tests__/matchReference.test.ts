import { describe, expect, it } from "vitest";
import { teamMatchReference, tmRefBand } from "../matchReference";
import { NEAR_FULL_MIN_MINUTES, NEAR_FULL_MIN_SAMPLE, NEAR_FULL_WINDOW_DAYS } from "../index";

const unit = (load: number | null, fellBack = false, distance: number | null = load == null ? null : 10000) =>
  ({ fellBack, load: { typical: load, peak: null }, distance: { typical: distance, peak: null } });

describe("teamMatchReference", () => {
  it("counts only players whose match unit carries a value", () => {
    const r = teamMatchReference([unit(900), unit(850), unit(null)]);
    expect(r.nPlayers).toBe(2);
    expect(r.nFellBack).toBe(0);
    expect(r.note.en).toContain("average of 2 players");
    expect(r.note.is).toContain("meðaltal 2 leikmanna");
  });

  it("says which matches and window define one match, read from the shared defaults", () => {
    const r = teamMatchReference([unit(900)]);
    expect(r.minMinutes).toBe(NEAR_FULL_MIN_MINUTES);
    expect(r.windowWeeks).toBe(Math.round(NEAR_FULL_WINDOW_DAYS / 7));
    expect(r.note.en).toContain(`${NEAR_FULL_MIN_MINUTES}+ min in the last ${r.windowWeeks} weeks`);
    expect(r.note.is).toContain(`${NEAR_FULL_MIN_MINUTES}+ mín síðustu ${r.windowWeeks} vikur`);
  });

  it("names players who fell back to the whole season", () => {
    const r = teamMatchReference([unit(900, true), unit(880), unit(870, true)]);
    expect(r.nFellBack).toBe(2);
    expect(r.note.en).toContain(`2 of them have fewer than ${NEAR_FULL_MIN_SAMPLE} such matches and use the whole season`);
    expect(r.note.is).toContain("2 þeirra eiga færri en");
    const one = teamMatchReference([unit(900, true)]);
    expect(one.note.en).toContain("1 of them has fewer than");
  });

  it("a distance-only unit still counts", () => {
    expect(teamMatchReference([unit(null, false, 9500)]).nPlayers).toBe(1);
  });

  it("no data → says so", () => {
    const r = teamMatchReference([unit(null)]);
    expect(r.nPlayers).toBe(0);
    expect(r.note.en).toMatch(/No player has a near-full match/);
  });
});

describe("tmRefBand", () => {
  it("below / within / above the research range, edges inclusive", () => {
    expect(tmRefBand(1.7, [1.8, 3.1])).toBe("below");
    expect(tmRefBand(1.8, [1.8, 3.1])).toBe("in");
    expect(tmRefBand(3.1, [1.8, 3.1])).toBe("in");
    expect(tmRefBand(3.2, [1.8, 3.1])).toBe("above");
  });
  it("no value or no range → null", () => {
    expect(tmRefBand(null, [1, 2])).toBeNull();
    expect(tmRefBand(2, null)).toBeNull();
  });
});

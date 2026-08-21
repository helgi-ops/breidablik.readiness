import { describe, it, expect } from "vitest";
import { zoneOf, aggregateZones, resolveExpected, EXPECTED_FG, ZONE_ORDER } from "../shotZones";

// Feed coords: x = length (0-100 over 28 m), y = width (0-100 over 15 m). foldShot maps
// x>50 onto the near half. Basket is at plot (75, 15.75).
describe("zoneOf", () => {
  it("classifies 2PT zones by geometry", () => {
    expect(zoneOf(4, 50, false)).toBe("restricted"); // right at the rim, centre
    expect(zoneOf(15, 50, false)).toBe("paint"); // deeper in the key, centre
    expect(zoneOf(20, 10, false)).toBe("midLeft"); // 2PT out wide left
    expect(zoneOf(20, 90, false)).toBe("midRight"); // 2PT out wide right
  });
  it("splits 3PT by bearing", () => {
    expect(zoneOf(30, 50, true)).toBe("threeTop"); // straight out, top of the arc
    expect(zoneOf(3, 4, true)).toBe("threeLC"); // deep left corner
    expect(zoneOf(3, 96, true)).toBe("threeRC"); // deep right corner
    expect(zoneOf(20, 20, true)).toBe("threeLW"); // left wing
    expect(zoneOf(20, 80, true)).toBe("threeRW"); // right wing
  });
  it("falls back sensibly with no coords", () => {
    expect(zoneOf(null, null, true)).toBe("threeTop");
    expect(zoneOf(null, null, false)).toBe("midCentre");
  });
});

describe("resolveExpected", () => {
  it("uses built-in defaults when the sample is too small", () => {
    const league = aggregateZones([
      { x: 4, y: 50, isThree: false, made: true },
      { x: 4, y: 50, isThree: false, made: false },
    ]);
    const { expected, leagueZones, leagueTotal } = resolveExpected(league);
    expect(leagueTotal).toBe(2);
    expect(leagueZones).toEqual([]); // below minTotal
    expect(expected).toEqual(EXPECTED_FG);
  });

  it("uses league FG% for a zone once it clears the sample gate", () => {
    // 700 restricted attempts at 70% (well above the 60 default), rest empty.
    const shots = Array.from({ length: 700 }, (_, i) => ({ x: 4, y: 50, isThree: false, made: i % 10 < 7 }));
    const { expected, leagueZones } = resolveExpected(aggregateZones(shots), { minTotal: 600, minPerZone: 40 });
    expect(leagueZones).toEqual(["restricted"]);
    expect(Math.round(expected.restricted)).toBe(70); // league-derived
    expect(expected.paint).toBe(EXPECTED_FG.paint); // untouched zone keeps the default
  });

  it("null league → all defaults", () => {
    const { expected, leagueZones } = resolveExpected(null);
    expect(leagueZones).toEqual([]);
    expect(expected).toEqual(EXPECTED_FG);
  });

  it("ZONE_ORDER covers every expected key", () => {
    expect(ZONE_ORDER.slice().sort()).toEqual(Object.keys(EXPECTED_FG).sort());
  });
});

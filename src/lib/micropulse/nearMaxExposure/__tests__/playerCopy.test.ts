import { describe, expect, it } from "vitest";
import { formatNearMaxForPlayer } from "../playerCopy";
import type { NearMaxRead } from "../index";

const read = (over: Partial<NearMaxRead> = {}): NearMaxRead => ({
  level: "due",
  daysSince: 12,
  lastDate: "2026-10-31",
  lastKmh: 29.4,
  ref: { kmh: 31.2, source: "gps_third_best", days: 64 },
  targetKmh: 28.1,
  confidence: "high",
  ...over,
});

const allText = (c: NonNullable<ReturnType<typeof formatNearMaxForPlayer>>, lang: "en" | "is") =>
  [c.title, c.verdict, ...c.facts, c.confidence, ...c.details].map((b) => b[lang]).join(" ");

describe("formatNearMaxForPlayer", () => {
  it("says nothing when the player is not overdue", () => {
    expect(formatNearMaxForPlayer(read({ level: "ok", daysSince: 4 }))).toBeNull();
  });

  it("due: one sentence, then last run, the speed that counts, and the coach line", () => {
    const c = formatNearMaxForPlayer(read())!;
    expect(c.level).toBe("due");
    expect(c.verdict.en).toBe("12 days since you last ran near your top speed.");
    expect(c.verdict.is).toBe("12 dagar síðan þú hljópst síðast nálægt hámarkshraða þínum.");
    expect(c.facts.map((f) => f.en)).toEqual([
      "Last time: 29.4 km/h on 31 October.",
      "A run at 28.1 km/h or faster counts.",
      "Your coach sees this reminder too and decides when a fast run fits the week.",
    ]);
    expect(c.facts[0].is).toBe("Síðast: 29,4 km/klst þann 31. október.");
    expect(c.facts[1].is).toBe("Sprettur á 28,1 km/klst eða hraðar telur.");
  });

  it("long gap: tells the player to build back in steps, never straight to a flat-out sprint", () => {
    const c = formatNearMaxForPlayer(read({ level: "long_gap", daysSince: 23 }))!;
    expect(c.level).toBe("long_gap");
    expect(c.facts[2].en).toContain("build your speed back up over a few sessions");
    expect(c.facts[2].en).toContain("Don't go straight to a flat-out sprint");
    expect(c.facts[2].is).toContain("Ekki fara beint í hámarkssprett");
  });

  it("Icelandic counts ending in 1 take the singular (21 dagur, 31 mældum degi), 11 does not", () => {
    expect(formatNearMaxForPlayer(read({ level: "long_gap", daysSince: 21 }))!.verdict.is).toContain("21 dagur síðan");
    expect(formatNearMaxForPlayer(read({ daysSince: 11 }))!.verdict.is).toContain("11 dagar síðan");
    expect(formatNearMaxForPlayer(read({ ref: { kmh: 31.2, source: "gps_third_best", days: 31 } }))!.confidence.is).toContain("31 mældum degi");
    expect(formatNearMaxForPlayer(read({ ref: { kmh: 31.2, source: "gps_third_best", days: 64 } }))!.confidence.is).toContain("64 mældum dögum");
  });

  it("no run found in the look-back: says so and drops the 'last time' line", () => {
    const c = formatNearMaxForPlayer(read({ level: "long_gap", daysSince: null, lastDate: null, lastKmh: null }))!;
    expect(c.verdict.en).toBe("No run near your top speed in your GPS data from the last 12 months.");
    expect(c.facts).toHaveLength(2);
    expect(c.facts[0].en).toBe("A run at 28.1 km/h or faster counts.");
  });

  it("names where the top speed comes from, behind the toggle", () => {
    const gps = formatNearMaxForPlayer(read())!;
    expect(gps.details[0].en).toContain("28.1 km/h is 90% of 31.2 km/h, your third-fastest day on GPS in the last 12 months");
    expect(gps.confidence.en).toBe("How sure: high. Your top speed rests on 64 measured days.");
    const test = formatNearMaxForPlayer(read({ ref: { kmh: 33, source: "sprint_test", days: 12 }, targetKmh: 29.7 }))!;
    expect(test.details[0].en).toBe("29.7 km/h is 90% of 33.0 km/h, your measured sprint test.");
    expect(test.confidence.en).toContain("measured sprint test");
    const thin = formatNearMaxForPlayer(read({ confidence: "moderate", ref: { kmh: 31.2, source: "gps_third_best", days: 14 } }))!;
    expect(thin.confidence.en).toBe("How sure: medium. Your top speed rests on only 14 measured days so far.");
  });

  it("cites the studies, keeps injury wording cautious, and never claims to be the colour", () => {
    for (const level of ["due", "long_gap"] as const) {
      const c = formatNearMaxForPlayer(read({ level, daysSince: level === "due" ? 12 : 30 }))!;
      const en = allText(c, "en");
      const is = allText(c, "is");
      expect(en).toContain("Malone 2017; Buchheit 2023; Edouard 2019");
      expect(en).toContain("associated with");
      expect(en).not.toMatch(/predict|causes|prevents|will get injured/i);
      expect(is).not.toMatch(/spáir|veldur|kemur í veg fyrir/i);
      expect(en).toContain("It does not change your readiness colour.");
      expect(is).toContain("Hún breytir ekki litnum þínum.");
      // Plain words in the first two layers: no sport-science shorthand.
      const front = [c.verdict, ...c.facts, c.confidence].map((b) => `${b.en} ${b.is}`).join(" ");
      expect(front).not.toMatch(/MSS|ACWR|HSR|%MaxV|exposure/i);
    }
  });
});

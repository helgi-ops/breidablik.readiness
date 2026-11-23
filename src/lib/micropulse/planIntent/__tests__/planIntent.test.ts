import { describe, expect, it } from "vitest";
import { sanitizeIntent, type IntentItem } from "../vocabulary";
import { readIntentByKeywords } from "../keywords";
import { extractJsonObject } from "../interpret";
import { mdLabelsForWeek, recommendPlan, suggestBlockGoal, type PlanContext } from "../recommend";

const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  scope: "week", start: "2026-05-04", weeks: 1, phase: "inseason", blockGoal: null,
  matchDates: [], repsPerSet: {}, noMatchWeek: null, mas: { withMas: 20, squad: 24 }, ...over,
});
const item = (goal: IntentItem["goal"], mode: IntentItem["mode"] = "build"): IntentItem => ({ goal, mode, quote: "" });
const gridText = (adv: ReturnType<typeof recommendPlan>, md: string) =>
  adv.grid.find((d) => d.md === md)?.items.map((i) => i.text.en).join(" | ") ?? "";

describe("sanitizeIntent — only what the coach wrote comes through", () => {
  const text = "Næstu fjórar vikur vil ég byggja upp hámarkshraða og halda styrk.";
  it("drops a quote that is not in the text, unknown goals and repeats", () => {
    const out = sanitizeIntent({
      items: [
        { goal: "max_speed", mode: "build", quote: "byggja upp  HÁMARKSHRAÐA" },
        { goal: "max_strength", mode: "maintain", quote: "halda styrk" },
        { goal: "rsa", mode: "build", quote: "hraðaþol" },
        { goal: "jump_rope", mode: "build", quote: "halda styrk" },
        { goal: "max_speed", mode: "reduce", quote: "hámarkshraða" },
      ],
      unclear: ["eitthvað annað", "fjórar vikur"],
    }, text, "ai");
    expect(out.items.map((i) => `${i.goal}:${i.mode}`)).toEqual(["max_speed:build", "max_strength:maintain"]);
    expect(out.unclear).toEqual(["fjórar vikur"]);
    expect(out.source).toBe("ai");
  });
  it("lets the coach's own list through without quotes", () => {
    expect(sanitizeIntent({ items: [{ goal: "power", mode: "nonsense" }] }, "", "coach").items).toEqual([{ goal: "power", mode: "build", quote: "" }]);
  });
});

describe("keyword read", () => {
  it("reads Icelandic goals with their direction", () => {
    const r = readIntentByKeywords("Næstu fjórar vikur vil ég byggja upp hámarkshraða og halda styrk.");
    expect(r.items.map((i) => `${i.goal}:${i.mode}`)).toEqual(["max_speed:build", "max_strength:maintain"]);
    expect(r.source).toBe("keywords");
  });
  it("takes the most specific goal: hraðaþol is RSA, hraðastyrkur is power", () => {
    expect(readIntentByKeywords("Bæta hraðaþol").items.map((i) => i.goal)).toEqual(["rsa"]);
    expect(readIntentByKeywords("Auka hraðastyrk").items.map((i) => i.goal)).toEqual(["power"]);
  });
  it("reads English and reduce", () => {
    const r = readIntentByKeywords("Keep strength, improve repeated sprint ability; less conditioning this week");
    expect(r.items.map((i) => `${i.goal}:${i.mode}`)).toEqual(["max_strength:maintain", "rsa:build", "aerobic_base:reduce"]);
  });
  it("freshness is always build and an unknown wish is shown, not guessed", () => {
    const r = readIntentByKeywords("Leikmenn ferskir fyrir leikinn. Ég vil betri sendingar.");
    expect(r.items.map((i) => `${i.goal}:${i.mode}`)).toEqual(["freshness:build"]);
    expect(r.unclear).toEqual(["Ég vil betri sendingar"]);
  });
});

describe("extractJsonObject", () => {
  it("reads JSON inside a code fence", () => {
    expect(extractJsonObject('```json\n{"items":[],"unclear":["x"]}\n```')).toEqual({ items: [], unclear: ["x"] });
    expect(extractJsonObject("no json")).toBeNull();
  });
});

describe("MD labels", () => {
  it("one match on Sunday after a Sunday match", () => {
    expect(mdLabelsForWeek("2026-05-04", ["2026-05-03", "2026-05-10"]).map((d) => d.md))
      .toEqual(["MD+1", "MD+2", "MD-4", "MD-3", "MD-2", "MD-1", "MD"]);
  });
  it("two matches (Wed + Sun)", () => {
    expect(mdLabelsForWeek("2026-05-04", ["2026-05-03", "2026-05-06", "2026-05-10"]).map((d) => d.md))
      .toEqual(["MD+1", "MD-1", "MD", "MD+1", "MD-2", "MD-1", "MD"]);
  });
});

describe("course example 1 — pre-season week 2 with a friendly on Saturday", () => {
  const c = ctx({ phase: "preseason", start: "2026-12-07", matchDates: ["2026-12-12"] });
  const adv = recommendPlan([item("max_strength"), item("aerobic_base"), item("hiit"), item("injury_prevention", "maintain")], c);

  it("lays the week out MD-5 … MD+1", () => {
    expect(adv.grid.map((d) => d.md)).toEqual(["MD-5", "MD-4", "MD-3", "MD-2", "MD-1", "MD", "MD+1"]);
  });
  it("strength uses the pre-season week rule (6 + 12 + 9) with no conflict", () => {
    const s = adv.recommendations.find((r) => r.goal === "max_strength")!;
    expect(s.headline.en).toContain("27 reps");
    expect(s.conflict).toBeNull();
    expect(gridText(adv, "MD-4")).toContain("12 reps");
  });
  it("two interval blocks on MD-4 and MD-3; the aerobic block is one ball game", () => {
    expect(gridText(adv, "MD-4")).toMatch(/15-15 runs 2 × 15 × 15 s at 105% of MAS, 15 s rest, 3 min between sets/);
    expect(gridText(adv, "MD-3")).toMatch(/Long intervals 4 × 4 min at 105% of MAS/);
    expect(adv.grid.flatMap((d) => d.items).filter((i) => i.goal === "aerobic_base")).toHaveLength(1);
  });
  it("nothing heavy on MD-2 / MD-1; prevention on MD-4 / MD-3 after training", () => {
    expect([...adv.grid.find((d) => d.md === "MD-2")!.items, ...adv.grid.find((d) => d.md === "MD-1")!.items].filter((i) => i.load === "high")).toHaveLength(0);
    expect(gridText(adv, "MD-4")).toContain("Nordic 4 × 5");
    expect(gridText(adv, "MD-3")).toContain("Copenhagen 4 × 6");
  });
  it("verdict names the goals and the match", () => {
    expect(adv.verdict.en).toMatch(/^All 4 goals fit this week \(one match\): Max strength \(build\)/);
  });
});

describe("course example 2 — in-season week, one match on Sunday", () => {
  const c = ctx({ matchDates: ["2026-05-03", "2026-05-10"] });
  const adv = recommendPlan([item("max_strength", "maintain"), item("max_speed"), item("power"), item("freshness")], c);

  it("keeps strength at 15 heavy reps (MD-4 9 + MD-3 6), nothing to change", () => {
    const s = adv.recommendations.find((r) => r.goal === "max_strength")!;
    expect(s.headline.en).toContain("15 heavy reps (MD-4 9 + MD-3 6)");
    expect(s.conflict).toBeNull();
  });
  it("top speed on MD-3, fast dose on MD-2 and MD-1, contrast on MD-3", () => {
    expect(gridText(adv, "MD-3")).toContain("flying sprints");
    expect(gridText(adv, "MD-3")).toContain("Contrast: a jump right after each heavy set");
    expect(gridText(adv, "MD-2")).toContain("Fast dose 4 × 4");
    expect(gridText(adv, "MD-1")).toContain("Fast dose 4 × 4");
    expect(gridText(adv, "MD+1")).toBe("");
  });
  it("all fit — freshness has no build conflict here", () => {
    expect(adv.recommendations.every((r) => !r.conflict)).toBe(true);
    expect(adv.verdict.en).toContain("All 4 goals fit");
  });
});

describe("situations that don't fit", () => {
  it("two-match week: no heavy day, building strength conflicts", () => {
    const adv = recommendPlan([item("max_strength"), item("max_speed")], ctx({ matchDates: ["2026-05-03", "2026-05-06", "2026-05-10"] }));
    expect(adv.recommendations.find((r) => r.goal === "max_strength")!.conflict).not.toBeNull();
    expect(adv.recommendations.find((r) => r.goal === "max_speed")!.conflict).not.toBeNull();
    expect(adv.verdict.en).toMatch(/^2 of 2 goals don't fit as written \(2 matches\)/);
  });
  it("building max strength in season goes past the week rule", () => {
    const adv = recommendPlan([item("max_strength")], ctx({ matchDates: ["2026-05-03", "2026-05-10"] }));
    expect(adv.recommendations[0].conflict?.en).toContain("15 heavy reps");
  });
  it("no MAS tests: the gap is named and confidence is low", () => {
    const adv = recommendPlan([item("hiit")], ctx({ matchDates: ["2026-05-03", "2026-05-10"], mas: { withMas: 2, squad: 24 } }));
    const r = adv.recommendations[0];
    expect(r.confidence).toBe("low");
    expect(r.facts[0].en).toContain("Only 2 of 24 players have a MAS test");
  });
  it("freshness + building conditioning pull against each other", () => {
    const adv = recommendPlan([item("freshness"), item("hiit")], ctx({ matchDates: ["2026-05-03", "2026-05-10"] }));
    expect(adv.recommendations.find((r) => r.goal === "freshness")!.conflict).not.toBeNull();
  });
  it("empty read says so", () => {
    expect(recommendPlan([], ctx()).verdict.en).toContain("Nothing read yet");
  });
});

describe("block goal", () => {
  it("speed and power point to Transmutation; freshness counts double", () => {
    expect(suggestBlockGoal([item("max_speed"), item("power")], null)).toBe("transmute");
    expect(suggestBlockGoal([item("max_strength"), item("freshness")], null)).toBe("realize");
    expect(suggestBlockGoal([item("max_strength", "maintain")], "accum")).toBeNull();
  });
  it("block scope leads with the block-goal recommendation and says 'each week'", () => {
    const adv = recommendPlan([item("max_strength"), item("aerobic_base")],
      ctx({ scope: "block", weeks: 4, phase: "preseason", blockGoal: "transmute", start: "2026-12-07", matchDates: ["2026-12-12"] }));
    const bg = adv.recommendations[0];
    expect(bg.goal).toBe("block_goal");
    expect(bg.suggestion?.en).toBe("Accumulation");
    expect(bg.now?.en).toBe("Transmutation");
    expect(adv.recommendations[1].headline.en).toContain("each week");
  });
});

describe("a week without a match follows the delivered weekday rule", () => {
  const c = ctx({ phase: "preseason", start: "2026-12-07", noMatchWeek: { mon: "strength", tue: "strength", thu: "power", sat: "light", sun: "rest" } });
  const adv = recommendPlan([item("max_strength")], c);
  it("splits 21 reps 12 + 9 and never puts two heavy days in a row", () => {
    expect(adv.recommendations[0].headline.en).toContain("21 reps");
    expect(adv.grid[0].items[0].text.en).toContain("12 reps");
    expect(adv.grid[1].items).toHaveLength(0);
    expect(adv.grid[1].football?.en).toBe("Light day (weekday plan)");
    expect(adv.grid[3].items[0].text.en).toContain("9 reps");
    expect(adv.grid[6].football?.en).toBe("Rest (weekday plan)");
  });
  it("off-season: building strength is flagged with off-season words, not in-season", () => {
    const off = recommendPlan([item("max_strength")], { ...c, phase: "offseason" });
    expect(off.recommendations[0].conflict?.en).toMatch(/^In the off-season/);
  });
});

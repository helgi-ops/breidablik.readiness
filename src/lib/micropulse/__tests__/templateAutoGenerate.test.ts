import { describe, it, expect } from "vitest";
import {
  generateYellow,
  generateRed,
  generateGreenPlus,
  type TemplateRecord,
} from "@/lib/micropulse/templateAutoGenerate";

function green(structure: TemplateRecord["structure"]): TemplateRecord {
  return {
    md_day: "MD-4",
    readiness_level: "GREEN",
    title: "🟢 MD-4 — Strength",
    structure,
    variant: "A",
  };
}

const stringify = (r: TemplateRecord) => JSON.stringify(r.structure);

describe("generateYellow — always less volume than GREEN, never identical", () => {
  it("reduces plain integer sets (5×5 → 4×5)", () => {
    const g = green([{ block: "A. Main", items: ["Back squat 5×5"] }]);
    const y = generateYellow(g);
    expect(y.structure[0].items[0]).toContain("4×5");
    expect(stringify(y)).not.toBe(stringify(g));
  });

  it("reduces a range and leaves reps alone (3–4 × 8–12 → 2–3 × 8–12)", () => {
    const g = green([{ block: "A. Main", items: ["Bench press 3–4 × 8–12"] }]);
    const y = generateYellow(g);
    expect(y.structure[0].items[0]).toBe("Bench press 2–3 × 8–12");
  });

  it("reduces English 'N sets' (3 sets of 6 → 2 sets of 6)", () => {
    const g = green([{ block: "A. Main", items: ["Nordic curl 3 sets of 6"] }]);
    const y = generateYellow(g);
    expect(y.structure[0].items[0]).toBe("Nordic curl 2 sets of 6");
  });

  it("GUARANTEE: when no set number exists, still ends up with less (trims an accessory)", () => {
    const g = green([
      { block: "Warm-up", items: ["Bike 5 min"] },
      { block: "A. Main", items: ["Nordic curl: high quality", "Hip thrust: heavy triple"] },
    ]);
    const y = generateYellow(g);
    // nothing numeric to reduce → the largest working block loses its last item
    expect(y.structure[1].items).toEqual(["Nordic curl: high quality"]);
    expect(stringify(y)).not.toBe(stringify(g));
  });

  it("never touches warm-up / cool-down blocks", () => {
    const g = green([
      { block: "Warm-up", items: ["Mini-band walk 2×10"] },
      { block: "A. Main", items: ["Squat 4×6"] },
    ]);
    const y = generateYellow(g);
    expect(y.structure[0]).toEqual(g.structure[0]);
  });

  it("holds across many shapes — YELLOW structure is never byte-identical to GREEN", () => {
    const samples: TemplateRecord["structure"][] = [
      [{ block: "A", items: ["Deadlift 3x3", "Row 3×10"] }],
      [{ block: "A", items: ["ISO hold 2 × 20–30 sek"] }],
      [{ block: "A", items: ["Clean 5 sett × 3"] }],
      [{ block: "A", items: ["Just a cue, no numbers", "Another cue"] }],
    ];
    for (const s of samples) {
      const g = green(s);
      expect(stringify(generateYellow(g))).not.toBe(stringify(g));
    }
  });
});

describe("potentiation-cluster formats (spelled-out numbers, rounds, rep-only trisets)", () => {
  it("reduces spelled-out 'Six Sets' and 'Two Rounds' on the same line", () => {
    const g = green([
      { block: "POTENTIATION CLUSTERS", items: [
        "1a. Deadlift 1 rep",
        "Complete Six Sets (total 6 reps each exercise) and Two Rounds - Rest between rounds is 90-120 sec",
      ] },
    ]);
    const y = generateYellow(g);
    const line = y.structure[0].items[1];
    expect(line).toContain("Five Sets");
    expect(line).toContain("One Round"); // singularised, no longer "Two Rounds"
    expect(line).not.toContain("Two Rounds");
    expect(line).toContain("total 6 reps"); // descriptive reps left alone
  });

  it("reduces a rep-only triset (5 reps → 4 reps) when the block has no set count", () => {
    const g = green([
      { block: "STRENGTH — Triset", items: [
        "2a Goblet squat 5 reps",
        "2b Chin-ups 5 reps",
        "3c Suitcase walk 40 m each arm",
      ] },
    ]);
    const y = generateYellow(g);
    expect(y.structure[0].items[0]).toBe("2a Goblet squat 4 reps");
    expect(y.structure[0].items[1]).toBe("2b Chin-ups 4 reps");
    expect(y.structure[0].items[2]).toBe("3c Suitcase walk 40 m each arm"); // distance untouched
  });

  it("GREEN+ raises 'Six Sets'/'Two Rounds' in the main potentiation block", () => {
    const g = green([
      { block: "POTENTIATION CLUSTERS", items: [
        "Complete Six Sets (total 6 reps each exercise) and Two Rounds - Rest 90-120 sec",
      ] },
      { block: "STRENGTH — Triset", items: ["2a Goblet squat 5 reps"] },
    ]);
    const gp = generateGreenPlus(g);
    const line = gp.structure[0].items[0];
    expect(line).toContain("Seven Sets");
    expect(line).toContain("Three Rounds");
    expect(gp.structure[1]).toEqual(g.structure[1]); // triset (not first block) untouched
  });
});

describe("generateGreenPlus — always more volume, focused on the first block", () => {
  it("boosts the FIRST working block and leaves accessories unchanged", () => {
    const g = green([
      { block: "Warm-up", items: ["Mini-band walk 2×10"] },
      { block: "A. Main", items: ["Back squat 5×5", "Bench 3×8"] },
      { block: "B. Accessory", items: ["Curl 3×12"] },
    ]);
    const gp = generateGreenPlus(g);
    expect(gp.readiness_level).toBe("GREEN_PLUS");
    expect(gp.structure[1].items[0]).toContain("6×5"); // main boosted
    expect(gp.structure[1].items[1]).toContain("4×8");
    expect(gp.structure[2]).toEqual(g.structure[2]); // accessory untouched
    expect(stringify(gp)).not.toBe(stringify(g));
  });

  it("GUARANTEE: when the main block has no set number, adds an extra top set", () => {
    const g = green([{ block: "A. Main", items: ["Nordic curl: high quality"] }]);
    const gp = generateGreenPlus(g);
    expect(gp.structure[0].items.length).toBe(2);
    expect(gp.structure[0].items[1]).toMatch(/Green\+/);
    expect(stringify(gp)).not.toBe(stringify(g));
  });
});

describe("the three variants are mutually distinct", () => {
  it("GREEN, GREEN+, YELLOW are all different volumes", () => {
    const g = green([{ block: "A. Main", items: ["Squat 4×6", "Bench 3×8"] }]);
    const gp = stringify(generateGreenPlus(g));
    const y = stringify(generateYellow(g));
    const base = stringify(g);
    expect(new Set([base, gp, y]).size).toBe(3);
  });

  it("RED keeps only warm-up / ISO / core", () => {
    const g = green([
      { block: "Warm-up", items: ["Bike 5 min"] },
      { block: "A. Main", items: ["Squat 5×5"] },
    ]);
    const r = generateRed(g);
    expect(r.readiness_level).toBe("RED");
    // no heavy main lift survives
    expect(JSON.stringify(r.structure)).not.toContain("Squat 5×5");
  });
});

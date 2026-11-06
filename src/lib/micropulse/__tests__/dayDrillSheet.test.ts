import { test } from "vitest";
import assert from "node:assert/strict";
import { buildDayDrillSheet, researchDayKey, researchDrillsForDay, researchDrillPrint, ideaText, toDrillPickInput, type ResearchDrillRow } from "../dayDrillSheet";

const row = (id: string, o: Partial<ResearchDrillRow>): ResearchDrillRow => ({
  id, drill_name: id, drill_format: id, source_citation: "Rampinini et al. 2007 — J Sports Sci 25(6):659-666", source_doi: "10.1080/02640410600811858",
  verified_from: "full_text", coach_encouragement: null, ...o,
});
const BANK: ResearchDrillRow[] = [
  row("3v3", { day_fit: ["mechanical"], finding_en: "about 90% of max heart rate", finding_is: "um 90% af hámarkspúls", field_length_m: "18.0", field_width_m: "30.0", area_per_player_m2: "90.00", reps: "3 × 4 min" }),
  row("3v3-quiet", { drill_format: "3v3", day_fit: ["mechanical"], coach_encouragement: false, finding_en: "about 89% of max heart rate" }),
  row("4v4-a", { drill_format: "4v4", day_fit: ["mechanical"] }),
  row("4v4-b", { drill_format: "4v4", day_fit: ["mechanical"], finding_en: "x" }),
  row("5v5", { day_fit: ["mechanical", "mixed"], finding_en: "x" }),
  row("unchecked", { day_fit: ["mechanical", "mixed", "locomotive", "topup", "activation"], verified_from: null, finding_en: "x" }),
  row("10v10", { day_fit: ["locomotive"] }),
  row("subs-topup", { day_fit: ["topup"], finding_en: "x" }),
];

test("researchDayKey: technical and activation share the low-load slot; top-up and recovery the day after a match", () => {
  assert.equal(researchDayKey({ stimulus: "mechanical" }), "mechanical");
  assert.equal(researchDayKey({ stimulus: "technical" }), "activation");
  assert.equal(researchDayKey({ stimulus: null, character: "ACTIVATION" }), "activation");
  assert.equal(researchDayKey({ stimulus: null, character: "TOPUP" }), "topup");
  assert.equal(researchDayKey({ stimulus: null, character: "recovery" }), "topup");
  assert.equal(researchDayKey({ stimulus: null, character: "OFF" }), null);
  assert.equal(researchDayKey({ stimulus: null, character: null }), null);
});

test("researchDrillsForDay: paired on day_fit, at most three, measured first, game sizes kept different", () => {
  const mech = researchDrillsForDay(BANK, { stimulus: "mechanical" });
  // 3v3, 4v4 and 5v5 before a second 4v4; the measured 4v4 before the unmeasured one.
  assert.deepEqual(mech.map((d) => d.id), ["3v3", "4v4-b", "5v5"]);
  assert.deepEqual(researchDrillsForDay(BANK, { stimulus: "mechanical" }, 5).map((d) => d.id), ["3v3", "4v4-b", "5v5", "4v4-a"]);
  assert.deepEqual(researchDrillsForDay(BANK, { stimulus: "locomotive" }).map((d) => d.id), ["10v10"]);
  assert.deepEqual(researchDrillsForDay(BANK, { stimulus: null, character: "RECOVERY" }).map((d) => d.id), ["subs-topup"]);
});

test("researchDrillsForDay: an unchecked row never prints, nor the no-encouragement twin, and a day with none stays empty", () => {
  const all = (["mechanical", "mixed", "locomotive"] as const).flatMap((stimulus) => researchDrillsForDay(BANK, { stimulus }, 10));
  assert.ok(!all.some((d) => d.id === "unchecked" || d.id === "3v3-quiet"));
  assert.equal(researchDrillsForDay(BANK, { stimulus: null, character: "ACTIVATION" }).length, 0);
  assert.equal(researchDrillsForDay(BANK, { stimulus: null, character: "OFF" }).length, 0);
  assert.equal(researchDrillsForDay([], { stimulus: "mixed" }).length, 0);
});

test("researchDrillPrint: the set-up the paper used, the measured fact, the short citation; nothing invented", () => {
  assert.deepEqual(researchDrillPrint(BANK[0], false), { name: "3v3", meta: "18 × 30 m · 90 m²/player · 3 × 4 min", finding: "about 90% of max heart rate", cite: "Rampinini et al. 2007" });
  assert.deepEqual(researchDrillPrint({ ...BANK[0], drill_name_is: "3v3 leikur" }, true), { name: "3v3 leikur", meta: "18 × 30 m · 90 m²/leikm. · 3 × 4 mín", finding: "um 90% af hámarkspúls", cite: "Rampinini et al. 2007" });
  // No pitch, no bouts, no finding recorded: the line is just the name and the citation.
  assert.deepEqual(researchDrillPrint(row("run", { source_citation: "Buchheit & Laursen 2013" }), true), { name: "run", meta: "", finding: "", cite: "Buchheit & Laursen 2013" });
});

test("buildDayDrillSheet: one row per training day type, with its MD days; an empty bank leaves the ideas", () => {
  const L = (en: string) => ({ en, is: en });
  const days = [
    { type: "topup" as const, md: "MD+1", label: L("Top-up") }, { type: "rest" as const, md: "MD+2", label: L("Rest") },
    { type: "mechanical" as const, md: "MD-4", label: L("Mechanical") }, { type: "mixed" as const, md: "MD-3", label: L("Mixed") },
    { type: "activation" as const, md: "MD-1", label: L("Activation") }, { type: "match" as const, md: "MD-0", label: L("Match") },
    { type: "mechanical" as const, md: "MD-5", label: L("Mechanical") }, { type: "mechanical" as const, md: "MD-4", label: L("Mechanical") },
  ];
  const sheet = buildDayDrillSheet({ days, rows: BANK, phase: "inseason" });
  assert.deepEqual(sheet.map((r) => r.type), ["mechanical", "mixed", "activation", "topup"]);
  assert.deepEqual(sheet[0].mds, ["MD-4", "MD-5"]);
  assert.deepEqual(sheet.map((r) => r.research.length), [3, 1, 0, 1]);
  assert.ok(sheet.every((r) => r.ideas.length >= 2)); // MD-1 has no study drill and still carries its ideas
  assert.match(ideaText(sheet[0].ideas[0], false), /3v3–4v4.*tight pitch.*3–5 min/);

  const bare = buildDayDrillSheet({ days, rows: [], phase: "inseason" });
  assert.ok(bare.every((r) => r.research.length === 0 && r.ideas.length >= 2));
});

test("toDrillPickInput: the session builder's row mapping (GPS decides the stimulus, else the stored one)", () => {
  assert.deepEqual(toDrillPickInput({ id: "a", drill_name: "A", category: "ssg", stimulus_type: "mixed", total_players: 12 }),
    { id: "a", name: "A", category: "ssg", stimulus: "mixed", areaPerPlayerM2: null, totalPlayers: 12 });
});

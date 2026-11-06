import { test } from "vitest";
import assert from "node:assert/strict";
import { buildDayDrillSheet, drillsForDay, ownDrillMeta, ideaText, type DrillLibraryRow } from "../dayDrillSheet";

const row = (id: string, o: Partial<DrillLibraryRow>): DrillLibraryRow => ({ id, drill_name: id, category: "ssg", ...o });
const LIB: DrillLibraryRow[] = [
  row("tight-a", { stimulus_type: "mechanical", total_players: 8 }),
  row("tight-b", { stimulus_type: "mechanical", total_players: 6, category: "possession" }),
  row("tight-c", { stimulus_type: "mechanical", total_players: 8, category: "transition" }),
  row("tight-d", { stimulus_type: "mechanical", total_players: 8, category: "finishing" }),
  row("open-a", { stimulus_type: "locomotive", total_players: 18, category: "running" }),
  row("match-a", { stimulus_type: "mixed", total_players: 14, area_per_player_m2: 130, duration_min: 10 }),
  row("rondo", { stimulus_type: "technical", total_players: 7, category: "possession" }),
];

test("drillsForDay: at most three of the coach's drills, matched on the day's stimulus", () => {
  const mech = drillsForDay(LIB, { stimulus: "mechanical" });
  assert.equal(mech.length, 3);
  assert.ok(mech.every((d) => d.id.startsWith("tight-")));
  assert.equal(drillsForDay(LIB, { stimulus: "locomotive" })[0].id, "open-a");
});

test("drillsForDay: activation reads as a technical day; MD+1 takes one drill per load; rest day none", () => {
  assert.equal(drillsForDay(LIB, { stimulus: null, character: "ACTIVATION" })[0].id, "rondo");
  const topup = drillsForDay(LIB, { stimulus: null, character: "TOPUP" });
  assert.deepEqual(topup.map((d) => d.id), ["open-a", "tight-a", "match-a"]);
  assert.deepEqual(drillsForDay(LIB, { stimulus: null, character: "RECOVERY" }).map((d) => d.id), topup.map((d) => d.id));
  assert.equal(drillsForDay(LIB, { stimulus: null, character: "OFF" }).length, 0);
  assert.equal(drillsForDay([], { stimulus: "mixed" }).length, 0);
});

test("ownDrillMeta: prints what the drill has recorded, and a measured pitch only", () => {
  const [m] = drillsForDay(LIB, { stimulus: "mixed" });
  assert.equal(m.id, "match-a");
  assert.equal(ownDrillMeta(m, false), "Small-sided game · 14 players · 130 m²/player · 10 min");
  assert.equal(ownDrillMeta(m, true), "Fámennur leikur · 14 leikm. · 130 m²/leikm. · 10 mín");
  // No recorded pitch: the area is an estimate from the player count, so it isn't printed as a fact.
  const [t] = drillsForDay(LIB, { stimulus: "mechanical" });
  assert.equal(t.areaM2, null);
  assert.doesNotMatch(ownDrillMeta(t, false), /m²/);
  assert.equal(ownDrillMeta({ id: "x", name: "x", category: "other", players: null, areaM2: null, durationMin: null }, false), "");
});

test("buildDayDrillSheet: one row per training day type, with its MD days; an empty library leaves the ideas", () => {
  const L = (en: string) => ({ en, is: en });
  const days = [
    { type: "topup" as const, md: "MD+1", label: L("Top-up") }, { type: "rest" as const, md: "MD+2", label: L("Rest") },
    { type: "mechanical" as const, md: "MD-4", label: L("Mechanical") }, { type: "mixed" as const, md: "MD-3", label: L("Mixed") },
    { type: "activation" as const, md: "MD-1", label: L("Activation") }, { type: "match" as const, md: "MD-0", label: L("Match") },
    { type: "mechanical" as const, md: "MD-5", label: L("Mechanical") }, { type: "mechanical" as const, md: "MD-4", label: L("Mechanical") },
  ];
  const sheet = buildDayDrillSheet({ days, rows: LIB, phase: "inseason" });
  assert.deepEqual(sheet.map((r) => r.type), ["mechanical", "mixed", "activation", "topup"]);
  assert.deepEqual(sheet[0].mds, ["MD-4", "MD-5"]);
  assert.ok(sheet.every((r) => r.ideas.length >= 2 && r.own.length >= 1 && r.own.length <= 3));
  assert.equal(sheet[3].lowMinutes, true);
  assert.equal(sheet[0].lowMinutes, false);
  assert.match(ideaText(sheet[0].ideas[0], false), /3v3–4v4.*tight pitch.*3–5 min/);

  const bare = buildDayDrillSheet({ days, rows: [], phase: "inseason" });
  assert.ok(bare.every((r) => r.own.length === 0 && r.ideas.length >= 2));
});

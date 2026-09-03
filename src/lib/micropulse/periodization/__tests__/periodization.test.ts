import { test } from "vitest";
import assert from "node:assert/strict";
import { detectSeasonPhases, buildMesoBlocks, intervalSpeedsFromMas, strengthFromVbt, dataReadiness, strengthDefaultForBlock, valdVolumeCap, teamAverages, positionGroup, mdWeekTargets, dataTier, classifyMatchWeek, congestedWeeks, matchAxisTargets, type WeekLoad, type SessionRow, type TeamAverages } from "../index";

test("detectSeasonPhases: pre-season before first fixture + competitive across the fixtures", () => {
  const fixtures = [{ date: "2026-04-10" }, { date: "2026-05-01" }, { date: "2026-09-11" }];
  const ph = detectSeasonPhases(fixtures, "2026-02-02");
  assert.equal(ph.length, 2);
  assert.equal(ph[0].key, "preseason");
  assert.equal(ph[0].start, "2026-02-02");   // data start (before first fixture)
  assert.equal(ph[0].end, "2026-04-10");
  assert.equal(ph[1].key, "competitive");
  assert.equal(ph[1].matches, 3);
  assert.match(ph[1].rationale.en, /3 matches/);
});

test("buildMesoBlocks: leads with TMr, deloads on a sharp acute-load rise, ACWR is a contested view", () => {
  // 12 weeks; a clear jump in block 2 (weeks 5-8) vs the prior 4-week acute mean.
  const weeks: WeekLoad[] = [];
  const base = Date.parse("2026-04-06");
  for (let i = 0; i < 12; i++) {
    const load = i >= 4 && i < 8 ? 4200 : 2000; // block 2 doubles the load → sharp rise
    weeks.push({ weekStart: new Date(base + i * 7 * 86_400_000).toISOString().slice(0, 10), load, readiness: 70 });
  }
  const matchLoad = 700; // one match ≈ 700 load units → TMr expresses the week in match units
  const blocks = buildMesoBlocks("2026-04-06", "2026-06-29", weeks, 4, matchLoad);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].phase.en, "Accumulation");
  // TMr is the leading metric — week 1 block ≈ 2000/700 ≈ 2.86 matches' worth of load.
  assert.ok(blocks[0].tmr != null && blocks[0].tmr > 2.5 && blocks[0].tmr < 3.2);
  const spiked = blocks[1];
  assert.equal(spiked.loadTrend, "rising");              // the trend that drives the call
  assert.equal(spiked.isDeload, true);
  assert.match(spiked.flag!.en, /rising sharply/i);      // NOT an ACWR-band verdict
  assert.ok(spiked.tmr != null && spiked.tmr > 5.5);     // 4200/700 = 6 matches' worth
  assert.ok(spiked.volumeTargetPct != null && spiked.volumeTargetPct < 100); // cuts volume
  // ACWR is present but explicitly a contested view, never the target.
  assert.ok(spiked.acwr != null);
  assert.match(spiked.acwrNote.en, /Contested view|not an injury predictor|not the target/i);
  // No match load → no fabricated TMr.
  assert.equal(buildMesoBlocks("2026-04-06", "2026-06-29", weeks, 4)[0].tmr, null);
});

test("matchAxisTargets: three axes vs the match — running under, mechanical over, HSR deficit flagged", () => {
  const b: TeamAverages = { sessions: 100, players: 9, distanceM: 4600, hsrM: 200, sprintM: 60, maxKmh: 31, playerLoad: 470, plPerMin: 10, accel: 60, decel: 80, direction: null, matchSessions: 20, matchDistanceM: 11000, matchHsrM: 900, matchPlayerLoad: 1100, matchSprintM: 300, matchAccel: 45, matchDecel: 70 };
  const ax = matchAxisTargets(b);
  // Running axis under-reaches the match — training ceiling < match value.
  const hsr = ax.running.metrics.find((m) => /HSR/.test(m.metric.en))!;
  assert.match(hsr.band, /36–61%/);
  assert.equal(hsr.matchValue, "900 m");
  assert.equal(hsr.trainingCeiling, "540 m");           // 900 × 0.6
  assert.ok(ax.running.flag != null);                   // HSR is the deficit axis
  // Mechanical axis over-shoots the match — training ceiling > match value.
  const acc = ax.mechanical.metrics.find((m) => /Accel/.test(m.metric.en))!;
  assert.match(acc.band, /131–166%/);
  assert.equal(acc.trainingCeiling, "68");              // 45 × 1.5, rounded
  // Session HSR (200) is < 50% of match HSR (900) → deficit banner.
  assert.ok(ax.hsrDeficit != null);
  assert.match(ax.hsrDeficit!.en, /well under match/i);
});

test("intervalSpeedsFromMas: Type 1–5 km/h scale off MAS", () => {
  const z = intervalSpeedsFromMas(17.5);
  assert.equal(z.length, 5);
  assert.equal(z[0].type, 1);
  assert.equal(z[3].pctMas, 105);
  assert.equal(z[3].kmh, Math.round(17.5 * 1.05 * 10) / 10);  // VO2max at MAS
  assert.ok(z[4].kmh! > z[0].kmh!);                            // speed > recovery
  const none = intervalSpeedsFromMas(null);
  assert.equal(none[0].kmh, null);                             // no MAS → no fabricated number
});

test("strengthFromVbt: velocity zone from the latest heavy set", () => {
  assert.equal(strengthFromVbt("Squat", 130, 0.42)!.zone.en, "max strength");
  assert.equal(strengthFromVbt("Squat", 100, 0.62)!.zone.en, "strength–speed");
  assert.equal(strengthFromVbt("Squat", 60, 0.9)!.zone.en, "speed–strength");
  assert.equal(strengthFromVbt(null, null, null), null);
});

test("detectSeasonPhases: coach window overrides auto-detect (Dec start, late-Oct end)", () => {
  const fixtures = [{ date: "2026-04-10" }, { date: "2026-09-11" }];
  const ph = detectSeasonPhases(fixtures, "2026-02-02", { preseasonStart: "2025-12-01", seasonEnd: "2026-10-31" });
  assert.equal(ph[0].start, "2025-12-01");   // coach's December pre-season start (before data start)
  assert.match(ph[0].rationale.en, /coach-set start/);
  assert.equal(ph[1].end, "2026-10-31");     // coach's late-October end (beyond last fixture)
  assert.match(ph[1].rationale.en, /coach-set end/);
});

test("strengthDefaultForBlock: research %1RM defaults per phase, with citations", () => {
  assert.match(strengthDefaultForBlock("Accumulation", false).pct1rm.en, /85–95%/);
  assert.match(strengthDefaultForBlock("Realization", false).pct1rm.en, /30–60%/);
  assert.match(strengthDefaultForBlock("Realization", false).cite, /Suchomel|Haff/);
  assert.match(strengthDefaultForBlock("Transmutation", false).velocity.en, /0\.50–0\.75/);
});

test("valdVolumeCap: status → volume cap %, hamstring flag surfaced", () => {
  assert.equal(valdVolumeCap("green", "green").capPct, 100);
  assert.equal(valdVolumeCap("yellow", "yellow").capPct, 85);
  assert.match(valdVolumeCap("yellow", "yellow").note.en, /hamstring/);
  assert.equal(valdVolumeCap("red", null).capPct, 70);
  assert.equal(valdVolumeCap(null, null).capPct, null);
});

test("teamAverages: squad baseline overall + match-day subset from the data that exists", () => {
  const rows: SessionRow[] = [
    { isMatch: true, distanceM: 12000, hsrM: 900, sprintM: 300, maxKmh: 32, playerLoad: 1100, plPerMin: 12, accel: 60, decel: 110 },
    { isMatch: false, distanceM: 6000, hsrM: 300, sprintM: 80, maxKmh: 28, playerLoad: 500, plPerMin: 8, accel: 30, decel: 50 },
    { isMatch: false, distanceM: null, hsrM: null, sprintM: null, maxKmh: null, playerLoad: 400, plPerMin: 7, accel: null, decel: null }, // partial row — missing metrics excluded
  ];
  const t = teamAverages(rows, { forward: 0.2, backward: 0.3, lateral: 0.5 });
  assert.equal(t.sessions, 3);
  assert.equal(t.distanceM, 9000);            // (12000+6000)/2 — the null row excluded, not counted as 0
  assert.equal(t.playerLoad, Math.round(((1100 + 500 + 400) / 3) * 10) / 10);
  assert.equal(t.matchSessions, 1);
  assert.equal(t.matchDistanceM, 12000);      // match-day subset
  assert.equal(t.direction!.lateral, 0.5);
});

test("positionGroup: buckets positions GK/Def/Mid/Fwd", () => {
  assert.equal(positionGroup("GK").key, 0);
  assert.equal(positionGroup("CB").key, 1);
  assert.equal(positionGroup("LB").key, 1);
  assert.equal(positionGroup("CM").key, 2);
  assert.equal(positionGroup("AM").key, 2);
  assert.equal(positionGroup("CF").key, 3);
  assert.equal(positionGroup("RW").key, 3);
  assert.equal(positionGroup(null).key, 4);
  assert.equal(positionGroup("CF").label.is, "Sóknarmenn");
});

test("mdWeekTargets: MD-anchored days with numbers from the position baseline", () => {
  const b: TeamAverages = { sessions: 100, players: 9, distanceM: 4600, hsrM: 260, sprintM: 90, maxKmh: 31, playerLoad: 470, plPerMin: 10, accel: 43, decel: 57, direction: null, matchSessions: 20, matchDistanceM: 11000, matchHsrM: 900, matchPlayerLoad: 1100, matchSprintM: 300, matchAccel: 45, matchDecel: 70 };
  const days = mdWeekTargets(b);
  const tag = (t: string) => days.find((d) => d.mdTag === t)!;
  assert.equal(tag("MD-5").type, "mechanical");   // MD-5 = mechanical (accel/decel/PL)
  assert.ok(tag("MD-5").targets.some((t) => /Player Load/.test(t.metric.en)));
  assert.equal(tag("MD-4").type, "locomotive");   // MD-4 = locomotive (HSR/distance/sprint)
  assert.ok(tag("MD-4").targets.some((t) => /HSR/.test(t.metric.en)));
  assert.equal(tag("MD-3").type, "mixed");
  assert.equal(tag("MD-2").type, "technical");
  assert.equal(tag("MD+1").type, "restart");
  assert.equal(tag("MD").type, "match");
  assert.ok(tag("MD").targets.some((t) => /900 m/.test(t.value)));  // match-day HSR baseline
  assert.equal(tag("Top-up").type, "topup");
  // Own-data MD shape overrides the default multiplier (MD-4 locomotive HSR = 260 × 2.0 = 520 m):
  const shaped = mdWeekTargets(b, { mdShape: { "MD-4": 2.0 } });
  const md4Hsr = shaped.find((d) => d.mdTag === "MD-4")!.targets.find((t) => /HSR/.test(t.metric.en))!.value;
  assert.ok(/520 m/.test(md4Hsr));
});

test("congested weeks: classify + collapse the micro (Oliveira 2019)", () => {
  assert.equal(classifyMatchWeek(7), "normal");
  assert.equal(classifyMatchWeek(4), "two_game");
  assert.equal(classifyMatchWeek(3), "three_game");
  assert.equal(classifyMatchWeek(null), "normal");
  // 2+ matches inside a calendar week are flagged:
  const cw = congestedWeeks(["2026-05-04", "2026-05-07", "2026-05-17"]); // Mon 4th + Thu 7th same week
  assert.equal(cw.length, 1);
  assert.equal(cw[0].matches, 2);
  // The template collapses — no MD-5/-4/-3 build in a 2-game week:
  const b: TeamAverages = { sessions: 50, players: 9, distanceM: 4600, hsrM: 260, sprintM: 90, maxKmh: 31, playerLoad: 470, plPerMin: 10, accel: 43, decel: 57, direction: null, matchSessions: 10, matchDistanceM: 11000, matchHsrM: 900, matchPlayerLoad: 1100, matchSprintM: 300, matchAccel: 45, matchDecel: 70 };
  const two = mdWeekTargets(b, { weekType: "two_game" }).map((d) => d.mdTag);
  assert.ok(!two.includes("MD-5") && !two.includes("MD-4") && !two.includes("MD-3"));
  assert.deepEqual(two, ["MD+1", "MD-2", "MD-1", "MD", "Top-up"]);
  const three = mdWeekTargets(b, { weekType: "three_game" }).map((d) => d.mdTag);
  assert.deepEqual(three, ["MD+1", "MD-1", "MD", "Top-up"]); // recover + prep only
});

test("dataTier: works for every club — GPS+IMA → pro, GPS → core, RPE-only → rpe, none", () => {
  assert.equal(dataTier({ ima: true, gps: true, rpe: true }).tier, "pro");
  assert.equal(dataTier({ ima: false, gps: true, rpe: true }).tier, "core");
  assert.equal(dataTier({ ima: false, gps: false, rpe: true }).tier, "rpe");
  assert.equal(dataTier({ ima: false, gps: false, rpe: true }).loadSource, "srpe"); // sRPE fallback
  assert.equal(dataTier({ ima: false, gps: false, rpe: false }).tier, "none");
  assert.ok(dataTier({ ima: false, gps: true, rpe: true }).unlock); // core names what Pro unlocks
});

test("dataReadiness: names the gaps (no CS test, stale VBT) instead of faking", () => {
  const gaps = dataReadiness({ hasCsTest: false, masAgeDays: 17, vbtAgeDays: 150, hasValdThisBlock: false });
  assert.ok(gaps.find((g) => g.key === "cs" && /running-test MAS/.test(g.message.en))); // CS missing → MAS fallback named
  assert.ok(gaps.find((g) => g.key === "vbt" && g.severity === "stale" && /150 days/.test(g.message.en)));
  assert.ok(gaps.find((g) => g.key === "vald" && g.severity === "missing"));
});

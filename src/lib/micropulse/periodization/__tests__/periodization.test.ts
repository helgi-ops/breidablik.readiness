import { test } from "vitest";
import assert from "node:assert/strict";
import { detectSeasonPhases, buildMesoBlocks, intervalSpeedsFromMas, strengthFromVbt, dataReadiness, strengthDefaultForBlock, valdVolumeCap, teamAverages, positionGroup, mdWeekTargets, dataTier, classifyMatchWeek, congestedWeeks, matchAxisTargets, computeMatchUnit, weeklyTargetFromMatch, buildMesoPlan, buildCalendarBlock, recommendBlockGoal, type WeekLoad, type SessionRow, type TeamAverages, type PlayerMatchRow, type MatchUnitAbs } from "../index";

// A full Pro (GPS + IMA) match unit — running spine + the mechanical/IMA axis (Acc/Dec B2–3, stride, dir).
const UNIT: MatchUnitAbs = { dist: 12564, hsr: 988, load: 1184, accdec: 259, accHiEff: 40, decHiEff: 52, stride: 300, dirFwd: 0.5, dirBack: 0.2, dirLat: 0.3, rhie: null, symmetry: null, metPower: null };

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

test("detectSeasonPhases: a pre-season friendly does NOT start the competitive season", () => {
  const fx = [
    { date: "2026-02-15", competition: "Friendly" },      // pre-season friendly
    { date: "2026-03-01", competition: "Æfingaleikur" },  // another friendly (IS)
    { date: "2026-04-10", competition: "Besta deild" },   // first competitive fixture
    { date: "2026-10-20", competition: "Besta deild" },
  ];
  const ph = detectSeasonPhases(fx, null);
  const pre = ph.find((p) => p.key === "preseason")!;
  const comp = ph.find((p) => p.key === "competitive")!;
  assert.equal(comp.start, "2026-04-10");   // the first COMPETITIVE game, not the Feb friendly
  assert.equal(pre.end, "2026-04-10");      // pre-season runs up to the first competitive game
  assert.equal(comp.matches, 2);            // friendlies excluded from the competitive count
});

test("detectSeasonPhases: an all-friendly schedule falls back to the earliest fixture", () => {
  const fx = [{ date: "2026-02-15", competition: "Friendly" }, { date: "2026-03-01", competition: "Friendly" }];
  const comp = detectSeasonPhases(fx, null).find((p) => p.key === "competitive")!;
  assert.equal(comp.start, "2026-02-15");   // still resolves (degenerate: no real competitive game)
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
  assert.equal(spiked.deloadNow, true);                  // fatigue → pull the deload WEEK forward (not a goal change)
  assert.equal(spiked.isDeload, true);                   // legacy mirror of deloadNow
  assert.equal(spiked.phase.en, "Transmutation");        // the block KEEPS its goal — deload is a week, not a block
  assert.equal(spiked.deloadWeekStart, spiked.start);    // pulled to the block's first week
  assert.match(spiked.flag!.en, /rising sharply/i);      // NOT an ACWR-band verdict
  assert.ok(spiked.tmr != null && spiked.tmr > 5.5);     // 4200/700 = 6 matches' worth
  // ACWR is present but explicitly a contested view, never the target.
  assert.ok(spiked.acwr != null);
  assert.match(spiked.acwrNote.en, /Contested view|not an injury predictor|not the target/i);
  // No match load → no fabricated TMr.
  assert.equal(buildMesoBlocks("2026-04-06", "2026-06-29", weeks, 4)[0].tmr, null);
});

test("matchAxisTargets: three axes vs the match — running under, mechanical over, HSR deficit flagged", () => {
  const b: TeamAverages = { sessions: 100, players: 9, distanceM: 4600, hsrM: 200, sprintM: 60, maxKmh: 31, playerLoad: 470, plPerMin: 10, accel: 60, decel: 80, direction: null, matchSessions: 20, matchDistanceM: 11000, matchHsrM: 900, matchPlayerLoad: 1100, matchSprintM: 300, matchAccel: 45, matchDecel: 70, accelHiEff: 20, decelHiEff: 30, strideHi: 150, matchAccelHiEff: 40, matchDecelHiEff: 55, matchStrideHi: 300, rhieBouts: null, runSymmetry: null, metabolicPower: null };
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
  // Richer mechanical metrics render only when the feed carries them (Band 2–3 efforts here).
  assert.ok(ax.mechanical.metrics.some((m) => /B2–3/.test(m.metric.en)));
  assert.ok(ax.mechanical.metrics.some((m) => /strides/i.test(m.metric.en)));
  // Mechanical is AHEAD of match here (140 vs 115 = 122%) while running lags (22%) → NOT neglected.
  assert.equal(ax.mechNeglect, null);
  // A running-loaded / mechanical-lagging squad DOES trip the neglect flag.
  const neglect = matchAxisTargets({ ...b, hsrM: 500, accel: 20, decel: 20 });
  assert.ok(neglect.mechNeglect != null);
  assert.match(neglect.mechNeglect!.en, /mechanical axis lags/i);
});

test("computeMatchUnit: median = typical, p90 = peak, ≥80-min filter, thin-window fallback", () => {
  const mk = (date: string, minutes: number, load: number, hsr: number): PlayerMatchRow => ({ date, minutes, load, hsr, sprint: null, distance: null, accel: null, decel: null });
  const rows: PlayerMatchRow[] = [
    mk("2026-08-31", 90, 780, 640), mk("2026-08-24", 88, 760, 600), mk("2026-08-17", 85, 800, 660),
    mk("2026-08-10", 90, 740, 580), mk("2026-08-03", 92, 900, 720), // 5 near-full in window
    mk("2026-07-27", 20, 200, 90),  // partial — excluded from the unit
  ];
  const u = computeMatchUnit(rows, { asOfMs: Date.parse("2026-09-03") });
  assert.equal(u.nNearFull, 5);          // the 20-min match is excluded
  assert.equal(u.fellBack, false);
  assert.equal(u.confidence, "medium");  // 5 near-full → medium
  assert.equal(u.load.typical, 780);     // median of 740,760,780,800,900
  assert.ok(u.load.peak != null && u.load.peak >= 800); // p90 ≈ the top match
  // Thin recent window → widen to all near-full and flag it.
  const old = [mk("2026-02-01", 90, 700, 500), mk("2026-02-08", 90, 720, 520)];
  const w = computeMatchUnit(old, { asOfMs: Date.parse("2026-09-03") });
  assert.equal(w.fellBack, true);
  assert.equal(w.confidence, "low");
  assert.equal(computeMatchUnit([], {}).load.typical, null); // no matches → no fabricated unit
});

test("weeklyTargetFromMatch: pre-season builds above match; in-season = match + gated increment + top-up", () => {
  const pre = weeklyTargetFromMatch(800, { phase: "preseason", sessionCount: 6 });
  assert.ok(pre.matchMultiple != null && pre.matchMultiple > 1);     // supra-match
  assert.ok(pre.perSessionLoad != null && pre.weeklyLoadTarget != null && pre.perSessionLoad < pre.weeklyLoadTarget);
  const preFew = weeklyTargetFromMatch(800, { phase: "preseason", sessionCount: 3 });
  assert.ok(pre.matchMultiple! > preFew.matchMultiple!);             // more sessions → higher weekly multiple
  const starter = weeklyTargetFromMatch(800, { phase: "inseason", sessionCount: 4, minutesTypical: 90 });
  assert.ok(starter.matchMultiple != null && starter.matchMultiple < 2); // can't freely multiply
  assert.equal(starter.topUp, 0);                                    // full-minute player → no top-up
  const sub = weeklyTargetFromMatch(800, { phase: "inseason", sessionCount: 4, minutesTypical: 30 });
  assert.ok(sub.topUp != null && sub.topUp > 0);                     // low-minute player → topped up
  const capped = weeklyTargetFromMatch(800, { phase: "inseason", sessionCount: 4, minutesTypical: 90, readinessCapPct: 70 });
  assert.ok(capped.weeklyLoadTarget! < starter.weeklyLoadTarget!);   // readiness caps the increment
  assert.equal(weeklyTargetFromMatch(null, { phase: "inseason", sessionCount: 4 }).weeklyLoadTarget, null);
});

test("buildMesoBlocks: re-flows from the anchors — moving the start shifts blocks; cadence sets block length", () => {
  const weeks: WeekLoad[] = [];
  const base = Date.parse("2026-04-06");
  for (let i = 0; i < 12; i++) weeks.push({ weekStart: new Date(base + i * 7 * 86_400_000).toISOString().slice(0, 10), load: 2000, readiness: 70 });
  // Cadence = block length: 12 weeks → three 4-week blocks, or two 6-week blocks.
  assert.equal(buildMesoBlocks("2026-04-06", "2026-06-29", weeks, 4, 700).length, 3);
  assert.equal(buildMesoBlocks("2026-04-06", "2026-06-29", weeks, 6, 700).length, 2);
  // Moving the first-match/phase start shifts every block start (the cascade).
  const a = buildMesoBlocks("2026-04-06", "2026-06-29", weeks, 4, 700);
  const b = buildMesoBlocks("2026-04-13", "2026-07-06", weeks, 4, 700);
  assert.notEqual(a[0].start, b[0].start);
  assert.equal(b[0].start, "2026-04-13");
});

test("buildMesoBlocks: the deload is a WEEK (last week by default), snapped to the lightest fixture week near the end", () => {
  const weeks: WeekLoad[] = [];
  const base = Date.parse("2026-04-06");
  for (let i = 0; i < 8; i++) weeks.push({ weekStart: new Date(base + i * 7 * 86_400_000).toISOString().slice(0, 10), load: 2000, readiness: 70 });
  // No fixtures → the deload week defaults to the block's last week; a real goal, never "Deload".
  const plain = buildMesoBlocks("2026-04-06", "2026-05-31", weeks, 4, 700);
  assert.equal(plain[0].deloadNow, false);
  assert.equal(plain[0].deloadWeekStart, "2026-04-27");   // last week of the first 4-week block
  assert.notEqual(plain[0].phase.en, "Deload");
  // Block 0's last two weeks are 2026-04-20 (bye) and 2026-04-27 (a match) → snap to the lighter bye week.
  const snapped = buildMesoBlocks("2026-04-06", "2026-05-31", weeks, 4, 700, ["2026-04-29"]);
  assert.equal(snapped[0].deloadWeekStart, "2026-04-20");
});

test("buildMesoBlocks: off-season blocks snap to Monday (a Sunday season-end doesn't start a Sunday block)", () => {
  // Season end 24 Oct 2026 (Sat) → off-season raw start 25 Oct (Sun). Blocks must start Mon 26 Oct.
  const blocks = buildMesoBlocks("2026-01-05", "2026-11-30", [], 6, 700, ["2026-04-04"], "2026-03-30", [], "2026-10-25", null);
  const off = blocks.filter((b) => b.start >= "2026-10-25");
  assert.ok(off.length >= 1);
  assert.equal(off[0].start, "2026-10-26");   // Monday, not the Sunday 25 Oct
  const d = new Date(`${off[0].start}T00:00:00Z`).getUTCDay();
  assert.equal(d, 1);                          // 1 = Monday
});

test("buildMesoBlocks: coach per-block LENGTH override re-flows later blocks", () => {
  const weeks: WeekLoad[] = [];
  const base = Date.parse("2026-04-06");
  for (let i = 0; i < 12; i++) weeks.push({ weekStart: new Date(base + i * 7 * 86_400_000).toISOString().slice(0, 10), load: 2000, readiness: 70 });
  // Default cadence 4 → three 4-week blocks. Override block 0 to 6 weeks → [6, 4, 2], starts re-flow.
  const b = buildMesoBlocks("2026-04-06", "2026-06-29", weeks, 4, 700, [], null, [], null, null, { blockWeeksByStart: { "2026-04-06": 6 } });
  assert.equal(b.length, 3);
  assert.equal(b[0].weeks, 6);
  assert.equal(b[0].lengthPinned, true);
  assert.equal(b[1].start, "2026-05-18");       // 2026-04-06 + 6 weeks
  assert.equal(b[1].lengthPinned, false);        // only the first block was pinned
  // An out-of-range length (1 or 9) is ignored → falls back to the cadence.
  const ignored = buildMesoBlocks("2026-04-06", "2026-06-29", weeks, 4, 700, [], null, [], null, null, { blockWeeksByStart: { "2026-04-06": 1 } });
  assert.equal(ignored[0].weeks, 4);
});

test("buildMesoBlocks: off-season is sliced into its OWN ~4-week blocks, independent of the in-season cadence", () => {
  // Pre 05 Jan → comp 30 Mar (12w pre-season) → off-season 05 Oct → end 30 Nov (8 off-season weeks).
  const blocks = buildMesoBlocks("2026-01-05", "2026-11-30", [], 6, 700, ["2026-04-04"], "2026-03-30", [], "2026-10-05", null);
  const off = blocks.filter((b) => b.start >= "2026-10-05");
  assert.ok(off.length >= 2, "8 off-season weeks at ~4w each → two blocks");
  assert.equal(off[0].weeks, 4);                 // 4-week reconditioning block, NOT the 6-week cadence
  assert.ok(off.every((b) => b.weeks <= 4));      // none inherits the 6-week in-season cadence
  // The in-season cadence still governs the pre-season blocks (6 weeks here).
  const pre = blocks.filter((b) => b.start < "2026-03-30");
  assert.equal(pre[0].weeks, 6);
});

test("buildMesoBlocks: coach deload-week pin wins over the auto placement", () => {
  const weeks: WeekLoad[] = [];
  const base = Date.parse("2026-04-06");
  for (let i = 0; i < 8; i++) weeks.push({ weekStart: new Date(base + i * 7 * 86_400_000).toISOString().slice(0, 10), load: 2000, readiness: 70 });
  const pinned = buildMesoBlocks("2026-04-06", "2026-05-31", weeks, 4, 700, [], null, [], null, null, { deloadByStart: { "2026-04-06": "2026-04-13" } });
  assert.equal(pinned[0].deloadWeekStart, "2026-04-13");  // pinned, not the default last week (04-27)
  assert.equal(pinned[0].deloadPinned, true);
  // A pin outside the block is ignored.
  const outside = buildMesoBlocks("2026-04-06", "2026-05-31", weeks, 4, 700, [], null, [], null, null, { deloadByStart: { "2026-04-06": "2026-05-25" } });
  assert.equal(outside[0].deloadPinned, false);
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
  const b: TeamAverages = { sessions: 100, players: 9, distanceM: 4600, hsrM: 260, sprintM: 90, maxKmh: 31, playerLoad: 470, plPerMin: 10, accel: 43, decel: 57, direction: null, matchSessions: 20, matchDistanceM: 11000, matchHsrM: 900, matchPlayerLoad: 1100, matchSprintM: 300, matchAccel: 45, matchDecel: 70, accelHiEff: null, decelHiEff: null, strideHi: null, matchAccelHiEff: null, matchDecelHiEff: null, matchStrideHi: null, rhieBouts: null, runSymmetry: null, metabolicPower: null };
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
  const b: TeamAverages = { sessions: 50, players: 9, distanceM: 4600, hsrM: 260, sprintM: 90, maxKmh: 31, playerLoad: 470, plPerMin: 10, accel: 43, decel: 57, direction: null, matchSessions: 10, matchDistanceM: 11000, matchHsrM: 900, matchPlayerLoad: 1100, matchSprintM: 300, matchAccel: 45, matchDecel: 70, accelHiEff: null, decelHiEff: null, strideHi: null, matchAccelHiEff: null, matchDecelHiEff: null, matchStrideHi: null, rhieBouts: null, runSymmetry: null, metabolicPower: null };
  const two = mdWeekTargets(b, { weekType: "two_game" }).map((d) => d.mdTag);
  assert.ok(!two.includes("MD-5") && !two.includes("MD-4") && !two.includes("MD-3"));
  assert.deepEqual(two, ["MD+1", "MD-2", "MD-1", "MD", "Top-up"]);
  const three = mdWeekTargets(b, { weekType: "three_game" }).map((d) => d.mdTag);
  assert.deepEqual(three, ["MD+1", "MD-1", "MD", "Top-up"]); // recover + prep only
});

test("buildMesoPlan: N weeks, deload every 4th, overload ramps, week type from fixtures, numbers scale", () => {
  const b: TeamAverages = { sessions: 100, players: 9, distanceM: 4600, hsrM: 260, sprintM: 90, maxKmh: 31, playerLoad: 470, plPerMin: 10, accel: 43, decel: 57, direction: null, matchSessions: 20, matchDistanceM: 11000, matchHsrM: 900, matchPlayerLoad: 1100, matchSprintM: 300, matchAccel: 45, matchDecel: 70, accelHiEff: null, decelHiEff: null, strideHi: null, matchAccelHiEff: null, matchDecelHiEff: null, matchStrideHi: null, rhieBouts: null, runSymmetry: null, metabolicPower: null };
  const plan = buildMesoPlan({ startDate: "2026-01-05", numWeeks: 4, sessionsPerWeek: 5, baseline: b, matchUnitLoad: 1000, fixtures: ["2026-01-21", "2026-01-24"] });
  assert.equal(plan.weeks.length, 4);
  assert.equal(plan.weeks[3].isDeload, true);              // every 4th week is a planned deload
  assert.equal(plan.weeks[3].overloadPct, 60);
  assert.ok(plan.weeks[1].overloadPct > plan.weeks[0].overloadPct); // progressive overload ramps up
  // Week index 2 (starts 2026-01-19) contains both fixtures (21st + 24th) → congested.
  assert.equal(plan.weeks[2].weekType, "two_game");
  assert.ok(plan.weeks[2].sessions.every((d) => !["MD-5", "MD-4", "MD-3"].includes(d.mdTag))); // collapsed
  // TMr + weekly target scale with the overload, off the match unit.
  assert.ok(plan.weeks[0].tmr != null && plan.weeks[0].tmr > 1);
  assert.ok(plan.weeks[3].weeklyLoadTarget! < plan.weeks[0].weeklyLoadTarget!); // deload cuts the week
  assert.ok(plan.notes.some((n) => /never a norm|Little & Buchheit/i.test(n.en)));
});

test("buildCalendarBlock: reproduces the demo microcycle (Sat/Sun alternation, tight/roomy weeks, ≤3 in a row)", () => {
  const unit = UNIT;
  const b = buildCalendarBlock({ unit, startDate: "2026-01-05", numWeeks: 6, scopeName: "Óli Valur", scopePos: "winger", baseOverloadPct: 100, stepPct: 8 });
  const pat = (w: number) => b.weeks[w].days.map((d) => d.type);
  // The approved demo's exact 6-week structure (Mon→Sun):
  assert.deepEqual(pat(0), ["mechanical", "locomotive", "mixed", "rest", "activation", "match", "topup"]);       // W1 Sat, roomy
  assert.deepEqual(pat(1), ["rest", "mechanical", "locomotive", "mixed", "rest", "activation", "match"]);        // W2 Sun, roomy
  assert.deepEqual(pat(2), ["topup", "rest", "locomotive", "mixed", "rest", "match", "topup"]);                  // W3 Sat, tight (2 quality)
  assert.deepEqual(pat(5), ["rest", "locomotive", "rest", "mixed", "rest", "activation", "match"]);              // W6 Sun, deload (extra rest)
  assert.equal(b.weeks[0].matchDow.en, "Sat"); assert.equal(b.weeks[1].matchDow.en, "Sun");
  assert.equal(b.weeks[5].isDeload, true); assert.ok(b.weeks[5].mult < b.weeks[4].mult);
  // MD labels descend correctly to the match (W1: MECH=MD-5 … ACT=MD-1 … MATCH=MD-0, TOP=MD+1).
  assert.deepEqual(b.weeks[0].days.map((d) => d.md), ["MD-5", "MD-4", "MD-3", "MD-2", "MD-1", "MD-0", "MD+1"]);
  // Never more than 3 sessions (any on-day incl. match/top-up) in a row — across week boundaries.
  const stream = b.weeks.flatMap((w) => w.days.map((d) => d.type !== "rest"));
  let run = 0, maxRun = 0; for (const on of stream) { run = on ? run + 1 : 0; maxRun = Math.max(maxRun, run); }
  assert.ok(maxRun <= 3, `max sessions in a row = ${maxRun}`);
  // Match day = the unit at 100% (unscaled); a mechanical day over-shoots LOAD (1.10) and under-reaches HSR (0.30).
  const w1match = b.weeks[0].days.find((d) => d.type === "match")!;
  assert.equal(w1match.dist, 12564); assert.equal(w1match.hsr, 988); assert.equal(w1match.load, 1184); // exact unit
  const mech = b.weeks[0].days.find((d) => d.type === "mechanical")!;
  assert.equal(mech.load, Math.round(1184 * 1.10));  // ≈1302, over match
  assert.equal(mech.dist, Math.round(12564 * 0.45 / 10) * 10); // dist rounds to 10 m
  // Rest days carry no numbers; the ramp accumulates training above one match; deload cuts it + adds rest.
  assert.ok(b.weeks[0].days.some((d) => d.type === "rest" && d.dist === null));
  assert.ok(b.weeks[0].pctRunning != null && b.weeks[0].pctRunning > 100);
  assert.ok(b.weeks[5].restDays >= b.weeks[0].restDays);
  assert.ok(b.weeks[5].pctRunning! < b.weeks[3].pctRunning!);
  assert.equal(b.legend.length, 7);
  // Mechanical / IMA axis: the match day carries the exact unit; a mechanical day over-shoots Acc/Dec B2–3
  // (share 1.30) while the Locomotive day carries the highest stride and lower efforts (the split).
  assert.equal(w1match.accHiEff, 40); assert.equal(w1match.decHiEff, 52); assert.equal(w1match.stride, 300);
  assert.equal(mech.accHiEff, Math.round(40 * 1.30)); // 52, over match's 40
  const loco = b.weeks[0].days.find((d) => d.type === "locomotive")!;
  assert.ok(loco.stride! > mech.stride!);            // stride highest on the running day
  assert.ok(mech.accHiEff! > loco.accHiEff!);        // efforts highest on the mechanical day
  assert.ok(b.weeks[0].pctAccDec23 != null && b.weeks[0].pctStride != null);
  // Direction VARIES by day-type (not a static per-block constant): the Locomotive day leans forward,
  // the Mechanical day leans backward — so loco.fwd > mech.fwd. The match day keeps the raw split (0.5).
  assert.ok(loco.dir != null && mech.dir != null && loco.dir.fwd > mech.dir.fwd);
  assert.ok(w1match.dir != null && Math.abs(w1match.dir.fwd - 0.5) < 1e-9); // match keeps the raw split
});

test("buildCalendarBlock: off-season split — days after the boundary drop the MD countup and run the development rotation; in-season days keep their MD labels", () => {
  // A 6-week block whose last 3 weeks fall in the off-season (boundary = Monday of week 4). Matches only in
  // the competitive first three weeks; the off-season weeks carry coach-forced sessions (onDays).
  const offStart = "2026-01-26"; // 2026-01-05 + 21 days — Monday of week 4
  const b = buildCalendarBlock({
    unit: UNIT, startDate: "2026-01-05", numWeeks: 6, scopeName: "__team__", baseOverloadPct: 100,
    matchDates: ["2026-01-10", "2026-01-17", "2026-01-24"],
    onDays: ["2026-01-26", "2026-01-28", "2026-01-30", "2026-02-02", "2026-02-04", "2026-02-09", "2026-02-11"],
    offseasonStart: offStart,
  });
  assert.equal(b.weeks.length, 6);
  const isoAt = (k: number) => new Date(Date.parse("2026-01-05T00:00:00Z") + k * 86_400_000).toISOString().slice(0, 10);
  const allDays = b.weeks.flatMap((w, wi) => w.days.map((d, di) => ({ d, iso: isoAt(wi * 7 + di) })));
  // In-season portion keeps at least one MD-labelled day; the off-season portion has NONE.
  assert.ok(allDays.some(({ d, iso }) => iso < offStart && /^MD/.test(d.md)), "an in-season day should carry an MD label");
  for (const { d, iso } of allDays) if (iso >= offStart) assert.equal(d.md, "", `${iso} is off-season → no MD countup (got ${d.md})`);
  // Every off-season SESSION day is a development type (Strength/Power/Conditioning/Activation), never a match.
  const DEV = new Set(["mechanical", "mixed", "locomotive", "activation"]);
  for (const { d, iso } of allDays) if (iso >= offStart && d.type !== "rest" && d.type !== "topup") {
    assert.ok(DEV.has(d.type), `${iso} off-season session should be a development type (got ${d.type})`);
  }
});

test("buildCalendarBlock: an all-off-season block never invents a weekly match (no fixtures in off-season)", () => {
  // No matchDates + the whole block is off-season → the auto Sat/Sun friendly must NOT be placed.
  const b = buildCalendarBlock({ unit: UNIT, startDate: "2026-10-26", numWeeks: 4, scopeName: "__team__", baseOverloadPct: 100, offseasonStart: "2026-10-26" });
  const matchDays = b.weeks.flatMap((w) => w.days).filter((d) => d.type === "match");
  assert.equal(matchDays.length, 0);
  // A real fixture inside the off-season still shows (it's a declared game, not an invented one).
  const withGame = buildCalendarBlock({ unit: UNIT, startDate: "2026-10-26", numWeeks: 4, scopeName: "__team__", baseOverloadPct: 100, offseasonStart: "2026-10-26", matchDates: ["2026-11-07"] });
  assert.equal(withGame.weeks.flatMap((w) => w.days).filter((d) => d.type === "match").length, 1);
});

test("buildCalendarBlock: block GOAL reshapes volume/taper/strength and stays additive when omitted", () => {
  const build = (goal?: "accum" | "transmute" | "realize") =>
    buildCalendarBlock({ unit: UNIT, startDate: "2026-01-05", numWeeks: 6, scopeName: "__team__", baseOverloadPct: 100, goal });
  const accum = build("accum"), transmute = build("transmute"), realize = build("realize");
  // (a) Week-0 Mixed-day volume (template-independent — both LT and RT carry a Mixed day): accum > transmute > realize.
  const mixed0 = (b: ReturnType<typeof build>) => b.weeks[0].days.find((d) => d.type === "mixed")!.load!;
  assert.ok(mixed0(accum) > mixed0(transmute), `accum mixed ${mixed0(accum)} > transmute ${mixed0(transmute)}`);
  assert.ok(mixed0(transmute) > mixed0(realize), `transmute mixed ${mixed0(transmute)} > realize ${mixed0(realize)}`);
  // (b) Taper depth on the deload (last) week: realize cuts volume hardest (0.45) vs accum (0.75), and realize
  //     HOLDS intensity (hsr) above its volume cut (0.70 int vs 0.45 vol) — the peaking-taper signature.
  assert.equal(realize.weeks[5].mult, 0.45); assert.equal(accum.weeks[5].mult, 0.75);
  const rzDeload = realize.weeks[5].days.find((d) => d.type !== "rest" && d.type !== "match")!;
  assert.ok((rzDeload.hsr! / UNIT.hsr!) > (rzDeload.load! / UNIT.load!), "realize deload holds intensity above its volume cut");
  // (c) Realization's roomy week is fresher: more rest, no more than 3 sessions.
  assert.ok(realize.weeks[1].restDays >= accum.weeks[1].restDays, "realize week has ≥ rest of accum week");
  assert.ok(realize.weeks[1].days.filter((d) => d.type !== "rest" && d.type !== "match").length <= 3);
  // (d) Strength scheme migrates with the goal (cited %1RM bands).
  assert.match(accum.strength!.pct1rm.en, /85–95%/); assert.match(realize.strength!.pct1rm.en, /30–60%/);
  assert.match(transmute.strength!.pct1rm.en, /70–85%/);
  assert.equal(accum.goalKey, "accum"); assert.equal(realize.goalKey, "realize");
  // (e) ADDITIVE GUARD: a goal-less build is byte-identical to goal:undefined, and carries no goal fields.
  const neutral = buildCalendarBlock({ unit: UNIT, startDate: "2026-01-05", numWeeks: 6, scopeName: "__team__", baseOverloadPct: 100 });
  const neutralU = buildCalendarBlock({ unit: UNIT, startDate: "2026-01-05", numWeeks: 6, scopeName: "__team__", baseOverloadPct: 100, goal: undefined });
  assert.deepEqual(neutral, neutralU);
  assert.equal(neutral.goalKey, undefined); assert.equal(neutral.strength, undefined);
});

test("buildCalendarBlock: engine-driven ramp — volume climbs faster than HSR, running axes ceiling at match, week tags its cap", () => {
  const b = buildCalendarBlock({ unit: UNIT, startDate: "2026-01-05", numWeeks: 6, scopeName: "__team__", baseOverloadPct: 100 });
  // Week 1 is the flat start (mult 1.0) — the differentiated ramp opens equal, then diverges.
  const mixedIn = (w: number) => b.weeks[w].days.find((d) => d.type === "mixed")!;
  const w0 = mixedIn(0);
  assert.equal(w0.load, Math.round(UNIT.load! * 0.85)); // week-1 load = mixed share × 1.0
  // By a later build week, the volume axis (load, rate 0.08) has ramped MORE than the HSR axis (rate 0.05).
  const wl = 3;
  const loadGrowth = mixedIn(wl).load! / w0.load!;
  const hsrGrowth = mixedIn(wl).hsr! / mixedIn(0).hsr!;
  assert.ok(loadGrowth > hsrGrowth, `volume should ramp faster than HSR (load ×${loadGrowth.toFixed(2)} vs HSR ×${hsrGrowth.toFixed(2)})`);
  // No training session's running axes ever exceed the match unit ("build TO match, not beyond").
  for (const w of b.weeks) for (const d of w.days) if (d.type !== "match" && d.type !== "rest") {
    if (d.hsr != null) assert.ok(d.hsr <= UNIT.hsr!, `HSR ${d.hsr} > match ${UNIT.hsr}`);
    if (d.dist != null) assert.ok(d.dist <= UNIT.dist!);
    if (d.stride != null) assert.ok(d.stride <= UNIT.stride!);
  }
  // At least one build week explains its cap (a running axis reaching the match ceiling).
  assert.ok(b.weeks.some((w) => !w.isDeload && w.capNote && /ceiling|leikþak/i.test(w.capNote.en + w.capNote.is)));
});

test("buildCalendarBlock: presence-gates the IMA axis — a Core (GPS-only) unit shows Acc/Dec B2–3 but not stride/direction", () => {
  const core: MatchUnitAbs = { dist: 11000, hsr: 900, load: 1000, accdec: 200, accHiEff: 35, decHiEff: 44, stride: null, dirFwd: null, dirBack: null, dirLat: null, rhie: null, symmetry: null, metPower: null };
  const b = buildCalendarBlock({ unit: core, startDate: "2026-01-05", numWeeks: 2, scopeName: "Core", scopePos: "winger" });
  const mech = b.weeks[0].days.find((d) => d.type === "mechanical")!;
  assert.ok(mech.accHiEff != null && mech.decHiEff != null); // GPS-derivable efforts present
  assert.equal(mech.stride, null); assert.equal(mech.dir, null); // no IMU stride / direction
  assert.ok(b.weeks[0].pctAccDec23 != null); assert.equal(b.weeks[0].pctStride, null);
});

test("buildCalendarBlock: honours the coach's skeleton — explicit match days + forced off/on", () => {
  const unit = UNIT;
  // Coach places two matches (Wed of week1, Sun of week2) and forces a Tuesday off + a Thursday on.
  const b = buildCalendarBlock({
    unit, startDate: "2026-01-05", numWeeks: 3, scopeName: "__team__",
    matchDates: ["2026-01-07", "2026-01-18"], offDays: ["2026-01-06"], onDays: ["2026-01-08"],
  });
  const flat = b.weeks.flatMap((w) => w.days);
  const at = (iso: string) => flat[Math.round((Date.parse(iso) - Date.parse("2026-01-05")) / 86_400_000)];
  // The explicit matches land on the coach's dates (Wed 7th, Sun 18th).
  assert.equal(at("2026-01-07").type, "match");
  assert.equal(at("2026-01-18").type, "match");
  assert.equal(b.weeks[0].matchDow.en, "Wed");       // week banner reflects the real match day
  // Forced off → rest; forced on (a day the solver would rest) → a session.
  assert.equal(at("2026-01-06").type, "rest");
  assert.notEqual(at("2026-01-08").type, "rest");
  // Still ≤3 sessions in a row across the whole block.
  const stream = b.weeks.flatMap((w) => w.days.map((d) => d.type !== "rest"));
  let run = 0, maxRun = 0; for (const on of stream) { run = on ? run + 1 : 0; maxRun = Math.max(maxRun, run); }
  assert.ok(maxRun <= 3);
  // Per-day type override — the coach sets the quality; loads recompute from that type's share.
  const ov = buildCalendarBlock({ unit, startDate: "2026-01-05", numWeeks: 2, scopeName: "__team__", typeOverrides: { "2026-01-08": "locomotive" } });
  const thu = ov.weeks[0].days[3]; // Thu of week 1
  assert.equal(thu.type, "locomotive");
  assert.equal(thu.hsr, Math.round(988 * 0.70 / 5) * 5); // locomotive HSR share 0.70 at ×1.00
  // Per-player knobs: VALD cap limits the peak multiplier, loadScale trims, emphasis tilts HSR/mech.
  const full = buildCalendarBlock({ unit, startDate: "2026-01-05", numWeeks: 5, scopeName: "__team__", baseOverloadPct: 100, stepPct: 10 });
  const capped = buildCalendarBlock({ unit, startDate: "2026-01-05", numWeeks: 5, scopeName: "P", maxMult: 1.15, baseOverloadPct: 100, stepPct: 10 });
  assert.ok(capped.weeks[3].mult <= 1.15 && full.weeks[3].mult > 1.15); // yellow VALD caps the peak
  const trimmed = buildCalendarBlock({ unit, startDate: "2026-01-05", numWeeks: 2, scopeName: "P", loadScale: 0.9 });
  const fMech = full.weeks[0].days.find((d) => d.type === "mechanical")!;
  const tMech = trimmed.weeks[0].days.find((d) => d.type === "mechanical")!;
  assert.ok(tMech.load! < fMech.load!); // minutes trim lowers the training load
  const tilt = buildCalendarBlock({ unit, startDate: "2026-01-05", numWeeks: 2, scopeName: "P", emphasis: { hsr: 1.1, mech: 0.9 } });
  const baseLoco = buildCalendarBlock({ unit, startDate: "2026-01-05", numWeeks: 2, scopeName: "P" }).weeks[0].days.find((d) => d.type === "locomotive")!;
  const tiltLoco = tilt.weeks[0].days.find((d) => d.type === "locomotive")!;
  assert.ok(tiltLoco.hsr! > baseLoco.hsr!); // winger tilt raises HSR on the Locomotive day
});

test("recommendBlockGoal: fatigue overrides sequence; phase / runway / sequence otherwise", () => {
  const base = { phaseKey: "competitive" as const, weeksToNextFixture: 8, matchesPerWeek: 1, deloadNow: false, deloadReason: null, prevGoal: null, fixturesLoaded: 20, loadHistoryWeeks: 20 };
  // Fatigue is a WEEK-level action, not a goal change: deloadNow flags "pull the deload week forward"
  // while the GOAL still follows the sequence (after Accumulation, open runway → Transmutation).
  const dl = recommendBlockGoal({ ...base, prevGoal: "accum", deloadNow: true, deloadReason: { en: "Acute load rising sharply", is: "x" } });
  assert.equal(dl.deloadNow, true);
  assert.notEqual(dl.goal, "deload");            // never recommends "deload" as a goal
  assert.equal(dl.goal, "transmute");            // the sequence goal is unchanged by fatigue
  assert.match(dl.reasons[0].en, /rising sharply/); // the pull-forward reason leads
  // Pre-season → Accumulation.
  assert.equal(recommendBlockGoal({ ...base, phaseKey: "preseason" }).goal, "accum");
  // 2–3 weeks to a key match → Realization (peak/taper).
  assert.equal(recommendBlockGoal({ ...base, weeksToNextFixture: 2 }).goal, "realize");
  // Congested run → Realization (hold freshness).
  assert.equal(recommendBlockGoal({ ...base, matchesPerWeek: 2 }).goal, "realize");
  // Open runway, after an Accumulation block → Transmutation (sequence).
  assert.equal(recommendBlockGoal({ ...base, prevGoal: "accum" }).goal, "transmute");
  // After Transmutation → Realization; never Realization with nothing behind it (no prev → accum).
  assert.equal(recommendBlockGoal({ ...base, prevGoal: "transmute" }).goal, "realize");
  assert.equal(recommendBlockGoal({ ...base, prevGoal: null }).goal, "accum");
  // Off-season → a development build (accumulation → transmutation), NEVER realize (no fixture to peak for),
  // even with a (spurious) near fixture or congestion in the inputs.
  assert.equal(recommendBlockGoal({ ...base, phaseKey: "offseason", prevGoal: null }).goal, "accum");
  assert.equal(recommendBlockGoal({ ...base, phaseKey: "offseason", prevGoal: "accum" }).goal, "transmute");
  assert.equal(recommendBlockGoal({ ...base, phaseKey: "offseason", weeksToNextFixture: 1, matchesPerWeek: 2, prevGoal: "accum" }).goal, "transmute"); // near fixture/congestion ignored off-season — never realize
  // Thin data → capped confidence + a hint caveat.
  const thin = recommendBlockGoal({ ...base, phaseKey: "preseason", fixturesLoaded: 1, loadHistoryWeeks: 2 });
  assert.notEqual(thin.confidence, "high");
  assert.ok(thin.reasons.some((r) => /hint|vísbendingu/i.test(r.en + r.is)));
  // Always carries an alternative.
  assert.ok(dl.alternative && dl.alternative.goal);
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

// ── Fixture-aware block goals (in-season blocks follow the calendar, not odd/even) ──
test("buildMesoBlocks: without competitiveStart keeps the mechanical accum→transmute↔realize order", () => {
  const blocks = buildMesoBlocks("2026-03-01", "2026-06-21", [], 4, 650, ["2026-04-05", "2026-04-12", "2026-05-03"]);
  assert.equal(blocks[0].goalKey, "accum");          // first block always accumulation
  assert.equal(blocks[1].goalKey, "transmute");      // then the odd/even sequence (no competitiveStart → preseason rule)
  assert.equal(blocks[2].goalKey, "realize");
});

test("buildMesoBlocks: a congested competitive block → Realization, a gap block → a loading block", () => {
  // Block A (Apr): one game a week, dense → realize. Block B (May) carries a 14-day gap → re-load.
  const fx = ["2026-04-04", "2026-04-11", "2026-04-18", "2026-04-25", "2026-05-02", "2026-05-16"]; // 05-02 → 05-16 is a 14-day gap
  const blocks = buildMesoBlocks("2026-04-01", "2026-05-27", [], 4, 650, fx, "2026-04-01");
  const apr = blocks.find((b) => b.start <= "2026-04-10" && "2026-04-10" < b.end)!;
  const may = blocks.find((b) => b.start <= "2026-05-10" && "2026-05-10" < b.end)!;
  assert.equal(apr.goalKey, "realize");              // dense weekly competition
  assert.notEqual(may.goalKey, "realize");           // the 14-day gap opens a loading block
  assert.ok(["accum", "transmute"].includes(may.goalKey));
});

test("buildMesoBlocks: a ≥2-week fixture gap becomes its own loading block (gap-aligned boundaries)", () => {
  // Pre-season Mar, then competitive with a ~4-week gap (04-25 → 05-23) in the middle.
  const fx = ["2026-04-04", "2026-04-11", "2026-04-18", "2026-04-25", "2026-05-23", "2026-05-30"];
  const blocks = buildMesoBlocks("2026-03-01", "2026-06-13", [], 4, 650, fx, "2026-04-04");
  // A fixture-free competitive block must exist at the gap (its own re-load block), not realize.
  const gapBlock = blocks.find((b) => b.start >= "2026-04-04" && b.start <= "2026-05-11" && fx.every((d) => !(d >= b.start && d < b.end)));
  assert.ok(gapBlock, "a fixture-free competitive block should exist at the gap");
  assert.notEqual(gapBlock!.goalKey, "realize");
  assert.ok(["accum", "transmute"].includes(gapBlock!.goalKey));
  // The surrounding competition block is Realization, and pre-season ends exactly at the first fixture.
  const apr = blocks.find((b) => b.start <= "2026-04-10" && "2026-04-10" < b.end)!;
  assert.equal(apr.goalKey, "realize");
  const lastPre = blocks.filter((b) => b.start < "2026-04-04").pop();
  if (lastPre) assert.equal(lastPre.end, "2026-04-04"); // boundary snapped to the first fixture
});

// ── Off-season (emitted only when the coach sets a season end) ──
test("detectSeasonPhases: a coach-set season end emits an off-season phase after competitive", () => {
  const fx = [{ date: "2026-04-10", competition: null, isHome: null }, { date: "2026-09-20", competition: null, isHome: null }];
  const noEnd = detectSeasonPhases(fx, null);
  assert.equal(noEnd.some((p) => p.key === "offseason"), false); // no season end set → no off-season
  const withEnd = detectSeasonPhases(fx, null, { seasonEnd: "2026-10-26" });
  const off = withEnd.find((p) => p.key === "offseason");
  assert.ok(off, "season end set → off-season phase emitted");
  assert.equal(off!.start, "2026-10-27"); // off-season starts the day AFTER the competitive end
  const comp = withEnd.find((p) => p.key === "competitive")!;
  assert.equal(comp.end, "2026-10-26"); // competitive ends at the coach-set date (the last competitive day)
});

test("buildMesoBlocks: off-season blocks build (accum→transmute) and never realize", () => {
  const fx = ["2026-04-10", "2026-05-10", "2026-06-10"];
  const phases = detectSeasonPhases(fx.map((d) => ({ date: d, competition: null, isHome: null })), null, { seasonEnd: "2026-06-21" });
  const comp = phases.find((p) => p.key === "competitive")!;
  const off = phases.find((p) => p.key === "offseason")!;
  const blocks = buildMesoBlocks(phases[0].start, phases[phases.length - 1].end, [], 4, 650, fx, comp.start, [], off.start);
  const offBlocks = blocks.filter((b) => b.start >= off.start);
  assert.ok(offBlocks.length >= 2);
  assert.equal(offBlocks[0].goalKey, "accum");                 // first off-season block = recondition base
  assert.ok(offBlocks.every((b) => b.goalKey !== "realize"));  // never a peak off-season (no fixture to realize for)
});

test("detectSeasonPhases: next pre-season bounds the off-season; a weeks length sets it otherwise", () => {
  const fx = [{ date: "2026-04-10", competition: null, isHome: null }, { date: "2026-09-20", competition: null, isHome: null }];
  // Next pre-season start → off-season ends exactly there.
  const bounded = detectSeasonPhases(fx, null, { seasonEnd: "2026-10-26", nextPreseasonStart: "2027-01-15" });
  const offB = bounded.find((p) => p.key === "offseason")!;
  assert.equal(offB.start, "2026-10-27"); // day after the competitive end
  assert.equal(offB.end, "2027-01-15"); // bounded by next pre-season
  // No next pre-season but an explicit length → that many weeks.
  const sized = detectSeasonPhases(fx, null, { seasonEnd: "2026-10-26", offseasonWeeks: 6 });
  const offS = sized.find((p) => p.key === "offseason")!;
  assert.equal(offS.weeks, 6);
  // Default horizon when neither is set.
  const def = detectSeasonPhases(fx, null, { seasonEnd: "2026-10-26" });
  assert.equal(def.find((p) => p.key === "offseason")!.weeks, 10);
});

test("buildMesoBlocks: an off-season start later than season end makes a holiday (Frí) block before the build", () => {
  const fx = ["2026-04-10", "2026-06-10", "2026-09-10"];
  const phases = detectSeasonPhases(fx.map((d) => ({ date: d, competition: null, isHome: null })), null, { seasonEnd: "2026-10-26", nextPreseasonStart: "2027-01-11" });
  const comp = phases.find((p) => p.key === "competitive")!;
  const off = phases.find((p) => p.key === "offseason")!;
  const blocks = buildMesoBlocks(phases[0].start, phases[phases.length - 1].end, [], 4, 650, fx, comp.start, [], off.start, "2026-11-16");
  const offBlocks = blocks.filter((b) => b.start >= comp.end);
  assert.equal(offBlocks[0].goalKey, "deload");        // the holiday is a full-rest (deload) block
  assert.equal(offBlocks[0].phase.en, "Off-season break");
  assert.equal(offBlocks[0].start, "2026-11-02"); // Monday-aligned (season end 26 Oct Mon → first full off-week Mon 2 Nov)
  assert.equal(offBlocks[0].end, "2026-11-16");
  assert.equal(offBlocks[1].goalKey, "accum");         // the build still starts at accumulation after the holiday
  assert.ok(offBlocks.slice(1).every((b) => b.goalKey !== "realize"));
  // With no off-season start, there is no holiday block.
  const noHol = buildMesoBlocks(phases[0].start, phases[phases.length - 1].end, [], 4, 650, fx, comp.start, [], off.start, null);
  assert.equal(noHol.filter((b) => b.start >= comp.end)[0].goalKey, "accum");
});

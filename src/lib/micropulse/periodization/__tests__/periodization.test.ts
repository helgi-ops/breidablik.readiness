import { test } from "vitest";
import assert from "node:assert/strict";
import { detectSeasonPhases, buildMesoBlocks, intervalSpeedsFromMas, strengthFromVbt, dataReadiness, strengthDefaultForBlock, valdVolumeCap, teamAverages, positionGroup, mdWeekTargets, dataTier, classifyMatchWeek, congestedWeeks, matchAxisTargets, computeMatchUnit, weeklyTargetFromMatch, buildMesoPlan, buildCalendarBlock, recommendBlockGoal, type WeekLoad, type SessionRow, type TeamAverages, type PlayerMatchRow } from "../index";

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
  const unit = { dist: 12564, hsr: 988, load: 1184, accdec: 259 };
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
});

test("buildCalendarBlock: honours the coach's skeleton — explicit match days + forced off/on", () => {
  const unit = { dist: 12564, hsr: 988, load: 1184, accdec: 259 };
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
});

test("recommendBlockGoal: fatigue overrides sequence; phase / runway / sequence otherwise", () => {
  const base = { phaseKey: "competitive" as const, weeksToNextFixture: 8, matchesPerWeek: 1, deloadNow: false, deloadReason: null, prevGoal: null, fixturesLoaded: 20, loadHistoryWeeks: 20 };
  // Fatigue first — a deload flag wins regardless of where they are in the sequence.
  const dl = recommendBlockGoal({ ...base, prevGoal: "accum", deloadNow: true, deloadReason: { en: "Acute load rising sharply", is: "x" } });
  assert.equal(dl.goal, "deload");
  assert.match(dl.reasons[0].en, /rising sharply/);
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

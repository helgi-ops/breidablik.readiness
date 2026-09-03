import { test } from "vitest";
import assert from "node:assert/strict";
import { detectSeasonPhases, buildMesoBlocks, intervalSpeedsFromMas, strengthFromVbt, dataReadiness, strengthDefaultForBlock, valdVolumeCap, teamAverages, positionGroup, mdWeekTargets, dataTier, type WeekLoad, type SessionRow, type TeamAverages } from "../index";

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

test("buildMesoBlocks: flags a load spike as a deload and rotates goals", () => {
  // 12 weeks; a clear spike in block 2 (weeks 5-8) vs the prior 4-week chronic.
  const weeks: WeekLoad[] = [];
  const base = Date.parse("2026-04-06");
  for (let i = 0; i < 12; i++) {
    const load = i >= 4 && i < 8 ? 4200 : 2000; // block 2 doubles the load → ACWR spike
    weeks.push({ weekStart: new Date(base + i * 7 * 86_400_000).toISOString().slice(0, 10), load, readiness: 70 });
  }
  const blocks = buildMesoBlocks("2026-04-06", "2026-06-29", weeks, 4);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].phase.en, "Accumulation");
  const spiked = blocks[1];
  assert.ok(spiked.acwr != null && spiked.acwr > 1.3);   // measured from the real load
  assert.equal(spiked.isDeload, true);
  assert.match(spiked.flag!.en, /spike/i);
  assert.ok(spiked.volumeTargetPct != null && spiked.volumeTargetPct < 100); // cuts volume
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
  const b: TeamAverages = { sessions: 100, players: 9, distanceM: 4600, hsrM: 260, sprintM: 90, maxKmh: 31, playerLoad: 470, plPerMin: 10, accel: 43, decel: 57, direction: null, matchSessions: 20, matchDistanceM: 11000, matchHsrM: 900, matchPlayerLoad: 1100 };
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
  const shaped = mdWeekTargets(b, { "MD-4": 2.0 });
  const md4Hsr = shaped.find((d) => d.mdTag === "MD-4")!.targets.find((t) => /HSR/.test(t.metric.en))!.value;
  assert.ok(/520 m/.test(md4Hsr));
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

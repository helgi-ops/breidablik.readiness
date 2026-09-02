import { test } from "vitest";
import assert from "node:assert/strict";
import {
  buildMicrocycleProgramme,
  preferredMdForQuality,
  type BuildMicrocycleInput,
  type MdTag,
} from "../index";
import type { PlayerStrengthSnapshot } from "../../strengthProgramming";

function baseSnap(): PlayerStrengthSnapshot {
  return {
    playerId: "p1", playerName: "Test Player", todayIso: "2026-09-01", mdContext: "MD-4",
    verdict: null, sprintSpeedDropPct: null, sprintExposureBand: null,
    codAsymmetryPct: null, codWeakerSide: null, decelBurdenBand: null,
    decelBurdenHighStreakDays: 0,
    wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
    vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null,
    isCongestedWeek: false,
  };
}

function daysMon(mds: MdTag[], startIso = "2026-09-01"): BuildMicrocycleInput["days"] {
  return mds.map((mdTag, i) => {
    const d = new Date(`${startIso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), mdTag, isTodayOrPast: false, readinessColor: null };
  });
}

test("planned load tapers DOWN toward the match (never rises approaching MD)", () => {
  const prog = buildMicrocycleProgramme({
    baseSnapshot: baseSnap(),
    days: daysMon(["MD-4", "MD-3", "MD-2", "MD-1", "MD"]),
    topGaps: [], weekStart: "2026-09-01",
  });
  const sev = { green: 0, yellow: 1, red: 2, none: -1 } as const;
  const md4 = prog.days.find((d) => d.mdTag === "MD-4")!;
  const md2 = prog.days.find((d) => d.mdTag === "MD-2")!;
  const md1 = prog.days.find((d) => d.mdTag === "MD-1")!;
  assert.equal(md4.plannedBand, "high");
  assert.equal(md4.colour, "green");
  assert.equal(md2.colour, "yellow");
  assert.equal(md1.colour, "red"); // lightest, closest to the match
  // monotonic non-decreasing severity from MD-4 → MD-1
  assert.ok(sev[md4.colour] <= sev[md2.colour] && sev[md2.colour] <= sev[md1.colour]);
});

test("a FUTURE day ignores readiness (planned colour stands)", () => {
  const days = daysMon(["MD-4"]);
  days[0].readinessColor = "red"; // but isTodayOrPast stays false
  const prog = buildMicrocycleProgramme({ baseSnapshot: baseSnap(), days, topGaps: [], weekStart: "2026-09-01" });
  assert.equal(prog.days[0].colour, "green");        // planned high, not eased
  assert.equal(prog.days[0].readinessAdjusted, false);
});

test("TODAY: readiness can DOWNGRADE a hard day but NEVER upgrade a light one", () => {
  // Hard day + red check-in → eased to red.
  const hard = daysMon(["MD-4"]);
  hard[0] = { ...hard[0], isTodayOrPast: true, readinessColor: "red" };
  const p1 = buildMicrocycleProgramme({ baseSnapshot: baseSnap(), days: hard, topGaps: [], weekStart: "2026-09-01" });
  assert.equal(p1.days[0].colour, "red");
  assert.equal(p1.days[0].readinessAdjusted, true);

  // Light day + green check-in → stays light (never upgraded to green).
  const light = daysMon(["MD-1"]);
  light[0] = { ...light[0], isTodayOrPast: true, readinessColor: "green" };
  const p2 = buildMicrocycleProgramme({ baseSnapshot: baseSnap(), days: light, topGaps: [], weekStart: "2026-09-01" });
  assert.equal(p2.days[0].colour, "red");
  assert.equal(p2.days[0].readinessAdjusted, false);
});

test("a capacity gap is placed on the day that trains it (power → MD-3)", () => {
  assert.equal(preferredMdForQuality("reactive_power"), "MD-3");
  const prog = buildMicrocycleProgramme({
    baseSnapshot: baseSnap(),
    days: daysMon(["MD-4", "MD-3", "MD-2"]),
    topGaps: [{ quality: "reactive_power", source: "role", label: { en: "reactive power", is: "hvatkraftur" }, preferredMd: "MD-3" }],
    weekStart: "2026-09-01",
  });
  const md3 = prog.days.find((d) => d.mdTag === "MD-3")!;
  const md4 = prog.days.find((d) => d.mdTag === "MD-4")!;
  assert.equal(md3.emphasis.length, 1);
  assert.equal(md3.emphasis[0].quality, "reactive_power");
  assert.equal(md4.emphasis.length, 0); // not this day
});

test("MD (match) and OFF carry no strength session", () => {
  const prog = buildMicrocycleProgramme({
    baseSnapshot: baseSnap(),
    days: daysMon(["MD", "OFF"]),
    topGaps: [], weekStart: "2026-09-01",
  });
  assert.equal(prog.days[0].session, null); // MD
  assert.equal(prog.days[1].session, null); // OFF
  assert.equal(prog.days[1].colour, "none");
});

test("injured player → no team strength session in any day (rehab-only)", () => {
  const snap = baseSnap(); snap.injuryStatus = "injured";
  const prog = buildMicrocycleProgramme({
    baseSnapshot: snap, days: daysMon(["MD-4", "MD-3"]), topGaps: [], weekStart: "2026-09-01",
  });
  // buildStrengthSession returns a rehab-only session (blocks empty) for injured.
  for (const d of prog.days) {
    assert.ok(d.session === null || d.session.templateId === "rehab-only");
  }
});

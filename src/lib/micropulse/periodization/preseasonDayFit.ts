/**
 * Fit a pre-season calendar week to the week's planned total, per variable.
 *
 * The ramp (`preseasonStartRamp`) sets each week's total per variable (distance, HSR, PlayerLoad, accel/decel,
 * IMA…), each with its own multiple of a match. The calendar (`buildCalendarBlock`) lays out the days and the
 * SHAPE of the week (a mechanical day carries more accel/decel, a locomotive day more running). This joins them:
 * the friendly counts toward the week as it is, and the training days share what is left, in the calendar's own
 * proportions. So when the coach adds a session the others get lighter, and when he takes one out the rest carry
 * it — the week still lands on the plan (preseasonMatchExposure: "training fills the remainder").
 *
 * Pure. Rest days stay empty; match days are never changed. No new numbers: the totals are the ramp's and the
 * split is the calendar's. Descriptive — never the readiness colour.
 */

import type { CalWeek, CalDay, MatchUnitAbs } from "./index";
import type { PreseasonWeekTarget } from "./preseasonStart";

type Axis = "dist" | "hsr" | "load" | "accel" | "decel" | "cod" | "fr" | "stride";

/** The week's planned total for each calendar axis (null = the ramp has no total for it → left as is). */
export function weekTotalsFromTarget(t: PreseasonWeekTarget): Record<Axis, number | null> {
  const k = t.byKpi as Partial<Record<string, number>>;
  const b5 = k.velocityBand5, b6 = k.velocityBand6;
  return {
    dist: k.totalDistance ?? null,
    // Calendar HSR = band 5 + band 6 (velocityBand5 is HSR − sprint; preseasonKpiMap).
    hsr: b5 != null ? b5 + (b6 ?? 0) : null,
    load: k.totalPlayerLoad ?? t.weeklyLoadTarget ?? null,
    accel: k.accelB23 ?? null,
    decel: k.decelB23 ?? null,
    cod: k.imaCod ?? null,
    fr: k.imaFrDistance ?? null,
    stride: k.imaStrideHi ?? null,
  };
}

const isTraining = (d: CalDay) => d.type !== "rest" && d.type !== "match";

export type FitNote = { axis: Axis; target: number; matchPart: number };

/** Scale the week's training days so each axis sums to the planned total. Returns the new week + notes on
 *  axes where the friendly alone already reaches the total (training gets nothing for that axis). */
export function fitWeekToTarget(week: CalWeek, target: PreseasonWeekTarget, unit: MatchUnitAbs): { week: CalWeek; notes: FitNote[] } {
  const totals = weekTotalsFromTarget(target);
  const days: CalDay[] = week.days.map((d) => ({ ...d }));
  const notes: FitNote[] = [];
  const factor: Partial<Record<Axis, number>> = {};
  for (const axis of Object.keys(totals) as Axis[]) {
    const total = totals[axis];
    if (total == null) continue;
    const matchPart = days.filter((d) => d.type === "match").reduce((s, d) => s + ((d[axis] as number | null | undefined) ?? 0), 0);
    const trainSum = days.filter(isTraining).reduce((s, d) => s + ((d[axis] as number | null | undefined) ?? 0), 0);
    if (trainSum <= 0) continue; // no training day carries this axis → nothing to fit
    const remainder = Math.max(0, total - matchPart);
    if (remainder === 0) notes.push({ axis, target: total, matchPart });
    factor[axis] = remainder / trainSum;
  }
  for (const d of days) {
    if (!isTraining(d)) continue;
    for (const [axis, f] of Object.entries(factor) as Array<[Axis, number]>) {
      const v = d[axis] as number | null | undefined;
      if (v != null) (d as Record<Axis, number | null | undefined>)[axis] = Math.round(v * f);
    }
    // High-intensity accel/decel are subsets of accel/decel: they move with them.
    if (factor.accel != null && d.accHiEff != null) d.accHiEff = Math.round(d.accHiEff * factor.accel);
    if (factor.decel != null && d.decHiEff != null) d.decHiEff = Math.round(d.decHiEff * factor.decel);
  }
  // The week's summary percentages (training days vs one match) follow the fitted days.
  const sum = (f: (d: CalDay) => number | null | undefined) => days.filter(isTraining).reduce((s, d) => s + (f(d) ?? 0), 0);
  const pct = (v: number, ref: number | null | undefined) => (ref ? Math.round((v / ref) * 100) : null);
  const unitAccDec = (unit.accHiEff ?? 0) + (unit.decHiEff ?? 0);
  return {
    week: {
      // The calendar's "held at match ceiling" note described its own capped days; the fitted days follow the
      // ramp's total instead, so the note no longer applies.
      ...week, days, capNote: null,
      pctRunning: pct(sum((d) => d.dist), unit.dist),
      pctHsr: pct(sum((d) => d.hsr), unit.hsr),
      pctMech: pct(sum((d) => d.load), unit.load),
      pctAccDec23: unitAccDec > 0 ? Math.round((sum((d) => (d.accHiEff ?? 0) + (d.decHiEff ?? 0)) / unitAccDec) * 100) : null,
      pctStride: pct(sum((d) => d.stride), unit.stride),
      pctFr: pct(sum((d) => d.fr), unit.fr),
      pctCod: pct(sum((d) => d.cod), unit.cod),
      pctAccel: pct(sum((d) => d.accel), unit.accel),
      pctDecel: pct(sum((d) => d.decel), unit.decel),
    },
    notes,
  };
}

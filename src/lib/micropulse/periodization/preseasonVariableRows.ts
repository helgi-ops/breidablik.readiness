/**
 * Pre-season "Load per variable": week 1 → peak → light week for every variable, as × a match beside the
 * research training:match range. One pure function so the hub table (PreseasonWeek1Table) and the pre-season PDF
 * print the same numbers. Presentation only — no new rule: the ramp comes from preseasonRamp, the range from
 * kpiTmRefRange.
 */

import { kpiTmRefRange } from "@/lib/micropulse/periodization/plannedVolume";
import { PRESEASON_DEFAULT_WEEK1 } from "@/lib/micropulse/periodization/preseasonWindow";
import type { PreseasonWeekTarget } from "@/lib/micropulse/periodization/preseasonStart";
import { WEEKLY_LOAD_LABELS, type WeeklyLoadMetricKey } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";

type Bi = { en: string; is: string };

/** One variable. w1 / prop / pk / lt are × a match (2 decimals); w1Raw is week 1 in the variable's own unit. */
export type PreseasonVariableRow = {
  k: string; lab: Bi; unit: string;
  w1: number | null; w1Raw: number | null; prop: number | null; mine: boolean;
  pk: number | null; lt: number | null; ref: [number, number] | null;
};

export type PreseasonVariableRows = {
  /** The variables (match value known, week 1 set), in kpiKeys order, then the overall PlayerLoad row last. */
  rows: PreseasonVariableRow[];
  /** 1-based week numbers of the peak and the light week (null = no light week). */
  peakNo: number;
  lightNo: number | null;
};

export function preseasonVariableRows({ ramp, kpiKeys, proposal, matchKpi, week1Kpi, week1Mult }: {
  ramp: PreseasonWeekTarget[];
  kpiKeys: WeeklyLoadMetricKey[];
  /** Week 1 with no coach values (the system's proposal). */
  proposal: PreseasonWeekTarget;
  /** One team match per variable (the × a match unit). */
  matchKpi: Record<string, number | undefined>;
  week1Kpi: Record<string, number>;
  week1Mult: number;
}): PreseasonVariableRows {
  const mvOf = (k: string) => { const mv = matchKpi[k]; return mv != null && mv > 0 ? mv : null; };
  const xm = (v: number | null | undefined, k: string) => { const mv = mvOf(k); return v != null && mv != null ? Math.round((v / mv) * 100) / 100 : null; };

  const last = ramp[ramp.length - 1];
  const lightW = last.taper ? last : null;
  const peakW = lightW && ramp.length >= 2 ? ramp[ramp.length - 2] : ramp.reduce((m, w) => ((w.multipleOfMatch ?? 0) > (m.multipleOfMatch ?? 0) ? w : m), ramp[0]);

  const rows: PreseasonVariableRow[] = [
    ...kpiKeys.filter((k) => mvOf(k) != null && ramp[0].byKpi[k] != null).map((k) => ({
      k, lab: WEEKLY_LOAD_LABELS[k], unit: WEEKLY_LOAD_LABELS[k].unit,
      w1: xm(ramp[0].byKpi[k], k), w1Raw: ramp[0].byKpi[k] ?? null, prop: xm(proposal.byKpi[k], k), mine: week1Kpi[k] != null,
      pk: xm(peakW.byKpi[k], k), lt: lightW ? xm(lightW.byKpi[k], k) : null, ref: kpiTmRefRange(k),
    })),
    {
      k: "totalPlayerLoad", lab: { en: "Overall load (PlayerLoad)", is: "Heildarálag (PlayerLoad)" }, unit: "",
      w1: ramp[0].multipleOfMatch ?? null, w1Raw: null, prop: PRESEASON_DEFAULT_WEEK1, mine: week1Mult !== PRESEASON_DEFAULT_WEEK1,
      pk: peakW.multipleOfMatch ?? null, lt: lightW ? lightW.multipleOfMatch ?? null : null, ref: kpiTmRefRange("totalPlayerLoad"),
    },
  ];
  return { rows, peakNo: ramp.indexOf(peakW) + 1, lightNo: lightW ? ramp.length : null };
}

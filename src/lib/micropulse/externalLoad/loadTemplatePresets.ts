/**
 * Per-MD-day load-distribution PRESETS (pure — no I/O, client-safe).
 *
 * A preset fills the team's match_demand_template with a named directional shape the coach
 * can then tune. Two are shipped: the Martín-García 2018 default (MD-4 peak) and an Owen-style
 * steep taper (MD-4 peak, then a steeper fall to the lowest MD-1 — taper after Owen 2017).
 * Owen put the peak on MD-3; since 2026-11-24 every MicroPulse week shape puts it on MD-4 (coach's
 * call, Martín-García 2018), so this preset keeps Owen's steeper taper but not his peak day. The
 * papers give no exact per-KPI percentages: the numbers are MicroPulse's and stay editable.
 *
 * Descriptive planning config — never the readiness colour or the daily decision.
 */

import type { WeeklyLoadMetricKey } from "./weeklyLoadTypes";

export type MdDayTemplate = Record<string, Partial<Record<WeeklyLoadMetricKey, number>>>;

/** Martín-García 2018 (Barcelona B) — the default distribution (MD-4 the peak training day). */
export const MARTIN_GARCIA_TEMPLATE: MdDayTemplate = {
  "MD-5": { totalDistance: 1.10, totalPlayerLoad: 1.10, velocityBand5: 0.80, velocityBand6: 0.50, accelB23: 1.00, decelB23: 1.00, fmpDynamicHigh: 0.70, fmpDynamicMedium: 0.85, fmpRunningHigh: 0.75, imaTotal: 0.90 },
  "MD-4": { totalDistance: 1.15, totalPlayerLoad: 1.15, velocityBand5: 1.00, velocityBand6: 0.70, accelB23: 1.10, decelB23: 1.10, fmpDynamicHigh: 1.00, fmpDynamicMedium: 1.05, fmpRunningHigh: 1.05, imaTotal: 1.10 },
  "MD-3": { totalDistance: 1.00, totalPlayerLoad: 1.00, velocityBand5: 0.80, velocityBand6: 0.50, accelB23: 0.90, decelB23: 0.90, fmpDynamicHigh: 0.80, fmpDynamicMedium: 0.90, fmpRunningHigh: 0.90, imaTotal: 0.90 },
  "MD-2": { totalDistance: 0.75, totalPlayerLoad: 0.80, velocityBand5: 0.50, velocityBand6: 0.35, accelB23: 0.60, decelB23: 0.60, fmpDynamicHigh: 0.50, fmpDynamicMedium: 0.65, fmpRunningHigh: 0.55, imaTotal: 0.60 },
  "MD-1": { totalDistance: 0.50, totalPlayerLoad: 0.55, velocityBand5: 0.30, velocityBand6: 0.20, accelB23: 0.40, decelB23: 0.40, fmpDynamicHigh: 0.30, fmpDynamicMedium: 0.40, fmpRunningHigh: 0.35, imaTotal: 0.40 },
  "MD+1": { totalDistance: 0.40, totalPlayerLoad: 0.40, velocityBand5: 0.15, velocityBand6: 0.05, accelB23: 0.30, decelB23: 0.30, fmpDynamicHigh: 0.15, fmpDynamicMedium: 0.30, fmpRunningHigh: 0.20, imaTotal: 0.30 },
  "MD": { totalDistance: 1.00, totalPlayerLoad: 1.00, velocityBand5: 1.00, velocityBand6: 1.00, accelB23: 1.00, decelB23: 1.00, fmpDynamicHigh: 1.00, fmpDynamicMedium: 1.00, fmpRunningHigh: 1.00, imaTotal: 1.00 },
};

/** Owen-style steep taper — MD-4 the peak training day (MicroPulse's order), then a steeper fall than
 *  Martin-Garcia to the lowest MD-1 (taper after Owen 2017; Owen's own peak was MD-3). */
export const OWEN_CUPS_TEMPLATE: MdDayTemplate = {
  "MD-5": { totalDistance: 1.05, totalPlayerLoad: 1.05, velocityBand5: 0.75, velocityBand6: 0.45, accelB23: 0.95, decelB23: 0.95, fmpDynamicHigh: 0.65, fmpDynamicMedium: 0.80, fmpRunningHigh: 0.70, imaTotal: 0.85 },
  "MD-4": { totalDistance: 1.20, totalPlayerLoad: 1.20, velocityBand5: 1.05, velocityBand6: 0.80, accelB23: 1.15, decelB23: 1.15, fmpDynamicHigh: 1.05, fmpDynamicMedium: 1.10, fmpRunningHigh: 1.10, imaTotal: 1.15 },
  "MD-3": { totalDistance: 1.10, totalPlayerLoad: 1.10, velocityBand5: 0.90, velocityBand6: 0.60, accelB23: 1.05, decelB23: 1.05, fmpDynamicHigh: 0.90, fmpDynamicMedium: 0.95, fmpRunningHigh: 0.95, imaTotal: 1.00 },
  "MD-2": { totalDistance: 0.70, totalPlayerLoad: 0.72, velocityBand5: 0.45, velocityBand6: 0.30, accelB23: 0.55, decelB23: 0.55, fmpDynamicHigh: 0.45, fmpDynamicMedium: 0.60, fmpRunningHigh: 0.50, imaTotal: 0.55 },
  "MD-1": { totalDistance: 0.45, totalPlayerLoad: 0.48, velocityBand5: 0.25, velocityBand6: 0.15, accelB23: 0.35, decelB23: 0.35, fmpDynamicHigh: 0.25, fmpDynamicMedium: 0.35, fmpRunningHigh: 0.30, imaTotal: 0.35 },
  "MD+1": { totalDistance: 0.40, totalPlayerLoad: 0.40, velocityBand5: 0.15, velocityBand6: 0.05, accelB23: 0.30, decelB23: 0.30, fmpDynamicHigh: 0.15, fmpDynamicMedium: 0.30, fmpRunningHigh: 0.20, imaTotal: 0.30 },
  "MD": { totalDistance: 1.00, totalPlayerLoad: 1.00, velocityBand5: 1.00, velocityBand6: 1.00, accelB23: 1.00, decelB23: 1.00, fmpDynamicHigh: 1.00, fmpDynamicMedium: 1.00, fmpRunningHigh: 1.00, imaTotal: 1.00 },
};

export type LoadTemplatePresetKey = "martin_garcia" | "owen_cups";

/** The named presets a coach can apply from the load-target settings (all tunable after). */
export const LOAD_TEMPLATE_PRESETS: Record<LoadTemplatePresetKey, { label: { en: string; is: string }; desc: { en: string; is: string }; template: MdDayTemplate }> = {
  martin_garcia: {
    label: { en: "Martin-Garcia (default)", is: "Martin-Garcia (sjálfgefið)" },
    desc: { en: "MD-4 the peak training day (Martín-García 2018).", is: "MD-4 er þyngsti æfingadagurinn (Martín-García 2018)." },
    template: MARTIN_GARCIA_TEMPLATE,
  },
  owen_cups: {
    label: { en: "Steep taper (after Owen)", is: "Brött niðurtröppun (eftir Owen)" },
    desc: { en: "MD-4 the peak, then a steeper fall to the lowest MD-1 than the default — taper after Owen 2017 (Owen put the peak on MD-3; how steep is MicroPulse's). Tunable.", is: "MD-4 þyngstur, svo brattari lækkun niður í lægsta MD-1 en sjálfgefið — niðurtröppun eftir Owen 2017 (Owen setti toppinn á MD-3; brattinn er val MicroPulse). Stillanlegt." },
    template: OWEN_CUPS_TEMPLATE,
  },
};

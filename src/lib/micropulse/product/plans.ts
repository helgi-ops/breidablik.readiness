import { PLAN_FEATURES } from "./features";
import type { PlanDefinition } from "./types";

/**
 * Canonical plan definitions. This is the single source for names, pricing, and
 * included features so homepage/pricing/settings stay aligned.
 */
export const PLAN_DEFINITIONS: Record<PlanDefinition["key"], PlanDefinition> = {
  FREE: {
    key: "FREE",
    displayName: "Free",
    monthlyPriceLabel: "€0 / month",
    annualPriceLabel: null,
    targetAudience: ["Small teams", "Academies", "Coaches testing the platform"],
    summary: "Start with daily monitoring and basic team visibility.",
    featureKeys: PLAN_FEATURES.FREE,
    sortOrder: 1,
    highlighted: false,
  },
  // Lite — for clubs on standard Catapult Activity Reports OR clubs with no
  // GPS at all (indoor sports without IMU vests). Sport-agnostic — pricing
  // is anchored to data tier (Lite Catapult plan) not sport. This replaced
  // the Pro Indoor tier in May 2026 because Pro Indoor required Premium
  // Catapult IMU plans which no Iceland indoor club had — net result was
  // an empty addressable market priced higher than Lite, which was upside-
  // down strategically.
  LITE: {
    key: "LITE",
    displayName: "Lite",
    monthlyPriceLabel: "€129 / month",
    annualPriceLabel: null,
    targetAudience: ["Lower-division clubs", "Indoor sports without IMU vests", "Clubs on standard Catapult plans", "Academies graduating from Free"],
    summary: "Standalone sport-science suite built on Gabbett 2016, Malone 2017, Foster 1998, Buchheit 2018 — works on RPE + wellness alone, or RPE + standard Catapult Activity Reports.",
    featureKeys: PLAN_FEATURES.LITE,
    sortOrder: 2,
    highlighted: false,
  },
  PRO: {
    key: "PRO",
    displayName: "Pro",
    monthlyPriceLabel: "€349 / month",
    annualPriceLabel: null,
    targetAudience: ["S&C coaches", "Performance staff", "Top-flight clubs", "Premium Catapult subscribers (B2-3 efforts or IMU bands)"],
    summary: "Adds Decel Intelligence, Indoor Load, Quadrant 2017 B2-3 axis, Sharp Cut, MPE Recovery — the full McBurnie 2022 stack on top of everything in Lite.",
    featureKeys: PLAN_FEATURES.PRO,
    sortOrder: 3,
    highlighted: true,
  },
  ELITE: {
    key: "ELITE",
    displayName: "Elite",
    monthlyPriceLabel: "From €1250 / month",
    annualPriceLabel: null,
    targetAudience: ["Professional clubs", "Multi-team organizations", "Performance directors", "Medical and leadership staff"],
    summary: "Scale performance intelligence across teams, departments, and leadership.",
    featureKeys: PLAN_FEATURES.ELITE,
    sortOrder: 4,
    highlighted: false,
  },
};

export const ORDERED_PLAN_DEFINITIONS: PlanDefinition[] = Object.values(PLAN_DEFINITIONS).sort((a, b) => a.sortOrder - b.sortOrder);

export function getPlanDefinition(plan: PlanDefinition["key"]): PlanDefinition {
  return PLAN_DEFINITIONS[plan];
}

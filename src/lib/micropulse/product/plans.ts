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
  PRO: {
    key: "PRO",
    displayName: "Pro",
    monthlyPriceLabel: "€349 / month",
    annualPriceLabel: null,
    targetAudience: ["S&C coaches", "Performance staff", "Single-team environments", "Semi-professional teams"],
    summary: "Run daily team operations with smarter readiness and session decision support.",
    featureKeys: PLAN_FEATURES.PRO,
    sortOrder: 2,
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
    sortOrder: 3,
    highlighted: false,
  },
};

export const ORDERED_PLAN_DEFINITIONS: PlanDefinition[] = Object.values(PLAN_DEFINITIONS).sort((a, b) => a.sortOrder - b.sortOrder);

export function getPlanDefinition(plan: PlanDefinition["key"]): PlanDefinition {
  return PLAN_DEFINITIONS[plan];
}

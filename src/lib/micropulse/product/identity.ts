import type { ProductIdentity } from "./types";

/**
 * Canonical product identity for consistent positioning across homepage, pricing,
 * settings, and future sales/billing surfaces.
 */
export const MICROPULSE_PRODUCT_IDENTITY: ProductIdentity = {
  name: "MicroPulse",
  shortTagline: "Turn athlete monitoring into better daily decisions.",
  longDescription:
    "MicroPulse connects athlete monitoring, training decisions, and performance intelligence in one platform. Instead of just collecting data, MicroPulse helps coaching and performance staff understand what the data means and what to do next.",
  category: "Performance Intelligence Platform",
  positioningSummary:
    "A decision engine for coaching, performance, and medical staff that turns monitoring data into actionable training decisions.",
  primaryAudience: [
    "Coaches",
    "Strength & Conditioning Staff",
    "Performance Directors",
    "Medical / Performance Teams",
    "Clubs / Multi-team Organizations",
  ],
  coreValuePoints: [
    "Turns monitoring data into actionable training decisions",
    "Detects fatigue and instability earlier",
    "Improves session adjustment and daily decision support",
    "Connects coaching, performance, and medical workflows",
    "Supports operational visibility across teams",
  ],
};

import type { SessionTemplate } from "./types";

export const SESSION_TEMPLATE_LIBRARY: SessionTemplate[] = [
  {
    id: "gym_full_v1",
    name: "Gym Full",
    sessionType: "GYM",
    dayType: "training",
    blocks: [
      { id: "prep", type: "PREP", title: "Movement Prep", defaultDurationMin: 12, defaultIntensity: "LOW" },
      { id: "power", type: "POWER", title: "Power / Explosive", defaultSets: 4, defaultReps: "2-4", defaultIntensity: "HIGH", exposureTags: ["PLYOS"] },
      { id: "strength", type: "STRENGTH", title: "Primary Strength", defaultSets: 4, defaultReps: "3-5", defaultIntensity: "HIGH", exposureTags: ["HEAVY_GYM"] },
      { id: "accessory", type: "ACCESSORY", title: "Accessory Strength", defaultSets: 3, defaultReps: "6-10", defaultIntensity: "MODERATE", optional: true },
      { id: "mobility", type: "MOBILITY", title: "Mobility Finish", defaultDurationMin: 8, defaultIntensity: "LOW" },
    ],
  },
  {
    id: "gym_modified_v1",
    name: "Gym Modified",
    sessionType: "GYM",
    dayType: "training",
    blocks: [
      { id: "prep", type: "PREP", title: "Movement Prep", defaultDurationMin: 10, defaultIntensity: "LOW" },
      { id: "strength_main", type: "STRENGTH", title: "Strength (Controlled)", defaultSets: 3, defaultReps: "3-5", defaultIntensity: "MODERATE", exposureTags: ["HEAVY_GYM"] },
      { id: "isometric", type: "ISOMETRIC", title: "Support Isometrics", defaultSets: 2, defaultReps: "20-30s", defaultIntensity: "LOW" },
      { id: "mobility", type: "MOBILITY", title: "Mobility / Tissue", defaultDurationMin: 10, defaultIntensity: "LOW" },
    ],
  },
  {
    id: "field_full_v1",
    name: "Field Full",
    sessionType: "FIELD",
    dayType: "training",
    blocks: [
      { id: "prep", type: "PREP", title: "Field Warm-up", defaultDurationMin: 12, defaultIntensity: "LOW" },
      { id: "speed", type: "SPEED", title: "Speed Exposure", defaultDurationMin: 15, defaultIntensity: "HIGH", exposureTags: ["MAX_SPEED", "HIGH_DECEL"] },
      { id: "main", type: "MAIN", title: "Main Tactical Block", defaultDurationMin: 30, defaultIntensity: "MODERATE" },
      { id: "conditioning", type: "CONDITIONING", title: "Conditioning", defaultDurationMin: 15, defaultIntensity: "HIGH", exposureTags: ["FIELD_MINUTES"] },
      { id: "down", type: "DOWNREGULATION", title: "Downregulation", defaultDurationMin: 8, defaultIntensity: "LOW" },
    ],
  },
  {
    id: "field_modified_v1",
    name: "Field Modified",
    sessionType: "FIELD",
    dayType: "training",
    blocks: [
      { id: "prep", type: "PREP", title: "Field Warm-up", defaultDurationMin: 10, defaultIntensity: "LOW" },
      { id: "skill", type: "SKILL", title: "Technical Block", defaultDurationMin: 20, defaultIntensity: "MODERATE", exposureTags: ["TECHNICAL_ONLY"] },
      { id: "main", type: "MAIN", title: "Controlled Main Block", defaultDurationMin: 20, defaultIntensity: "MODERATE" },
      { id: "down", type: "DOWNREGULATION", title: "Downregulation", defaultDurationMin: 10, defaultIntensity: "LOW" },
    ],
  },
  {
    id: "recovery_generic_v1",
    name: "Recovery Session",
    sessionType: "RECOVERY",
    dayType: "training",
    blocks: [
      { id: "mobility", type: "MOBILITY", title: "Mobility Flow", defaultDurationMin: 12, defaultIntensity: "LOW", exposureTags: ["RECOVERY_ONLY"] },
      { id: "flush", type: "AEROBIC_FLUSH", title: "Aerobic Flush", defaultDurationMin: 15, defaultIntensity: "LOW", exposureTags: ["RECOVERY_ONLY"] },
      { id: "recovery", type: "RECOVERY", title: "Recovery Modalities", defaultDurationMin: 12, defaultIntensity: "LOW", exposureTags: ["RECOVERY_ONLY"] },
      { id: "down", type: "DOWNREGULATION", title: "Breathing / Downregulation", defaultDurationMin: 8, defaultIntensity: "LOW", exposureTags: ["RECOVERY_ONLY"] },
    ],
  },
  {
    id: "recovery_mdplus1_v1",
    name: "MD+1 Restore",
    sessionType: "RECOVERY",
    dayType: "md+1",
    blocks: [
      { id: "mobility", type: "MOBILITY", title: "Restore Mobility", defaultDurationMin: 10, defaultIntensity: "LOW" },
      { id: "flush", type: "AEROBIC_FLUSH", title: "Low-Intensity Flush", defaultDurationMin: 18, defaultIntensity: "LOW", exposureTags: ["RECOVERY_ONLY"] },
      { id: "iso", type: "ISOMETRIC", title: "Support Isometrics", defaultSets: 2, defaultReps: "20-30s", defaultIntensity: "LOW" },
      { id: "down", type: "DOWNREGULATION", title: "Nervous System Reset", defaultDurationMin: 8, defaultIntensity: "LOW" },
    ],
  },
  {
    id: "protective_mdminus1_v1",
    name: "MD-1 Protective",
    sessionType: "FIELD",
    dayType: "md-1",
    blocks: [
      { id: "prep", type: "PREP", title: "Activation Prep", defaultDurationMin: 10, defaultIntensity: "LOW" },
      { id: "skill", type: "SKILL", title: "Technical Sharpness", defaultDurationMin: 18, defaultIntensity: "MODERATE", exposureTags: ["TECHNICAL_ONLY"] },
      { id: "speed_small", type: "SPEED", title: "Controlled Speed Touch", defaultDurationMin: 8, defaultIntensity: "MODERATE", optional: true },
      { id: "down", type: "DOWNREGULATION", title: "Freshness Close", defaultDurationMin: 8, defaultIntensity: "LOW" },
    ],
  },
  {
    id: "off_restore_v1",
    name: "Off / Restore",
    sessionType: "OFF",
    dayType: "off",
    blocks: [
      { id: "mobility", type: "MOBILITY", title: "Optional Mobility", defaultDurationMin: 12, defaultIntensity: "LOW", optional: true },
      { id: "down", type: "DOWNREGULATION", title: "Recovery Breathing", defaultDurationMin: 8, defaultIntensity: "LOW", optional: true },
    ],
  },
];

export function getSessionTemplateByType(sessionType: SessionTemplate["sessionType"]): SessionTemplate | null {
  return SESSION_TEMPLATE_LIBRARY.find((t) => t.sessionType === sessionType) ?? null;
}

export function getDefaultSessionTemplate(sessionType: SessionTemplate["sessionType"]): SessionTemplate {
  return getSessionTemplateByType(sessionType) ?? SESSION_TEMPLATE_LIBRARY.find((t) => t.id === "recovery_generic_v1")!;
}

export function getMatchdayAwareTemplate(args: {
  sessionType: SessionTemplate["sessionType"];
  dayType?: SessionTemplate["dayType"];
}): SessionTemplate {
  if (args.dayType) {
    const exact = SESSION_TEMPLATE_LIBRARY.find((t) => t.dayType === args.dayType && t.sessionType === args.sessionType);
    if (exact) return exact;
  }

  if (args.dayType === "md+1") return SESSION_TEMPLATE_LIBRARY.find((t) => t.id === "recovery_mdplus1_v1")!;
  if (args.dayType === "md-1") return SESSION_TEMPLATE_LIBRARY.find((t) => t.id === "protective_mdminus1_v1")!;
  if (args.dayType === "off") return SESSION_TEMPLATE_LIBRARY.find((t) => t.id === "off_restore_v1")!;

  return getDefaultSessionTemplate(args.sessionType === "MIXED" ? "FIELD" : args.sessionType);
}

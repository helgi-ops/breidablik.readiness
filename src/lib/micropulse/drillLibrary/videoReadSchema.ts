/**
 * Drill video-read schema + normalizer — pure.
 *
 * A multimodal model reads a drill from sampled video frames and returns the QUALITATIVE / TACTICAL
 * fields only (name, category, format, phases, description, estimates). This normalizer is the hard
 * boundary that the acceptance criteria demand: it accepts ONLY the allowed fields, so the video read
 * can NEVER produce a physical metric (HSR / accel-decel / player-load / distance) or a player identity
 * — those stay GPS-sourced. Unknown / extra keys from the model are dropped. Pure, no I/O.
 *
 * Descriptive AI DRAFT — the coach confirms/edits before anything is saved.
 */

import type { Bi } from "@/lib/micropulse/load/peakPeriod";

/** The football drill categories the read may choose (drill_library.category subset). */
export const VIDEO_READ_CATEGORIES = ["possession", "ssg", "transition", "finishing", "running", "warmup", "other"] as const;
export type VideoReadCategory = (typeof VIDEO_READ_CATEGORIES)[number];

export interface DrillVideoRead {
  suggestedName: string;
  category: VideoReadCategory;
  format: string | null;                 // "6v3", "8v8+2", …
  playersEst: number | null;
  areaType: "small" | "medium" | "large" | null;
  phases: string[];                      // ["possession in grid","transition","finish on goal"]
  equipment: string[];                   // ["mini-goals","mannequin","cones"]
  description: Bi;                        // plain, coach-readable
  intensityEst: "low" | "moderate" | "high" | null;
  confidence: "high" | "moderate" | "low";
  caveat: Bi;                            // "AI read from N frames — confirm"
}

const asStr = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const clampEnum = <T extends string>(v: unknown, allowed: readonly T[], fallback: T | null): T | null => {
  const s = asStr(v).toLowerCase();
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
};
const strArray = (v: unknown, cap: number): string[] =>
  Array.isArray(v) ? v.map(asStr).filter((s) => s.length > 0).slice(0, cap) : [];
const bi = (v: unknown, fallback: Bi): Bi => {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const en = asStr(o.en), is = asStr(o.is);
    if (en || is) return { en: en || is, is: is || en };
  }
  const s = asStr(v);
  return s ? { en: s, is: s } : fallback;
};

/**
 * Coerce a raw model object into a safe DrillVideoRead. Any physical-metric or player-identity keys
 * the model may have emitted are simply not read here, so they cannot reach the drill card from video.
 * `frameCount` only shapes the default caveat text.
 */
export function normalizeDrillVideoRead(raw: unknown, frameCount: number): DrillVideoRead {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const playersRaw = o.playersEst;
  const players = typeof playersRaw === "number" && Number.isFinite(playersRaw) ? Math.max(0, Math.round(playersRaw)) : null;

  return {
    suggestedName: asStr(o.suggestedName) || "Untitled drill",
    category: clampEnum(o.category, VIDEO_READ_CATEGORIES, "other") ?? "other",
    format: asStr(o.format) || null,
    playersEst: players,
    areaType: clampEnum(o.areaType, ["small", "medium", "large"] as const, null),
    phases: strArray(o.phases, 8),
    equipment: strArray(o.equipment, 12),
    description: bi(o.description, { en: "Drill read from video — add detail.", is: "Drilla lesin úr myndbandi — bættu við smáatriðum." }),
    intensityEst: clampEnum(o.intensityEst, ["low", "moderate", "high"] as const, null),
    confidence: clampEnum(o.confidence, ["high", "moderate", "low"] as const, "moderate") ?? "moderate",
    caveat: bi(o.caveat, {
      en: `AI read from ${frameCount} video frame${frameCount === 1 ? "" : "s"} — confirm and edit. Physical load numbers come from GPS, not video.`,
      is: `AI las úr ${frameCount} myndramma${frameCount === 1 ? "" : "m"} — staðfestu og lagfærðu. Álagstölur koma úr GPS, ekki myndbandi.`,
    }),
  };
}

/** Keys that must NEVER appear on a video-read result (they are GPS-sourced). Used by tests + callers. */
export const FORBIDDEN_METRIC_KEYS = [
  "player_load", "player_load_per_min", "vel_b5", "vel_b6", "accel_b23", "decel_b23",
  "distance_m", "hsr", "hsr_m", "max_velocity", "speed", "playerName", "player_name", "players",
] as const;

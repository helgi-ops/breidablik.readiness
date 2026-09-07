/**
 * Fixed JSON schema for the AI movement-vision analysis + the DEFENSIVE
 * NORMALIZATION (OsteoSport pattern, layers 2 & 4). The model must return only
 * these keys; then everything it returns is forced through the known-valid world
 * from the engine (regions.ts) — an invented region key or field id is dropped,
 * severity is clamped to the allowed set, and lengths are capped. So the rest of
 * the app can trust the output 100% and wire `region` + `priorityFieldIds` into
 * the assessment. Pure — no DB, no model, never the readiness colour.
 */
import { FIELD_IDS_BY_REGION, REGION_KEYS, type RegionKey } from "./regions";
import { CORRECTIVE_BY_SLUG } from "../correctives/registry";

export type VisionSeverity = "notable" | "mild" | "normal";
export const VISION_SEVERITIES: VisionSeverity[] = ["notable", "mild", "normal"];

export type VisionObservation = { region: RegionKey; severity: VisionSeverity; text: string };
/** A suggestion may reference real corrective-library slugs (filtered on the server). */
export type VisionSuggestion = { title: string; detail: string; cite?: string; correctiveSlugs?: string[] };

export type MovementVisionAnalysis = {
  summary: string;
  captureQuality: string;
  observations: VisionObservation[];
  patterns: string[];
  suggestions: VisionSuggestion[];
  /** The region to assess next — the carry-over target (or null). */
  region: RegionKey | null;
  /** Field ids WITHIN `region` to star in the assessment. */
  priorityFieldIds: string[];
  references: string[];
  redFlags: string[];
};

const str = (v: unknown, max = 1200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strList = (v: unknown, maxItems: number, maxLen = 600): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];

/**
 * Force a raw model object into the trusted shape. Unknown region keys / field
 * ids are dropped; severity is clamped; everything is length-capped.
 */
export function normalizeMovementVisionAnalysis(raw: unknown): MovementVisionAnalysis {
  const p = (raw ?? {}) as Record<string, unknown>;
  const validRegions = new Set<string>(REGION_KEYS);

  // region to assess next — only a real region key survives.
  const region: RegionKey | null = typeof p.region === "string" && validRegions.has(p.region) ? (p.region as RegionKey) : null;

  // priorityFieldIds — only ids that belong to the REGION that was chosen.
  const regionFields = region ? FIELD_IDS_BY_REGION.get(region) : null;
  const priorityFieldIds = regionFields && Array.isArray(p.priorityFieldIds)
    ? [...new Set((p.priorityFieldIds as unknown[]).map(String))].filter((id) => regionFields.has(id)).slice(0, 8)
    : [];

  // observations — drop any with an unknown region; clamp severity.
  const observations: VisionObservation[] = Array.isArray(p.observations)
    ? (p.observations as unknown[])
        .map((o) => {
          const obj = (o ?? {}) as Record<string, unknown>;
          const rk = typeof obj.region === "string" && validRegions.has(obj.region) ? (obj.region as RegionKey) : null;
          if (!rk) return null;
          const sev = obj.severity;
          const severity: VisionSeverity = sev === "notable" || sev === "mild" || sev === "normal" ? sev : "mild";
          const text = str(obj.text, 800);
          if (!text) return null;
          return { region: rk, severity, text } as VisionObservation;
        })
        .filter((x): x is VisionObservation => x != null)
        .slice(0, 24)
    : [];

  const suggestions: VisionSuggestion[] = Array.isArray(p.suggestions)
    ? (p.suggestions as unknown[])
        .map((s) => {
          const obj = (s ?? {}) as Record<string, unknown>;
          const title = str(obj.title, 200);
          const detail = str(obj.detail, 900);
          if (!title && !detail) return null;
          const cite = str(obj.cite, 200);
          // Only real corrective-library slugs survive (drop invented ones).
          const correctiveSlugs = Array.isArray(obj.correctiveSlugs)
            ? [...new Set((obj.correctiveSlugs as unknown[]).map(String))].filter((s) => CORRECTIVE_BY_SLUG[s]).slice(0, 6)
            : [];
          return { title, detail, ...(cite ? { cite } : {}), ...(correctiveSlugs.length ? { correctiveSlugs } : {}) } as VisionSuggestion;
        })
        .filter((x): x is VisionSuggestion => x != null)
        .slice(0, 8)
    : [];

  return {
    summary: str(p.summary, 1500),
    captureQuality: str(p.captureQuality, 500),
    observations,
    patterns: strList(p.patterns, 10),
    suggestions,
    region,
    priorityFieldIds,
    references: strList(p.references, 12, 240),
    redFlags: strList(p.redFlags, 8),
  };
}

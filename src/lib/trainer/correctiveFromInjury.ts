import "server-only";

/**
 * Corrective-exercise generator from a trainer's free-text injury history.
 *
 * READ-ONLY AI, library-first: the model reads the (usually Icelandic) injury
 * text and maps it onto the app's EXISTING vocabularies — movement
 * `CompensationKey`s and the `classifyRehabTrack` buckets — so the actual
 * exercises come from the CITED corrective library (each with cue, dose, video,
 * citation), not from the model. Only where nothing in the library covers a
 * stated problem does the model propose a clearly-flagged `aiSuggested` item for
 * the trainer to vet. "Rules decide, AI explains."
 *
 * The output is a PROPOSAL the trainer reviews, edits and confirms — nothing is
 * written to any table from here. Screening / training support, never a
 * diagnosis, never the readiness colour.
 *
 * Mirrors the clinical-extract pattern (src/lib/clinical/extractReport.ts): raw
 * fetch, sonnet-5 with thinking disabled (adaptive thinking corrupts the JSON
 * block), fence-tolerant parse, hand-rolled validation (no SDK, no zod).
 */

import {
  prescribeForCompensations,
  type CompensationKey,
} from "@/lib/micropulse/movementScreen/correctives/mapping";
import {
  CORRECTIVE_BY_SLUG,
  SEED_CORRECTIVE_EXERCISES,
  type CorrectiveExercise,
  type CorrectivePhase,
} from "@/lib/micropulse/movementScreen/correctives/registry";
import { classifyRehabTrack } from "@/lib/micropulse/unifiedDeficits/rehabTrackSignals";
import { parseModelJson } from "@/lib/clinical/extractReport";

// Sonnet is the accuracy tier for messy clinical free-text; correctness over latency.
export const CORRECTIVE_MODEL = "claude-sonnet-5";

/** The movement compensations the model may map onto (the library routing key). */
const COMPENSATION_KEYS: CompensationKey[] = [
  "dynamic_valgus", "hip_abductor_weakness", "forward_trunk_lean", "limited_dorsiflexion",
  "low_reactive_strength", "poor_absorption", "landing_instability", "limb_asymmetry",
  "trunk_antirotation",
];
const COMPENSATION_SET = new Set<string>(COMPENSATION_KEYS);

/**
 * classifyRehabTrack's track string → the cited corrective slugs to pull for that
 * injury. Every slug is a real `SEED_CORRECTIVE_EXERCISES` entry (verified), so
 * each resolves to a cited exercise with cue/dose/video. This is the injury-driven
 * half of the library (the compensation engine does not route adductor / calf /
 * hamstring / tendon work).
 */
const TRACK_CORRECTIVE_SLUGS: Record<string, string[]> = {
  jumpers_knee: ["spanish_squat_iso", "iso_wall_sit", "eccentric_step_down", "single_leg_squat"],
  acl_knee: ["spanish_squat_iso", "single_leg_squat", "single_leg_balance", "nordic_hamstring", "drop_landing_soft_catch"],
  achilles: ["iso_single_leg_heel_raise_hold", "smr_calf", "calf_stretch_gastroc", "pogo_hops"],
  calf: ["iso_single_leg_heel_raise_hold", "smr_calf", "calf_stretch_gastroc", "single_leg_hops"],
  hamstring: ["nordic_hamstring", "single_leg_rdl", "single_leg_balance"],
  adductor_groin: ["ball_squeeze_isometric", "side_lying_hip_adduction", "standing_hip_adduction_band", "copenhagen_adduction", "clamshell"],
  low_back: ["hip_ir_mobility", "thoracic_rotation_mobility", "mcgill_curl_up", "mcgill_side_bridge", "bird_dog", "pallof_press", "hip_hinge_dowel"],
};

const PHASE_RANK: Record<string, number> = { inhibit: 0, lengthen: 1, activate: 2, integrate: 3 };

/**
 * Corrective-library slug → an `exercise_library` row name whose curated video
 * demonstrates the same movement. Lets the corrective items reuse the club's
 * OWN demo videos (kept in exercise_library) instead of sourcing new ones. The
 * route looks the names up live, so a re-curated video flows through. Only
 * confident matches are listed; the rest stay video-less (honest).
 */
export const CORRECTIVE_SLUG_TO_LIBRARY: Record<string, string> = {
  copenhagen_adduction: "Copenhagen Adductor",
  ball_squeeze_isometric: "Adductor Plate Squeeze",
  spanish_squat_iso: "Spanish Squat",
  glute_bridge: "Glute Bridge",
  iso_glute_bridge_hold: "ISO Hip Extension (overcoming)",
  barbell_hip_thrust: "Hip Thrust",
  nordic_hamstring: "Nordic Hamstring Curl",
  single_leg_rdl: "Single-Leg RDL",
  pallof_press: "Pallof Press",
  iso_wall_sit: "Wall Sit",
  iso_single_leg_heel_raise_hold: "ISO Calf Raise Hold (Single-Leg)",
  lateral_step_up: "Step-Up",
  crossover_step_up: "Step-Up",
  split_squat: "RFESS",
  suitcase_carry: "Suitcase Carry",
  pogo_hops: "Pogo Jump",
  lateral_hurdle_hop: "Hurdle Hop",
  goblet_squat_knee_tracking: "Goblet Squat",
  goblet_squat_counterbalance: "Goblet Squat",
  side_plank_hip_abduction: "Side Plank",
};

/** A light exercise entry for the manual-add autocomplete. */
export type LibrarySearchItem = {
  name: string;
  nameIs?: string;
  slug?: string;
  dose?: string;
  doseIs?: string;
  cue?: string;
  cueIs?: string;
  citation?: string;
  videoUrl?: string | null;
  kind: "corrective" | "library";
};

/** Search the cited corrective library by name (EN/IS) for the autocomplete. */
export function searchCorrectiveLibrary(q: string, limit = 8): LibrarySearchItem[] {
  const n = q.trim().toLowerCase();
  if (n.length < 2) return [];
  const out: LibrarySearchItem[] = [];
  for (const e of SEED_CORRECTIVE_EXERCISES) {
    if (e.name.en.toLowerCase().includes(n) || e.name.is.toLowerCase().includes(n)) {
      out.push({
        name: e.name.en, nameIs: e.name.is, slug: e.slug,
        dose: e.dose.en, doseIs: e.dose.is, cue: e.cue.en, cueIs: e.cue.is,
        citation: e.citation, videoUrl: e.videoUrl ?? null, kind: "corrective",
      });
      if (out.length >= limit) break;
    }
  }
  return out;
}

export type Side = "left" | "right" | "bilateral" | null;

export type CorrectiveInjury = {
  body_part: string;
  side: Side;
  type: string | null;
  note: string | null;
};

/** A corrective item in the bilingual `{block, items}` family the player card,
 *  strength override and periodised week already render. Library items carry a
 *  citation + (often) a video; `aiSuggested` items are the flagged gap-fills. */
export type CorrectiveItem = {
  slug?: string;
  name: string;
  nameIs?: string;
  cue?: string;
  cueIs?: string;
  dose?: string;
  doseIs?: string;
  target?: string;
  targetIs?: string;
  phase?: CorrectivePhase;
  citation?: string;
  evidenceGrade?: string;
  videoUrl?: string | null;
  /** True = proposed by AI because no library exercise covered a stated problem
   *  (no citation). The trainer must vet it. */
  aiSuggested?: boolean;
  /** True = added by the trainer by hand (not from the library or AI). */
  manual?: boolean;
  /** ISO weekdays (1=Mon..7=Sun) this exercise appears on. Empty/undefined =
   *  every day the prescription runs (the prescription's `weekdays`). Lets the
   *  trainer give different exercises on different days. */
  days?: number[];
};

export type CorrectiveProposal = {
  injuries: CorrectiveInjury[];
  items: CorrectiveItem[];
  citations: string[];
  caveat: string;
  caveatIs: string;
  model: string;
};

const CAVEAT_EN =
  "Training / screening support read from the stated injury history — NOT a diagnosis. Cited exercises come from the app's corrective library; items marked “AI-tillaga” are AI suggestions to vet. Pain or red flags → refer to a clinician.";
const CAVEAT_IS =
  "Þjálfunar- / skimunarstð lesin úr uppgefinni meiðslasögu — EKKI greining. Cited æfingar koma úr corrective-safni kerfisins; æfingar merktar „AI-tillaga“ eru AI-tillögur til yfirferðar. Verkur eða rauð flögg → vísaðu til klínikers.";

const SYSTEM = `You read a personal trainer's free-text notes about ONE client's injury history (usually in Icelandic) and map them onto a sports-rehab app's existing vocabulary so the app can pull CITED corrective exercises. You do NOT prescribe exercises yourself except as a clearly-marked fallback. Return ONLY JSON — no prose, no markdown — matching the schema exactly.

Rules:
- PRESERVE SIDE. Icelandic: "hægri" = right, "vinstri" = left, "báðum megin"/"beggja vegna"/"tívhíða" = bilateral. Use "left"|"right"|"bilateral"|null. Never invent a side that is not stated.
- You are READING, not diagnosing. Only record problems the client actually HAS (current or recurring). A denial ("engin saga um...") is not an injury.
- compensations: pick ONLY from this fixed list where a movement compensation clearly applies to a stated problem; otherwise leave it empty. Allowed: dynamic_valgus, hip_abductor_weakness, forward_trunk_lean, limited_dorsiflexion, low_reactive_strength, poor_absorption, landing_instability, limb_asymmetry, trunk_antirotation. (e.g. a groin/adductor or low-back problem often maps to hip_abductor_weakness and/or trunk_antirotation.)
- aiSuggested: ONLY for a stated problem that neither an injury nor a compensation would cover with the app's library (e.g. shin splints / beinhimnubólga). Keep it to 1–3 conservative, low-risk prehab items, each with a plain cue and a sensible dose. Never for something a compensation already covers. Provide name (English) and nameIs (Icelandic).
- If nothing applies, return empty arrays. Do not invent values.

Schema:
{
  "injuries": [ { "body_part": string, "side": "left"|"right"|"bilateral"|null, "type": string|null, "note": string|null } ],
  "compensations": [ string ],
  "aiSuggested": [ { "name": string, "nameIs": string, "cue": string, "dose": string, "why": string, "targetArea": string } ]
}`;

function str(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s.length ? s : null;
}
function coerceSide(v: unknown): Side {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "left" || s === "vinstri" || s === "l") return "left";
  if (s === "right" || s === "hægri" || s === "r") return "right";
  if (s === "bilateral" || s === "both" || s === "báðum" || s === "bilat") return "bilateral";
  return null;
}

type Parsed = {
  injuries: CorrectiveInjury[];
  compensations: CompensationKey[];
  aiSuggested: Array<{ name: string; nameIs: string | null; cue: string | null; dose: string | null; why: string | null; targetArea: string | null }>;
};

/** Hand-rolled validation of the model JSON (no zod), mirroring extractReport. */
export function validateParsed(raw: unknown): Parsed {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const injuries = Array.isArray(o.injuries)
    ? (o.injuries as unknown[]).map((r) => {
        const it = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
        return {
          body_part: str(it.body_part) ?? "—",
          side: coerceSide(it.side),
          type: str(it.type),
          note: str(it.note),
        };
      })
    : [];
  const compensations = Array.isArray(o.compensations)
    ? (o.compensations as unknown[])
        .map((c) => String(c ?? "").trim())
        .filter((c) => COMPENSATION_SET.has(c)) as CompensationKey[]
    : [];
  const aiSuggested = Array.isArray(o.aiSuggested)
    ? (o.aiSuggested as unknown[])
        .map((r) => {
          const it = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
          return {
            name: str(it.name) ?? "",
            nameIs: str(it.nameIs),
            cue: str(it.cue),
            dose: str(it.dose),
            why: str(it.why),
            targetArea: str(it.targetArea),
          };
        })
        .filter((x) => x.name.length > 0)
    : [];
  // Dedupe compensations.
  return { injuries, compensations: [...new Set(compensations)], aiSuggested };
}

function exerciseToItem(e: CorrectiveExercise): CorrectiveItem {
  return {
    slug: e.slug,
    name: e.name.en,
    nameIs: e.name.is,
    cue: e.cue.en,
    cueIs: e.cue.is,
    dose: e.dose.en,
    doseIs: e.dose.is,
    target: e.target.en,
    targetIs: e.target.is,
    phase: e.phase,
    citation: e.citation,
    evidenceGrade: e.evidenceGrade,
    videoUrl: e.videoUrl ?? null,
  };
}

/** Collect the ordered, de-duplicated cited corrective slugs the mapping implies. */
function citedSlugs(compensations: CompensationKey[], injuries: CorrectiveInjury[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (slug: string) => {
    if (seen.has(slug) || !CORRECTIVE_BY_SLUG[slug]) return;
    seen.add(slug);
    out.push(slug);
  };

  // 1. Movement compensations → the engine's ordered block.
  const presc = prescribeForCompensations(compensations);
  if (presc) for (const grp of presc.phases) for (const ex of grp.items) add(ex.slug);

  // 2. Per-injury rehab-track slugs (adductor / calf / hamstring / tendon / etc.).
  for (const inj of injuries) {
    const text = `${inj.type ?? ""} ${inj.body_part ?? ""} ${inj.note ?? ""}`.trim();
    const cls = classifyRehabTrack(text);
    const slugs = cls ? TRACK_CORRECTIVE_SLUGS[cls.track] : undefined;
    if (slugs) for (const s of slugs) add(s);
  }
  return out;
}

/** Order library items by the NASM continuum (inhibit → lengthen → activate →
 *  integrate); AI-suggested items go last. Stable within a phase. */
function orderItems(items: CorrectiveItem[]): CorrectiveItem[] {
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const ra = a.it.aiSuggested ? 99 : PHASE_RANK[a.it.phase ?? "integrate"] ?? 2;
      const rb = b.it.aiSuggested ? 99 : PHASE_RANK[b.it.phase ?? "integrate"] ?? 2;
      return ra - rb || a.i - b.i;
    })
    .map((x) => x.it);
}

/**
 * Generate the corrective proposal. Throws on network / non-JSON (the caller
 * surfaces the error). Degrades: when the model maps nothing and there are no
 * aiSuggested items, returns an empty item list (the UI shows "nothing to add").
 */
export async function generateCorrectiveProposal(opts: {
  apiKey: string;
  injuryText: string;
}): Promise<CorrectiveProposal> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
    // thinking disabled — sonnet-5 runs adaptive thinking by default, which corrupts
    // the JSON text block (see extractReport.ts).
    body: JSON.stringify({
      model: CORRECTIVE_MODEL,
      max_tokens: 2000,
      thinking: { type: "disabled" },
      system: SYSTEM,
      messages: [{ role: "user", content: `Client injury notes:\n\n${opts.injuryText}\n\nMap to the schema as JSON. JSON only.` }],
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = json.content?.find((c) => c.type === "text")?.text ?? "";
  const parsed = validateParsed(parseModelJson(text)); // parse throws → caller 422

  // Library items (cited) first, then the flagged AI gap-fills.
  const libraryItems = citedSlugs(parsed.compensations, parsed.injuries)
    .map((s) => CORRECTIVE_BY_SLUG[s])
    .filter((e): e is CorrectiveExercise => !!e)
    .map(exerciseToItem);

  const aiItems: CorrectiveItem[] = parsed.aiSuggested.map((s) => ({
    name: s.name,
    nameIs: s.nameIs ?? undefined,
    cue: s.why ? `${s.cue ?? ""}${s.cue ? " — " : ""}${s.why}`.trim() : s.cue ?? undefined,
    dose: s.dose ?? undefined,
    target: s.targetArea ?? undefined,
    aiSuggested: true,
  }));

  const items = orderItems([...libraryItems, ...aiItems]);
  const citations = [...new Set(libraryItems.map((it) => it.citation).filter((c): c is string => !!c))];

  return {
    injuries: parsed.injuries,
    items,
    citations,
    caveat: CAVEAT_EN,
    caveatIs: CAVEAT_IS,
    model: CORRECTIVE_MODEL,
  };
}

/** Validate a weekday array from the client (ISO 1=Mon..7=Sun, deduped, sorted). */
export function sanitizeWeekdays(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const set = new Set<number>();
  for (const x of v) {
    const n = Number(x);
    if (Number.isInteger(n) && n >= 1 && n <= 7) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

/** Validate/clamp an item list coming back from the trainer's edited proposal. */
export function sanitizeItems(v: unknown): CorrectiveItem[] {
  if (!Array.isArray(v)) return [];
  const out: CorrectiveItem[] = [];
  for (const r of v) {
    const it = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const name = str(it.name);
    if (!name) continue;
    out.push({
      slug: str(it.slug) ?? undefined,
      name,
      nameIs: str(it.nameIs) ?? undefined,
      cue: str(it.cue) ?? undefined,
      cueIs: str(it.cueIs) ?? undefined,
      dose: str(it.dose) ?? undefined,
      doseIs: str(it.doseIs) ?? undefined,
      target: str(it.target) ?? undefined,
      targetIs: str(it.targetIs) ?? undefined,
      phase: (["inhibit", "lengthen", "activate", "integrate"].includes(String(it.phase)) ? it.phase : undefined) as CorrectivePhase | undefined,
      citation: str(it.citation) ?? undefined,
      evidenceGrade: str(it.evidenceGrade) ?? undefined,
      videoUrl: str(it.videoUrl),
      aiSuggested: it.aiSuggested === true || undefined,
      manual: it.manual === true || undefined,
      days: sanitizeWeekdays(it.days),
    });
    if (out.length >= 40) break; // sane cap
  }
  return out;
}

import "server-only";

/**
 * Custom-programme extraction. Reads the raw text of a coach's uploaded
 * training programme (PDF / Excel / Word — text already extracted client-side)
 * and proposes a structured, multi-day breakdown.
 *
 * This is READ-ONLY AI, exactly like the clinical-report extractor: the output
 * is a PROPOSAL the coach reviews, edits and confirms in the builder. Nothing
 * is written to any template table from here. Rules/coaches decide; AI reads.
 *
 * The output `structure` shape ({ block, items[] }) is the same free-text block
 * shape the custom-templates builder already uses (TemplateBlock), so a proposed
 * day drops straight into the GREEN editor for the coach to finalise.
 */

import type { TemplateBlock } from "@/lib/micropulse/templateAutoGenerate";

// Accuracy tier — extraction correctness matters more than latency (same choice
// as the clinical extractor).
export const PROGRAMME_EXTRACT_MODEL = "claude-sonnet-5";

// The MD-day codes the builder understands. Mirrors MD_DAYS in the page; kept in
// sync by hand (small, stable list). GENERIC = a general day with no match anchor.
export const PROGRAMME_MD_DAYS = [
  "GENERIC",
  "MD-4",
  "MD-3",
  "MD-2",
  "MD-1",
  "MD",
  "MD+1",
  "MD+2",
  "MD+3",
] as const;
export type ProgrammeMdDay = (typeof PROGRAMME_MD_DAYS)[number];

export type ExtractedProgrammeDay = {
  /** The label as it appears in the source (e.g. "Day 1", "Session A", "Mánudagur"). */
  label: string;
  /** Best-effort MD-day suggestion the coach can change; defaults to GENERIC. */
  suggested_md_day: ProgrammeMdDay;
  /** Short human title for the session. */
  title: string;
  /** Ordered blocks, each with a heading and free-text exercise lines. */
  structure: TemplateBlock[];
};

export type ExtractedProgramme = {
  programme_name: string | null;
  days: ExtractedProgrammeDay[];
};

export const PROGRAMME_EXTRACT_SYSTEM = `You extract a structured strength / conditioning training programme from the raw text of a document a coach uploaded (originally a PDF, Excel or Word file). The text may be in Icelandic or English. Return ONLY JSON — no prose, no markdown fences — matching the schema exactly.

What you are reading: a coach's training programme, usually 1–4 distinct training days/sessions (e.g. "Day 1 / Day 2", "Session A / B / C", weekdays, or "MD-4 / MD-2"). Each day contains blocks (warm-up, main strength, power, accessory, core, cool-down…) and each block lists exercises with sets/reps/tempo/load.

Non-negotiable rules:
- SPLIT BY DAY. Return one entry in "days" per distinct training session in the document. If the document is clearly a single session, return one day. Never merge two sessions into one; never invent days that aren't there.
- PRESERVE THE EXERCISE TEXT. Keep each exercise line close to verbatim — including sets×reps, %1RM, tempo, rest, and any coaching cue. Do NOT normalise, translate, or "improve" the exercises. Keep the coach's language.
- BLOCKS IN ORDER. Within a day, keep blocks and their items in the order they appear. Give each block a short heading ("block"); if the source has no heading for a group, use a sensible one like "Warm-up", "Main", "Accessory", "Core", "Cool-down".
- suggested_md_day: map each day to the closest code in [GENERIC, MD-4, MD-3, MD-2, MD-1, MD, MD+1, MD+2, MD+3]. If the document names MD days explicitly, use them. Otherwise infer from intent ONLY when obvious (heavy/high-intensity lower-body → earlier in the week e.g. MD-4/MD-3; sharp/low-volume primer → MD-2/MD-1; recovery/regeneration → MD+1). When unsure, use "GENERIC". Never leave it blank.
- If a field is not present, use null (programme_name) or a best-effort value; never invent exercises.
- You are READING, not programming. Do not add sets, exercises, or advice that are not in the text.

Schema:
{
  "programme_name": string | null,
  "days": [
    {
      "label": string,
      "suggested_md_day": "GENERIC"|"MD-4"|"MD-3"|"MD-2"|"MD-1"|"MD"|"MD+1"|"MD+2"|"MD+3",
      "title": string,
      "structure": [ { "block": string, "items": [ string ] } ]
    }
  ]
}`;

// ── Validation (no zod dependency, mirrors the clinical extractor) ─────────────

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}
function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x)).filter((x) => x.length > 0);
}
function coerceMdDay(v: unknown): ProgrammeMdDay {
  const s = str(v).toUpperCase().replace(/\s+/g, "");
  return (PROGRAMME_MD_DAYS as readonly string[]).includes(s) ? (s as ProgrammeMdDay) : "GENERIC";
}
function coerceBlock(raw: unknown): TemplateBlock | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const block = str(o.block) || "Block";
  const items = strArr(o.items);
  if (items.length === 0) return null; // drop empty blocks
  return { block, items };
}
function coerceDay(raw: unknown, idx: number): ExtractedProgrammeDay | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const structure = Array.isArray(o.structure)
    ? o.structure.map(coerceBlock).filter((b): b is TemplateBlock => b != null)
    : [];
  if (structure.length === 0) return null; // a day with no readable content is dropped
  return {
    label: str(o.label) || `Day ${idx + 1}`,
    suggested_md_day: coerceMdDay(o.suggested_md_day),
    title: str(o.title) || str(o.label) || `Day ${idx + 1}`,
    structure,
  };
}

export function validateExtractedProgramme(raw: unknown): ExtractedProgramme {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const days = Array.isArray(o.days)
    ? o.days.map((d, i) => coerceDay(d, i)).filter((d): d is ExtractedProgrammeDay => d != null)
    : [];
  const name = str(o.programme_name);
  return { programme_name: name.length ? name : null, days };
}

// Keep the token budget bounded — a very long export gets truncated rather than
// blowing the context / cost. 24k chars is plenty for a 1–4 day programme.
const MAX_INPUT_CHARS = 24_000;

export async function extractProgramme(opts: {
  apiKey: string;
  text: string;
  sport?: string | null;
}): Promise<ExtractedProgramme> {
  const text = (opts.text ?? "").slice(0, MAX_INPUT_CHARS);
  if (text.trim().length < 20) {
    throw new Error("The document had too little readable text to analyse.");
  }
  const sportLine = opts.sport
    ? `Sport context: ${opts.sport}. Keep exercises appropriate to how they read; do not force sport-specific relabelling.\n\n`
    : "";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: PROGRAMME_EXTRACT_MODEL,
      max_tokens: 4096,
      system: PROGRAMME_EXTRACT_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${sportLine}Programme text:\n\n${text}\n\nExtract the multi-day programme structure as JSON per the schema. JSON only.`,
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const out = json.content?.find((c) => c.type === "text")?.text ?? "";
  const cleaned = out.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const parsed: unknown = JSON.parse(cleaned); // throws → caller returns 422
  return validateExtractedProgramme(parsed);
}

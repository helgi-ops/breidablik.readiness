import "server-only";

/**
 * AI movement-vision analysis (OsteoSport pattern, layer 3). Claude vision reads
 * the browser-sampled frames of one or more named movement tests and returns a
 * STRICT JSON object grounded in the curated engine (regions.ts) + the corrective
 * library — allowed region keys, allowed field ids, allowed corrective slugs. The
 * server then filters everything through `normalizeMovementVisionAnalysis`, so an
 * invented key can never reach the app. Screening / training only — never a
 * diagnosis, never the readiness colour. Rules recommend; the coach decides.
 */
import { REGIONS } from "./regions";
import { SEED_CORRECTIVE_EXERCISES } from "../correctives/registry";
import { normalizeMovementVisionAnalysis, type MovementVisionAnalysis } from "./schema";

const AI_MODEL = "claude-sonnet-5";

export type MovementTestInput = { label: string; frames: string[] };

/** The engine, written into the prompt so the model uses ONLY real keys. */
function regionCatalog(): string {
  return REGIONS.map((r) => {
    const fields = r.fields.map((f) => `${f.id} (${f.label.en})`).join(", ");
    return `- ${r.key} — ${r.label.en}: ${fields}`;
  }).join("\n");
}

function correctiveCatalog(): string {
  return SEED_CORRECTIVE_EXERCISES.map((e) => `${e.slug} (${e.phase}, ${e.name.en})`).join("; ");
}

function systemPrompt(): string {
  return `You are a movement-screening analyst helping a strength & conditioning coach read a movement test from a handful of still frames (sampled evenly, in order, from a short clip or supplied photos). You describe movement quality and suggest what to assess and train next. This is DECISION SUPPORT — screening / training only, NOT a diagnosis, and it never mentions injury-risk %, readiness, or load.

You are grounded in a curated engine. Use ONLY these region keys and field ids:
${regionCatalog()}

When you suggest corrective work, prefer these library exercises by slug (inhibit → lengthen → activate → integrate is the ordering):
${correctiveCatalog()}

How to read:
- Read the frames of each test in order (chronological) AND across tests to find the common thread (e.g. "arms fall forward + forward lean at depth" pointing to thoracic/shoulder and possibly ankle dorsiflexion).
- Describe ONLY what the frames support. If unclear, say so — never invent a joint angle, a side, or a compensation you cannot see. Note capture quality honestly (still frames of a short clip, distance/lighting).
- Map each observation to ONE region key from the list. Grade severity notable | mild | normal.
- Choose the single most useful region to assess next (region) and up to 5 priorityFieldIds that MUST belong to that region.
- Suggestions are "to consider," each with a short title, a detail, an optional cite (a method/source), and optional correctiveSlugs drawn ONLY from the library above.
- Surface red flags (pain behaviour, gross asymmetry, instability) as items that route to a clinician — never interpret them yourself.

Return ONLY a JSON object (no markdown fence) with EXACTLY these keys:
  summary: string,
  captureQuality: string,
  observations: Array<{ region: string (a region key), severity: "notable"|"mild"|"normal", text: string }>,
  patterns: string[] (movement-chain compensations tying observations together),
  suggestions: Array<{ title: string, detail: string, cite?: string, correctiveSlugs?: string[] }>,
  region: string|null (the region key to assess next),
  priorityFieldIds: string[] (field ids within that region),
  references: string[],
  redFlags: string[]`;
}

export async function analyzeMovementVision(
  tests: MovementTestInput[],
  lang: "EN" | "IS",
): Promise<{ ok: true; analysis: MovementVisionAnalysis; model: string } | { ok: false; error: string; status: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "AI movement analysis unavailable (no API key configured).", status: 503 };

  const language = lang === "IS" ? "Icelandic" : "English";
  const content: Array<Record<string, unknown>> = [];
  for (const t of tests) {
    content.push({ type: "text", text: `=== Test: ${t.label || "Movement test"} ===` });
    for (const data of t.frames) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
  }
  content.push({
    type: "text",
    text: `The blocks above are ${tests.length} movement test(s), each a few still frames sampled in order. Analyse each test AND the common thread across them, grounded in the engine. Write all prose in ${language} ONLY. Return the JSON object only.`,
  });

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 4000, thinking: { type: "disabled" }, system: systemPrompt(), messages: [{ role: "user", content }] }),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed.", status: 502 };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, error: `AI movement analysis failed (${res.status}). ${detail.slice(0, 200)}`, status: 502 };
  }

  const j = await res.json();
  let text = String(j?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  text = a >= 0 && b > a ? text.slice(a, b + 1) : text;
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  if (!parsed) return { ok: false, error: "The model didn't return a readable analysis — try again.", status: 422 };

  return { ok: true, analysis: normalizeMovementVisionAnalysis(parsed), model: AI_MODEL };
}

/**
 * Plan intent — the AI read: the coach's free text → the fixed list in `vocabulary.ts`.
 *
 * The model only READS. It picks goals from the list, a direction (build / keep / reduce) and quotes the coach's
 * own words for each; `sanitizeIntent` then drops anything not on the list and any quote that is not in the text.
 * It writes no advice: the rules in `recommend.ts` do that. Same call pattern as
 * `api/coach/player/[id]/ai-strength-refinement` (Haiku, small output, JSON only). Null on any failure, so the
 * caller falls back to the keyword read.
 */

import { GOAL_LABEL, INTENT_GOALS, sanitizeIntent, type PlanIntent, type PlanScope } from "./vocabulary";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 600;

const SYSTEM_PROMPT = [
  "You read a football coach's note about what they want from a training block or a training week.",
  "Your only job is to map the note onto a FIXED list of goals. You give no advice and add nothing the coach did not write.",
  "",
  "Goals (use these keys exactly):",
  ...INTENT_GOALS.map((g) => `- ${g}: ${GOAL_LABEL[g].en} / ${GOAL_LABEL[g].is}`),
  "",
  "Directions: build (improve, develop, increase, focus on), maintain (keep, hold), reduce (less, cut, lighten).",
  "The note may be in Icelandic or English.",
  "",
  "Rules:",
  "- Each goal at most once. Only goals the coach actually asks for.",
  "- quote = the exact words from the note (copied character for character, a short phrase) that show the goal.",
  "- A wish that fits none of the goals goes in unclear, as an exact quote from the note. Never force it onto a goal.",
  "- freshness is always build.",
  "",
  'Reply with JSON only: {"items":[{"goal":"…","mode":"build|maintain|reduce","quote":"…"}],"unclear":["…"]}',
].join("\n");

/** Pull the outermost {...} out of the model's reply (it may wrap it in a code fence). */
export function extractJsonObject(text: string): unknown {
  const s = text.replace(/```(?:json)?/gi, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

export async function interpretIntentAI(args: { apiKey: string; text: string; scope: PlanScope }): Promise<PlanIntent | null> {
  const what = args.scope === "block" ? "a training block (several weeks)" : "one training week";
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: { "x-api-key": args.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `The note is about ${what}.\n\nNote:\n"""\n${args.text}\n"""` }],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = extractJsonObject(json.content?.find((c) => c.type === "text")?.text ?? "");
    if (!raw) return null;
    return sanitizeIntent(raw, args.text, "ai");
  } catch {
    return null;
  }
}

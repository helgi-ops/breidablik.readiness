/**
 * KSÍ call-up report AI summary — a labelled narrative of what the player has been doing,
 * built STRICTLY from his own load numbers over the window (rules pick the facts; the model
 * only phrases them). Descriptive — it makes no readiness, availability or injury-risk call.
 * Same Anthropic Messages pattern as the transfer dossier (thinking disabled — Sonnet-5 would
 * otherwise return empty JSON).
 */

const AI_MODEL = "claude-sonnet-5";

const AI_SYSTEM = `You are a football club's head of performance writing a short, factual paragraph for the national federation (KSÍ) about what one of the club's players has been doing in training and matches over a recent window, ahead of a call-up.

You are given a JSON object of rule-computed numbers: the window, session count, accrued GPS/IMA load totals (distance, high-speed running, sprint distance, top speed, accelerations, decelerations, PlayerLoad, IMA high-speed), and an "athletic profile" radar where each axis is the player's percentile WITHIN HIS OWN SQUAD over the window (0-100). You may also get the coach's injury/factors note and individual-programme note.

Write STRICTLY from these numbers — never invent values, tests, minutes or injuries. Describe what he has BEEN DOING: his training/match volume, how much high-speed and sprint work he has done, his mechanical load (accel/decel), his top speed, and where he sits in the squad (use the percentiles). If the injury/programme notes are given, reflect them in one neutral clause. Cite actual numbers. Neutral, factual, respectful. Make NO claim about readiness, availability, selection or injury risk — this only describes recent load.

Return ONLY a JSON object, no prose, no markdown fences:
{
  "headline": "one sentence — what his recent load profile looks like",
  "summary": "3-5 sentences describing what he has been doing over the window, citing his numbers and squad percentiles"
}`;

export type KsiAiSummary = { headline?: string; summary?: string };

export type KsiAiFacts = {
  name: string;
  window: { from: string; to: string; sessions: number };
  load: Record<string, number>;
  radar: Array<{ label: string; value: number; unit: string; pct: number | null }>;
  injuryNote?: string | null;
  programNote?: string | null;
};

export async function buildKsiAiSummary(facts: KsiAiFacts, lang: "EN" | "IS"): Promise<KsiAiSummary> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("AI is not configured (missing ANTHROPIC_API_KEY).");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 1200,
      thinking: { type: "disabled" },
      system: AI_SYSTEM,
      messages: [{ role: "user", content: `Write in ${lang === "IS" ? "Icelandic" : "English"}. Player load data (JSON):\n\n${JSON.stringify(facts)}` }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AI summary failed (${res.status}). ${detail.slice(0, 200)}`);
  }
  const j = await res.json();
  let txt = String(j?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const a = txt.indexOf("{"), b = txt.lastIndexOf("}");
  if (a >= 0 && b > a) txt = txt.slice(a, b + 1);
  try {
    const parsed = JSON.parse(txt) as KsiAiSummary;
    return { headline: parsed.headline?.trim(), summary: parsed.summary?.trim() };
  } catch {
    throw new Error("AI returned an unparseable summary.");
  }
}

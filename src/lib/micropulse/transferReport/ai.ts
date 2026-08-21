/**
 * Transfer-dossier AI summary — the labelled narrative for the receiving club.
 *
 * Rules (the pure engine) pick the facts; the model only phrases them. It writes
 * a professional performance summary a receiving S&C staff can read at a glance,
 * citing the numbers it was given. Descriptive — it makes no readiness or
 * availability call. Same Anthropic Messages pattern as the basketball scout
 * report (thinking disabled — Sonnet-5 reasons by default and would return empty
 * JSON otherwise).
 */

import type { TransferDossier } from "./index";

const AI_MODEL = "claude-sonnet-5";

const AI_SYSTEM = `You are a football club's head of performance writing a concise, professional performance dossier summary about a player who is transferring to another club, for the receiving club's performance staff.

You are given a JSON object of rule-computed facts (identity, and per-area sections for GPS load, worst-case match demands, IMA accel/decel, force plates (VALD), velocity-based training, games, fitness tests, and a position-percentiled athlete profile). Each section has a headline, plain facts, and sometimes a table.

Write STRICTLY from these numbers — never invent values, tests, or injuries. If a section is absent or low-confidence, say the data is limited rather than guessing. Be specific and cite the actual numbers (distances, speeds, percentiles). Neutral, factual, respectful tone — this is shared as part of an agreed transfer. Make NO claim about readiness, availability, or injury risk.

Return ONLY a JSON object, no prose, no markdown fences, with these keys:
{
  "headline": "one sentence — the player's physical identity in a line",
  "summary": "2-4 sentences overview of the player's performance profile over the window",
  "physicalProfile": "2-3 sentences on speed / power / running output, citing GPS + VALD + VBT numbers",
  "gameProfile": "1-2 sentences on games, minutes and worst-case match demands",
  "strengths": ["3-5 short bullet strings, each citing a number"],
  "watchPoints": ["1-3 short bullet strings on limits or thin data (NOT injury/availability claims)"]
}`;

export type TransferAiSummary = {
  headline?: string;
  summary?: string;
  physicalProfile?: string;
  gameProfile?: string;
  strengths?: string[];
  watchPoints?: string[];
};

/** Reduce the dossier to the compact fact set the model narrates from. */
function factsFor(d: TransferDossier) {
  return {
    identity: d.identity,
    window: d.window,
    overallConfidence: d.overallConfidence,
    sections: d.sections.map((s) => ({
      id: s.id,
      present: s.present,
      confidence: s.confidence,
      headline: s.headline?.en ?? null,
      facts: s.facts.map((f) => f.en),
      tables: s.tables.map((t) => ({ caption: t.caption?.en ?? null, columns: t.columns.map((c) => c.en), rows: t.rows })),
    })),
  };
}

export async function buildTransferAiSummary(dossier: TransferDossier, lang: "EN" | "IS"): Promise<TransferAiSummary> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("AI is not configured (missing ANTHROPIC_API_KEY).");
  const facts = factsFor(dossier);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 2500,
      thinking: { type: "disabled" },
      system: AI_SYSTEM,
      messages: [{ role: "user", content: `Write the summary in ${lang === "IS" ? "Icelandic" : "English"}. Here is the player's dossier data (JSON):\n\n${JSON.stringify(facts)}` }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AI summary failed (${res.status}). ${detail.slice(0, 200)}`);
  }
  const j = await res.json();
  let txt = String(j?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const a = txt.indexOf("{"), b = txt.lastIndexOf("}");
  txt = a >= 0 && b > a ? txt.slice(a, b + 1) : txt;
  const parsed = JSON.parse(txt) as TransferAiSummary;
  return parsed;
}

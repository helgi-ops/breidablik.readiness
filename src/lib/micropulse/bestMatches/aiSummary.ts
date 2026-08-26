/**
 * Best Match Analysis — the labelled AI summary.
 *
 * Rules pick and rank the best games (rankMatches) and compute "what we did well"; the model only
 * PHRASES those facts. In ONE call it returns both a whole-set summary (the common thread in the
 * team's best games, under the chosen lens) AND a one-line note per match. Descriptive — it makes no
 * readiness/availability call and invents nothing. Same Anthropic Messages pattern as the transfer
 * dossier / basketball scout (thinking disabled — Sonnet-5 reasons by default and would return empty
 * JSON otherwise). Cite: StatsBomb IQ metric glossary.
 */

import type { RankedMatch, Lens } from "./index";

const AI_MODEL = "claude-sonnet-5";

const AI_SYSTEM = `You are a football club's head of performance writing a short, coach-facing summary of the team's BEST games of the season, for the head coach.

The system has already RANKED these games (best first) under a lens (overall = result; attacking = goals + chances created; defending = few goals/xG conceded) and computed "what we did well" for each. You are given those rule-computed facts as JSON (per game: opponent, venue, score, result, xG for/against, OBV, and the strengths the system flagged).

Write STRICTLY from these numbers — never invent values, tactics, player names, or events. Plain language a non-analyst coach reads at a glance; no sport-science jargon. Find the genuine common thread across these best games under the given lens.

Return ONLY a JSON object, no prose, no markdown fences, with these keys:
{
  "overall": "2-3 sentences on what the team does well when it is at its best under this lens — the recurring pattern across these games, citing the kinds of numbers that repeat (e.g. winning the xG battle, high OBV, clean sheets, set-piece threat).",
  "perMatch": [ { "date": "YYYY-MM-DD", "note": "one short sentence — the single thing that stood out in THIS game" } ]
}
Return exactly one perMatch entry for every game given, in the same order, using its date.`;

export type BestMatchesAiSummary = { overall: string; perMatch: Array<{ date: string; note: string }> };

/** Compact per-match facts the model narrates from (no raw tables, no invented fields). */
function factsFor(ranked: RankedMatch[]) {
  return ranked.map((m) => ({
    date: m.matchDate,
    opponent: m.opponent ?? "opponent",
    venue: m.isHome == null ? "" : m.isHome ? "home" : "away",
    score: `${m.goals}-${m.goalsAgainst}`,
    result: m.outcome,
    xg: m.xg, xgAgainst: m.xgAgainst, obv: m.obv,
    strengths: m.strengths.map((s) => s.label.en),
  }));
}

export async function buildBestMatchesAiSummary(ranked: RankedMatch[], lens: Lens, lang: "EN" | "IS"): Promise<BestMatchesAiSummary> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("AI is not configured (missing ANTHROPIC_API_KEY).");
  const lensWord = lens === "attack" ? "attacking" : lens === "defense" ? "defending" : "overall";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 2000,
      thinking: { type: "disabled" },
      system: AI_SYSTEM,
      messages: [{ role: "user", content: `Lens: ${lensWord}. Write in ${lang === "IS" ? "Icelandic" : "English"}. Best games (JSON, best first):\n\n${JSON.stringify(factsFor(ranked))}` }],
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
  const parsed = JSON.parse(txt) as BestMatchesAiSummary;
  return { overall: String(parsed.overall ?? ""), perMatch: Array.isArray(parsed.perMatch) ? parsed.perMatch : [] };
}

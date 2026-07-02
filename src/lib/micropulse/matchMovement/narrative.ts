/**
 * Match Movement (IMA driver) AI narrative — shared server helpers for the coach
 * and player narrative routes.
 *
 * Explainability rules (manifesto #5): the AI only rephrases real numbers that
 * were RE-COMPUTED server-side (the client never supplies figures), cites the
 * actual signals, invents nothing, and is labelled as AI in the UI. Rules decide;
 * AI explains. This is the DRIVER layer (HOW a player moves), and it is described
 * — never used to predict injury (descriptive, not predictive).
 */

import type { MovementFingerprint, SubBands } from "./types";

export const NARRATIVE_MODEL = "claude-haiku-4-5-20251001";

/** Plain-language meaning of every fingerprint dimension + sub-band the AI sees. */
export const MM_METRIC_GUIDE: Record<string, string> = {
  totalPerMin: "overall movement work per minute — accelerations, decelerations and turns combined (how busy the game was)",
  accelDecelRatio: "ratio of accelerating to braking; above 1 = more accelerating (front-foot, explosive), below 1 = more braking (reactive, stop-start)",
  codPerMin: "change-of-direction actions per minute — cuts and turns (the agility demand)",
  codLeftPct: "share of turns to the left vs right as a percentage; near 50% is balanced, a big skew is one-sided",
  hiCadencePerMin: "fast, sprint-type running per minute (high-cadence strides)",
  decelLow: "low-intensity decelerations (raw count for the match)",
  decelMed: "medium-intensity decelerations (raw count)",
  decelHigh: "high-intensity decelerations — the demanding braking end (raw count)",
  stride6: "high-cadence stride band 6 (raw count)",
  stride7: "high-cadence stride band 7 (raw count)",
  stride8: "high-cadence stride band 8 — sprint cadence, the demanding end (raw count)",
  codHigh: "high-intensity changes of direction (raw count)",
  codMed: "medium-intensity changes of direction (raw count)",
  codLow: "low-intensity changes of direction (raw count)",
};

export type FpEntry = { label: string; minutes?: number; fingerprint: MovementFingerprint; sub?: SubBands | null };

/** Round the two fingerprints + sub-bands to compact JSON the model can read. */
function compactFp(fp: MovementFingerprint): Record<string, number | null> {
  return {
    totalPerMin: round(fp.totalPerMin, 2),
    accelDecelRatio: round(fp.accelDecelRatio, 2),
    codPerMin: round(fp.codPerMin, 2),
    codLeftPct: round(fp.codLeftPct, 0),
    hiCadencePerMin: round(fp.hiCadencePerMin, 2),
  };
}
function compactSub(sub: SubBands | null | undefined): Record<string, number | null> | undefined {
  if (!sub) return undefined;
  const out: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(sub)) out[k] = v == null ? null : Math.round(v);
  return out;
}
function round(v: number | null, dp: number): number | null {
  if (v == null) return null;
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

/** Facts for a two-shape comparison (norm / A-B / player-picks). */
export function buildComparisonFacts(a: FpEntry, b: FpEntry) {
  return {
    view: "comparison" as const,
    a: { label: a.label, minutes: a.minutes ?? null, fingerprint: compactFp(a.fingerprint), sub_bands: compactSub(a.sub) },
    b: { label: b.label, minutes: b.minutes ?? null, fingerprint: compactFp(b.fingerprint), sub_bands: compactSub(b.sub) },
    metric_guide: MM_METRIC_GUIDE,
  };
}

/** Facts for a squad snapshot (one match), optionally compared to a second match. */
export function buildSquadFacts(
  matchLabel: string,
  players: Array<{ name: string; position: string | null; fingerprint: MovementFingerprint }>,
  compare?: { label: string; meanA: MovementFingerprint; meanB: MovementFingerprint } | null,
) {
  return {
    view: "squad" as const,
    match: matchLabel,
    players: players.map((p) => ({ name: p.name, position: p.position ?? "unknown", fingerprint: compactFp(p.fingerprint) })),
    squad_compare: compare
      ? { vs_match: compare.label, this_match_squad_mean: compactFp(compare.meanA), other_match_squad_mean: compactFp(compare.meanB) }
      : null,
    metric_guide: MM_METRIC_GUIDE,
  };
}

const SHARED_RULES = `Hard rules:
- Use ONLY the numbers in the data. Never invent, estimate, or round differently.
- Describe ONLY dimensions present; if a value is null, say nothing about it.
- This is the DRIVER layer (IMA) — HOW the player moved (accelerate/brake/turn), NOT how much he ran (that is GPS). Frame it that way.
- Reference every metric by its plain meaning from metric_guide. You may use a term like "change of direction" or "braking" but never raw jargon ("IMA", "band 8", "ACWR").
- Descriptive, NOT predictive: describe the movement style and mechanical demand only. Never claim or imply injury risk, predict injury, or give medical, transfer, or recruitment advice. No training prescriptions.
- Percentages (CoD left %) are asymmetry, not volume. Ratios (accel:decel) are balance, not counts. "per minute" normalises for time on the pitch.`;

export const COACH_SYSTEM = `You explain a football player's (or squad's) MOVEMENT comparison to a coach, from Catapult inertial-movement (IMA) data. Many coaches are new to this data, so be clear and instructive.

${SHARED_RULES}

Style:
- Open with ONE plain sentence a head coach gets at a glance (the headline difference).
- Then give detail an S&C coach values: name the 2-3 biggest movement-shape differences, what they plausibly reflect (role, opponent, game state, tactical demand), and call out any left/right asymmetry or a stand-out high-intensity braking/change-of-direction end if the sub-bands show one.
- 150-210 words, 2-3 short paragraphs. Factual, specific, grounded in the numbers.
- Write in the requested language only. Return prose only — no headings, no bullet lists, no preamble.`;

export const PLAYER_SYSTEM = `You explain to a football player, in the second person ("you"), how he moved in a match compared to another match or his usual, from his own movement (IMA) data.

${SHARED_RULES}

Style:
- Warm, factual and encouraging, never hyperbolic or competitive.
- Open with one plain sentence on the main difference in how you moved, then a little detail: name one clear standout (e.g. more explosive, more agile, more sprint-running) and one neutral observation, both grounded in the numbers. If your left/right turning was lopsided, mention it plainly as something to be aware of — not a problem.
- 90-140 words, 2 short paragraphs, plain language a player reads in 20 seconds.
- Write in the requested language only. Return prose only — no headings, no bullet points, no preamble.`;

/** Call Anthropic and return the narrative text, or throw with a useful message. */
export async function callMatchMovementAI(opts: {
  apiKey: string;
  system: string;
  facts: unknown;
  lang: "English" | "Icelandic";
  audience: "coach" | "player";
  maxTokens?: number;
}): Promise<string> {
  const who = opts.audience === "coach" ? "Explain it to the coach" : "Explain it to the player";
  const userMsg = `${who}. Write in ${opts.lang}. Data (JSON):\n${JSON.stringify(opts.facts)}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: NARRATIVE_MODEL,
      max_tokens: opts.maxTokens ?? 700,
      temperature: 0.4,
      system: opts.system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (json.content?.find((c) => c.type === "text")?.text ?? "").trim();
  if (!text) throw new Error("Empty AI response");
  return text;
}

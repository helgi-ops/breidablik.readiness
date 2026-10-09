import "server-only";

/**
 * Multimodal drill read from video frames. Sends sampled JPEG frames to Claude vision and returns a
 * QUALITATIVE / TACTICAL draft (name, category, format, phases, description, estimates) — an AI DRAFT
 * the coach confirms. The prompt + the normalizer forbid any physical metric (speed / distance / load)
 * and any player identity; those stay GPS-sourced. Mirrors movementScreen/vision/ai.ts.
 *
 * Descriptive; the read never touches the readiness colour or the daily decision.
 */

import { normalizeDrillVideoRead, videoReadCategoriesForSport, type DrillVideoRead } from "./videoReadSchema";

const AI_MODEL = "claude-sonnet-5";

/** Human sport label for the prompt. Defaults to football (the drill library's primary sport). */
function sportLabel(sport?: string | null): string {
  const s = String(sport ?? "").toLowerCase();
  if (s === "basketball") return "basketball";
  if (s === "handball") return "handball";
  if (!s || s === "football" || s === "soccer") return "soccer/football";
  return s;
}

const schemaKeys = (cats: readonly string[]) => `Return STRICT JSON only (no prose, no code fences) with EXACTLY these keys:
{
  "suggestedName": string,                         // e.g. "6v3 possession + finish"
  "category": one of ${cats.map((c) => `"${c}"`).join(" | ")},
  "format": string | null,                         // e.g. "6v3", "8v8+2"; null if unclear
  "playersEst": number | null,                     // ESTIMATE of players visible; null if unclear
  "areaType": "small" | "medium" | "large" | null, // relative pitch size per player
  "phases": string[],                              // ordered, e.g. ["possession in grid","transition","finish on goal"]
  "equipment": string[],                           // e.g. ["mini-goals","mannequin","cones"]
  "description": { "en": string, "is": string },   // DETAILED coach-readable write-up (see DESCRIPTION GUIDANCE); "is" = Icelandic
  "intensityEst": "low" | "moderate" | "high" | null, // QUALITATIVE only
  "stimulusType": "mechanical" | "locomotive" | "mixed" | "technical" | null, // movement character (see STIMULUS GUIDANCE)
  "confidence": "high" | "moderate" | "low",
  "caveat": { "en": string, "is": string }
}

HARD RULES:
- NEVER output any physical measurement: no metres, no speeds (km/h, m/s), no high-speed-running, no accelerations/decelerations counts, no player-load, no distances, no heart rate. Those come from GPS, not video. Do NOT put numbers like these anywhere, including inside description.
- NEVER identify, name, or describe individual players (no names, numbers, appearance). Describe the DRILL only.
- playersEst and areaType are ESTIMATES from what is visible — set null when unsure, never guess precisely.
- If this is not a recognisable training drill, set category "other", confidence "low", and say so in the caveat.
- Output JSON only.

DESCRIPTION GUIDANCE (make "description" thorough — a coach should be able to set this drill up from it alone):
Write several short labelled parts, each on its own line, in this order (omit a part only if there is genuinely nothing to say):
- "Setup:" the pitch/area shape, goals/targets, zones/grids, bibs/teams, and equipment layout.
- "How it runs:" the sequence of play, the rules/conditions, scoring, rotations, and restarts.
- "Trains:" the tactical/technical intent — what the drill develops and the key moments it rehearses.
- "Coaching points:" 2-4 concrete things to look for and cue.
- "Progressions:" 1-3 ways to make it harder/easier or vary it.
Plain coaching language, no jargon dumps. Still obey every HARD RULE above — no physical measurements, no player identities. If you are unsure of a part, describe what is visible/implied rather than inventing specifics, and lower "confidence".

STIMULUS GUIDANCE (set "stimulusType" from the MOVEMENT CHARACTER you see — NOT from any measurement):
- "mechanical": tight/closed, repetitive technique in a small area — lots of accelerations, decelerations, cuts, 1v1s, finishing; little continuous running. Isolated, low open-play decision-making, fixed patterns.
- "locomotive": the players are transported across space — continuous running, sprinting, large pitch, high-speed running and change-of-direction over distance; running capacity.
- "mixed": a clear blend of both — e.g. possession that breaks into transition and running, or SSG that mixes tight work with longer runs.
- "technical": ball-skill / warm-up with minimal locomotion and minimal mechanical load (light).
Choose the ONE that dominates; use "mixed" only when both are genuinely present. Set null if you truly can't tell, and lower confidence.`;

/** Vision system prompt — reads a drill from sampled frames of a {sport} clip. */
function buildSystem(sport?: string | null): string {
  return `You are an assistant that reads a ${sportLabel(sport)} training drill from a handful of still frames sampled from a short clip. You describe the DRILL — its structure, format, phases, equipment and tactical intent — for a coach.

${schemaKeys(videoReadCategoriesForSport(sport))}`;
}

/** Text system prompt — drafts a drill card from the TITLE/DESCRIPTION the uploader wrote (no footage). */
function buildLinkSystem(sport?: string | null): string {
  return `You are an assistant that drafts a ${sportLabel(sport)} training-drill card from the TITLE and DESCRIPTION text the uploader wrote for a video. You have NOT watched the video — work only from the given text. If the text is thin or not clearly a drill, keep confidence "low" and say so in the caveat.

${schemaKeys(videoReadCategoriesForSport(sport))}`;
}

/** Shared: POST a messages request, parse the strict-JSON drill draft, normalize. */
async function runDrillDraft(
  key: string,
  system: string,
  content: Array<Record<string, unknown>>,
  frameCountForCaveat: number,
  allowedCategories: readonly string[],
): Promise<{ ok: true; read: DrillVideoRead; model: string } | { ok: false; error: string; status: number }> {
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 2800, thinking: { type: "disabled" }, system, messages: [{ role: "user", content }] }),
    });
  } catch {
    return { ok: false, error: "AI request failed", status: 502 };
  }
  if (!res.ok) return { ok: false, error: `AI error (${res.status})`, status: 502 };

  let parsed: unknown;
  try {
    const j = await res.json();
    let text = String(j?.content?.[0]?.text ?? "");
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const first = text.indexOf("{"), last = text.lastIndexOf("}");
    if (first === -1 || last === -1) return { ok: false, error: "AI returned no JSON", status: 422 };
    parsed = JSON.parse(text.slice(first, last + 1));
  } catch {
    return { ok: false, error: "AI returned invalid JSON", status: 422 };
  }

  return { ok: true, read: normalizeDrillVideoRead(parsed, frameCountForCaveat, allowedCategories), model: AI_MODEL };
}

export async function analyzeDrillVideo(
  frames: string[],
  durationSec: number | null,
  lang: "EN" | "IS",
  sport?: string | null,
): Promise<{ ok: true; read: DrillVideoRead; model: string } | { ok: false; error: string; status: number }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "AI is not configured", status: 503 };
  const clean = frames.filter((f) => typeof f === "string" && f.length > 0);
  if (clean.length === 0) return { ok: false, error: "No frames", status: 400 };

  const content: Array<Record<string, unknown>> = [
    ...clean.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
    { type: "text", text: `These are ${clean.length} frames sampled evenly, in order, from a ~${durationSec ?? "short"}s ${sportLabel(sport)} training clip. Read the DRILL per the schema. Write "description" and "caveat" in ${lang === "IS" ? "Icelandic for the .is field and English for the .en field" : "both English (.en) and Icelandic (.is)"}. JSON only.` },
  ];

  return runDrillDraft(key, buildSystem(sport), content, clean.length, videoReadCategoriesForSport(sport));
}

/**
 * Draft a drill card from a video's OWN title/description text (YouTube/Vimeo oEmbed) — used when the
 * footage can't be frame-sampled (external hosts block cross-origin reads). Text-only; honest caveat.
 */
export async function analyzeDrillLink(
  meta: { title?: string | null; description?: string | null; author?: string | null; provider?: string | null },
  lang: "EN" | "IS",
  sport?: string | null,
): Promise<{ ok: true; read: DrillVideoRead; model: string } | { ok: false; error: string; status: number }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "AI is not configured", status: 503 };
  const title = String(meta.title ?? "").trim();
  const description = String(meta.description ?? "").trim();
  if (!title && !description) return { ok: false, error: "No video title/description to read", status: 422 };

  const text = [
    `A coach pasted a ${meta.provider ?? "video"} link. Here is the metadata the uploader wrote (you have NOT seen the footage):`,
    `TITLE: ${title || "(none)"}`,
    meta.author ? `CHANNEL/AUTHOR: ${meta.author}` : null,
    `DESCRIPTION: ${description ? description.slice(0, 4000) : "(none)"}`,
    `Draft the drill card per the schema. Write "description" and "caveat" in ${lang === "IS" ? "Icelandic (.is) and English (.en)" : "both English (.en) and Icelandic (.is)"}. In the caveat, note the draft is from the video's title/description, NOT the footage. JSON only.`,
  ].filter(Boolean).join("\n");

  // frameCountForCaveat 0 → the normalizer's default caveat mentions frames, but analyzeDrillLink
  // always returns an explicit metadata caveat from the model, so the default is never surfaced.
  return runDrillDraft(key, buildLinkSystem(sport), [{ type: "text", text }], 0, videoReadCategoriesForSport(sport));
}

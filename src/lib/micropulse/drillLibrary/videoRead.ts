import "server-only";

/**
 * Multimodal drill read from video frames. Sends sampled JPEG frames to Claude vision and returns a
 * QUALITATIVE / TACTICAL draft (name, category, format, phases, description, estimates) — an AI DRAFT
 * the coach confirms. The prompt + the normalizer forbid any physical metric (speed / distance / load)
 * and any player identity; those stay GPS-sourced. Mirrors movementScreen/vision/ai.ts.
 *
 * Descriptive; the read never touches the readiness colour or the daily decision.
 */

import { normalizeDrillVideoRead, VIDEO_READ_CATEGORIES, type DrillVideoRead } from "./videoReadSchema";

const AI_MODEL = "claude-sonnet-5";

const SYSTEM = `You are an assistant that reads a SOCCER/FOOTBALL training drill from a handful of still frames sampled from a short clip. You describe the DRILL — its structure, format, phases, equipment and tactical intent — for a coach.

Return STRICT JSON only (no prose, no code fences) with EXACTLY these keys:
{
  "suggestedName": string,                         // e.g. "6v3 possession + finish"
  "category": one of ${VIDEO_READ_CATEGORIES.map((c) => `"${c}"`).join(" | ")},
  "format": string | null,                         // e.g. "6v3", "8v8+2"; null if unclear
  "playersEst": number | null,                     // ESTIMATE of players visible; null if unclear
  "areaType": "small" | "medium" | "large" | null, // relative pitch size per player
  "phases": string[],                              // ordered, e.g. ["possession in grid","transition","finish on goal"]
  "equipment": string[],                           // e.g. ["mini-goals","mannequin","cones"]
  "description": { "en": string, "is": string },   // 1-3 plain sentences, coach-readable; "is" = Icelandic
  "intensityEst": "low" | "moderate" | "high" | null, // QUALITATIVE only
  "confidence": "high" | "moderate" | "low",
  "caveat": { "en": string, "is": string }
}

HARD RULES:
- NEVER output any physical measurement: no metres, no speeds (km/h, m/s), no high-speed-running, no accelerations/decelerations counts, no player-load, no distances, no heart rate. Those come from GPS, not video. Do NOT put numbers like these anywhere, including inside description.
- NEVER identify, name, or describe individual players (no names, numbers, appearance). Describe the DRILL only.
- playersEst and areaType are ESTIMATES from what is visible — set null when unsure, never guess precisely.
- If the frames are not a football drill, set category "other", confidence "low", and say so in the caveat.
- Output JSON only.`;

export async function analyzeDrillVideo(
  frames: string[],
  durationSec: number | null,
  lang: "EN" | "IS",
): Promise<{ ok: true; read: DrillVideoRead; model: string } | { ok: false; error: string; status: number }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "AI is not configured", status: 503 };
  const clean = frames.filter((f) => typeof f === "string" && f.length > 0);
  if (clean.length === 0) return { ok: false, error: "No frames", status: 400 };

  const content: Array<Record<string, unknown>> = [
    ...clean.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
    { type: "text", text: `These are ${clean.length} frames sampled evenly, in order, from a ~${durationSec ?? "short"}s football training clip. Read the DRILL per the schema. Write "description" and "caveat" in ${lang === "IS" ? "Icelandic for the .is field and English for the .en field" : "both English (.en) and Icelandic (.is)"}. JSON only.` },
  ];

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 1500, thinking: { type: "disabled" }, system: SYSTEM, messages: [{ role: "user", content }] }),
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

  return { ok: true, read: normalizeDrillVideoRead(parsed, clean.length), model: AI_MODEL };
}

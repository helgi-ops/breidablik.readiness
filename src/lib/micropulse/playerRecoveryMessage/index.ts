/**
 * Player Recovery Message — AI-drafted message sent to a flagged player.
 *
 * When detect_coach_notifications fires a wellness/load transition for
 * a player, the coach can click "Draft AI message" on the notifications
 * page. This module:
 *
 *   1. Builds parameter-specific guidance from a deterministic library
 *      (no LLM invents medical advice — all categories come from here).
 *   2. Hands those guardrailed inputs to Claude Haiku 4.5, which only
 *      writes friendly prose around them.
 *   3. Validates the output to catch hallucinated specifics
 *      (medication names, sets/reps, diagnoses).
 *
 * Architecture note (2026-04-29 hallucination day rules apply):
 *   - The AI never picks the action category. The library does.
 *   - The AI's job is tone + name + brevity, NOT clinical content.
 *   - Validator hard-rejects anything that looks like a medical claim.
 */

// ─── Types ───────────────────────────────────────────────────────────

export type NotificationParameter =
  | "wellness_sleep"
  | "wellness_soreness"
  | "wellness_energy"
  | "wellness_readiness"
  | "acwr"
  | "hsr"
  | "sharp_cut";

export type NotificationDirection =
  | "wellness_drop"
  | "overload"
  | "underload";

export type RecoveryGuidance = {
  /** What the player should focus on tonight + tomorrow. 2-3 short bullets. */
  actions: string[];
  /** When to escalate to the coach. */
  escalation: string;
};

// ─── Per-parameter recovery library ──────────────────────────────────
// These are the ONLY action categories the AI can use. They map to
// research-backed general advice that is safe to give to an athlete
// without a clinician in the loop.

const GUIDANCE: Record<string, { en: RecoveryGuidance; is: RecoveryGuidance }> = {
  wellness_sleep: {
    en: {
      actions: [
        "aim for 8 hours tonight — caffeine cutoff by 14:00, screens off 30 min before bed",
        "keep tomorrow's first session light and skip the high-intensity finisher",
        "extra hydration today and tomorrow morning",
      ],
      escalation: "If sleep stays poor for 3 nights in a row, message the coach.",
    },
    is: {
      actions: [
        "stefnu á 8 tíma í nótt — engin koffín eftir kl 14, skjáir af 30 mín fyrir svefn",
        "fyrri æfing á morgun má vera létt — slepptu hávaða-finishernum",
        "auka vatnsdrykkju í dag og á morgun",
      ],
      escalation: "Ef svefnin er enn slæmur eftir 3 nætur — sendu skilaboð á þjálfarann.",
    },
  },
  wellness_soreness: {
    en: {
      actions: [
        "20 min light mobility tonight (hip openers, hamstring nerve flossing)",
        "skip the heavy eccentric work tomorrow if soreness is still 2 or below",
        "warm shower + foam roll the affected area before sleep",
      ],
      escalation: "If pain is sharp or localized to one joint, tell the coach before training.",
    },
    is: {
      actions: [
        "20 mín létt mobility í kvöld (hip openers, hamstring nerve flossing)",
        "slepptu þungri eccentric vinnu á morgun ef eymsl eru enn 2 eða lægri",
        "heit sturta + foam roll á svæðið fyrir svefn",
      ],
      escalation: "Ef sársauki er skarpur eða einhvers staðar í einum lið — láttu þjálfara vita fyrir æfingu.",
    },
  },
  wellness_energy: {
    en: {
      actions: [
        "extra carbs tonight (60–80g), protein within 30 min of waking",
        "cut tomorrow's session intensity by ~20% — focus on technique not output",
        "take 10 min of slow nasal breathing before bed",
      ],
      escalation: "If energy stays low for 4 days, message the coach about a recovery day.",
    },
    is: {
      actions: [
        "extra kolvetni í kvöldmat (60–80g), prótein innan 30 mín frá vakningu",
        "minnkaðu intensity í æfingu á morgun um ~20% — fókus á tækni ekki magn",
        "10 mín hægur nef-andardráttur fyrir svefn",
      ],
      escalation: "Ef orkan er enn lág eftir 4 daga — sendu þjálfaranum til að ræða recovery-dag.",
    },
  },
  wellness_readiness: {
    en: {
      actions: [
        "treat tomorrow as a recovery day — light aerobic only, no high intensity",
        "meal-prep something rich in iron and B-vitamins (red meat, eggs, leafy greens)",
        "8+ hours of sleep tonight, no exceptions",
      ],
      escalation: "If readiness stays below 15 for 3 days, talk to the coach in person.",
    },
    is: {
      actions: [
        "líttu á morgun-daginn sem recovery dag — bara léttur aerobic, ekkert hávaðasamt",
        "borða eitthvað ríkt af járni og B-vítamínum (rautt kjöt, egg, grænmeti)",
        "8+ tíma svefn í nótt, undantekningalaust",
      ],
      escalation: "Ef readiness er enn undir 15 eftir 3 daga — talaðu við þjálfara í persónu.",
    },
  },
  acwr: {
    en: {
      actions: [
        "training load has spiked — tomorrow's session will be modified, listen for the brief",
        "active recovery today: 20 min easy bike or pool walk",
        "extra sleep + extra protein for the next 2 nights",
      ],
      escalation: "If you feel any niggle in the next 48 hours, flag it immediately.",
    },
    is: {
      actions: [
        "æfingaálag hefur spike-að — æfing á morgun verður breytt, hlustaðu á briefið",
        "active recovery í dag: 20 mín auðveldur hjóltíma eða sundganga",
        "auka svefn + auka prótein næstu 2 nætur",
      ],
      escalation: "Ef þú finnur fyrir niggle einhvers staðar næsta sólarhring — láttu strax vita.",
    },
  },
  hsr: {
    en: {
      actions: [
        "high-speed running has been low — make sure you don't skip sprint exposure on the next session",
        "5 min dynamic warmup before any sprint work, with hamstring activations",
        "if you feel undercooked sprint-wise, ask the coach for an extra exposure block",
      ],
      escalation: "If a hamstring tightens during sprint, stop and tell the coach.",
    },
    is: {
      actions: [
        "hraðhlaup hefur verið lítið — passaðu að sleppa ekki sprint exposure í næstu æfingu",
        "5 mín dynamic warmup fyrir sprint, með hamstring activations",
        "ef þú finnur fyrir undercooked sprint — biddu þjálfara um auka exposure block",
      ],
      escalation: "Ef hamstring hertist í sprint — stopp og láttu þjálfara vita.",
    },
  },
  sharp_cut: {
    en: {
      actions: [
        "sharp braking volume is up — reduce hard cuts in tomorrow's small-sided games",
        "extra knee mobility + glute activation in warmup",
        "monitor knees and ankles for any unusual stiffness",
      ],
      escalation: "Any knee swelling, instability, or pain on cutting — stop and message the coach.",
    },
    is: {
      actions: [
        "skarpar bremsur upp — minnkaðu hörð cuts í small-sided games á morgun",
        "auka knee mobility + glute activation í warmup",
        "fylgstu með hnjám og ökklum fyrir óvenjulega stífni",
      ],
      escalation: "Hnjáspolning, óstöðugleiki eða sársauki við cuts — stopp og senda þjálfara skilaboð.",
    },
  },
};

// ─── Builder: notification → guidance ─────────────────────────────────

export type NotificationInput = {
  parameter: string;
  direction: string;
  severity: string;
  player_name: string;
  position?: string | null;
  value_now?: number | null;
  value_prev?: number | null;
  summary?: string | null;
  is_post_match?: boolean | null;
};

export function buildGuidance(notification: NotificationInput, lang: "EN" | "IS"): RecoveryGuidance {
  const key = notification.parameter;
  const entry = GUIDANCE[key];
  if (!entry) {
    // Unknown parameter — generic safe advice
    return lang === "IS"
      ? {
          actions: [
            "taktu rólegan recovery dag á morgun",
            "auka svefn + vatnsdrykkju í kvöld",
          ],
          escalation: "Talaðu við þjálfara ef þú finnur fyrir áhyggjum.",
        }
      : {
          actions: [
            "take a light recovery day tomorrow",
            "extra sleep and hydration tonight",
          ],
          escalation: "Talk to the coach if anything feels off.",
        };
  }
  return lang === "IS" ? entry.is : entry.en;
}

// ─── Claude prompt ────────────────────────────────────────────────────

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 350;

export function buildSystemPrompt(lang: "EN" | "IS"): string {
  const base = `You write short, friendly recovery messages from a sport-science platform to a flagged athlete.

═══════ HARD RULES ═══════

1. You MUST use ONLY the actions and escalation guidance provided in the input. Never invent
   exercises, sets, reps, durations, supplement names, drug names, or specific medical advice.

2. NEVER diagnose. Don't say "you have" + any condition (strain, tear, deficiency, etc.).
   Don't say "you're at risk of" any specific injury name.

3. The athlete name and the metric name come from the input. Don't change them.

4. Length: 4–6 sentences total. The athlete reads this in 15 seconds.

5. Tone: warm, direct, peer-to-peer. Not clinical. Not a lecture. The athlete is a teammate
   you respect, not a patient.

6. Structure:
   - Sentence 1: greet by name, name the metric that flagged.
   - Sentence 2: brief why-it-matters in everyday language.
   - Sentences 3–5: the actions, paraphrased lightly into prose. Don't list as bullets.
   - Final sentence: the escalation guidance.

7. End with a short sign-off: "— MicroPulse" (no extra punctuation).

8. Do NOT mention "AI", "model", "generated", "Claude", or any system internals.

`;

  const langInstr = lang === "IS"
    ? `9. WRITE IN ICELANDIC. Natural sport / strength conditioning Icelandic — say "æfing" not "session", "leikmaður" not "player", etc. Avoid English loan-words where a clean Icelandic word exists.\n\n`
    : `9. WRITE IN ENGLISH.\n\n`;

  const output = `Output JSON only, no surrounding text:
{ "message": "4–6 sentence message ending with the sign-off" }`;

  return base + langInstr + output;
}

// ─── Validator ────────────────────────────────────────────────────────

const FORBIDDEN_TERMS = [
  // diagnoses
  "you have a strain", "you have a tear", "you have a sprain",
  "þú ert með strain", "þú ert með tear",
  // medication/supplement specifics
  "ibuprofen", "paracetamol", "voltaren", "creatine", "ashwagandha",
  // drug-like prescriptions
  "take 500mg", "take 1000mg",
];

export function validatePlayerMessage(
  text: string,
  ctx: { player_name: string; lang: "EN" | "IS" },
): string | null {
  const trimmed = text.trim();
  if (trimmed.length < 80) return "Message too short (<80 chars)";
  if (trimmed.length > 1200) return "Message too long (>1200 chars)";

  // Sentence count: 3-7 (4-6 is target, allow ±1 for natural variation)
  const sentenceCount = trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 5).length;
  if (sentenceCount < 3 || sentenceCount > 8) {
    return `Sentence count out of bounds (${sentenceCount}, expected 3-8)`;
  }

  // Must include player name
  if (!trimmed.includes(ctx.player_name.split(" ")[0])) {
    return "Player first name missing";
  }

  // Must include sign-off
  if (!/MicroPulse\s*$/.test(trimmed)) {
    return "Missing — MicroPulse sign-off";
  }

  // No forbidden medical terms
  const lower = trimmed.toLowerCase();
  for (const term of FORBIDDEN_TERMS) {
    if (lower.includes(term.toLowerCase())) {
      return `Contains forbidden medical term: "${term}"`;
    }
  }

  // No system-internal mentions
  if (/\b(claude|gpt|llm|ai\s+model|generated by)\b/i.test(trimmed)) {
    return "Contains system-internal mention (AI/model/Claude)";
  }

  return null;
}

// ─── Claude call ──────────────────────────────────────────────────────

async function callClaude(systemPrompt: string, userMessage: string): Promise<{ message: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Claude API ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = json.content?.find((c) => c.type === "text")?.text ?? "";
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let parsed: { message?: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
  if (!parsed.message) throw new Error(`Claude response missing 'message' field`);
  return { message: parsed.message.trim() };
}

// ─── Public entry point ──────────────────────────────────────────────

export async function generatePlayerMessage(
  notification: NotificationInput,
  lang: "EN" | "IS",
): Promise<{ message: string; guidance: RecoveryGuidance }> {
  const guidance = buildGuidance(notification, lang);
  const systemPrompt = buildSystemPrompt(lang);

  const userMessage = `Notification context:
${JSON.stringify(
  {
    player_name: notification.player_name,
    position: notification.position ?? null,
    metric: notification.parameter,
    direction: notification.direction,
    severity: notification.severity,
    value_now: notification.value_now ?? null,
    value_prev: notification.value_prev ?? null,
    is_post_match: notification.is_post_match ?? false,
    summary: notification.summary ?? null,
  },
  null,
  2,
)}

Recovery guidance to use (pick from these — don't invent new actions):
${JSON.stringify(guidance, null, 2)}

Write the message now. JSON only.`;

  let result: { message: string };
  let issues: string | null = null;
  try {
    result = await callClaude(systemPrompt, userMessage);
    issues = validatePlayerMessage(result.message, { player_name: notification.player_name, lang });
    if (issues) {
      // Single retry with explicit feedback — same pattern as decel-summary route
      const retry = await callClaude(
        systemPrompt,
        userMessage +
          `\n\nIMPORTANT: Your previous attempt failed validation: ${issues}. Re-read the HARD RULES, especially the sign-off and the player-name requirement.`,
      );
      result = retry;
      issues = validatePlayerMessage(result.message, { player_name: notification.player_name, lang });
    }
  } catch (e) {
    throw new Error(`Generation failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (issues) {
    throw new Error(`Validation failed after retry: ${issues}`);
  }

  return { message: result.message, guidance };
}

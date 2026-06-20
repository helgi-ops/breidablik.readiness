/**
 * Curated coach Q&A library — 8 standard questions per player.
 *
 * Each question has:
 *   - id            : stable key used in API calls
 *   - label_en/is   : what the coach sees in the dropdown
 *   - data_keys     : which signals to fetch for this question (gates LLM scope)
 *   - prompt        : structured instruction to Claude — scoped to one specific
 *                     decision the coach is asking about
 *
 * Why curated rather than free-text: each prompt is focused on a specific
 * decision and only sees the data that's relevant to that decision. This
 * dramatically reduces hallucination scope vs a raw chatbot. The dropdown
 * is also a teaching aid — coaches discover what the system can actually
 * answer well, instead of asking unanswerable questions.
 */

export type QuestionDataKey =
  | "decel_status"
  | "indoor_state"
  | "pattern_window"
  | "active_injuries"
  | "match_calendar"
  | "recent_load"
  | "wellness_recent"
  | "vald_strength"
  | "sharp_cut"
  | "asp_burst"
  | "mpe_recovery"
  | "notifications_history"
  | "squad_averages"
  | "verdict_history";

export type Question = {
  id:    string;
  label: string;
  /** Hint shown under the dropdown when the coach hovers / focuses */
  hint:  string;
  /** Which data subsets to pull from DB and pass to Claude */
  data_keys: QuestionDataKey[];
  /** Focused prompt instruction — tells Claude exactly what to answer */
  prompt: string;
};

export const COACH_QUESTIONS: Question[] = [
  {
    id:    "biggest_risk",
    label: "What's his biggest injury risk right now?",
    hint:  "Surfaces the single dominant risk factor across all signals",
    data_keys: ["decel_status", "sharp_cut", "asp_burst", "active_injuries", "vald_strength", "wellness_recent"],
    prompt: `Question: What is this player's single biggest injury risk profile right now?

Answer in 2-3 sentences. Structure:
- Sentence 1: name the body region or system at highest risk (hamstring / groin / knee / ankle / general overload). If no real risk, say "no elevated injury risk — train normally".
- Sentence 2: which specific signals are pointing there (sharp cuts + low hip-ER strength → groin/ACL; A:D ratio <0.7 (eccentric-dominant) + recurring soreness → ACL / quadriceps / patellar tendon; A:D ratio >1.3 (concentric-dominant) + sprint exposure → hamstring; etc.)
- Sentence 3 (only if amber/red): one specific protective action (drill modification, recovery focus, strength priority).

Be honest about absence of risk. Coaches lose trust fast if you invent risks that aren't there.`,
  },
  {
    id:    "last_flag",
    label: "When was he last flagged and why?",
    hint:  "Notification history lookup — most recent threshold crossing",
    data_keys: ["notifications_history"],
    prompt: `Question: When was this player most recently flagged in the notification system, and what was the reason?

Answer in 2-3 sentences. Structure:
- Sentence 1: the date and the parameter that fired (e.g. "Flagged on Apr 26 for elevated decel volume")
- Sentence 2: brief context — was it acknowledged, did it resolve, did anything follow.
- Sentence 3 (only if pattern): note if the same flag has fired multiple times recently.

If there are no flags in the recent history, say so plainly: "No flags in the last 14 days — clean record."`,
  },
  {
    id:    "trend_14d",
    label: "What's his trend over the last 14 days?",
    hint:  "Trajectory read across load, wellness and verdicts",
    data_keys: ["pattern_window", "recent_load", "wellness_recent", "verdict_history"],
    prompt: `Question: What is this player's overall trajectory across the last 14 days?

Answer in 2-3 sentences. Structure:
- Sentence 1: improving / steady / worsening (one clear direction)
- Sentence 2: the dominant signal driving that direction (load climbing, wellness slipping, recovering well from previous spike, etc.)
- Sentence 3: implication for the next 7 days (e.g. "expect plateau", "watch for breakthrough fatigue around MD-1").

Be honest if data is sparse (e.g. injury time off the squad). Don't manufacture a trend if there's nothing to read.`,
  },
  {
    id:    "match_cost",
    label: "What did the last match cost him?",
    hint:  "Post-match load + recovery trajectory",
    data_keys: ["recent_load", "match_calendar", "wellness_recent", "decel_status"],
    prompt: `Question: What did the most recent match cost this player in load and recovery terms?

Answer in 2-3 sentences. Structure:
- Sentence 1: how heavy the match was for him relative to his typical (light / typical / heavy / very heavy)
- Sentence 2: how he's recovering since (back to baseline, lingering, still catching up)
- Sentence 3: practical implication (e.g. "ready to train fully again", "give one more easy day", "monitor for the rest of the week").

If there has been no match in the last 5 days, say "no recent match in the data" and stop.`,
  },
  {
    id:    "safest_drill",
    label: "What's the safest drill for him today?",
    hint:  "Drill modality recommendation based on dominant fatigue type",
    data_keys: ["decel_status", "indoor_state", "pattern_window", "active_injuries"],
    prompt: `Question: Given this player's current state, what type of drill is safest for him today and what should be avoided?

Answer in 2-3 sentences. Structure:
- Sentence 1: the drill modality you'd recommend (e.g. "small-sided possession", "linear running with tempo", "technical/passing", "recovery-only")
- Sentence 2: what to avoid and why (e.g. "skip high-decel finishing — A:D coupling is borderline" or "avoid sustained high-speed running — metabolic load already elevated")
- Sentence 3 (only when meaningful): one positive opportunity (e.g. "good day for explosive work — joints are fresh").

If the player is in clean GREEN with no concerns, say "any planned drill is fine — no restrictions" and stop.`,
  },
  {
    id:    "squad_compare",
    label: "How does he compare to the squad average?",
    hint:  "Per-signal comparison vs team mean",
    data_keys: ["recent_load", "squad_averages", "wellness_recent"],
    prompt: `Question: How does this player compare to the squad average on the key load and wellness signals?

Answer in 2-3 sentences. Structure:
- Sentence 1: overall positioning (above / at / below squad average for load)
- Sentence 2: 1-2 specific signals where he differs most from squad mean (e.g. "20% higher sprint volume than average; wellness 1 point below squad mean")
- Sentence 3: what that means in context (a striker above average sprint volume is normal; a centre-back above average sprint volume is unusual).

Stay descriptive — coaches use this to calibrate, not to act on directly.`,
  },
  {
    id:    "watch_today",
    label: "What should I watch for in today's session?",
    hint:  "Pre-session scan — most important factor to watch live",
    data_keys: ["decel_status", "pattern_window", "wellness_recent", "active_injuries", "indoor_state"],
    prompt: `Question: When this player is on the pitch today, what's the single most important thing to watch for?

Answer in 2-3 sentences. Structure:
- Sentence 1: the one thing to watch (movement quality at high decel, body language at fatigue point, soreness in body part X, etc.)
- Sentence 2: when in the session it's most likely to show up (early / mid / late / specific drill type)
- Sentence 3 (only if needed): the trigger that would mean "pull him" (e.g. "hold limb after a sprint", "drop in pace below his usual")

If everything is clean, say "nothing specific to watch today — just routine session-end check-in" and stop.`,
  },
  {
    id:    "why_flagged",
    label: "Why is he flagged today?",
    hint:  "Explains today's verdict — which signal tipped the scale and what that means",
    data_keys: ["wellness_recent", "recent_load", "decel_status", "active_injuries", "verdict_history"],
    prompt: `Question: Why is this player flagged (yellow / red) today? Explain the verdict using the actual signals that drove it.

Answer in 2-3 sentences. Structure:
- Sentence 1: the dominant signal that pushed today's verdict away from green (e.g. "Sleep dropped to 2/5 versus his usual 4.1 — primary driver", or "Player load yesterday was 73% above his rolling average — primary driver", or "Multiple wellness sub-scores under his personal norm — no single dominant driver"). Name the actual signal and the value.
- Sentence 2: secondary context — what else is contributing or what makes this more / less concerning (e.g. "It's MD+1 so a post-match echo is expected — readings should rebound by MD+2 (Nédélec 2012)", or "He's been in this range for 3 days, suggesting a persistent issue rather than a one-off"). When you attribute a dip to post-match residual fatigue, append the inline tag "(Nédélec 2012)" exactly as shown.
- Sentence 3 (only when meaningful): the single lever most likely to flip the verdict back to green tomorrow (e.g. "A normal night's sleep would likely return him to green", or "Skip the high-intensity block today and he should clear by MD-2").

HARD RULES for this question specifically:
- Use ONLY the actual numbers from the input. Never round drastically or invent a value.
- Tie every sentence back to a NAMED signal (sleep, soreness, player load, composite, etc.) — don't say "his readings are off" without saying which reading.
- If the verdict is GREEN, say "no flag today — he's clear" and stop.
- If the player has an active injury, lead with that ("Flagged because he's in the active injury pipeline — not a readiness issue") and skip the readings analysis.
- PATTERN CLAIMS — read the sub-scores carefully before claiming a recurring driver. If you say "X has been the driver on the recent red days", first check the wellness_recent_14d entries for those red dates and confirm X was actually dipped vs his usual on EACH of those days. A score of 4/5 on sleep IS his usual; do NOT call that a "dip" or include it in a sleep-driven pattern. The classic failure: confidently writing "sleep was the driver on May 23 and May 18" when sleep was actually 4/5 on both days and the real drivers were energy and soreness. If the historical drivers don't all share the same sub-score, say so plainly ("each red day was driven by different sub-scores — no single recurring sensitivity").`,
  },
];

export function getQuestion(id: string): Question | undefined {
  return COACH_QUESTIONS.find((q) => q.id === id);
}

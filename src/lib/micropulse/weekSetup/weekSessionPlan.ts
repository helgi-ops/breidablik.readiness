/**
 * Week → session setup — pure, side-effect free.
 *
 * Turns the coach's WEEK PLAN (Week Setup: an MD day + a physical theme per date) into a
 * per-session recommendation the Session Builder can pre-fill: what STIMULUS TYPE each
 * training day should be (mechanical / locomotive / mixed / technical) and the drill blend
 * that expresses it — so "build session" reads the week and lays out the week's sessions.
 *
 * The theme → type map mirrors the Week-setup dropdown's own MD definitions (FORCE=MD-4,
 * NEURAL_VELOCITY=MD-3, VELOCITY/POLISH_CALM=MD-2, ACTIVATION=MD-1) and the strength engine's
 * per-MD emphasis. Descriptive planning aid — never the readiness colour or the daily decision.
 *
 * Cite: the existing Week-setup themes + MD-periodised strength templates; Owen 2017 (taper).
 */

import type { StimulusType } from "@/lib/drill-stimulus";
import type { Bi } from "@/lib/micropulse/load/peakPeriod";

/** One day of the week plan, as stored by Week Setup. */
export interface WeekPlanDayInput {
  date: string;
  /** md_day (e.g. "MD-4") if resolved, else null. */
  mdDay?: string | null;
  /** day_type_final theme token (FORCE / NEURAL_VELOCITY / POLISH_CALM / ACTIVATION / …). */
  dayType?: string | null;
  /** Optional target Player Load for the day (from the load plan / mdShape). */
  targetPl?: number | null;
}

export type StimulusBlend = Partial<Record<StimulusType, number>>;

export interface SessionRecommendation {
  date: string;
  mdDay: string | null;
  theme: string | null;
  /** null when the day is the match / a day off / not a training session. */
  sessionType: StimulusType | null;
  /** Recommended count of drills per stimulus (a simple, tunable blend). */
  blend: StimulusBlend;
  targetPl: number | null;
  note: Bi;
  /** Post-match RECOVERY day (MD+1 top-up / MD+2 regen). The stimulus vocabulary has no "recovery"
   *  type, so it's reduced to a light locomotive blend — this flag lets the UI label it correctly
   *  ("Top-up / recovery") instead of showing "Locomotive". */
  recovery?: boolean;
}

const T = (s: string | null | undefined) => (s ?? "").toUpperCase();

/** The default drill blend for a stimulus type (a simple, tunable starting point). */
const BLEND_FOR_TYPE: Record<StimulusType, StimulusBlend> = {
  mechanical: { mechanical: 2, mixed: 1 },
  mixed: { mixed: 2, locomotive: 1 },
  locomotive: { locomotive: 1, technical: 1 },
  technical: { technical: 1, mixed: 1 },
};

/** Explicit stimulus word a coach may set as the day's theme (day_type_final) — wins over the
 * generic MD-tier map, because it is the coach's own labelling of the day. */
function stimulusFromToken(token: string): { type: StimulusType; note: Bi } | null {
  if (token.includes("MECHANICAL")) return { type: "mechanical", note: { en: "Mechanical day — accel/decel & strength emphasis + a mixed game.", is: "Vélrænn dagur — accel/decel og styrkur + blandaður leikur." } };
  if (token.includes("LOCOMOTIVE")) return { type: "locomotive", note: { en: "Locomotive day — running/volume emphasis + a technical block.", is: "Hlaupadagur — hlaup/magn + tæknilegur kafli." } };
  if (token.includes("MIXED") || (token.includes("NEURAL") && token.includes("VELOCITY"))) return { type: "mixed", note: { en: "Mixed / high-intensity day + a locomotive block.", is: "Blandaður / háákefðardagur + hlaupakafli." } };
  if (token.includes("GAME PREPARATION") || token.includes("ACTIVATION") || token.includes("POLISH") || token.includes("CALM") || token.includes("TECHNICAL")) {
    return { type: "technical", note: { en: "Game-prep day — short, sharp, technical/mixed; low volume (the taper).", is: "Leikundirbúningur — stutt, beitt, tæknilegt/blandað; lágt magn (niðurtröppun)." } };
  }
  if (token.includes("RECOVERY")) return { type: "locomotive", note: { en: "Recovery — low-load locomotive / technical flow.", is: "Endurheimt — létt hlaup / tæknilegt flæði." } };
  return null;
}

/** Resolve a Week-setup theme/MD token to its MD tier (mirrors mapWeekSetupDayToMdContext). */
function tierOf(mdDay: string | null | undefined, dayType: string | null | undefined): string | null {
  const md = T(mdDay);
  if (md) {
    if (/MD-?4/.test(md)) return "MD-4";
    if (/MD-?3/.test(md)) return "MD-3";
    if (/MD-?2/.test(md)) return "MD-2";
    if (/MD-?1(?!\d)/.test(md)) return "MD-1";
    if (/MD\+1/.test(md)) return "MD+1";
    if (/MD-?5/.test(md)) return "MD-5";
    if (md === "MD" || md === "GAME") return "MD";
  }
  const dt = T(dayType);
  if (!dt) return null;
  if (dt.includes("GAME")) return "MD";
  if (dt.includes("OFF") || dt.includes("REST")) return "OFF";
  if (dt.includes("RECOVERY")) return "MD+1";
  if (dt.includes("FORCE")) return "MD-4";
  if (dt.includes("NEURAL") && dt.includes("VELOCITY")) return "MD-3";
  if (dt.includes("POLISH") || dt.includes("CALM")) return "MD-2";
  if (dt.includes("VELOCITY")) return "MD-2";
  if (dt.includes("ACTIVATION")) return "MD-1";
  return null;
}

/** Per-MD-tier session recommendation (stimulus type + drill blend + plain rationale). */
const TIER_PLAN: Record<string, { type: StimulusType | null; blend: StimulusBlend; note: Bi }> = {
  "MD-5": { type: "mechanical", blend: { mechanical: 2, mixed: 1 }, note: { en: "Reload / extensive — mechanical-dominant with a mixed block.", is: "Álagsdagur / magn — vélrænt ráðandi með blönduðum kafla." } },
  "MD-4": { type: "mechanical", blend: { mechanical: 2, mixed: 1 }, note: { en: "FORCE day — mechanical-dominant (accel/decel, strength emphasis) + a mixed game.", is: "FORCE dagur — vélrænt ráðandi (accel/decel, styrkur) + blandaður leikur." } },
  "MD-3": { type: "mixed", blend: { mixed: 2, locomotive: 1 }, note: { en: "NEURAL/VELOCITY day — mixed high-intensity + a locomotive/speed block.", is: "NEURAL/VELOCITY dagur — blandað háákefð + hlaupa-/hraðakafli." } },
  "MD-2": { type: "technical", blend: { technical: 1, mixed: 1 }, note: { en: "POLISH/CALM day — technical + a light mixed block, lower volume.", is: "POLISH/CALM dagur — tæknilegt + léttur blandaður kafli, minna magn." } },
  "MD-1": { type: "technical", blend: { technical: 1, mixed: 1 }, note: { en: "ACTIVATION day — short, sharp, technical/mixed; low volume (the taper).", is: "ACTIVATION dagur — stutt, beitt, tæknilegt/blandað; lágt magn (niðurtröppun)." } },
  "MD+1": { type: "mixed", blend: { locomotive: 1, mechanical: 1, mixed: 1 }, note: { en: "Top-up — load the players who didn't play (or played little) toward the match demand: BOTH locomotive (HSR) and mechanical (accel/decel). Starters recover.", is: "Áfylling — hlaða leikmenn sem spiluðu ekki (eða lítið) upp að leikkröfunni: BÆÐI hlaup (HSR) og vélrænt (accel/decel). Byrjunarlið í endurheimt." } },
  "MD": { type: null, blend: {}, note: { en: "Match day — no training session.", is: "Leikdagur — engin æfing." } },
  "OFF": { type: null, blend: {}, note: { en: "Day off.", is: "Frídagur." } },
};

/** Recommend a session setup for one week-plan day. Pure.
 *
 * Precedence: (1) match/off day → no session; (2) the coach's explicit stimulus label on the
 * day (day_type_final = "Mechanical"/"Locomotive"/…) wins; (3) else the generic MD-tier map. */
export function recommendSessionForDay(day: WeekPlanDayInput): SessionRecommendation {
  const token = `${T(day.dayType)} ${T(day.mdDay)}`;
  const tier = tierOf(day.mdDay, day.dayType);
  // Post-match recovery: the MD+1 top-up (and any "TOP-UP"/"RECOVERY" theme). Light day, not a
  // running session — flagged so the UI reads "Top-up / recovery", not "Locomotive".
  const isRecovery = tier === "MD+1" || token.includes("TOP-UP") || token.includes("TOPUP") || token.includes("RECOVERY");
  const out = (type: StimulusType | null, blend: StimulusBlend, note: Bi): SessionRecommendation => ({
    // Prefer an explicit MD label passed in (from the day's focus); else the derived tier.
    date: day.date, mdDay: (day.mdDay ?? null) || tier, theme: day.dayType ?? null,
    sessionType: type, blend, targetPl: typeof day.targetPl === "number" && isFinite(day.targetPl) ? day.targetPl : null, note,
    recovery: isRecovery && type != null,
  });

  // (1) match / day off → no training session.
  if (token.includes("GAME") && !token.includes("PREPARATION")) return out(null, {}, { en: "Match day — no training session.", is: "Leikdagur — engin æfing." });
  if (/\b(OFF|REST)\b/.test(token)) return out(null, {}, { en: "Day off.", is: "Frídagur." });

  // (2) the coach's explicit stimulus label wins — UNLESS this is a top-up/recovery day (keep it light).
  const explicit = isRecovery ? null : stimulusFromToken(token);
  if (explicit) return out(explicit.type, BLEND_FOR_TYPE[explicit.type], explicit.note);

  // (3) generic MD-tier map.
  const plan = (tier && TIER_PLAN[tier]) || null;
  if (plan) return out(plan.type, plan.blend, plan.note);
  return out(null, {}, { en: "No theme set — pick an MD day / theme in Week Setup.", is: "Ekkert þema — veldu MD-dag / þema í Vikuskipulagi." });
}

/** Recommend the whole week's session setups (training days only carry a sessionType). Pure. */
export function recommendWeekSessions(days: WeekPlanDayInput[]): SessionRecommendation[] {
  return (days ?? []).map(recommendSessionForDay).sort((a, b) => a.date.localeCompare(b.date));
}

/** A drill already classified by stimulus — the input to the picker. */
export interface ClassifiedDrill { id: string; name: string; stimulus: StimulusType | null }

/**
 * Pick drills that express a session's blend: for each stimulus in the blend, take up to its
 * count from drills classified to that type (in the given order). Pure; deduped by id.
 */
export function pickDrillsForBlend(drills: ClassifiedDrill[], blend: StimulusBlend): ClassifiedDrill[] {
  const used = new Set<string>();
  const out: ClassifiedDrill[] = [];
  for (const type of Object.keys(blend) as StimulusType[]) {
    const want = blend[type] ?? 0;
    let taken = 0;
    for (const d of drills) {
      if (taken >= want) break;
      if (d.stimulus === type && !used.has(d.id)) { used.add(d.id); out.push(d); taken++; }
    }
  }
  return out;
}

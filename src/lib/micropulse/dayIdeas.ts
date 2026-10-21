/**
 * Per-day COACHING IDEAS — a thin, pure composer over existing cited libraries, used on Week Setup (and
 * fed into Build Session). For a training day it returns, in a layered read:
 *   - focus:  a plain-language one-liner of the day's physical focus (phase-aware: in-season pitch stimulus
 *             vs off-/pre-season gym-led development).
 *   - load:   a colour-codable band (low/moderate/high) + estimated duration (min) + sRPE (AU) + % of match,
 *             from `planSessionLoad` (Buchheit 2024). A development fallback covers no-MD (dev) weeks.
 *   - pitch:  1–2 ON-PITCH implementation examples (small-sided-game area + bout length, or running),
 *             each carrying its citation (Hill-Haas 2011; Lacome 2018; López-Fernández 2019).
 *
 * Descriptive only — never the readiness colour. Invents no new sport-science; it composes + labels the
 * existing AREA_BAND / format / planned-load science. Keep the display thin: this is the content layer.
 */
import { planSessionLoad } from "./plannedSessionLoad";
import type { StimulusType } from "@/lib/drill-stimulus";

export type Bi = { en: string; is: string };
export type IdeaBand = "low" | "moderate" | "high";
export type PitchForm = { form: Bi; area: Bi; bout: Bi; cite: string };
export type DayIdeaLoad = { band: IdeaBand; durationMin: number; sessionLoad: number; matchPct: number; rpe: number };
export type DayIdea = { focus: Bi; load: DayIdeaLoad | null; pitch: PitchForm[] };

// ── Plain-language focus, IN-SEASON (the stimulus is a pitch stimulus) ──────────────────────────────
const FOCUS_INSEASON: Record<StimulusType, Bi> = {
  mechanical: { en: "Acceleration/deceleration + change-of-direction — mechanical overload in tight space; low HSR (protect the hamstrings).", is: "Hröðun/hemlun + stefnubreytingar — vélrænt yfirálag í þröngu rými; lágt háhraðahlaup (verndar aftanlæri)." },
  locomotive: { en: "High-speed running / running capacity — open-space HSR and top speed.", is: "Háhraðahlaup / hlaupageta — háhraði í opnu rými og hámarkshraði." },
  mixed: { en: "Match-like mixed stimulus — balanced HSR + accel/decel; the week's biggest session.", is: "Leiklíkt blandað áreiti — jafnvægi háhraða + hröðun/hemlun; stærsta æfing vikunnar." },
  technical: { en: "Technical / low-load — sharpen skills, prime without fatigue.", is: "Tæknilegt / lágt álag — skerpa færni, virkja án þreytu." },
};
// Plain-language focus, DEVELOPMENT phases (off-/pre-season — the same stimulus value means a gym-led quality)
const FOCUS_DEV: Record<StimulusType, Bi> = {
  mechanical: { en: "Strength / max-force — gym max-strength + acceleration mechanics.", is: "Styrkur / hámarkskraftur — hámarksstyrkur í sal + hröðunar-tækni." },
  mixed: { en: "Power / speed — explosive power and neural-velocity.", is: "Kraftur / hraði — sprengikraftur og tauga-hraði." },
  locomotive: { en: "Conditioning — aerobic / running base.", is: "Þol — loftháður / hlaupagrunnur." },
  technical: { en: "Technical / skills — low-load skill work.", is: "Tæknilegt / færni — léttari færniæfing." },
};
// Special (non-stimulus) days
const FOCUS_SPECIAL: Record<string, Bi> = {
  ACTIVATION: { en: "Activation / primer — sharpen and prime, do not fatigue (the lightest day before a match).", is: "Virkjun / undirbúningur — skerpa og virkja, ekki þreyta (léttasti dagur fyrir leik)." },
  TOPUP: { en: "Top-up / compensation — extra work for low-minute players; recovery for starters.", is: "Áfylling / uppbót — aukaálag fyrir fáar-mínútna leikmenn; endurheimt fyrir byrjunarlið." },
  RECOVERY: { en: "Recovery — aerobic flush / mobility; restore, don't load.", is: "Endurheimt — loftháð hreinsun / liðleiki; endurheimta, ekki hlaða." },
  OFF: { en: "Rest day — passive recovery.", is: "Frídagur — óvirk endurheimt." },
};

// ── On-pitch implementation examples, IN-SEASON (SSG area + bout; Hill-Haas 2011 areas, Lacome 2018 bouts) ──
const PITCH_INSEASON: Record<StimulusType, PitchForm[]> = {
  mechanical: [{ form: { en: "Small-sided games 3v3–4v4 + change-of-direction drills", is: "Fámennir leikir 3v3–4v4 + stefnubreytinga-drillur" }, area: { en: "tight pitch (~30–90 m²/player)", is: "þröngt svæði (~30–90 m²/leikm.)" }, bout: { en: "3–5 min bouts · 90–120 s rest", is: "3–5 mín lotur · 90–120 s hvíld" }, cite: "Hill-Haas 2011; Lacome 2018" }],
  locomotive: [{ form: { en: "Large-area SSG 7v7–9v9, or extensive / interval running", is: "Stórsvæðis-leikir 7v7–9v9, eða löng / interval hlaup" }, area: { en: "large / open pitch (~150–400 m²/player)", is: "stórt / opið svæði (~150–400 m²/leikm.)" }, bout: { en: "10–15+ min blocks · high HSR + top speed", is: "10–15+ mín blokkir · hátt háhraðahlaup + hámarkshraði" }, cite: "Hill-Haas 2011; López-Fernández 2019" }],
  mixed: [{ form: { en: "Match-like SSG 6v6–8v8 / positional games", is: "Leiklíkir leikir 6v6–8v8 / stöðuleikir" }, area: { en: "match-like pitch (~100–170 m²/player)", is: "leiklíkt svæði (~100–170 m²/leikm.)" }, bout: { en: "8–12 min bouts · balanced HSR + accel/decel", is: "8–12 mín lotur · jafnvægi háhraða + hröðun/hemlun" }, cite: "Hill-Haas 2011; Lacome 2018" }],
  technical: [{ form: { en: "Rondos / possession + finishing on a small, sharp area", is: "Rondó / boltahald + klárun á litlu, beittu svæði" }, area: { en: "small, sharp pitch (~30–110 m²/player)", is: "lítið, beitt svæði (~30–110 m²/leikm.)" }, bout: { en: "short, high-touch · low physical load", is: "stutt, mikil snerting · lágt líkamlegt álag" }, cite: "Hill-Haas 2011" }],
};
// On-pitch / gym examples, DEVELOPMENT phases (gym-led + running, not match-prep SSG)
const PITCH_DEV: Record<StimulusType, PitchForm[]> = {
  mechanical: [{ form: { en: "Gym max-strength + short sprint / acceleration mechanics", is: "Hámarksstyrkur í sal + stutt spretta / hröðunar-tækni" }, area: { en: "gym + short track", is: "salur + stutt braut" }, bout: { en: "heavy sets · long rest", is: "þungar lotur · löng hvíld" }, cite: "Issurin 2010; Suchomel 2017" }],
  mixed: [{ form: { en: "Jumps / throws + short small-sided games", is: "Stökk / köst + stuttir fámennir leikir" }, area: { en: "gym + small area", is: "salur + lítið svæði" }, bout: { en: "explosive · full recovery", is: "sprengikraftur · full endurheimt" }, cite: "Cormie 2011" }],
  locomotive: [{ form: { en: "Extensive or interval running (aerobic base)", is: "Löng eða interval hlaup (loftháður grunnur)" }, area: { en: "open space / track", is: "opið svæði / braut" }, bout: { en: "continuous, or 3–4 min intervals", is: "samfellt, eða 3–4 mín interval" }, cite: "Buchheit & Laursen 2013" }],
  technical: [{ form: { en: "Rondos / low-load ball work", is: "Rondó / léttari boltavinna" }, area: { en: "small area", is: "lítið svæði" }, bout: { en: "short, high-touch", is: "stutt, mikil snerting" }, cite: "Hill-Haas 2011" }],
};

const to3Band = (b: string): IdeaBand => (b === "light" ? "low" : b === "moderate" ? "moderate" : "high");

/** No-MD (development / manual) fallback — a sensible band + nominal duration by focus, so dev weeks still
 *  show a planned load. sRPE = rpe × duration; matchPct 0 (no match to reference). */
function devLoad(stimulus: StimulusType | null, character: string): DayIdeaLoad {
  if (character === "RECOVERY") return mkLoad("low", 35, 4);
  if (character === "ACTIVATION" || character === "TOPUP") return mkLoad("low", 40, 5);
  const byStim: Record<StimulusType, { band: IdeaBand; min: number; rpe: number }> = {
    mechanical: { band: "high", min: 75, rpe: 7 },     // strength / max-force
    mixed: { band: "moderate", min: 70, rpe: 6 },       // power / speed
    locomotive: { band: "moderate", min: 65, rpe: 6 },  // conditioning
    technical: { band: "low", min: 50, rpe: 5 },
  };
  const b = stimulus ? byStim[stimulus] : { band: "moderate" as IdeaBand, min: 60, rpe: 6 };
  return mkLoad(b.band, b.min, b.rpe);
}
const mkLoad = (band: IdeaBand, durationMin: number, rpe: number): DayIdeaLoad => ({ band, durationMin, rpe, sessionLoad: rpe * durationMin, matchPct: 0 });

/** Compose the per-day idea. `stimulus` is the caller's characterToStimulus(character) (null for
 *  activation/top-up/recovery/off); `character` is the raw day-character token (upper-cased inside);
 *  `phase` gates the in-season vs development vocabulary. */
export function dayIdea(input: {
  stimulus: StimulusType | null;
  character?: string | null;
  mdDay: string | null;
  dayType: string | null;
  focus: string | null;
  phase?: string | null;
}): DayIdea {
  const char = String(input.character ?? "").toUpperCase();
  const dt = String(input.dayType ?? "").toUpperCase();
  const isOff = char === "OFF" || dt === "OFF" || dt === "GAME";
  const isDev = input.phase === "offseason" || input.phase === "preseason";

  // Focus line: stimulus day → phase-aware map; otherwise the special-day focus.
  const focus: Bi = input.stimulus
    ? (isDev ? FOCUS_DEV : FOCUS_INSEASON)[input.stimulus]
    : (FOCUS_SPECIAL[char] ?? FOCUS_SPECIAL.OFF);

  // Load band + duration: the planned-load model when an MD anchors the day; else a dev fallback (unless OFF).
  let load: DayIdeaLoad | null = null;
  if (!isOff) {
    const psl = planSessionLoad({ mdDay: input.mdDay, dayType: input.dayType, focus: input.focus });
    load = psl.applicable
      ? { band: to3Band(psl.band), durationMin: psl.durationMin, sessionLoad: psl.sessionLoad, matchPct: psl.matchPct, rpe: psl.rpe }
      : devLoad(input.stimulus, char);
  }

  // On-pitch examples: only for stimulus training days (not OFF / activation-only / recovery).
  const pitch: PitchForm[] = input.stimulus && !isOff ? (isDev ? PITCH_DEV : PITCH_INSEASON)[input.stimulus] : [];

  return { focus, load, pitch };
}

/** Bilingual label + a traffic-safe colour token for a load band (coach colour-coding). Never the
 *  readiness colour — this is a PLANNED-load legibility aid (green=low, cobalt=moderate, amber=high). */
export const LOAD_BAND_META: Record<IdeaBand, { label: Bi; color: string }> = {
  low: { label: { en: "Low", is: "Lágt" }, color: "#1c7a4a" },
  moderate: { label: { en: "Moderate", is: "Miðlungs" }, color: "#2740e6" },
  high: { label: { en: "High", is: "Hátt" }, color: "#de9328" },
};

/** The estimated session-RPE shown as a ±1 target band on the Borg CR-10 scale (clamped 1–10),
 *  e.g. 7 → "6–8". A range reads honestly as planning latitude, not false point-precision. */
export const rpeRange = (rpe: number): string => {
  const r = Math.round(rpe);
  return `${Math.max(1, r - 1)}–${Math.min(10, r + 1)}`;
};

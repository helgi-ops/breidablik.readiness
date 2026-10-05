/**
 * Periodization model — the coach's own principles, as DATA (not a new engine).
 *
 * A periodization model maps each MD day of the microcycle to an intended load TYPE,
 * an intensity cap (as a share of a match), and — optionally — an emphasised game moment
 * or a free principle tag. The session-fit checker (`sessionFitCheck.ts`) reads the ACTIVE
 * model's day spec instead of a hard-coded microcycle, so a coach can check a built session
 * against the built-in MD-microcycle, a Tactical Periodization morphocycle, or their own
 * custom model.
 *
 * Two presets ship:
 *   - DEFAULT_MD_MICROCYCLE — faithful to the existing engine (plannedSessionLoad base types),
 *     so nothing changes for teams that don't opt in.
 *   - TACTICAL_PERIODIZATION_MORPHOCYCLE — the Frade / Mourinho morphocycle (Tension / Duration /
 *     Velocity acquisition days), which deliberately DIFFERS from the default (e.g. MD-2 is a
 *     speed day, not a locomotive day) — which is the whole point of making the model selectable.
 *
 * Models are data; they never compute a verdict, never touch the readiness colour.
 *
 * Cite: Tactical Periodization — Vítor Frade (Univ. Porto), popularised by Mourinho / Villas-Boas:
 *       the four moments of the game; specificity (every drill expresses the game model); the
 *       morphocycle with acquisition days (MD-4 Tension / MD-3 Duration / MD-2 Velocity) at
 *       intensity maximal relative to recovery. Default MD-cycle types & bands: existing MicroPulse
 *       engines (plannedSessionLoad, drillMdFit, loadTargets); Buchheit & Lacome; Martín-García 2018.
 */

import type { SessionLoadType } from "@/lib/micropulse/plannedSessionLoad";
import type { Bi } from "@/lib/micropulse/load/peakPeriod";

export type ModelSource = "default_md" | "tactical_periodization" | "custom";

/** The intended load type for a day. Extends SessionLoadType with an explicit speed day. */
export type IntendedType = SessionLoadType | "speed";

/** The four moments of the game (Tactical Periodization). Null = no tactical emphasis set. */
export type GameMoment = "def_org" | "def_to_att" | "att_org" | "att_to_def" | null;

export interface MdDaySpec {
  /** "MD-4", "MD-3", "MD-2", "MD-1", "MD+1"… (canonical label). */
  mdDay: string;
  /** mechanical / locomotive / speed / mixed. */
  intendedType: IntendedType;
  /** Intensity cap as a share of a match, in percent. Null = no cap (model doesn't bound this day). */
  intensityCapPct: number | null;
  /** The emphasised game moment for the day (TP / custom). Omitted / null = none. */
  tacticalMoment?: GameMoment;
  /** Free coach tag ("high press", "build-up", "reduced spaces"). */
  principleTag?: string | null;
  /** Plain bilingual note on what the day is for. */
  note: Bi;
}

export interface PeriodizationModel {
  id: string;
  name: Bi;
  source: ModelSource;
  /** One spec per MD day in the microcycle. */
  days: MdDaySpec[];
}

/** Parse "MD-3" / "MD+1" / "MD" → signed offset. Null when unrecognised. */
export function mdOffset(mdDay: string | number | null | undefined): number | null {
  if (mdDay == null) return null;
  const s = String(mdDay).toUpperCase().replace(/\s+/g, "");
  if (s === "MD" || s === "MD0" || s === "MD+0") return 0;
  const m = s.match(/^MD([+-])(\d+)$/);
  if (!m) return null;
  return (m[1] === "-" ? -1 : 1) * parseInt(m[2], 10);
}

/** Canonical label for a signed offset. */
export function labelForOffset(offset: number): string {
  if (offset === 0) return "MD";
  return offset < 0 ? `MD-${Math.abs(offset)}` : `MD+${offset}`;
}

/**
 * DEFAULT_MD_MICROCYCLE — the built-in model. Types mirror plannedSessionLoad's per-MD base
 * types exactly (MD-4 mechanical, MD-3 locomotive, MD-2 locomotive, MD-1 mixed, recovery days
 * mixed), so a team that doesn't opt into another model sees the same convention it does today.
 */
export const DEFAULT_MD_MICROCYCLE: PeriodizationModel = {
  id: "default_md",
  name: { en: "Default MD microcycle", is: "Sjálfgefinn MD-vikuhringur" },
  source: "default_md",
  days: [
    {
      mdDay: "MD-4", intendedType: "mechanical", intensityCapPct: 75,
      note: { en: "Early-week acquisition — force / accel-decel emphasis.", is: "Megin-álagsdagur snemma í viku — kraftur / accel-decel áhersla." },
    },
    {
      mdDay: "MD-3", intendedType: "locomotive", intensityCapPct: 95,
      note: { en: "Peak training day — high-speed running volume.", is: "Þyngsti æfingadagurinn — háhraðahlaup í magni." },
    },
    {
      mdDay: "MD-2", intendedType: "locomotive", intensityCapPct: 60,
      note: { en: "Taper begins — moderate running volume.", is: "Niðurtröppun hefst — hóflegt hlaupamagn." },
    },
    {
      mdDay: "MD-1", intendedType: "mixed", intensityCapPct: 40,
      note: { en: "Activation — short and sharp into the match.", is: "Virkjun — stutt og beitt inn í leik." },
    },
    {
      mdDay: "MD+1", intendedType: "mixed", intensityCapPct: 30,
      note: { en: "Recovery / top-up — light, loads non-starters.", is: "Endurheimt / áfylling — létt, hleður varamenn." },
    },
    {
      mdDay: "MD+2", intendedType: "mixed", intensityCapPct: 40,
      note: { en: "Recovery day — rebuild toward acquisition.", is: "Endurheimtardagur — uppbygging að megin-álagi." },
    },
  ],
};

/**
 * TACTICAL_PERIODIZATION_MORPHOCYCLE — the Frade morphocycle. Acquisition days carry a specific
 * stimulus and an emphasised principle: MD-4 Tension (mechanical, reduced spaces, eccentric / 1v1 /
 * finishing), MD-3 Duration (locomotive endurance, larger spaces, longest day), MD-2 Velocity
 * (speed — short high-speed actions, big recoveries), MD-1 Activation (polish / set pieces).
 * Note MD-2 differs from the default (speed vs locomotive) and MD-3 carries a higher volume cap —
 * that divergence is exactly why a coach would select this model.
 */
export const TACTICAL_PERIODIZATION_MORPHOCYCLE: PeriodizationModel = {
  id: "tactical_periodization",
  name: { en: "Tactical Periodization (morphocycle)", is: "Taktísk periodisering (morphocycle)" },
  source: "tactical_periodization",
  days: [
    {
      mdDay: "MD-4", intendedType: "mechanical", intensityCapPct: 70,
      principleTag: "Tension — reduced spaces, strength / 1v1 / finishing",
      note: { en: "Tension day — reduced spaces, eccentric / strength, 1v1, finishing. High mechanical, low volume.", is: "Tension-dagur — minnkuð svæði, eccentric / styrkur, 1v1, klárun. Hátt vélrænt, lágt magn." },
    },
    {
      mdDay: "MD-3", intendedType: "locomotive", intensityCapPct: 100,
      principleTag: "Duration — large spaces, collective organisation",
      note: { en: "Duration day — larger spaces, more continuous 11v11. The week's endurance / volume peak.", is: "Duration-dagur — stærri svæði, samfelldara 11v11. Úthalds- / magntoppur vikunnar." },
    },
    {
      mdDay: "MD-2", intendedType: "speed", intensityCapPct: 55,
      principleTag: "Velocity — short high-speed actions, big recoveries",
      note: { en: "Velocity day — short high-speed actions with long recoveries. Speed, not volume.", is: "Velocity-dagur — stuttar háhraða-aðgerðir með löngum hvíldum. Hraði, ekki magn." },
    },
    {
      mdDay: "MD-1", intendedType: "mixed", intensityCapPct: 35,
      principleTag: "Activation — polish, set pieces",
      note: { en: "Activation — polish and set pieces, keep it calm into the match.", is: "Virkjun — fínpússun og fastaleikir, haltu ró inn í leik." },
    },
    {
      mdDay: "MD+1", intendedType: "mixed", intensityCapPct: 30,
      note: { en: "Recovery / compensation for non-starters.", is: "Endurheimt / uppbót fyrir varamenn." },
    },
  ],
};

export const BUILTIN_MODELS: Record<"default_md" | "tactical_periodization", PeriodizationModel> = {
  default_md: DEFAULT_MD_MICROCYCLE,
  tactical_periodization: TACTICAL_PERIODIZATION_MORPHOCYCLE,
};

/** The day spec for a given MD day in a model. Matches by signed offset, so "MD-03" / "MD -3" also resolve. */
export function specForDay(model: PeriodizationModel, mdDay: string | number | null): MdDaySpec | null {
  const want = mdOffset(mdDay);
  if (want == null) return null;
  for (const d of model.days) {
    if (mdOffset(d.mdDay) === want) return d;
  }
  return null;
}

/**
 * Build a PeriodizationModel from a stored row. `source` picks a built-in; "custom" uses the stored
 * `days` (falling back to the default microcycle's days when the stored model is empty/invalid).
 */
export function modelFromStored(input: {
  source: ModelSource | string | null | undefined;
  days?: MdDaySpec[] | null;
  name?: Bi | null;
} | null | undefined): PeriodizationModel {
  const source = (input?.source ?? "default_md") as ModelSource;
  if (source === "tactical_periodization") return TACTICAL_PERIODIZATION_MORPHOCYCLE;
  if (source === "custom") {
    const days = Array.isArray(input?.days) && input!.days!.length ? input!.days! : DEFAULT_MD_MICROCYCLE.days;
    return {
      id: "custom",
      name: input?.name ?? { en: "Custom model", is: "Sérsniðið módel" },
      source: "custom",
      days,
    };
  }
  return DEFAULT_MD_MICROCYCLE;
}

/**
 * Season-phase model for athlete programming.
 *
 * A ready-made programme can be assigned for a specific season block. The phase
 * applies an explainable volume multiplier (and an intensity note) on top of the
 * programme so the same template serves the whole year:
 *
 *   offseason  → build:        more volume to develop the base
 *   preseason  → convert:      full intensity, quality over quantity
 *   inseason   → maintain:     reduced volume, intensity kept (freshness)
 *   postseason → restoration:  light volume and intensity
 *
 * Rules decide, the surface explains — the note is always shown to the athlete.
 */

export const SEASON_PHASES = ["offseason", "preseason", "inseason", "postseason"] as const;
export type SeasonPhase = (typeof SEASON_PHASES)[number];

export function isSeasonPhase(v: unknown): v is SeasonPhase {
  return typeof v === "string" && (SEASON_PHASES as readonly string[]).includes(v);
}

type PhaseSpec = {
  volume: number; // multiplier applied to each exercise's set count
  label: { IS: string; EN: string };
  note: { IS: string; EN: string };
};

export const SEASON_PHASE_SPEC: Record<SeasonPhase, PhaseSpec> = {
  offseason: {
    volume: 1.2,
    label: { IS: "Undirbúningstímabil", EN: "Off-season" },
    note: { IS: "Uppbygging — meira magn til að byggja grunn.", EN: "Build phase — extra volume to develop the base." },
  },
  preseason: {
    volume: 1.0,
    label: { IS: "Undirbúningur fyrir tímabil", EN: "Pre-season" },
    note: { IS: "Umbreyting í kraft — full ákefð, gæði fram yfir magn.", EN: "Convert to power — full intensity, quality over quantity." },
  },
  inseason: {
    volume: 0.6,
    label: { IS: "Á tímabili", EN: "In-season" },
    note: { IS: "Ferskleiki í forgang — minna magn, ákefð haldið.", EN: "Freshness priority — reduced volume, intensity kept." },
  },
  postseason: {
    volume: 0.5,
    label: { IS: "Eftir tímabil", EN: "Post-season" },
    note: { IS: "Endurheimt — létt magn og ákefð.", EN: "Restoration — light volume and intensity." },
  },
};

/** Apply the phase volume multiplier to a set count (never below 1 set). */
export function applySeasonVolume(sets: number, phase: SeasonPhase | null | undefined): number {
  if (!phase || !isSeasonPhase(phase)) return sets;
  const m = SEASON_PHASE_SPEC[phase].volume;
  return Math.max(1, Math.round(sets * m));
}

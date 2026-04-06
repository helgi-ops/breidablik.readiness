/**
 * Drill Stimulus Classification
 *
 * Flokkar hverja drillu í eina af fjórum stimulus-gerðum byggt á GPS/Catapult
 * metrics. Þetta hjálpar þjálfurum að blanda rétt álag í gegnum MD-vikuna:
 *
 *  - Mechanical = þröngt rými, mikil accel/decel → MD-5 overload, ASD-prep
 *  - Locomotive = opið rými, hátt high-speed running → MD-4 running capacity
 *  - Mixed = jafnvægi beggja → MD-3 match-prep
 *  - Technical = lágt álag, bæði á HSR og accel/decel → warm-up, MD-2, MD-1
 */

export type StimulusType = "mechanical" | "locomotive" | "mixed" | "technical";

export interface StimulusClassification {
  type: StimulusType;
  label: string;
  shortLabel: string;
  description: string;
  /** MD-dagar sem passa best */
  suitableMdDays: string[];
  /** HSR (v5+v6) í metrum */
  hsrM: number;
  /** Accel + Decel B2-3 telja */
  accDec: number;
}

/** Viðmið í metrum og fjölda (per drill-bout, ekki per mín) */
const THRESHOLDS = {
  /** HSR mark fyrir locomotive-dominant drill */
  HSR_HIGH: 75,
  /** HSR mark fyrir að teljast "þröng" (mechanical eða technical) */
  HSR_LOW: 25,
  /** Accel+Decel B2-3 mark fyrir mechanical stimulus */
  ACCDEC_HIGH: 6,
  /** Accel+Decel B2-3 mark fyrir locomotive „hreint" */
  ACCDEC_LOCOMOTIVE_MAX: 12,
} as const;

function metaFor(type: StimulusType): Pick<
  StimulusClassification,
  "label" | "shortLabel" | "description" | "suitableMdDays"
> {
  switch (type) {
    case "mechanical":
      return {
        label: "Mechanical",
        shortLabel: "MECH",
        description:
          "Þröngt rými með mörgum accel/decel. Háður neuromuscular álag, undirbúningur fyrir ASD og stutt snúningsálag.",
        suitableMdDays: ["MD-5", "MD-4"],
      };
    case "locomotive":
      return {
        label: "Locomotive",
        shortLabel: "LOC",
        description:
          "Opið rými með miklu high-speed running. Byggir running capacity og hlauphraða.",
        suitableMdDays: ["MD-4", "MD-3"],
      };
    case "mixed":
      return {
        label: "Mixed",
        shortLabel: "MIX",
        description:
          "Jafnvægi milli HSR og accel/decel. Match-like stimulus fyrir MD-3.",
        suitableMdDays: ["MD-3", "MD-4"],
      };
    case "technical":
      return {
        label: "Technical",
        shortLabel: "TECH",
        description:
          "Lágt physiological álag í báðum víddum. Hentar fyrir warm-up, recovery og MD-2/MD-1.",
        suitableMdDays: ["MD-2", "MD-1"],
      };
  }
}

/**
 * Classify drill stimulus from GPS metrics.
 *
 * @param velB5 distance in vel band 5 (m)
 * @param velB6 distance in vel band 6 (m)
 * @param accelB23 number of accelerations in band 2-3
 * @param decelB23 number of decelerations in band 2-3
 * @returns classification or null if data insufficient
 */
export function classifyDrillStimulus(
  velB5: number | null | undefined,
  velB6: number | null | undefined,
  accelB23: number | null | undefined,
  decelB23: number | null | undefined
): StimulusClassification | null {
  const hsr = (velB5 ?? 0) + (velB6 ?? 0);
  const accDec = (accelB23 ?? 0) + (decelB23 ?? 0);

  // Ef engin gögn => null
  const hasAnyData =
    velB5 != null || velB6 != null || accelB23 != null || decelB23 != null;
  if (!hasAnyData) return null;

  let type: StimulusType;

  if (hsr >= THRESHOLDS.HSR_HIGH && accDec < THRESHOLDS.ACCDEC_LOCOMOTIVE_MAX) {
    type = "locomotive";
  } else if (hsr < THRESHOLDS.HSR_LOW && accDec >= THRESHOLDS.ACCDEC_HIGH) {
    type = "mechanical";
  } else if (hsr < THRESHOLDS.HSR_LOW && accDec < THRESHOLDS.ACCDEC_HIGH) {
    type = "technical";
  } else {
    type = "mixed";
  }

  return {
    type,
    hsrM: Math.round(hsr),
    accDec: Math.round(accDec),
    ...metaFor(type),
  };
}

/** Tailwind CSS classes fyrir hverja stimulus-gerð */
export function stimulusColorClasses(type: StimulusType): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  switch (type) {
    case "mechanical":
      // Rauð-appelsínugult fyrir neuromuscular/mechanical álag
      return {
        bg: "bg-rose-100",
        text: "text-rose-800",
        border: "border-rose-300",
        dot: "bg-rose-500",
      };
    case "locomotive":
      // Blátt fyrir running / aerobic
      return {
        bg: "bg-sky-100",
        text: "text-sky-800",
        border: "border-sky-300",
        dot: "bg-sky-500",
      };
    case "mixed":
      // Fjólublátt fyrir blöndu
      return {
        bg: "bg-violet-100",
        text: "text-violet-800",
        border: "border-violet-300",
        dot: "bg-violet-500",
      };
    case "technical":
      // Grátt fyrir technical/low-load
      return {
        bg: "bg-slate-100",
        text: "text-slate-700",
        border: "border-slate-300",
        dot: "bg-slate-400",
      };
  }
}

/** Safnar saman dreifingu stimulus-gerða í session */
export interface StimulusDistribution {
  mechanical: number;
  locomotive: number;
  mixed: number;
  technical: number;
  unclassified: number;
  total: number;
}

export function buildStimulusDistribution(
  drills: Array<{
    vel_b5: number | null;
    vel_b6: number | null;
    accel_b23: number | null;
    decel_b23: number | null;
    sets?: number | null;
  }>
): StimulusDistribution {
  const dist: StimulusDistribution = {
    mechanical: 0,
    locomotive: 0,
    mixed: 0,
    technical: 0,
    unclassified: 0,
    total: 0,
  };
  for (const d of drills) {
    const weight = d.sets ?? 1;
    const c = classifyDrillStimulus(d.vel_b5, d.vel_b6, d.accel_b23, d.decel_b23);
    dist.total += weight;
    if (!c) {
      dist.unclassified += weight;
    } else {
      dist[c.type] += weight;
    }
  }
  return dist;
}

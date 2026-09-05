/**
 * Multi-process recovery reads. After a football match, recovery is several
 * overlapping processes on different timelines — not one number. This computes a
 * small per-player, per-process read (recovered / lagging / no-data) for each,
 * each labelled with its own evidence, NEVER blended into a single score and
 * NEVER the readiness colour.
 *
 *   Neuromuscular — CMJ/force-plate vs baseline, else the canonical readiness
 *                   colour as a proxy. STRONG (Thomas 2017; Silva 2018).
 *   Autonomic     — HRV / resting-HR trend vs the player's own baseline.
 *                   STRONG (Stanley, Peake & Buchheit 2013). No-data until a
 *                   wearable feed exists.
 *   Perceptual    — soreness self-report vs baseline. STRONG.
 *   Sleep         — sleep self-report + the night-match flag. STRONG that night
 *                   football disrupts sleep.
 *
 * Descriptive: reads signals the platform already has; reads the readiness colour
 * but never writes it.
 */

export type ProcessKey = "neuromuscular" | "autonomic" | "perceptual" | "sleep";
export type ProcessStatus = "recovered" | "lagging" | "no_data";
export type ProcessEvidence = "strong" | "uncertain";
export type Bi = { en: string; is: string };

export interface ProcessRead {
  key: ProcessKey;
  status: ProcessStatus;
  evidence: ProcessEvidence;
  detail: Bi;
}

/** A post-match value paired with the player's own pre-match baseline. */
export type VsBaseline = { value: number | null; baseline: number | null };

export interface ProcessInputs {
  /** Canonical readiness colour at MD+2 (READ only). */
  md2Color: "green" | "yellow" | "red" | null;
  /** CMJ jump-height % vs pre-match baseline at the recovery day (negative = down). */
  cmjJhPct: number | null;
  /** Wellness sub-scores — all "lower_is_worse" (higher = better). */
  soreness: VsBaseline;
  sleepQuality: VsBaseline;
  /** Autonomic (wearable) — HRV higher = better; resting HR higher = worse. */
  hrv: VsBaseline;
  restingHr: VsBaseline;
  /** Evening kickoff → sleep disruption expected. */
  nightMatch: boolean;
}

// Thresholds — deliberately lenient so a normal daily wobble isn't a "lag".
const CMJ_DOWN_PCT = -5; // jump height ≥5% below baseline = neuromuscular lag (Gathercole noise floor)
const WELLNESS_MARGIN = 0.75; // on the 1–5 wellness scale
const HRV_DROP_RATIO = 0.9; // HRV ≤90% of baseline = autonomic lag
const RHR_RISE_RATIO = 1.05; // resting HR ≥105% of baseline = autonomic lag

const COLOR_WORD: Record<"green" | "yellow" | "red", Bi> = {
  green: { en: "green", is: "grænt" },
  yellow: { en: "yellow", is: "gult" },
  red: { en: "red", is: "rautt" },
};

function neuromuscular(inp: ProcessInputs): ProcessRead {
  const base = { key: "neuromuscular" as const, evidence: "strong" as const };
  if (inp.cmjJhPct != null) {
    const lag = inp.cmjJhPct <= CMJ_DOWN_PCT;
    const s = inp.cmjJhPct > 0 ? `+${inp.cmjJhPct}` : `${inp.cmjJhPct}`;
    return {
      ...base,
      status: lag ? "lagging" : "recovered",
      detail: { en: `CMJ ${s}% vs baseline`, is: `CMJ ${s}% vs grunnlínu` },
    };
  }
  if (inp.md2Color != null) {
    const lag = inp.md2Color !== "green";
    return {
      ...base,
      status: lag ? "lagging" : "recovered",
      detail: {
        en: `readiness ${COLOR_WORD[inp.md2Color].en} at MD+2 (no jump test)`,
        is: `viðbúnaður ${COLOR_WORD[inp.md2Color].is} á MD+2 (ekkert stökkpróf)`,
      },
    };
  }
  return { ...base, status: "no_data", detail: { en: "no jump test / no readiness", is: "ekkert stökkpróf / enginn viðbúnaður" } };
}

function autonomic(inp: ProcessInputs): ProcessRead {
  const base = { key: "autonomic" as const, evidence: "strong" as const };
  const hrvOk = inp.hrv.value != null && inp.hrv.baseline != null && inp.hrv.baseline > 0;
  const rhrOk = inp.restingHr.value != null && inp.restingHr.baseline != null && inp.restingHr.baseline > 0;
  if (!hrvOk && !rhrOk) {
    return { ...base, status: "no_data", detail: { en: "no HRV / resting-HR feed", is: "engin HRV / hvíldarpúls-gögn" } };
  }
  const hrvLag = hrvOk && (inp.hrv.value as number) <= (inp.hrv.baseline as number) * HRV_DROP_RATIO;
  const rhrLag = rhrOk && (inp.restingHr.value as number) >= (inp.restingHr.baseline as number) * RHR_RISE_RATIO;
  const lag = hrvLag || rhrLag;
  const bits: string[] = [];
  if (hrvOk) bits.push(`HRV ${Math.round(inp.hrv.value as number)}ms`);
  if (rhrOk) bits.push(`RHR ${Math.round(inp.restingHr.value as number)}bpm`);
  return {
    ...base,
    status: lag ? "lagging" : "recovered",
    detail: { en: bits.join(" · ") + " vs baseline", is: bits.join(" · ") + " vs grunnlínu" },
  };
}

function perceptual(inp: ProcessInputs): ProcessRead {
  const base = { key: "perceptual" as const, evidence: "strong" as const };
  const { value, baseline } = inp.soreness;
  if (value == null || baseline == null) {
    return { ...base, status: "no_data", detail: { en: "no soreness check-in", is: "engin eymsla-skráning" } };
  }
  const lag = value <= baseline - WELLNESS_MARGIN; // higher soreness score = less sore, so below baseline = worse
  return {
    ...base,
    status: lag ? "lagging" : "recovered",
    detail: { en: `soreness ${value}/5 (base ${baseline.toFixed(1)})`, is: `eymsli ${value}/5 (grunn ${baseline.toFixed(1)})` },
  };
}

function sleep(inp: ProcessInputs): ProcessRead {
  const base = { key: "sleep" as const, evidence: "strong" as const };
  const { value, baseline } = inp.sleepQuality;
  const hasSelf = value != null && baseline != null;
  if (!hasSelf && !inp.nightMatch) {
    return { ...base, status: "no_data", detail: { en: "no sleep input", is: "engin svefn-gögn" } };
  }
  const selfLag = hasSelf && (value as number) <= (baseline as number) - WELLNESS_MARGIN;
  // A night match is a strong prior for disruption even before the self-report lands.
  const lag = selfLag || (inp.nightMatch && !hasSelf) || (inp.nightMatch && selfLag);
  const detailEn = hasSelf
    ? `sleep ${value}/5 (base ${(baseline as number).toFixed(1)})${inp.nightMatch ? " · night match" : ""}`
    : "night match — sleep disruption expected";
  const detailIs = hasSelf
    ? `svefn ${value}/5 (grunn ${(baseline as number).toFixed(1)})${inp.nightMatch ? " · kvöldleikur" : ""}`
    : "kvöldleikur — búist við svefnröskun";
  return { ...base, status: lag ? "lagging" : "recovered", detail: { en: detailEn, is: detailIs } };
}

export function computeProcessReads(inp: ProcessInputs): ProcessRead[] {
  return [neuromuscular(inp), autonomic(inp), perceptual(inp), sleep(inp)];
}

export const PROCESS_LABEL: Record<ProcessKey, Bi> = {
  neuromuscular: { en: "Neuromuscular", is: "Taugavöðva" },
  autonomic: { en: "Autonomic", is: "Ósjálfráð" },
  perceptual: { en: "Perceptual", is: "Skynjun" },
  sleep: { en: "Sleep", is: "Svefn" },
};
export const STATUS_LABEL: Record<ProcessStatus, Bi> = {
  recovered: { en: "recovered", is: "endurheimt" },
  lagging: { en: "lagging", is: "á eftir" },
  no_data: { en: "no data", is: "engin gögn" },
};

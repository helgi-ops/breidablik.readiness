/**
 * loadVerdict — the explainability synthesis over Load Intelligence.
 *
 * PURE + deterministic. It does NOT recompute load — it consumes the signal
 * OUTPUTS the existing libs/endpoints already produce (playerLoadAcwr,
 * compositeLoad/externalLoad, mechanicalLoad MLI, foster monotony/strain,
 * metabolicLoad, movementSignature spike) and synthesizes one plain-language
 * verdict with named drivers + confidence. Rules decide the band; any AI layer
 * only rephrases the sentence (CLAUDE.md: rules decide, AI explains).
 *
 * Spec: docs/load-intelligence-explainability.md (step 1).
 *
 * Band logic (mirrors playerLoadAcwr cut-points so the page agrees with the
 * rest of the system: <0.8 UNDERTRAIN · 0.8–1.3 SAFE · 1.3–1.5 WATCH · >1.5 RISK):
 *   SPIKING     ACWR > 1.5, OR a ≥2.0 SD spike in a load driver (movementSignature
 *               peakZ, braking, or HSR) — "a sharp jump above the player's norm".
 *   BUILDING    ACWR 1.3–1.5 (WATCH), or rising monotony/strain.
 *   UNDER       ACWR < 0.8 (undertraining).
 *   SUSTAINABLE otherwise.
 *
 * Integrity guardrail: metabolic power (di Prampero) is weighted LOW and never
 * flips a band on its own; when it's a driver its plain text flags it as
 * directional only. Low signal coverage degrades confidence, never the band.
 */

export type LoadVerdictBand = "SUSTAINABLE" | "BUILDING" | "SPIKING" | "UNDER";
export type AcwrBandIn = "UNDERTRAIN" | "SAFE" | "WATCH" | "RISK" | "INSUFFICIENT_DATA";
type Lang = { EN: string; IS: string };

/** One already-computed signal output: its value and z vs the player's norm. */
export type Signal = { value: number | null; z: number | null };

export type LoadVerdictInput = {
  subject: { name: string };
  /** playerLoadAcwr output (the primary band driver). */
  acwr?: { ratio: number | null; band: AcwrBandIn; daysObserved: number } | null;
  /** movementSignature unfamiliar-load spike (peakZ ≥ 2.0 = spike). */
  movementSpike?: { peakZ: number | null; spike: boolean } | null;
  /** compositeLoad/externalLoad — high-intensity braking (McBurnie decel burden). */
  braking?: Signal | null;
  /** High-speed running. */
  hsr?: Signal | null;
  /** High-intensity distance %. */
  hid?: Signal | null;
  /** Mechanical Load Index (mechanicalLoad.ts). */
  mli?: Signal | null;
  /** Foster monotony / strain. */
  monotony?: { monotony: number | null; strain: number | null; rising: boolean } | null;
  /** di Prampero metabolic power — SECONDARY, low weight, flagged. */
  metabolic?: Signal | null;
};

export type LoadDriver = { signal: string; plain: Lang; z?: number; weight: number };
export type LoadComponent = { key: string; label: Lang; value: number | null; band: "LOW" | "NORMAL" | "ELEVATED" | "HIGH"; tooltip: Lang };
export type LoadVerdict = {
  band: LoadVerdictBand;
  sentence: Lang;
  drivers: LoadDriver[];
  confidence: { level: "high" | "moderate" | "low"; coverage: number; baselineDays: number };
  components: LoadComponent[];
};

// ── Thresholds (mirror playerLoadAcwr / movementSignature) ──
const ACWR_RISK = 1.5;
const SPIKE_Z = 2.0;       // movementSignature SPIKE_Z
const DRIVER_Z = 1.0;      // a signal is "elevated enough" to name as a driver
const METABOLIC_DRIVER_Z = 1.5; // higher bar — contested signal, don't over-name
const MIN_BASELINE = 8;    // playerLoadAcwr MIN_CHRONIC_DAYS_OBSERVED

const PLAIN: Record<string, Lang> = {
  braking: { EN: "high braking load", IS: "mikið hemlunarálag" },
  hsr: { EN: "high-speed running", IS: "háhraðahlaup" },
  hid: { EN: "high-intensity volume", IS: "háákefðar-magn" },
  mli: { EN: "mechanical load", IS: "vélrænt álag" },
  monotony: { EN: "training monotony", IS: "einhæfni álags" },
  acwr_spike: { EN: "acute load spike (ACWR > 1.5)", IS: "bráðaálags-stökk (ACWR > 1.5)" },
  movement_spike: { EN: "unfamiliar movement spike", IS: "óvænt hreyfistökk" },
  metabolic: { EN: "metabolic-power estimate — directional only", IS: "efnaskiptaafl — aðeins vísbending" },
};
const WEIGHT: Record<string, number> = {
  acwr_spike: 0.30, movement_spike: 0.30, braking: 0.25, hsr: 0.20, mli: 0.15, monotony: 0.13, hid: 0.12, metabolic: 0.05,
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const zOf = (s: Signal | null | undefined): number => (s && s.z != null && Number.isFinite(s.z) ? s.z : -Infinity);
const present = (s: Signal | null | undefined): boolean => !!s && (s.value != null || s.z != null);

function deriveBand(input: LoadVerdictInput): { band: LoadVerdictBand; trigger: string | null } {
  const ratio = input.acwr?.ratio ?? null;
  // ── SPIKING ── ACWR risk, or a sharp ≥2 SD spike in a load driver.
  if (ratio != null && ratio > ACWR_RISK) return { band: "SPIKING", trigger: "acwr_spike" };
  if (input.movementSpike?.spike) return { band: "SPIKING", trigger: "movement_spike" };
  if (zOf(input.braking) >= SPIKE_Z) return { band: "SPIKING", trigger: "braking" };
  if (zOf(input.hsr) >= SPIKE_Z) return { band: "SPIKING", trigger: "hsr" };
  // ── BUILDING ── elevated ACWR trajectory or rising monotony/strain.
  if (input.acwr?.band === "WATCH" || (ratio != null && ratio >= 1.3 && ratio <= ACWR_RISK)) return { band: "BUILDING", trigger: "acwr_watch" };
  if (input.monotony?.rising) return { band: "BUILDING", trigger: "monotony" };
  // ── UNDER ── undertraining.
  if (input.acwr?.band === "UNDERTRAIN" || (ratio != null && ratio < 0.8)) return { band: "UNDER", trigger: "acwr_under" };
  return { band: "SUSTAINABLE", trigger: null };
}

function buildDrivers(input: LoadVerdictInput, trigger: string | null): LoadDriver[] {
  const out: LoadDriver[] = [];
  const seen = new Set<string>();
  const add = (signal: string, z?: number) => {
    if (seen.has(signal)) return;
    seen.add(signal);
    out.push({ signal, plain: PLAIN[signal] ?? { EN: signal, IS: signal }, ...(z != null && Number.isFinite(z) ? { z: round1(z) } : {}), weight: WEIGHT[signal] ?? 0.05 });
  };

  // 1) The band trigger is always named (that IS the explanation).
  if (trigger === "acwr_spike" || trigger === "movement_spike") add(trigger);
  else if (trigger === "braking") add("braking", zOf(input.braking));
  else if (trigger === "hsr") add("hsr", zOf(input.hsr));
  else if (trigger === "monotony") add("monotony");

  // 2) Any other elevated signal (z ≥ 1.0; metabolic needs ≥1.5 — contested).
  const elevated: Array<{ key: string; z: number }> = [];
  for (const [key, sig] of [["braking", input.braking], ["hsr", input.hsr], ["hid", input.hid], ["mli", input.mli], ["metabolic", input.metabolic]] as const) {
    const z = zOf(sig);
    const bar = key === "metabolic" ? METABOLIC_DRIVER_Z : DRIVER_Z;
    if (z >= bar) elevated.push({ key, z });
  }
  elevated.sort((a, b) => b.z - a.z).forEach((e) => add(e.key, e.z));

  // Sort: named drivers by z desc; entries without z (acwr/movement/monotony) keep priority at the front.
  return out.sort((a, b) => (b.z ?? 99) - (a.z ?? 99));
}

function buildSentence(name: string, band: LoadVerdictBand, drivers: LoadDriver[]): Lang {
  const top = drivers.slice(0, 2);
  const listEN = top.map((d) => d.plain.EN).join(" and ");
  const listIS = top.map((d) => d.plain.IS).join(" og ");
  switch (band) {
    case "SPIKING":
      return { EN: `${name}'s load is spiking${listEN ? ` — driven by ${listEN}` : ""}.`, IS: `Álag ${name} er að rjúka upp${listIS ? ` — drifið af: ${listIS}` : ""}.` };
    case "BUILDING":
      return { EN: `${name}'s load is building${listEN ? ` — ${listEN}` : ""}.`, IS: `Álag ${name} er að byggjast upp${listIS ? ` — ${listIS}` : ""}.` };
    case "UNDER":
      return { EN: `${name} is under-loaded — below the chronic baseline.`, IS: `${name} er undir-hlaðinn — undir grunnlínu álags.` };
    default:
      return { EN: `${name}'s load is sustainable.`, IS: `Álag ${name} er sjálfbært.` };
  }
}

function tileBand(z: number | null): LoadComponent["band"] {
  if (z == null || !Number.isFinite(z)) return "NORMAL";
  if (z >= SPIKE_Z) return "HIGH";
  if (z >= DRIVER_Z) return "ELEVATED";
  if (z <= -DRIVER_Z) return "LOW";
  return "NORMAL";
}

function buildComponents(input: LoadVerdictInput): LoadComponent[] {
  const tiles: LoadComponent[] = [];
  if (present(input.braking)) tiles.push({ key: "braking", label: { EN: "Braking load", IS: "Hemlunarálag" }, value: input.braking!.value, band: tileBand(input.braking!.z), tooltip: { EN: "High-intensity deceleration burden (McBurnie 2022) vs the player's own norm.", IS: "Háákefðar-hemlunarálag (McBurnie 2022) m.v. eigin venju leikmannsins." } });
  if (present(input.hid)) tiles.push({ key: "hid", label: { EN: "High-intensity %", IS: "Háákefðar-%" }, value: input.hid!.value, band: tileBand(input.hid!.z), tooltip: { EN: "Share of distance covered at high speed.", IS: "Hlutfall vegalengdar á háum hraða." } });
  if (input.monotony) tiles.push({ key: "monotony", label: { EN: "Monotony", IS: "Einhæfni" }, value: input.monotony.monotony, band: input.monotony.rising ? "ELEVATED" : "NORMAL", tooltip: { EN: "Foster training monotony — day-to-day sameness of load; high monotony raises strain.", IS: "Foster einhæfni — hversu eins álagið er dag frá degi; mikil einhæfni eykur strain." } });
  const spikeZ = Math.max(zOf(input.braking), zOf(input.hsr), input.movementSpike?.peakZ ?? -Infinity);
  tiles.push({ key: "spike", label: { EN: "Spike", IS: "Stökk" }, value: Number.isFinite(spikeZ) ? round1(spikeZ) : null, band: spikeZ >= SPIKE_Z ? "HIGH" : "NORMAL", tooltip: { EN: "A sharp jump (≥2 SD) above the player's own recent norm.", IS: "Snöggt stökk (≥2 SD) yfir nýlega venju leikmannsins." } });
  return tiles;
}

function computeConfidence(input: LoadVerdictInput): LoadVerdict["confidence"] {
  // Coverage over the six component signals (lower Catapult tiers expose fewer).
  const componentSignals = [input.braking, input.hsr, input.hid, input.mli, input.metabolic];
  let n = componentSignals.filter(present).length;
  if (input.monotony && (input.monotony.monotony != null || input.monotony.strain != null)) n += 1;
  const coverage = Math.round((n / 6) * 100) / 100;
  const baselineDays = input.acwr?.daysObserved ?? 0;
  let level: "high" | "moderate" | "low" = "low";
  if (baselineDays >= 19 && coverage >= 0.66) level = "high";
  else if (baselineDays >= MIN_BASELINE && coverage >= 0.5) level = "moderate";
  return { level, coverage, baselineDays };
}

/** Synthesize one load verdict (player or team) from already-computed signals. */
export function computeLoadVerdict(input: LoadVerdictInput): LoadVerdict {
  const { band, trigger } = deriveBand(input);
  const drivers = buildDrivers(input, trigger);
  return {
    band,
    sentence: buildSentence(input.subject.name, band, drivers),
    drivers,
    confidence: computeConfidence(input),
    components: buildComponents(input),
  };
}

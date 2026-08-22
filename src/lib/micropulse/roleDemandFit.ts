/**
 * Role-Demand Fit — pure, IO-free fusion engine (fusion-lag #1).
 *
 * Answers one question a coach can read at a glance: does this player's physical ENGINE
 * match the physical DEMANDS of the role he plays — and does his tactical OUTPUT confirm
 * it? It fuses data that normally lives in separate silos:
 *
 *   Engine (GPS/VALD percentiles)  x  Role demand (roleModel)  x  Driver (IMA movement
 *   archetype)  x  Output (per-90 tactical production).
 *
 * It reuses the player-capacity reduction from Game-Plan Fit (demand-weighted mean of the
 * player's POSITION percentiles) but DROPS the opponent modifier and the readiness gate:
 * this is a development / scouting read, layered beside readiness, NEVER touching the
 * readiness colour, the load target, or the daily decision. Rules compute; the AI (if any)
 * only phrases. Every weight cites its paper (see roleModel.ts); every verdict carries its
 * confidence (signal coverage + baseline maturity).
 *
 * The watch-item is the signal neither dataset shows alone: the highest-demand quality where
 * he is weakest RELATIVE to the demand — for a winger, the aerobic/durability base under the
 * repeated peaks. Small squad -> position norms have low n -> confidence must reflect it.
 */

import { QUALITY_BY_ID, type QualityId, type AthleteProfile } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import { juPositionGroup, JU_GROUP_LABEL, type JuGroup } from "@/lib/micropulse/positionStyle";
import { resolveRoleFit, ROLE_MODEL_CITATIONS } from "@/lib/micropulse/roleModel";

export type Bi = { en: string; is: string };
export type Confidence = "high" | "moderate" | "low";
export type EngineBand = "elite" | "solid" | "below" | "unknown";
export type DriverFit = "fits" | "atypical" | "unknown";
export type OutputRead = "productive" | "at_norm" | "under" | "unknown";

// ── Thresholds (transparent constants) ─────────────────────────────────────────
export const T = {
  eliteScore: 80,       // engine-fit >= this -> elite
  solidScore: 55,       // >= this -> solid; below -> below
  coverageFloor: 0.25,  // demanded-weight fraction with data below which the engine read is unknown
  coverageMin: 0.4,     // below this -> confidence capped low (partial engine data)
  watchMinWeight: 0.55, // a quality must be demanded at least this much to be a watch-item
  watchMaxPctl: 45,     // ...and he must sit at/below this position percentile
  outputProductive: 0.10, // per-90 vs season norm: >= +10% = productive
  outputUnder: -0.15,     // <= -15% = under (mirrors Form-vs-State dip threshold)
  matureMatches: 4,
};

const ARCH_WORD: Record<string, Bi> = {
  speed: { en: "speed / vertical threat", is: "hraði / lóðrétt ógn" },
  agility: { en: "repeat-effort agility", is: "snerpa / endurteknir sprettir" },
  volume: { en: "box-to-box engine", is: "vél / box-to-box" },
  aerial: { en: "aerial presence", is: "loftógn" },
  structural: { en: "low-intensity / structural", is: "lágákefð / strúktúr" },
  balanced: { en: "balanced mover", is: "jafn hreyfistíll" },
};

// ── Inputs (fixture-testable — no DB in the lib) ───────────────────────────────
/** Player's movement archetype (primary/secondary axis keys from classifyStyle). */
export type DriverInput = { primary: string | null; secondary: string | null } | null;
/** Per-90 tactical output vs the player's own season norm (reuses the Form-vs-State baseline). */
export type OutputInput = { per90: number | null; baselinePer90: number | null; matches: number } | null;

export type RoleDemandFitInput = {
  playerId: string;
  name: string;
  position: string | null;
  sport?: string | null;
  /** Optional sub-role tag (e.g. "inverted", "stopper"); falls back to the position default. */
  subRole?: string | null;
  profile: AthleteProfile | null;
  driver: DriverInput;
  output: OutputInput;
};

// ── Outputs ────────────────────────────────────────────────────────────────────
export type DemandFitRow = { quality: QualityId; label: Bi; weight: number; percentile: number | null };
export type WatchItem = { quality: QualityId; label: Bi; percentile: number; weight: number };
export type RoleDemandFitRead = {
  playerId: string;
  name: string;
  position: string | null;
  juGroup: JuGroup | null;
  roleLabel: Bi;
  subRole: string | null;
  driverArchetype: Bi;   // the role's expected movement archetype (from the sub-role model)
  outputMetric: Bi;      // the role's ideal output metric(s) — context for the OBV-based read
  scored: boolean;
  verdict: Bi;
  engine: { band: EngineBand; score: number | null; fact: Bi };
  driver: { fit: DriverFit; fact: Bi };
  output: { read: OutputRead; deltaPct: number | null; fact: Bi };
  watch: WatchItem[];
  counterfactual: Bi | null;
  demand: DemandFitRow[];
  confidence: Confidence;
  coverage: { engine: boolean; driver: boolean; output: boolean };
  sources: string[];
  citations: string[];
  citeRow: string;
};

const num = (x: number | null | undefined): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/**
 * Derive the movement archetype (the Driver) from the athlete profile's own qualities —
 * mechanical_power + change_of_direction are the IMA driver signals, speed/anaerobic are the
 * GPS engine, work/aerobic the volume base. Position-relative percentiles, so the top axis is
 * what he's relatively built for. Pure — the route passes the result as DriverInput. Null when
 * no movement data is present.
 */
export function driverArchetypeFromProfile(profile: AthleteProfile | null): DriverInput {
  if (!profile) return null;
  const pctl = (q: QualityId): number | null => profile.qualities.find((x) => x.id === q)?.positionPercentile ?? null;
  const axisMean = (qs: QualityId[]): number | null => {
    const vs = qs.map(pctl).filter((v): v is number => v != null);
    return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null;
  };
  const axes = ([
    { key: "speed", v: axisMean(["speed", "anaerobic_reserve"]) },
    { key: "agility", v: axisMean(["change_of_direction", "mechanical_power"]) },
    { key: "volume", v: axisMean(["work_capacity", "aerobic_endurance"]) },
    { key: "aerial", v: axisMean(["reactive_power"]) },
  ] as Array<{ key: string; v: number | null }>).filter((a): a is { key: string; v: number } => a.v != null);
  if (!axes.length) return null;
  axes.sort((a, b) => b.v - a.v);
  return { primary: axes[0].key, secondary: axes[1] && axes[1].v >= 60 ? axes[1].key : null };
}
/** Plain label — strips the "(…)" clarifier so the primary strings stay jargon-free. */
const plain = (id: QualityId): Bi => ({
  en: QUALITY_BY_ID[id].en.replace(/\s*\(.*\)\s*$/, ""),
  is: QUALITY_BY_ID[id].is.replace(/\s*\(.*\)\s*$/, ""),
});
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pctlWord = (p: number): Bi =>
  p >= 80 ? { en: "top-tier", is: "í efsta flokki" }
  : p >= T.solidScore ? { en: "strong", is: "sterk" }
  : p >= 40 ? { en: "around average", is: "um meðallag" }
  : { en: "a relative gap", is: "hlutfallslegur veikleiki" };

export function computeRoleDemandFit(input: RoleDemandFitInput): RoleDemandFitRead {
  const { playerId, name, position, profile } = input;
  const juGroup = juPositionGroup(position, input.sport);
  const roleLabel: Bi = juGroup ? JU_GROUP_LABEL[juGroup] : { en: "this role", is: "þessari stöðu" };

  const base: RoleDemandFitRead = {
    playerId, name, position, juGroup, roleLabel, subRole: null,
    driverArchetype: { en: "", is: "" }, outputMetric: { en: "", is: "" }, scored: false,
    verdict: { en: "", is: "" },
    engine: { band: "unknown", score: null, fact: { en: "", is: "" } },
    driver: { fit: "unknown", fact: { en: "", is: "" } },
    output: { read: "unknown", deltaPct: null, fact: { en: "", is: "" } },
    watch: [], counterfactual: null, demand: [], confidence: "low",
    coverage: { engine: false, driver: false, output: false },
    sources: profile?.coverage.sources ?? [], citations: ROLE_MODEL_CITATIONS, citeRow: "",
  };

  // GK / unknown / basketball: honest out-of-scope (the outfield demand model doesn't apply).
  if (!juGroup) {
    return { ...base,
      verdict: {
        en: `${name} — no outfield role-demand benchmark for this position.`,
        is: `${name} — ekkert stöðu-viðmið fyrir þessa leikstöðu.`,
      } };
  }
  const { subRole, demand: model } = resolveRoleFit(juGroup, input.subRole);
  const citeRow = model.cite;

  // ── Engine-fit: demand-weighted mean of position percentiles over covered qualities ──
  const weights = model.weights;
  const totalW = (Object.values(weights) as number[]).reduce((s, w) => s + (w ?? 0), 0) || 1;
  const findPctl = (q: QualityId): number | null => profile?.qualities.find((x) => x.id === q)?.positionPercentile ?? null;
  const demand: DemandFitRow[] = (Object.keys(weights) as QualityId[])
    .map((q) => ({ quality: q, label: plain(q), weight: (weights[q] ?? 0) / totalW, percentile: findPctl(q) }))
    .sort((a, b) => b.weight - a.weight);

  const covered = demand.filter((d) => d.percentile != null);
  const coveredWeight = covered.reduce((s, d) => s + d.weight, 0); // fraction of demand with data
  const engineScore = covered.length ? covered.reduce((s, d) => s + d.weight * (d.percentile as number), 0) / coveredWeight : null;
  const engineBand: EngineBand = engineScore == null || coveredWeight < T.coverageFloor ? "unknown"
    : engineScore >= T.eliteScore ? "elite" : engineScore >= T.solidScore ? "solid" : "below";

  // Engine tile fact — name the enabler (highest demand × percentile), in plain words.
  const enabler = covered.length ? [...covered].sort((a, b) => (b.weight * (b.percentile as number)) - (a.weight * (a.percentile as number)))[0] : null;
  const engineFact: Bi = enabler
    ? { en: `His ${enabler.label.en.toLowerCase()} is ${pctlWord(enabler.percentile as number).en} for a ${roleLabel.en}.`,
        is: `${cap(enabler.label.is)} hans er ${pctlWord(enabler.percentile as number).is} fyrir ${roleLabel.is}.` }
    : { en: "Not enough movement-capacity data for his role yet.", is: "Ekki nóg hreyfigetu-gögn fyrir stöðuna enn." };

  // ── Driver-fit: does his movement archetype match what the role expects ──
  const expect = model.driverAxes;
  const prim = input.driver?.primary ?? null;
  const sec = input.driver?.secondary ?? null;
  let driverFit: DriverFit = "unknown";
  let driverFact: Bi = { en: "No movement-signature data yet.", is: "Engin hreyfi-fingrafars gögn enn." };
  if (prim) {
    const hit = expect.includes(prim) || (sec != null && expect.includes(sec));
    driverFit = hit ? "fits" : "atypical";
    const archP = ARCH_WORD[prim] ?? { en: prim, is: prim };
    driverFact = hit
      ? { en: `Moves like a ${archP.en} — fits a ${roleLabel.en}.`, is: `Hreyfist eins og ${archP.is} — passar ${roleLabel.is}.` }
      : { en: `Moves like a ${archP.en} — unusual for a ${roleLabel.en}.`, is: `Hreyfist eins og ${archP.is} — óvenjulegt fyrir ${roleLabel.is}.` };
  }

  // ── Output read: per-90 vs his own season norm (Form-vs-State baseline) ──
  let outputRead: OutputRead = "unknown";
  let deltaPct: number | null = null;
  const per90 = num(input.output?.per90);
  const baseline = num(input.output?.baselinePer90);
  if (per90 != null && baseline != null && baseline !== 0) {
    deltaPct = (per90 - baseline) / Math.abs(baseline);
    outputRead = deltaPct >= T.outputProductive ? "productive" : deltaPct <= T.outputUnder ? "under" : "at_norm";
  }
  const outputFact: Bi = outputRead === "unknown"
    ? { en: "No match-output data to confirm the engine yet.", is: "Engin leikja-output gögn til að staðfesta vélina enn." }
    : outputRead === "productive"
      ? { en: "Match output is above his usual — the engine is turning into end product.", is: "Leikja-output er yfir venju — vélin skilar sér í lokaafurð." }
      : outputRead === "under"
        ? { en: "Match output is below his usual — not yet turning the engine into end product.", is: "Leikja-output er undir venju — vélin skilar sér ekki enn í lokaafurð." }
        : { en: "Match output is at his usual level.", is: "Leikja-output er á venjulegu róli." };

  // ── Watch-item: highest-demand quality where he's weakest relative to the demand ──
  const watch: WatchItem[] = demand
    .filter((d) => (weights[d.quality] ?? 0) >= T.watchMinWeight && d.percentile != null && (d.percentile as number) <= T.watchMaxPctl)
    .sort((a, b) => (b.weight * (100 - (b.percentile as number))) - (a.weight * (100 - (a.percentile as number))))
    .slice(0, 2)
    .map((d) => ({ quality: d.quality, label: d.label, percentile: d.percentile as number, weight: weights[d.quality] ?? 0 }));

  // ── Verdict (plain — no "percentile", no "OBV") ──
  const roleEn = roleLabel.en, roleIs = roleLabel.is;
  const enginePhrase: Bi = engineBand === "elite" ? { en: `Elite ${roleEn} engine`, is: `Elite ${roleIs}-vél` }
    : engineBand === "solid" ? { en: `Solid ${roleEn} engine`, is: `Traust ${roleIs}-vél` }
    : engineBand === "below" ? { en: `Below-par engine for a ${roleEn}`, is: `Vél undir pari fyrir ${roleIs}` }
    : { en: `${cap(roleEn)} — not enough engine data`, is: `${cap(roleIs)} — ekki nóg vélar-gögn` };
  const driverPhrase: Bi | null = driverFit === "fits" ? { en: "matched to his role", is: "í takt við hlutverkið" }
    : driverFit === "atypical" ? { en: "though his movement style is unusual for it", is: "þó hreyfistíll hans sé óvenjulegur fyrir það" } : null;
  const outputPhrase: Bi | null = outputRead === "productive" ? { en: "and turning it into end product", is: "og skilar því í lokaafurð" }
    : outputRead === "under" ? { en: "but the end product isn't there yet", is: "en lokaafurðin er ekki enn til staðar" }
    : outputRead === "at_norm" ? { en: "at his usual output", is: "á venjulegu output" } : null;

  const watchTail: Bi | null = watch.length
    ? { en: `${watch.map((w) => w.label.en.toLowerCase()).join(" and ")} ${watch.length > 1 ? "are" : "is"} the watch-item${watch.length > 1 ? "s" : ""}`,
        is: `${watch.map((w) => w.label.is.toLowerCase()).join(" og ")} ${watch.length > 1 ? "eru" : "er"} atriðið til að fylgjast með` }
    : (engineBand === "elite" || engineBand === "solid")
      ? { en: "no clear watch-item — a complete profile", is: "ekkert augljóst atriði til að fylgjast með — heill prófíll" }
      : null;

  const joinEn = [enginePhrase.en, driverPhrase?.en, outputPhrase?.en].filter(Boolean).join(", ");
  const joinIs = [enginePhrase.is, driverPhrase?.is, outputPhrase?.is].filter(Boolean).join(", ");
  const verdict: Bi = {
    en: watchTail ? `${joinEn} — ${watchTail.en}.` : `${joinEn}.`,
    is: watchTail ? `${joinIs} — ${watchTail.is}.` : `${joinIs}.`,
  };

  // Counterfactual — the top watch-item at role-median would complete the profile.
  const counterfactual: Bi | null = watch.length
    ? { en: `At role-median ${watch[0].label.en.toLowerCase()} -> the fit reads complete.`, is: `Við miðgildi stöðu í ${watch[0].label.is.toLowerCase()} -> fit-ið verður heilt.` }
    : null;

  // ── Confidence (coverage + baseline maturity) ──
  const covEngine = engineBand !== "unknown";
  const covDriver = driverFit !== "unknown";
  const covOutput = outputRead !== "unknown";
  const matches = input.output?.matches ?? 0;
  const ratio = profile?.coverage.ratio ?? 0;
  let confidence: Confidence = "moderate";
  if (!covEngine || coveredWeight < T.coverageMin) confidence = "low";
  else if (covOutput && covDriver && matches >= T.matureMatches && ratio >= 0.5) confidence = "high";

  const sources = [...(profile?.coverage.sources ?? [])];
  if (covOutput) sources.push("Match output");

  return {
    ...base, scored: true, citeRow,
    subRole, driverArchetype: model.driver, outputMetric: model.output,
    verdict,
    engine: { band: engineBand, score: engineScore == null ? null : Math.round(engineScore), fact: engineFact },
    driver: { fit: driverFit, fact: driverFact },
    output: { read: outputRead, deltaPct, fact: outputFact },
    watch, counterfactual, demand, confidence,
    coverage: { engine: covEngine, driver: covDriver, output: covOutput },
    sources,
  };
}

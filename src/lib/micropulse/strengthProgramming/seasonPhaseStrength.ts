/**
 * Season-phase strength goal — pure config layer on top of `detectSeasonPhases`.
 *
 * The MD-microdose engine already lays out per-MD sessions; this only says what the phase's GOAL,
 * intensity zone and volume should be, so the same engine expresses hypertrophy→max→power in
 * pre-season, retention in-season, and reconditioning off-season. Advisory; never the readiness colour.
 *
 * Cite: Rønnestad 2011 (in-season maintenance); Mujika & Padilla 2000 (detraining); Cormie/Suchomel
 *       2011/2016 (build sequence); Cuthbert 2021 (volume distribution).
 */

import type { Bi } from "@/lib/micropulse/load/peakPeriod";
import type { PreseasonEmphasis } from "./preseasonEmphasis";
import type { InSeasonStrengthMode } from "./inSeasonStrengthMode";

export type SeasonPhaseKey = "preseason" | "competitive" | "offseason";
export type StrengthGoal = "recondition_maintain" | "build_sequence" | "retain";

export interface PhaseStrengthConfig {
  phase: SeasonPhaseKey;
  goal: StrengthGoal;
  volume: "low" | "moderate" | "high" | "descending";
  intensity: Bi;   // %1RM / velocity guidance for the engine's zone
  verdict: Bi;     // one-line goal (layer-0 read)
  flags: Bi[];     // e.g. congested-week protection, break = mini-block
  cite: string;
}

const CITE = "Rønnestad 2011; Mujika & Padilla 2000; Cormie/Suchomel 2011/2016; Cuthbert 2021";

// ───────────────────── Coach-authored rule overrides ─────────────────────
// The schemes below are evidence-based DEFAULTS. A strength coach can override individual fields
// per team (stored in coach_strength_rules); the loader passes the matching cell in as `override`.
// A field-level, per-language merge: an absent override field inherits the default — so a coach can
// change just the %1RM zone and keep the default scheme text + citation. Descriptive only; this
// never touches the readiness colour or the daily decision.

/** A per-language override; either language may be left out to inherit the default. */
export type BiOverride = { en?: string; is?: string };
const mergeBi = (def: Bi, ovr?: BiOverride | null): Bi =>
  ovr ? { en: ovr.en ?? def.en, is: ovr.is ?? def.is } : def;

/** Coach override for one season-phase config cell (editable fields only). */
export interface CoachPhaseRule { intensity?: BiOverride; verdict?: BiOverride }
/** Coach override for one meso-block scheme cell (editable fields only). */
export interface CoachBlockRule { quality?: BiOverride; pct1rm?: BiOverride; scheme?: BiOverride; cite?: string; methods?: StrengthMethodKey[];
  /** Weekly approach for this block (any phase — pre-season or in-season): "microdose" (spread
   *  across the training week, the default) or "traditional" (concentrate the weekly volume onto
   *  1–4 chosen lift days, the rest Off — the coach marks lift/Off days per MD day on the Send tab).
   *  Unset = the team default (which itself defaults to microdose). Descriptive planning only. */
  mode?: InSeasonStrengthMode }
/** The full sparse rule map a team stores — only customised cells are present. */
export interface CoachStrengthRules {
  block?: Partial<Record<string, CoachBlockRule>>; // key = `${goalKey}:${phase}`
  phase?: Partial<Record<SeasonPhaseKey, CoachPhaseRule>>;
}

/** The strength goal + zone for a season phase. `opts` refine the in-season flags; `override` is the
 *  coach's per-team edit for this phase (absent → evidence-based default). */
export function strengthConfigForPhase(
  phase: SeasonPhaseKey,
  opts?: { onBreak?: boolean; congestedWeek?: boolean },
  override?: CoachPhaseRule | null,
): PhaseStrengthConfig {
  const base = baseConfigForPhase(phase, opts);
  if (!override) return base;
  return { ...base, intensity: mergeBi(base.intensity, override.intensity), verdict: mergeBi(base.verdict, override.verdict) };
}

function baseConfigForPhase(
  phase: SeasonPhaseKey,
  opts?: { onBreak?: boolean; congestedWeek?: boolean },
): PhaseStrengthConfig {
  if (phase === "offseason") {
    return {
      phase, goal: "recondition_maintain", volume: "low",
      intensity: { en: "moderate load; a short true rest first, then recondition — keep ≥1 low-volume session/wk to protect the pre-season start.", is: "hófleg þyngd; stutt raunhvíld fyrst, svo enduruppbygging — haltu ≥1 léttri æfingu/viku til að vernda upphaf undirbúnings." },
      verdict: { en: "Off-season — recover, then stop the bleed (minimum maintenance).", is: "Undirbúningshlé — jafnaðu þig, svo stöðvaðu tapið (lágmarks-viðhald)." },
      flags: [{ en: "Screen (movement / force plate) to set individual pre-season targets.", is: "Skimaðu (hreyfing / kraftplata) til að setja einstaklings-markmið fyrir undirbúning." }],
      cite: CITE,
    };
  }
  if (phase === "preseason") {
    return {
      phase, goal: "build_sequence", volume: "descending",
      intensity: { en: "rising: hypertrophy (higher volume, moderate load) → max strength (heavy, low-rep, neural) → power (ballistic, taper volume into the opener).", is: "hækkandi: hypertrophy (meira magn, hófleg þyngd) → hámarksstyrkur (þungt, fáar endurt., taugalegt) → afl (ballistískt, trappa magn niður í fyrsta leik)." },
      verdict: { en: "Pre-season — build: hypertrophy → max strength → power (per-player start below).", is: "Undirbúningur — byggðu: hypertrophy → hámarksstyrkur → afl (per-leikmanns upphaf neðar)." },
      flags: [{ en: "Injury-prevention foundation built here + kept year-round; sequence heavy strength & hard running to limit interference.", is: "Meiðslavarnar-grunnur byggður hér + haldið árið um kring; raðaðu þungum styrk og hörðu hlaupi til að draga úr truflun." }],
      cite: CITE,
    };
  }
  // competitive (in-season)
  const flags: Bi[] = [];
  if (opts?.onBreak) flags.push({ en: "Break in the fixtures → trigger a mini-block (re-load strength while there's a gap).", is: "Hlé í leikjaskrá → keyrðu mini-blokk (endurhlaðið styrk meðan það er svigrúm)." });
  if (opts?.congestedWeek) flags.push({ en: "Congested week → protect the maintenance dose: 1×/wk keeps it, 1×/2wk loses ~10% 1RM (Rønnestad).", is: "Þétt vika → verndaðu viðhaldsskammtinn: 1×/viku heldur, 1×/2vikur tapar ~10% 1RM (Rønnestad)." });
  return {
    phase, goal: "retain", volume: "low",
    intensity: { en: "HIGH intensity (neural), LOW volume, microdosed — retain & express, don't build; one quality session/wk maintains.", is: "HÁ ákefð (taugaleg), LÁGT magn, microdosed — haltu & tjáðu, ekki byggja; ein gæðaæfing/viku viðheldur." },
    verdict: { en: "In-season — maintain strength/power, manage match fatigue.", is: "Keppnistímabil — viðhaltu styrk/afli, stýrðu leikþreytu." },
    flags,
    cite: CITE,
  };
}

// ───────────────────── MESO — strength scheme per block ─────────────────────
// The macro→meso→micro spine is shared with the LOAD periodization (Accumulation → Transmutation →
// Realization + deload, Issurin 2010). This is the STRENGTH lane on the SAME blocks: given a block's
// goalKey and the phase it sits in, prescribe the quality + %1RM zone + set/rep intent + citation.
// Descriptive overview — the micro engine (distributeStrengthVolume) still places the dose on MD-days,
// and the per-player emphasis biases WHICH quality each athlete leans to inside the block.

export type BlockGoalKey = "accum" | "transmute" | "realize" | "deload";

export interface BlockStrengthScheme {
  goalKey: BlockGoalKey;
  quality: Bi;      // short lane label (layer-0)
  pct1rm: Bi;       // intensity zone
  scheme: Bi;       // set × rep + intent (layer-1)
  cite: string;
  methods: StrengthMethodKey[]; // HOW the work is structured inside the block (one or more setups)
}

const CITE_MESO = "Issurin 2010 (block); González-Badillo & Sánchez-Medina 2010; Suchomel 2016; Rønnestad 2011";

// ───────────────────── Exercise setups (training methods) ─────────────────────
// HOW the strength work is structured inside a block — the "setup" the coach programmes. A block can
// carry MORE THAN ONE (e.g. Realization = French contrast + complex). Descriptive prescription: these
// ride on the block scheme and are surfaced alongside it; they never touch the readiness colour.

export type StrengthMethodKey =
  | "straight" | "superset" | "complex" | "contrast" | "french_contrast"
  | "cluster_intra" | "rest_redistribution" | "cluster_extensive" | "potentiation_cluster"
  | "accentuated_eccentric" | "oscillatory" | "triphasic"
  | "wave" | "emom" | "pap_primer";

export interface StrengthMethod { key: StrengthMethodKey; label: Bi; desc: Bi; cite?: string }

export const STRENGTH_METHODS: StrengthMethod[] = [
  { key: "straight", label: { en: "Straight sets", is: "Bein sett" },
    desc: { en: "Same lift, full rest between sets — the traditional base.", is: "Sama lyfta, full hvíld milli setta — hefðbundinn grunnur." } },
  { key: "superset", label: { en: "Supersets", is: "Ofursett" },
    desc: { en: "Two non-competing lifts back-to-back — time-efficient accumulation.", is: "Tvær ósamkeppandi lyftur í röð — tímahagkvæm uppsöfnun." } },
  { key: "complex", label: { en: "Complex", is: "Samsett (complex)" },
    desc: { en: "Heavy strength lift → a biomechanically similar power/plyo move (PAP).", is: "Þung styrkæfing → líkamslega lík kraft/plyo æfing (PAP)." }, cite: "Seitz & Haff 2016" },
  { key: "contrast", label: { en: "Contrast", is: "Kontrast" },
    desc: { en: "Alternate heavy and light-explosive reps, set by set (PAP).", is: "Skiptu á þungum og léttum-sprengi settum, sett fyrir sett (PAP)." }, cite: "Cormie/Suchomel 2016" },
  { key: "french_contrast", label: { en: "French contrast", is: "Franskt kontrast" },
    desc: { en: "4-exercise chain: heavy → plyo → loaded power → assisted/accelerated plyo.", is: "4-æfinga keðja: þungt → plyo → hlaðið afl → hjálpað/hraðað plyo." }, cite: "Dietz (Triphasic)" },
  { key: "cluster_intra", label: { en: "Cluster — intra-set rest", is: "Klasi — hvíld í setti" },
    desc: { en: "Short 15–30s rests between mini-sets of 1–3 reps so velocity & technique stay high at heavy loads.", is: "Stuttar 15–30s hvíldir milli smá-setta af 1–3 endurt. svo hraði og tækni haldist há við þungt." }, cite: "Hansen 2011; Hardee 2012; Tufano 2017" },
  { key: "rest_redistribution", label: { en: "Rest-redistribution", is: "Hvíldar-endurdreifing" },
    desc: { en: "Same total reps and total rest as a straight set, spread into shorter, more frequent breaks — less fatigue, volume-matched.", is: "Sama heildarmagn og heildarhvíld og í beinu setti, dreift í styttri, tíðari hlé — minni þreyta, jafnað magn." }, cite: "Tufano 2017; Jukic 2020" },
  { key: "cluster_extensive", label: { en: "Extensive cluster", is: "Víðtækur klasi" },
    desc: { en: "Longer work bouts with brief rests (e.g. 20s on / 10s off) to bank quality volume under controlled fatigue.", is: "Lengri vinnulotur með stuttum hvíldum (t.d. 20s á / 10s af) til að safna gæðamagni með stýrðri þreytu." }, cite: "Davies 2021; Tufano 2017" },
  { key: "potentiation_cluster", label: { en: "Potentiation cluster", is: "Mögnunar-klasi" },
    desc: { en: "A heavy activation rep, then explosive reps within the cluster — PAP in a cluster format.", is: "Þung virkjunar-endurtekning, svo sprengi-endurtekningar inni í klasanum — PAP í klasa-formi." }, cite: "Suchomel 2016; Haff 2008" },
  { key: "accentuated_eccentric", label: { en: "Accentuated eccentric", is: "Aukin eccentric-hleðsla" },
    desc: { en: "Extra load on the lowering phase (weight releasers / slow tempo), then a normal concentric — overload the eccentric to drive strength & RFD.", is: "Aukin þyngd í niðurfasa (weight releasers / hægt tempó), svo venjuleg lyfta upp — ofhladdu eccentric til að auka styrk & kraftþróun." }, cite: "Wagle 2017; Suchomel 2019" },
  { key: "oscillatory", label: { en: "Oscillatory reps", is: "Sveiflu-endurtekningar" },
    desc: { en: "Small, fast partial reps held in one position — trains rate of force development and stiffness.", is: "Litlar, hraðar hluta-endurtekningar í einni stöðu — þjálfar kraftþróun og stífleika." }, cite: "Dietz & Peterson 2012" },
  { key: "triphasic", label: { en: "Triphasic", is: "Þrífasa (triphasic)" },
    desc: { en: "Blocks that emphasise each muscle action in turn — eccentric → isometric → concentric — before concurrent power.", is: "Blokkir sem leggja áherslu á hvern vöðvafasa í röð — eccentric → ísómetrískt → concentric — á undan samhliða afli." }, cite: "Dietz & Peterson 2012" },
  { key: "wave", label: { en: "Wave loading", is: "Bylgju-hleðsla" },
    desc: { en: "Ascending–descending load waves — potentiate across the waves.", is: "Stígandi–fallandi þyngdarbylgjur — magnaðu upp milli bylgna." } },
  { key: "emom", label: { en: "EMOM / density", is: "EMOM / þéttni" },
    desc: { en: "Fixed work on the minute — microdosed in-season density.", is: "Föst vinna á mínútunni — microdosed þéttni á tímabili." } },
  { key: "pap_primer", label: { en: "PAP primer", is: "PAP inngangur" },
    desc: { en: "One heavy potentiating set before explosive output — matchday taper.", is: "Eitt þungt magnandi sett fyrir sprengiafl — leikdags-taper." }, cite: "Seitz & Haff 2016" },
];

const METHOD_KEYS = new Set<string>(STRENGTH_METHODS.map((m) => m.key));
// Legacy keys from earlier versions → their current equivalent (keeps stored overrides valid).
const METHOD_ALIASES: Record<string, StrengthMethodKey> = { cluster: "cluster_intra" };
/** Keep only valid, de-duplicated method keys (defensive against stale stored overrides). */
export function sanitizeMethods(raw: unknown): StrengthMethodKey[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<StrengthMethodKey>();
  for (const k of raw) {
    if (typeof k !== "string") continue;
    const resolved = METHOD_KEYS.has(k) ? (k as StrengthMethodKey) : METHOD_ALIASES[k];
    if (resolved) seen.add(resolved);
  }
  return [...seen];
}

// ───────────────────── Dropdown option catalogs (shared with the Rules editor) ─────────────────────
// The distinct, evidence-based values used across the default cells — offered as pick-lists so the coach
// picks a known prescription instead of free-typing (a "Custom…" escape still lets them type their own).
export const ZONE_OPTIONS: Bi[] = [
  { en: "65–80% 1RM", is: "65–80% 1RM" },
  { en: "70–85% 1RM", is: "70–85% 1RM" },
  { en: "80–90% 1RM", is: "80–90% 1RM" },
  { en: "85–95% 1RM", is: "85–95% 1RM" },
  { en: "30–60% 1RM (ballistic / WL derivatives)", is: "30–60% 1RM (kast / lyftinga-afleiður)" },
  { en: "keep intensity, cut volume ~40–50%", is: "haltu ákefð, skerðu magn ~40–50%" },
];
export const SCHEME_OPTIONS: Bi[] = [
  { en: "3–4 × 8–12, moderate load, higher volume", is: "3–4 × 8–12, hófleg þyngd, meira magn" },
  { en: "4–5 × 4–6, heavy", is: "4–5 × 4–6, þungt" },
  { en: "3–5 × 3–5, explosive concentric, ~10–20% velocity-loss cap", is: "3–5 × 3–5, sprengikraftur, ~10–20% hraðatap-þak" },
  { en: "5/3/1 ascending–descending waves", is: "5/3/1 stígandi–fallandi bylgjur" },
  { en: "low volume, high output — jumps/throws + clean/pull derivatives", is: "lágt magn, há afköst — stökk/köst + clean/pull afleiður" },
  { en: "1–2 explosive quality sets, microdosed", is: "1–2 sprengi-gæðasett, microdosed" },
  { en: "1–2 crisp heavy singles/doubles, half the sets", is: "1–2 skörp þung stök/tvennt, helmingi færri sett" },
];
export const QUALITY_OPTIONS: Bi[] = [
  { en: "Hypertrophy + base", is: "Hypertrophy + grunnur" },
  { en: "Max-strength base", is: "Hámarksstyrks-grunnur" },
  { en: "Strength–power", is: "Styrkur–kraftur" },
  { en: "Power / speed-strength", is: "Kraftur / hraði-styrkur" },
  { en: "Deload", is: "Niðurtröppun" },
];
export const INTENSITY_OPTIONS: Bi[] = [
  { en: "rising: hypertrophy → max strength → power (taper into the opener)", is: "hækkandi: hypertrophy → hámarksstyrkur → afl (trappa niður í fyrsta leik)" },
  { en: "HIGH intensity (neural), LOW volume, microdosed — retain & express", is: "HÁ ákefð (taugaleg), LÁGT magn, microdosed — haltu & tjáðu" },
  { en: "moderate load; recondition, keep ≥1 low-volume session/wk", is: "hófleg þyngd; enduruppbygging, haltu ≥1 léttri æfingu/viku" },
];
export const VERDICT_OPTIONS: Bi[] = [
  { en: "Pre-season — build: hypertrophy → max strength → power", is: "Undirbúningur — byggðu: hypertrophy → hámarksstyrkur → afl" },
  { en: "In-season — maintain strength/power, manage match fatigue", is: "Keppnistímabil — viðhaltu styrk/afli, stýrðu leikþreytu" },
  { en: "Off-season — recover, then stop the bleed (minimum maintenance)", is: "Undirbúningshlé — jafnaðu þig, svo stöðvaðu tapið (lágmarks-viðhald)" },
];

/**
 * Strength scheme for one meso block. Accumulation reads differently in pre-season (tissue base =
 * hypertrophy) vs an in-season re-accumulation (max-strength base) — the phase refines it. `override`
 * is the coach's per-team edit for this block×phase cell (absent → the evidence-based default). Pure.
 */
export function strengthForBlockGoal(
  goalKey: BlockGoalKey,
  phase: SeasonPhaseKey,
  override?: CoachBlockRule | null,
): BlockStrengthScheme {
  const base = baseBlockScheme(goalKey, phase);
  if (!override) return base;
  const methods = override.methods ? sanitizeMethods(override.methods) : null;
  return {
    goalKey: base.goalKey,
    quality: mergeBi(base.quality, override.quality),
    pct1rm: mergeBi(base.pct1rm, override.pct1rm),
    scheme: mergeBi(base.scheme, override.scheme),
    cite: override.cite ?? base.cite,
    methods: methods && methods.length ? methods : base.methods,
  };
}

/** The evidence-based default setup(s) for a block×phase cell. */
function defaultMethods(goalKey: BlockGoalKey, phase: SeasonPhaseKey): StrengthMethodKey[] {
  if (goalKey === "deload") return ["straight"];
  if (goalKey === "accum") return phase === "preseason" ? ["straight", "superset"] : ["straight", "cluster_intra"];
  if (goalKey === "transmute") return phase === "preseason" ? ["contrast", "complex"] : ["contrast"];
  return phase === "preseason" ? ["french_contrast", "complex"] : ["contrast", "pap_primer"]; // realize
}

function baseBlockScheme(goalKey: BlockGoalKey, phase: SeasonPhaseKey): BlockStrengthScheme {
  return { ...coreBlockScheme(goalKey, phase), methods: defaultMethods(goalKey, phase) };
}

function coreBlockScheme(goalKey: BlockGoalKey, phase: SeasonPhaseKey): Omit<BlockStrengthScheme, "methods"> {
  if (goalKey === "deload") {
    return {
      goalKey, quality: { en: "Deload", is: "Niðurtröppun" },
      pct1rm: { en: "keep intensity, cut volume ~40–50%", is: "haltu ákefð, skerðu magn ~40–50%" },
      scheme: { en: "1–2 crisp heavy singles/doubles, half the sets — unload, don't detrain.", is: "1–2 skörp þung stök/tvennt, helmingi færri sett — aflest, ekki afþjálfa." },
      cite: CITE_MESO,
    };
  }
  if (goalKey === "accum") {
    return phase === "preseason"
      ? {
        goalKey, quality: { en: "Hypertrophy + base", is: "Hypertrophy + grunnur" },
        pct1rm: { en: "65–80% 1RM", is: "65–80% 1RM" },
        scheme: { en: "3–4 × 8–12, moderate load, higher volume — build tissue + work capacity.", is: "3–4 × 8–12, hófleg þyngd, meira magn — byggðu vef + vinnugetu." },
        cite: CITE_MESO,
      }
      : {
        goalKey, quality: { en: "Max-strength base", is: "Hámarksstyrks-grunnur" },
        pct1rm: { en: "80–90% 1RM", is: "80–90% 1RM" },
        scheme: { en: "4–5 × 4–6, heavy — re-accumulate a strength base in the gap (a break / mini-block).", is: "4–5 × 4–6, þungt — endurhladdu styrk-grunn í svigrúmi (hlé / mini-blokk)." },
        cite: CITE_MESO,
      };
  }
  if (goalKey === "transmute") {
    return {
      goalKey, quality: { en: "Strength–power", is: "Styrkur–kraftur" },
      pct1rm: { en: "70–85% 1RM", is: "70–85% 1RM" },
      scheme: phase === "preseason"
        ? { en: "3–5 × 3–5, explosive concentric, ~10–20% velocity-loss cap — convert strength to football power.", is: "3–5 × 3–5, sprengikraftur, ~10–20% hraðatap-þak — umbreyttu styrk í fótbolta-kraft." }
        : { en: "in-season: microdosed — 1–2 explosive quality sets, ~10–20% velocity-loss cap; express strength-power at LOW volume, don't accumulate.", is: "á tímabili: microdosed — 1–2 sprengi-gæðasett, ~10–20% hraðatap-þak; tjáðu styrk-kraft í LÁGU magni, ekki safna." },
      cite: CITE_MESO,
    };
  }
  // realize
  return {
    goalKey, quality: { en: "Power / speed-strength", is: "Kraftur / hraði-styrkur" },
    pct1rm: { en: "30–60% 1RM (ballistic / WL derivatives)", is: "30–60% 1RM (kast / lyftinga-afleiður)" },
    scheme: phase === "preseason"
      ? { en: "low volume, high output — jumps/throws + clean/pull derivatives; taper into the opener (RFD + PAP).", is: "lágt magn, há afköst — stökk/köst + clean/pull afleiður; trappa niður í fyrsta leik (RFD + PAP)." }
      : { en: "in-season: already low volume — a jumps/throws + contrast primer for freshness + peak power, taper into the fixture (RFD + PAP).", is: "á tímabili: nú þegar lágt magn — stökk/köst + kontrast inngangur fyrir ferskleika + hámarkskraft, taper í leikinn (RFD + PAP)." },
    cite: CITE_MESO,
  };
}

/** Which pre-season block a player is in, by weeks to the opener (everyone runs the sequence). */
export function preseasonBlockForWeeksOut(weeksToOpener: number | null): PreseasonEmphasis | null {
  if (weeksToOpener == null || !Number.isFinite(weeksToOpener) || weeksToOpener < 0) return null;
  if (weeksToOpener > 8) return "hypertrophy";       // far out: build tissue base
  if (weeksToOpener >= 4) return "max_strength";      // mid: raise the ceiling
  return "power";                                     // near the opener: convert + taper
}

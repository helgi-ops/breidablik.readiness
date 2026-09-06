/**
 * Movement-test registry — the extensible backbone of the movement-screen
 * framework. A movement test is a DEFINITION (identity, capture spec, phase
 * model, measured variables, norms/thresholds, interpretation rules, references),
 * so a new test plugs in as data (a `movement_tests` row / a seed here), not a
 * pipeline rewrite. The shared pose pipeline (Stage 2) reads the definition to
 * know which landmarks/phases to extract; Stage 1 records findings assisted by
 * the coach.
 *
 * Screening / training tool — never a diagnosis, never the readiness colour.
 * Rules map a movement compensation → a training target; pain / red flags route
 * to a clinician. Reference books inform the rules; their text is never
 * reproduced — we cite the concept, preferring the primary literature.
 */

export type Bi = { en: string; is: string };

export type MovementCategory =
  | "mobility_screen"
  | "landing"
  | "jump"
  | "hop"
  | "balance"
  | "gait"
  | "strength_endurance";

export type CaptureView = "front" | "side" | "both";
export type Laterality = "bilateral" | "per_leg";
/** How trustworthy a variable is from a single phone video. */
export type Reliability = "robust" | "moderate" | "low_precision";
export type EvidenceGrade = "strong" | "moderate" | "emerging";
export type Severity = "ok" | "mild" | "moderate" | "marked";
/** Corrective/strength direction a finding steers toward. */
export type StrengthEmphasis =
  | "unilateral"
  | "eccentric"
  | "plyometric"
  | "hip_abductor_er"
  | "posterior_chain"
  | "mobility"
  | "trunk_control"
  | "none";

/** How the shared pose pipeline (Stage 2) extracts + grades this variable.
 *  Absent → the variable is coach-recorded only (no auto-measure). */
export type ExtractKind =
  | "frontal_knee_valgus"
  | "knee_flexion"
  | "trunk_lean"
  | "rsi"
  | "pelvic_drop"
  | "landing_sway"
  | "shoulder_obliquity";
export type ExtractSpec = {
  kind: ExtractKind;
  view: "front" | "side" | "back";
  phase?: "initial_contact" | "absorption" | "takeoff" | "landing";
  /** Computed value → severity band cut-points (auto-measure is an ESTIMATE the
   *  coach confirms). `direction` says whether a higher or lower value is worse. */
  bands: { moderate: number; marked: number; direction: "higher_worse" | "lower_worse" };
};

export type MeasuredVariable = {
  key: string;
  label: Bi;
  unit: string; // "deg" | "ms" | "cm" | "%" | "index" | "band"
  reliability: Reliability;
  note?: Bi;
  extract?: ExtractSpec;
  /** Which camera view this checkpoint reads from (for the checkpoint list;
   *  auto-measured variables default to their `extract.view`). */
  view?: "front" | "side" | "back";
};

export type Phase = { key: string; label: Bi };

export type ThresholdBand = { id: string; label: Bi; rule: string; severity: Severity };
export type Threshold = { variableKey: string; bands: ThresholdBand[]; citation: string };

/**
 * A finding → likely cause → corrective/strength lever, the same shape across
 * every test. `match` is a human-readable condition (Stage 1 the coach selects
 * the band; Stage 2 the pose pipeline sets it); `flag` routes RTP / asymmetry.
 */
export type InterpretationRule = {
  id: string;
  /** variableKey + minimum severity that fires this rule, e.g. "knee_valgus_contact>=moderate". */
  match: { variableKey: string; minSeverity: Severity };
  finding: Bi;
  cause: Bi;
  lever: Bi;
  strengthEmphasis: StrengthEmphasis;
  flag: "rtp" | "asymmetry" | null;
  citation: string;
  evidenceGrade: EvidenceGrade;
};

export type MovementTest = {
  slug: string;
  name: Bi;
  category: MovementCategory;
  description: Bi;
  laterality: Laterality;
  capture: { views: CaptureView; needsReps: boolean; needsLegs: boolean; standardisation: Bi };
  phases: Phase[];
  variables: MeasuredVariable[];
  thresholds: Threshold[];
  rules: InterpretationRule[];
  references: Array<{ label: string; source?: string }>;
  evidenceGrade: EvidenceGrade;
  /** Test-specific honest caveats (what the screen does and does NOT establish),
   *  appended to the report's generic caveats. Keeps the evidence grade honest —
   *  e.g. reliable as a movement screen, weak as injury prediction. */
  caveats?: Bi[];
};

const SEVERITY_RANK: Record<Severity, number> = { ok: 0, mild: 1, moderate: 2, marked: 3 };
export const severityAtLeast = (a: Severity, min: Severity): boolean => SEVERITY_RANK[a] >= SEVERITY_RANK[min];

// ─────────────────────────────────────────────────────────────────────────────
// Seed test definitions (v1). The framework supports more — each is just data.
// ─────────────────────────────────────────────────────────────────────────────

/** Single-leg drop jump — the worked example. Landing mechanics + reactive
 *  strength + limb symmetry; hands overhead removes arm-swing and adds a
 *  trunk-control challenge, isolating the lower limb. */
const SINGLE_LEG_DROP_JUMP: MovementTest = {
  slug: "single_leg_drop_jump",
  name: { en: "Single-leg drop jump (hands overhead)", is: "Einfætt fallstökk (hendur yfir höfði)" },
  category: "landing",
  description: {
    en: "Drop from a box, land and re-jump on one leg with hands overhead. Screens landing quality (dynamic knee valgus), single-leg reactive strength (RSI) and left/right asymmetry.",
    is: "Fall af kassa, lending og endurstökk á öðrum fæti með hendur yfir höfði. Skimar lendingargæði (kraga-hné/valgus), einfætta viðbragðsstyrk (RSI) og hægri/vinstri ósamhverfu.",
  },
  laterality: "per_leg",
  capture: {
    views: "both",
    needsReps: true,
    needsLegs: true,
    standardisation: {
      en: "Front view reads the frontal plane — knee valgus (contact + peak), contralateral pelvic drop, lateral trunk lean and landing sway. Side view reads the sagittal plane — knee-flexion depth, trunk hinge and reactive strength (RSI). Fixed camera height/distance, same drop height, tight clothing. Capture both legs for the symmetry index.",
      is: "Framsýn les framplanið — kraga-hné (snerting + hámark), gagnlæga mjaðmagrindar-fall, hliðar-búkhalla og lendingar-vagg. Hliðarsýn les sagittal-planið — hnébeygju-dýpt, búk-hinge og viðbragðsstyrk (RSI). Föst myndavélarhæð/fjarlægð, sama fallhæð, þröngur klæðnaður. Taktu báða fætur upp fyrir samhverfuvísitöluna.",
    },
  },
  phases: [
    { key: "drop", label: { en: "Drop", is: "Fall" } },
    { key: "initial_contact", label: { en: "Initial contact", is: "Fyrsta snerting" } },
    { key: "absorption", label: { en: "Absorption (peak flexion)", is: "Deyfing (hámarks beygja)" } },
    { key: "propulsion", label: { en: "Propulsion", is: "Frákast" } },
    { key: "landing", label: { en: "Re-landing", is: "Endurlending" } },
  ],
  variables: [
    // ── Frontal plane (front view): medial/lateral control + injury risk ──
    { key: "knee_valgus_contact", label: { en: "Dynamic knee valgus at contact (FPPA)", is: "Kraga-hné við snertingu (FPPA)" }, unit: "deg/band", reliability: "robust", note: { en: "Frontal-plane projection angle at initial contact — the knee falls medial to the foot. Reliable from a front-view phone video.", is: "Framplans-vörpunarhorn við fyrstu snertingu — hnéð fellur miðlægt við fótinn. Áreiðanlegt úr framsýnu símamyndbandi." }, extract: { kind: "frontal_knee_valgus", view: "front", phase: "initial_contact", bands: { moderate: 0.06, marked: 0.12, direction: "higher_worse" } } },
    { key: "knee_valgus_absorption", label: { en: "Dynamic knee valgus at peak absorption", is: "Kraga-hné við hámarks deyfingu" }, unit: "deg/band", reliability: "robust", note: { en: "Medial collapse held into the deepest, highest-load moment of the landing — the peak-load window for the ACL (front view).", is: "Miðlægt hrun sem helst inn í dýpsta, mesta-álags augnablik lendingar — hámarksálag á ACL (framsýn)." }, extract: { kind: "frontal_knee_valgus", view: "front", phase: "absorption", bands: { moderate: 0.06, marked: 0.12, direction: "higher_worse" } } },
    { key: "pelvic_drop", label: { en: "Contralateral pelvic drop (Trendelenburg)", is: "Gagnlæg mjaðmagrindar-fall (Trendelenburg)" }, unit: "deg/band", reliability: "robust", note: { en: "Pelvis tilts down on the free-leg side → gluteus-medius / hip-abductor control of the stance leg (front view).", is: "Mjaðmagrind hallar niður á lausa-fótar hlið → glute medius / mjaðma-fráfærslu stjórn standfótar (framsýn)." }, extract: { kind: "pelvic_drop", view: "front", phase: "absorption", bands: { moderate: 5, marked: 10, direction: "higher_worse" } } },
    { key: "trunk_lean_frontal", label: { en: "Lateral trunk lean over stance leg", is: "Hliðar-búkhalli yfir standfót" }, unit: "deg/band", reliability: "moderate", note: { en: "Front-view trunk lean toward the stance leg. Hands overhead remove arm-swing, so this reads core / trunk control.", is: "Framsýnn búkhalli að standfæti. Hendur yfir höfði fjarlægja handsveiflu, svo þetta les core / búk-stjórn." }, extract: { kind: "trunk_lean", view: "front", phase: "absorption", bands: { moderate: 8, marked: 15, direction: "higher_worse" } } },
    { key: "landing_sway", label: { en: "Landing stability (medio-lateral sway)", is: "Lendingar-stöðugleiki (hliðar-vagg)" }, unit: "band", reliability: "moderate", note: { en: "Side-to-side wobble of the centre of mass after landing, as a fraction of shoulder width — did he stick it? (front view).", is: "Hliðar-vagg þyngdarpunkts eftir lendingu, sem hlutfall af axlabreidd — festi hann lendinguna? (framsýn)." }, extract: { kind: "landing_sway", view: "front", bands: { moderate: 0.15, marked: 0.3, direction: "higher_worse" } } },
    // ── Sagittal plane (side view): absorption + reactive strength ──
    { key: "knee_flexion_absorption", label: { en: "Knee-flexion absorption depth", is: "Hnébeygju-deyfingardýpt" }, unit: "deg/band", reliability: "moderate", note: { en: "Needs a side view.", is: "Þarf hliðarsýn." }, extract: { kind: "knee_flexion", view: "side", phase: "absorption", bands: { moderate: 70, marked: 55, direction: "lower_worse" } } },
    { key: "trunk_lean", label: { en: "Trunk lean at landing (sagittal)", is: "Búkhalli við lendingu (sagittal)" }, unit: "deg/band", reliability: "moderate", note: { en: "Forward trunk hinge — needs a side view.", is: "Fram-búk-hinge — þarf hliðarsýn." }, extract: { kind: "trunk_lean", view: "side", phase: "initial_contact", bands: { moderate: 15, marked: 25, direction: "higher_worse" } } },
    { key: "rsi", label: { en: "Reactive strength index (per leg)", is: "Viðbragðsstyrks-vísitala (per fót)" }, unit: "index", reliability: "low_precision", note: { en: "flight/contact time — marginal at 30 fps (~33 ms). Treat as a rough field estimate; prefer a force plate.", is: "flug/snertitími — ónákvæmt við 30 fps (~33 ms). Meðhöndla sem grófa vettvangsáætlun; kjóstu kraftplötu." }, extract: { kind: "rsi", view: "side", bands: { moderate: 0.5, marked: 0.3, direction: "lower_worse" } } },
    // ── Asymmetry (needs both legs) ──
    { key: "lsi", label: { en: "Limb symmetry index (L vs R)", is: "Útlima-samhverfuvísitala (V vs H)" }, unit: "%", reliability: "robust", note: { en: "Needs both legs — record from two per-leg captures.", is: "Þarf báða fætur — skráð úr tveimur einfættum upptökum." } },
  ],
  thresholds: [
    {
      variableKey: "knee_valgus_contact",
      bands: [
        { id: "ok", label: { en: "Neutral / minimal", is: "Hlutlaust / lítið" }, rule: "FPPA within normal, knee tracks over foot", severity: "ok" },
        { id: "moderate", label: { en: "Moderate medial collapse", is: "Miðlægt hrun í meðallagi" }, rule: "visible medial knee travel at contact", severity: "moderate" },
        { id: "marked", label: { en: "Marked valgus collapse", is: "Áberandi valgus-hrun" }, rule: "knee well medial to foot at contact/peak", severity: "marked" },
      ],
      citation: "Hewett 2005 (knee abduction predicts ACL injury); Padua 2009 (Landing Error Scoring System)",
    },
    {
      variableKey: "knee_valgus_absorption",
      bands: [
        { id: "ok", label: { en: "Knee holds over foot through depth", is: "Hné helst yfir fæti gegnum dýpt" }, rule: "no medial travel at peak flexion", severity: "ok" },
        { id: "moderate", label: { en: "Collapses under peak load", is: "Hrynur undir hámarksálagi" }, rule: "visible medial travel at peak absorption", severity: "moderate" },
        { id: "marked", label: { en: "Marked collapse at peak load", is: "Áberandi hrun við hámarksálag" }, rule: "knee well medial at peak absorption", severity: "marked" },
      ],
      citation: "Hewett 2005; Ford 2003 (valgus motion through landing)",
    },
    {
      variableKey: "pelvic_drop",
      bands: [
        { id: "ok", label: { en: "Level pelvis (<5°)", is: "Bein mjaðmagrind (<5°)" }, rule: "obliquity < 5°", severity: "ok" },
        { id: "moderate", label: { en: "5–10° drop", is: "5–10° fall" }, rule: "5° <= obliquity < 10°", severity: "moderate" },
        { id: "marked", label: { en: ">10° drop", is: ">10° fall" }, rule: "obliquity >= 10°", severity: "marked" },
      ],
      citation: "Bramah 2018 (contralateral pelvic drop); Powers 2010 (proximal control of the knee)",
    },
    {
      variableKey: "trunk_lean_frontal",
      bands: [
        { id: "ok", label: { en: "Trunk stacked (<8°)", is: "Búkur stöflaður (<8°)" }, rule: "lateral lean < 8°", severity: "ok" },
        { id: "moderate", label: { en: "8–15° lateral lean", is: "8–15° hliðarhalli" }, rule: "8° <= lean < 15°", severity: "moderate" },
        { id: "marked", label: { en: ">15° lateral lean", is: ">15° hliðarhalli" }, rule: "lean >= 15°", severity: "marked" },
      ],
      citation: "Powers 2010; Hewett 2010 (trunk control & knee-injury risk)",
    },
    {
      variableKey: "landing_sway",
      bands: [
        { id: "ok", label: { en: "Stuck landing (<0.15 SW)", is: "Föst lending (<0.15 AB)" }, rule: "ML sway < 0.15 shoulder-widths", severity: "ok" },
        { id: "moderate", label: { en: "0.15–0.30 SW wobble", is: "0.15–0.30 AB vagg" }, rule: "0.15 <= sway < 0.30", severity: "moderate" },
        { id: "marked", label: { en: ">0.30 SW / correction hop", is: ">0.30 AB / leiðréttingar-hopp" }, rule: "sway >= 0.30 shoulder-widths", severity: "marked" },
      ],
      citation: "Padua 2009 (LESS — landing stability); Ross 2005 (time to stabilization)",
    },
    {
      variableKey: "lsi",
      bands: [
        { id: "ok", label: { en: "Symmetric (<10% deficit)", is: "Samhverft (<10% halli)" }, rule: "|L-R| < 10%", severity: "ok" },
        { id: "moderate", label: { en: "10–15% deficit", is: "10–15% halli" }, rule: "10% <= |L-R| <= 15%", severity: "moderate" },
        { id: "marked", label: { en: ">15% deficit", is: ">15% halli" }, rule: "|L-R| > 15%", severity: "marked" },
      ],
      citation: "Barber-Westin & Noyes 2011; Grindem 2016 (RTP symmetry criteria)",
    },
  ],
  rules: [
    {
      id: "sldj_valgus",
      match: { variableKey: "knee_valgus_contact", minSeverity: "moderate" },
      finding: { en: "Dynamic knee valgus on single-leg landing", is: "Kraga-hné við einfætta lendingu" },
      cause: { en: "Hip abductor / external-rotator control + landing mechanics; often limited ankle dorsiflexion", is: "Stjórn mjaðma-fráfærslu / útsnúnings + lendingartækni; oft skert ökkla-uppbeygja" },
      lever: { en: "Single-leg banded hip abductor/ER strength + landing/deceleration mechanics + ankle dorsiflexion mobility", is: "Einfættur teygju-styrkur mjaðma-fráfærslu/útsnúnings + lendingar/hemlunartækni + ökkla-uppbeygju hreyfanleiki" },
      strengthEmphasis: "hip_abductor_er",
      flag: null,
      citation: "Hewett 2005; Rabin 2014 (dorsiflexion–valgus)",
      evidenceGrade: "strong",
    },
    {
      id: "sldj_valgus_absorption",
      match: { variableKey: "knee_valgus_absorption", minSeverity: "moderate" },
      finding: { en: "Knee valgus persists into peak absorption (highest-load moment)", is: "Kraga-hné helst inn í hámarks deyfingu (mesta-álags augnablik)" },
      cause: { en: "Eccentric hip/knee control fails through range — the knee caves at the deepest, highest-load point of the landing", is: "Eccentric mjaðma/hné stjórn brestur gegnum hreyfiferil — hnéð gefur eftir á dýpsta, mesta-álags punkti lendingar" },
      lever: { en: "Eccentric single-leg strength through full depth (tempo split squats, slow eccentric step-downs) + hip abductor/ER control", is: "Eccentric einfættur styrkur gegnum fulla dýpt (tempo klofbeygjur, hægar eccentric step-downs) + mjaðma-fráfærslu/útsnúnings stjórn" },
      strengthEmphasis: "eccentric",
      flag: null,
      citation: "Hewett 2005; Ford 2003",
      evidenceGrade: "strong",
    },
    {
      id: "sldj_pelvic_drop",
      match: { variableKey: "pelvic_drop", minSeverity: "moderate" },
      finding: { en: "Contralateral pelvic drop (Trendelenburg sign)", is: "Gagnlæg mjaðmagrindar-fall (Trendelenburg)" },
      cause: { en: "Gluteus-medius / hip-abductor weakness on the stance leg lets the pelvis drop on the free side — this drives the knee inward from above", is: "Glute medius / mjaðma-fráfærslu veikleiki í standfæti lætur mjaðmagrind falla á lausu hlið — það ýtir hnénu inn að ofan" },
      lever: { en: "Stance-leg hip-abductor strength (side plank with abduction, banded lateral walks, single-leg RDL for frontal-plane control)", is: "Mjaðma-fráfærslu styrkur standfótar (hliðarplanki með fráfærslu, teygju hliðargöngur, einfætt RDL fyrir framplans-stjórn)" },
      strengthEmphasis: "hip_abductor_er",
      flag: null,
      citation: "Bramah 2018; Powers 2010",
      evidenceGrade: "moderate",
    },
    {
      id: "sldj_trunk_lean_frontal",
      match: { variableKey: "trunk_lean_frontal", minSeverity: "moderate" },
      finding: { en: "Lateral trunk lean over the stance leg", is: "Hliðar-búkhalli yfir standfót" },
      cause: { en: "Trunk/core control shifts the centre of mass over the stance leg to unload the hip abductors — a compensation that raises knee-abduction load", is: "Búk/core stjórn færir þyngdarpunkt yfir standfót til að létta á mjaðma-fráfærum — uppbót sem eykur hné-fráfærslu álag" },
      lever: { en: "Frontal-plane trunk control (offset/suitcase carries, side planks, Pallof press) alongside hip-abductor strength", is: "Framplans-búkstjórn (offset/ferðatösku-burður, hliðarplankar, Pallof press) ásamt mjaðma-fráfærslu styrk" },
      strengthEmphasis: "trunk_control",
      flag: null,
      citation: "Powers 2010; Hewett 2010",
      evidenceGrade: "moderate",
    },
    {
      id: "sldj_landing_instability",
      match: { variableKey: "landing_sway", minSeverity: "moderate" },
      finding: { en: "Poor landing stability (medio-lateral sway / no stuck landing)", is: "Léleg lendingar-stöðugleiki (hliðar-vagg / lending ekki fest)" },
      cause: { en: "Reduced single-leg neuromuscular control / postural stability on landing — a correction hop or side wobble instead of a stuck landing", is: "Skert einfætt taugavöðva-stjórn / stöðu-stöðugleiki við lendingu — leiðréttingar-hopp eða hliðar-vagg í stað fastrar lendingar" },
      lever: { en: "Single-leg balance + landing-stabilisation progression (stick-and-hold landings, then perturbation / eyes-closed balance)", is: "Einfætt jafnvægi + lendingar-stöðgun stigmögnun (festu-og-haltu lendingar, svo truflun / lokuð augu jafnvægi)" },
      strengthEmphasis: "unilateral",
      flag: null,
      citation: "Padua 2009; Ross 2005",
      evidenceGrade: "moderate",
    },
    {
      id: "sldj_stiff_landing",
      match: { variableKey: "knee_flexion_absorption", minSeverity: "moderate" },
      finding: { en: "Stiff / low-flexion landing (poor absorption)", is: "Stíf / grunn lending (léleg deyfing)" },
      cause: { en: "Reduced eccentric / energy-absorption capacity through the landing leg", is: "Skert eccentric / orkudeyfingargeta í lendingarfæti" },
      lever: { en: "Eccentric + landing-absorption work (tempo split squats, drop-landings with soft catch)", is: "Eccentric + lendingar-deyfingarvinna (tempo klofbeygjur, fall-lendingar með mjúku gripi)" },
      strengthEmphasis: "eccentric",
      flag: null,
      citation: "Padua 2009 (LESS)",
      evidenceGrade: "moderate",
    },
    {
      id: "sldj_low_rsi",
      match: { variableKey: "rsi", minSeverity: "moderate" },
      finding: { en: "Low / asymmetric reactive strength (RSI)", is: "Lág / ósamhverf viðbragðsstyrkur (RSI)" },
      cause: { en: "Reduced stretch-shortening-cycle quality, biased to the weaker leg", is: "Skert gæði teygju-styttingar hringrásar, hallar á veikari fót" },
      lever: { en: "Reactive-strength / plyometric progression biased to the weaker leg (pogos → single-leg hops → drop jumps)", is: "Viðbragðsstyrks / plyometric stigmögnun með áherslu á veikari fót (pogos → einfætt hopp → fallstökk)" },
      strengthEmphasis: "plyometric",
      flag: null,
      citation: "Flanagan & Comyns 2008 (RSI interpretation)",
      evidenceGrade: "moderate",
    },
    {
      id: "sldj_asymmetry",
      match: { variableKey: "lsi", minSeverity: "moderate" },
      finding: { en: "Large left/right asymmetry (limb symmetry index deficit)", is: "Mikil hægri/vinstri ósamhverfa (útlima-samhverfuhalli)" },
      cause: { en: "Unilateral capacity deficit on the weaker side", is: "Einhliða getuhalli á veikari hlið" },
      lever: { en: "Unilateral loading biased to the weaker side; re-screen before clearing to full multidirectional load", is: "Einhliða álag með áherslu á veikari hlið; endurskima áður en fullt fjölátta álag er heimilað" },
      strengthEmphasis: "unilateral",
      flag: "rtp",
      citation: "Grindem 2016; Barber-Westin & Noyes 2011",
      evidenceGrade: "strong",
    },
  ],
  references: [
    { label: "Hewett et al. 2005 — Biomechanical measures of neuromuscular control and valgus loading predict ACL injury risk", source: "Am J Sports Med" },
    { label: "Ford et al. 2003 — Valgus knee motion during landing in high-school female and male athletes", source: "Med Sci Sports Exerc" },
    { label: "Padua et al. 2009 — The Landing Error Scoring System (LESS)", source: "Am J Sports Med" },
    { label: "Powers 2010 — The influence of abnormal hip mechanics on knee injury: a biomechanical perspective", source: "J Orthop Sports Phys Ther" },
    { label: "Bramah et al. 2018 — Is there a pathological gait associated with common running injuries? (contralateral pelvic drop)", source: "Am J Sports Med" },
    { label: "Hewett et al. 2010 — Understanding and preventing ACL injuries: trunk & hip control", source: "Am J Sports Med" },
    { label: "Ross & Guskiewicz 2005 — Time to stabilization: dynamic postural stability after landing", source: "Clin J Sport Med" },
    { label: "Flanagan & Comyns 2008 — The use of contact time and the reactive strength index", source: "Strength Cond J" },
    { label: "Grindem et al. 2016 — Simple decision rules reduce reinjury risk after ACL reconstruction", source: "Br J Sports Med" },
  ],
  evidenceGrade: "strong",
  caveats: [
    { en: "Evidence grade: STRONG as an observational screen + corrective target — dynamic knee valgus is a well-established, ACL-injury-associated landing mechanism (Hewett 2005) and is trainable (re-screen to confirm it closed); NOT an individual injury-prediction score — do not read it as an injury-risk %.", is: "Sönnunarstig: STERKT sem sjónmæld skimun + leiðréttingar-markmið — dynamic knee valgus er vel þekkt lendingar-vélræn tengt ACL-meiðslum (Hewett 2005) og þjálfanlegt (endurskima til að staðfesta að það hafi lokast); EKKI stak meiðsla-spáskor — lestu það ekki sem meiðsla-áhættu %." },
    { en: "Reactive strength index (RSI) from 30 fps phone video is low precision (~33 ms) — treat it as a rough field estimate; prefer a force plate for a decision.", is: "Viðbragðsstyrks-vísitala (RSI) úr 30 fps síma-myndbandi er ónákvæm (~33 ms) — meðhöndlaðu sem grófa vettvangs-áætlun; kjóstu kraftplötu fyrir ákvörðun." },
    { en: "True left/right limb symmetry needs two per-leg captures (only one leg lands per clip) — screen both legs before reading the symmetry index.", is: "Raunveruleg hægri/vinstri útlima-samhverfa þarf tvær einfættar upptökur (bara annar fótur lendir í hverju myndbandi) — skimaðu báða fætur áður en samhverfuvísitalan er lesin." },
  ],
};

/** Overhead squat assessment — a mobility/movement screen (NASM-CES style). */
const OVERHEAD_SQUAT_ASSESSMENT: MovementTest = {
  slug: "overhead_squat_assessment",
  name: { en: "Overhead squat assessment", is: "Yfirhöfuð-hnébeygju mat" },
  category: "mobility_screen",
  description: {
    en: "Bilateral squat with arms overhead — the single most informative movement-quality screen (Clifton 2015). A full movement-chain read (feet/ankles → knees → pelvis/low-back → shoulders/arms → head) from three views. Each checkpoint points to an overactive muscle to release/stretch and an underactive one to strengthen; medial knee displacement (dynamic valgus) is the best-evidenced single output. Movement-quality + corrective screen — NOT an injury-prediction score.",
    is: "Tvíhliða hnébeygja með hendur yfir höfði — mest upplýsandi hreyfigæða-skimunin (Clifton 2015). Heildar hreyfikeðju-lestur (fætur/ökklar → hné → mjaðmagrind/mjóbak → axlir/armar → höfuð) úr þremur sýnum. Hver checkpoint bendir á of-virkan vöðva til að losa/teygja og van-virkan til að styrkja; miðlæg hné-hliðrun (dynamic valgus) er best studda stak-mælingin. Hreyfigæða- + leiðréttingar-skimun — EKKI meiðsla-spáskor.",
  },
  laterality: "bilateral",
  capture: {
    views: "both",
    needsReps: true,
    needsLegs: false,
    standardisation: {
      en: "Three views — front (knee valgus, foot position, L/R symmetry), side (trunk lean, pelvic tilt, arms-fall-forward, dorsiflexion, depth), back (heel rise, calcaneal eversion, lateral shift, pelvic & scapular symmetry). Feet shoulder-width, arms fully overhead, ~5 reps, fixed camera height/distance.",
      is: "Þrjár sýnir — framan (hné-valgus, fótstaða, H/V samhverfa), hlið (búkhalli, mjaðmagrindar-tilt, armar-fram, dorsiflexion, dýpt), aftan (hæl-lyfta, calcaneal eversion, hliðar-shift, mjaðmagrindar- & herðablaða-samhverfa). Fætur á axlabreidd, armar að fullu yfir höfði, ~5 endurtekningar, föst myndavélarhæð/fjarlægð.",
    },
  },
  phases: [
    { key: "descent", label: { en: "Descent", is: "Niðurferð" } },
    { key: "absorption", label: { en: "Bottom", is: "Botn" } },
    { key: "ascent", label: { en: "Ascent", is: "Uppferð" } },
  ],
  variables: [
    // ── Front (anterior): feet + knees ──
    { key: "feet_turn_out", label: { en: "Feet turn out", is: "Fætur snúast út" }, unit: "band", reliability: "moderate", view: "front", note: { en: "Coach-scored from the front view.", is: "Þjálfari skorar úr framsýn." } },
    { key: "feet_pronation", label: { en: "Feet flatten / pronate (arch collapse)", is: "Fætur fletjast / pronera (ilrist fellur)" }, unit: "band", reliability: "moderate", view: "front", note: { en: "Coach-scored — arch collapse isn't reliable from phone pose.", is: "Þjálfari skorar — ilrist-fall er ekki áreiðanlegt úr síma-pose." } },
    { key: "knee_valgus", label: { en: "Medial knee displacement / dynamic valgus", is: "Miðlæg hné-hliðrun / dynamic valgus" }, unit: "deg/band", reliability: "robust", view: "front", note: { en: "The headline read — frontal-plane knee angle, both knees. Observational/phone-video MKD is a validated screen output (Post 2017; Krause 2015).", is: "Aðal-lesturinn — framplans hné-horn, báðir hné. Sjónmælt/síma-myndbands MKD er staðfest skimunar-úttak (Post 2017; Krause 2015)." }, extract: { kind: "frontal_knee_valgus", view: "front", phase: "absorption", bands: { moderate: 0.06, marked: 0.12, direction: "higher_worse" } } },
    { key: "knee_asymmetry", label: { en: "Left/right knee or foot asymmetry", is: "Hægri/vinstri hné- eða fótstöðu ósamhverfa" }, unit: "band", reliability: "moderate", view: "front", note: { en: "Coach-scored L vs R.", is: "Þjálfari skorar V vs H." } },
    // ── Side (lateral): trunk / pelvis / arms / ankle ──
    { key: "forward_lean", label: { en: "Excessive forward trunk lean", is: "Óhóflegur framhalli búks" }, unit: "deg/band", reliability: "moderate", view: "side", extract: { kind: "trunk_lean", view: "side", phase: "absorption", bands: { moderate: 50, marked: 65, direction: "higher_worse" } } },
    { key: "anterior_pelvic_tilt", label: { en: "Low-back arches / anterior pelvic tilt", is: "Mjóbak sveigist / anterior pelvic tilt" }, unit: "band", reliability: "moderate", view: "side", note: { en: "Coach-scored from the side view.", is: "Þjálfari skorar úr hliðarsýn." } },
    { key: "posterior_pelvic_tilt", label: { en: "Low-back rounds / posterior tilt (butt wink)", is: "Mjóbak rúllast / posterior tilt (butt wink)" }, unit: "band", reliability: "moderate", view: "side", note: { en: "Coach-scored — often an ankle dorsiflexion limit too.", is: "Þjálfari skorar — oft líka ökkla dorsiflexion takmörkun." } },
    { key: "arms_fall_forward", label: { en: "Arms fall forward", is: "Armar falla fram" }, unit: "band", reliability: "moderate", view: "side", note: { en: "Coach-scored — arms/wrists aren't in the pose model.", is: "Þjálfari skorar — armar/úlnliðir eru ekki í pose-líkaninu." } },
    { key: "squat_depth", label: { en: "Squat depth / dorsiflexion", is: "Hnébeygju-dýpt / dorsiflexion" }, unit: "deg/band", reliability: "moderate", view: "side", note: { en: "Knee-flexion depth at the bottom (side view).", is: "Hnébeygju-dýpt í botni (hliðarsýn)." }, extract: { kind: "knee_flexion", view: "side", phase: "absorption", bands: { moderate: 80, marked: 60, direction: "lower_worse" } } },
    // ── Back (posterior): ankle / pelvis / scapula ──
    { key: "heel_rise", label: { en: "Heels rise off the floor", is: "Hælar lyftast af gólfi" }, unit: "band", reliability: "moderate", view: "back", note: { en: "Coach-scored — needs a floor reference.", is: "Þjálfari skorar — þarf gólf-viðmið." } },
    { key: "calcaneal_eversion", label: { en: "Heels roll in (calcaneal eversion)", is: "Hælar velta inn (calcaneal eversion)" }, unit: "band", reliability: "moderate", view: "back", note: { en: "Coach-scored from the back view.", is: "Þjálfari skorar úr aftansýn." } },
    { key: "lateral_shift", label: { en: "Weight shifts to one side", is: "Þyngd færist á annan fót" }, unit: "band", reliability: "moderate", view: "back", note: { en: "Coach-scored asymmetric shift.", is: "Þjálfari skorar ósamhverfa hliðrun." } },
    { key: "pelvic_obliquity", label: { en: "Pelvis hikes / drops (frontal)", is: "Mjaðmagrind hækkar / fellur (frontal)" }, unit: "deg/band", reliability: "robust", view: "back", note: { en: "Pelvic obliquity — glute-med frontal control (back view).", is: "Mjaðmagrindar-halli — glute med frontal-stjórn (aftansýn)." }, extract: { kind: "pelvic_drop", view: "back", phase: "absorption", bands: { moderate: 5, marked: 10, direction: "higher_worse" } } },
    { key: "scapular_asymmetry", label: { en: "Shoulder / scapular asymmetry", is: "Axlar- / herðablaða-ósamhverfa" }, unit: "deg/band", reliability: "moderate", view: "back", note: { en: "Shoulder-line tilt (back view) — elevation / asymmetry proxy.", is: "Axlalínu-halli (aftansýn) — lyftu / ósamhverfu vísir." }, extract: { kind: "shoulder_obliquity", view: "back", phase: "absorption", bands: { moderate: 4, marked: 8, direction: "higher_worse" } } },
  ],
  thresholds: [
    { variableKey: "knee_valgus", citation: "Post 2017 (observational MKD reliability); Krause 2015 (phone-video angle validity); Bell/Padua/Clark 2008–2012", bands: [
      { id: "ok", label: { en: "Knees track over feet", is: "Hné fylgja fótum" }, rule: "no medial collapse", severity: "ok" },
      { id: "moderate", label: { en: "Knees drift inward", is: "Hné reka inn" }, rule: "visible medial drift", severity: "moderate" },
      { id: "marked", label: { en: "Marked valgus", is: "Áberandi valgus" }, rule: "knees well medial to feet", severity: "marked" } ] },
    { variableKey: "forward_lean", citation: "NASM-CES (Clark)", bands: [
      { id: "ok", label: { en: "Torso ≈ shin angle", is: "Búkur ≈ sköflungshorn" }, rule: "lean tracks shin", severity: "ok" },
      { id: "moderate", label: { en: "Excessive forward lean", is: "Óhóflegur framhalli" }, rule: "torso forward of shin", severity: "moderate" },
      { id: "marked", label: { en: "Chest falls forward", is: "Bringa fellur fram" }, rule: "marked forward lean", severity: "marked" } ] },
    { variableKey: "squat_depth", citation: "NASM-CES (Clark); ankle dorsiflexion", bands: [
      { id: "ok", label: { en: "At / below parallel", is: "Að / undir samsíða" }, rule: "hip below knee", severity: "ok" },
      { id: "moderate", label: { en: "Above parallel (shallow)", is: "Yfir samsíða (grunn)" }, rule: "limited depth", severity: "moderate" },
      { id: "marked", label: { en: "Very shallow", is: "Mjög grunn" }, rule: "markedly limited depth", severity: "marked" } ] },
    { variableKey: "pelvic_obliquity", citation: "Bramah 2018; Powers 2010", bands: [
      { id: "ok", label: { en: "Level pelvis (<5°)", is: "Bein mjaðmagrind (<5°)" }, rule: "obliquity < 5°", severity: "ok" },
      { id: "moderate", label: { en: "5–10° hike/drop", is: "5–10° hækkun/fall" }, rule: "5–10°", severity: "moderate" },
      { id: "marked", label: { en: ">10° hike/drop", is: ">10° hækkun/fall" }, rule: ">= 10°", severity: "marked" } ] },
    { variableKey: "scapular_asymmetry", citation: "NASM-CES (Clark)", bands: [
      { id: "ok", label: { en: "Shoulders level (<4°)", is: "Axlir jafnar (<4°)" }, rule: "tilt < 4°", severity: "ok" },
      { id: "moderate", label: { en: "4–8° tilt", is: "4–8° halli" }, rule: "4–8°", severity: "moderate" },
      { id: "marked", label: { en: ">8° tilt", is: ">8° halli" }, rule: ">= 8°", severity: "marked" } ] },
  ],
  rules: [
    { id: "ohsa_valgus", match: { variableKey: "knee_valgus", minSeverity: "moderate" },
      finding: { en: "Medial knee displacement / dynamic valgus", is: "Miðlæg hné-hliðrun / dynamic valgus" },
      cause: { en: "Weak/underactive hip abductors + external rotators (glute med/max) and/or restricted ankle dorsiflexion; overactive adductors / TFL / lateral gastroc (Bell 2008; Padua 2012; Macrum 2012)", is: "Veikir/van-virkir mjaðma-fráfærar + útsnúningar (glute med/max) og/eða skert ökkla-dorsiflexion; of-virkir adductors / TFL / lateral gastroc (Bell 2008; Padua 2012; Macrum 2012)" },
      lever: { en: "Release adductors/TFL; strengthen hip abd/ER (glute med/max); restore ankle dorsiflexion — the compensation is trainable, so re-screen to confirm the valgus has closed (Bell 2013)", is: "Losa adductors/TFL; styrkja mjaðma-fráfærslu/ER (glute med/max); endurheimta ökkla-dorsiflexion — uppbótin er þjálfanleg, svo endurskima til að staðfesta að valgus hafi lokast (Bell 2013)" },
      strengthEmphasis: "hip_abductor_er", flag: null, citation: "Bell 2008/2012; Padua 2012; Macrum 2012 (ankle DF); Bell 2013 (trainable)", evidenceGrade: "strong" },
    { id: "ohsa_feet_turn_out", match: { variableKey: "feet_turn_out", minSeverity: "moderate" },
      finding: { en: "Feet turn out", is: "Fætur snúast út" },
      cause: { en: "Overactive gastroc/soleus / biceps femoris; underactive medial gastroc / gracilis / popliteus", is: "Of-virkir gastroc/soleus / biceps femoris; van-virkir medial gastroc / gracilis / popliteus" },
      lever: { en: "Release calf/lateral hamstring; ankle dorsiflexion mobility; strengthen medial calf / deep hip rotators", is: "Losa kálfa/lateral hamstring; ökkla dorsiflexion; styrkja medial kálfa / djúpa mjaðma-snúninga" },
      strengthEmphasis: "mobility", flag: null, citation: "NASM-CES (Clark)", evidenceGrade: "moderate" },
    { id: "ohsa_feet_pronation", match: { variableKey: "feet_pronation", minSeverity: "moderate" },
      finding: { en: "Feet flatten / pronate", is: "Fætur fletjast / pronera" },
      cause: { en: "Overactive peroneals / lateral gastroc; underactive tibialis anterior / posterior", is: "Of-virkir peroneals / lateral gastroc; van-virkir tibialis anterior / posterior" },
      lever: { en: "Release peroneals/calf; strengthen tibialis anterior/posterior + foot intrinsics", is: "Losa peroneals/kálfa; styrkja tibialis anterior/posterior + innri fótvöðva" },
      strengthEmphasis: "mobility", flag: null, citation: "NASM-CES (Clark)", evidenceGrade: "moderate" },
    { id: "ohsa_knee_asymmetry", match: { variableKey: "knee_asymmetry", minSeverity: "moderate" },
      finding: { en: "Left/right asymmetry in knee / foot position", is: "Hægri/vinstri ósamhverfa í hné- / fótstöðu" },
      cause: { en: "Unilateral mobility or strength difference between sides", is: "Einhliða hreyfanleika- eða styrk-munur milli hliða" },
      lever: { en: "Bias correctives to the worse side; unilateral loading; re-screen", is: "Beina leiðréttingum á verri hlið; einhliða álag; endurskima" },
      strengthEmphasis: "unilateral", flag: "asymmetry", citation: "NASM-CES (Clark)", evidenceGrade: "moderate" },
    { id: "ohsa_forward_lean", match: { variableKey: "forward_lean", minSeverity: "moderate" },
      finding: { en: "Excessive forward trunk lean", is: "Óhóflegur framhalli búks" },
      cause: { en: "Overactive soleus/gastroc / hip flexors / abdominals; underactive glutes / erector spinae", is: "Of-virkir soleus/gastroc / hip flexors / kviðvöðvar; van-virkir glutes / erector spinae" },
      lever: { en: "Ankle dorsiflexion + hip-flexor mobility; strengthen glutes + erector spinae (posterior chain)", is: "Ökkla dorsiflexion + hip-flexor hreyfanleiki; styrkja glutes + erector spinae (aftari keðja)" },
      strengthEmphasis: "mobility", flag: null, citation: "NASM-CES (Clark)", evidenceGrade: "moderate" },
    { id: "ohsa_apt", match: { variableKey: "anterior_pelvic_tilt", minSeverity: "moderate" },
      finding: { en: "Low-back arches (anterior pelvic tilt)", is: "Mjóbak sveigist (anterior pelvic tilt)" },
      cause: { en: "Overactive hip flexors / erector spinae / lat; underactive glutes / hamstrings / core", is: "Of-virkir hip flexors / erector spinae / lat; van-virkir glutes / hamstrings / core" },
      lever: { en: "Release hip flexors/lat; strengthen glutes/hamstrings + anterior core (posterior chain)", is: "Losa hip flexors/lat; styrkja glutes/hamstrings + fremri core (aftari keðja)" },
      strengthEmphasis: "posterior_chain", flag: null, citation: "NASM-CES (Clark)", evidenceGrade: "moderate" },
    { id: "ohsa_ppt", match: { variableKey: "posterior_pelvic_tilt", minSeverity: "moderate" },
      finding: { en: "Low-back rounds (posterior tilt / butt wink)", is: "Mjóbak rúllast (posterior tilt / butt wink)" },
      cause: { en: "Overactive hamstrings / rectus abdominis; underactive hip flexors / erector spinae; often ankle dorsiflexion limit", is: "Of-virkir hamstrings / rectus abdominis; van-virkir hip flexors / erector spinae; oft ökkla dorsiflexion takmörkun" },
      lever: { en: "Hamstring + ankle dorsiflexion mobility; strengthen hip flexors / spinal extensors", is: "Hamstring + ökkla dorsiflexion hreyfanleiki; styrkja hip flexors / hryggréttivöðva" },
      strengthEmphasis: "mobility", flag: null, citation: "NASM-CES (Clark)", evidenceGrade: "moderate" },
    { id: "ohsa_arms_forward", match: { variableKey: "arms_fall_forward", minSeverity: "moderate" },
      finding: { en: "Arms fall forward", is: "Armar falla fram" },
      cause: { en: "Overactive lats / pec major-minor / teres major; underactive lower trap / rhomboids / rotator cuff", is: "Of-virkir lats / pec major-minor / teres major; van-virkir lower trap / rhomboids / rotator cuff" },
      lever: { en: "Release lats/pecs; thoracic mobility; strengthen lower trap / rhomboids / rotator cuff", is: "Losa lats/pecs; brjósthols-hreyfanleiki; styrkja lower trap / rhomboids / rotator cuff" },
      strengthEmphasis: "mobility", flag: null, citation: "NASM-CES (Clark)", evidenceGrade: "moderate" },
    { id: "ohsa_depth", match: { variableKey: "squat_depth", minSeverity: "moderate" },
      finding: { en: "Limited squat depth / dorsiflexion", is: "Skert hnébeygju-dýpt / dorsiflexion" },
      cause: { en: "Ankle dorsiflexion and/or hip mobility restriction limits depth", is: "Ökkla dorsiflexion og/eða mjaðma-hreyfanleika takmörkun skerðir dýpt" },
      lever: { en: "Ankle dorsiflexion + hip mobility; grooved tempo squats to depth", is: "Ökkla dorsiflexion + mjaðma-hreyfanleiki; stýrðar tempo-beygjur í dýpt" },
      strengthEmphasis: "mobility", flag: null, citation: "NASM-CES (Clark)", evidenceGrade: "moderate" },
    { id: "ohsa_heel_rise", match: { variableKey: "heel_rise", minSeverity: "moderate" },
      finding: { en: "Heels rise off the floor", is: "Hælar lyftast af gólfi" },
      cause: { en: "Overactive soleus/gastroc → ankle dorsiflexion restriction", is: "Of-virkir soleus/gastroc → ökkla dorsiflexion takmörkun" },
      lever: { en: "Release/stretch calf; ankle dorsiflexion mobility; heel-elevated regressions meanwhile", is: "Losa/teygja kálfa; ökkla dorsiflexion hreyfanleiki; hæl-hækkaðar afturfærslur á meðan" },
      strengthEmphasis: "mobility", flag: null, citation: "NASM-CES (Clark)", evidenceGrade: "moderate" },
    { id: "ohsa_calcaneal", match: { variableKey: "calcaneal_eversion", minSeverity: "moderate" },
      finding: { en: "Heels roll in (calcaneal eversion)", is: "Hælar velta inn (calcaneal eversion)" },
      cause: { en: "Arch collapse — overactive peroneals; underactive tibialis posterior / foot intrinsics", is: "Ilrist-fall — of-virkir peroneals; van-virkir tibialis posterior / innri fótvöðvar" },
      lever: { en: "Strengthen tibialis posterior + foot intrinsics; consider foot/ankle assessment", is: "Styrkja tibialis posterior + innri fótvöðva; íhuga fót-/ökkla-mat" },
      strengthEmphasis: "mobility", flag: null, citation: "NASM-CES (Clark)", evidenceGrade: "moderate" },
    { id: "ohsa_lateral_shift", match: { variableKey: "lateral_shift", minSeverity: "moderate" },
      finding: { en: "Weight shifts to one side", is: "Þyngd færist á annan fót" },
      cause: { en: "Asymmetric hip / ankle mobility or strength between sides", is: "Ósamhverfur mjaðma- / ökkla-hreyfanleiki eða styrkur milli hliða" },
      lever: { en: "Assess and bias mobility/strength to the restricted side; unilateral work; re-screen", is: "Meta og beina hreyfanleika/styrk á takmörkuðu hliðina; einhliða vinna; endurskima" },
      strengthEmphasis: "unilateral", flag: "asymmetry", citation: "NASM-CES (Clark)", evidenceGrade: "moderate" },
    { id: "ohsa_pelvic_obliquity", match: { variableKey: "pelvic_obliquity", minSeverity: "moderate" },
      finding: { en: "Pelvis hikes / drops (frontal)", is: "Mjaðmagrind hækkar / fellur (frontal)" },
      cause: { en: "Frontal-plane hip control — gluteus medius weakness on the low side", is: "Framplans mjaðma-stjórn — glute medius veikleiki á lágu hlið" },
      lever: { en: "Strengthen gluteus medius (side plank w/ abduction, banded lateral walks)", is: "Styrkja gluteus medius (hliðarplanki m/ fráfærslu, teygju hliðargöngur)" },
      strengthEmphasis: "hip_abductor_er", flag: null, citation: "Bramah 2018; Powers 2010", evidenceGrade: "moderate" },
    { id: "ohsa_scapular", match: { variableKey: "scapular_asymmetry", minSeverity: "moderate" },
      finding: { en: "Shoulder / scapular asymmetry", is: "Axlar- / herðablaða-ósamhverfa" },
      cause: { en: "Overactive upper trap / levator; underactive lower trap / serratus anterior", is: "Of-virkir upper trap / levator; van-virkir lower trap / serratus anterior" },
      lever: { en: "Release upper trap/levator; strengthen lower trap / serratus (scap control)", is: "Losa upper trap/levator; styrkja lower trap / serratus (herðablaða-stjórn)" },
      strengthEmphasis: "trunk_control", flag: null, citation: "NASM-CES (Clark)", evidenceGrade: "moderate" },
  ],
  references: [
    // Construct / kinematics
    { label: "Clifton, Grooms & Onate 2015 — Overhead deep-squat performance predicts the overall FMS score", source: "Int J Sports Phys Ther" },
    { label: "Aleixo et al. 2024 — Deep-squat (FMS) convergent validity, discriminates joint mobility", source: "J Bodyw Mov Ther" },
    { label: "Heredia et al. 2021 — Lower-extremity kinematics during the overhead deep squat differ by FMS score", source: "J Sports Sci Med" },
    { label: "Hoogenboom et al. 2023 — 3D kinematics/kinetics of the overhead deep squat (normal reference)", source: "Applied Sciences" },
    { label: "Vidal et al. 2018 — Movement screens may measure movement skill as much as dysfunction", source: "Int J Sports Sci Coach" },
    // Reliability of an observational / phone-video read
    { label: "Post et al. 2017 — OHSA reliable & discriminative for observational medial knee displacement", source: "J Sport Rehab" },
    { label: "Krause et al. 2015 — Mobile goniometer app reliable/accurate for video FMS deep-squat angles", source: "Int J Sports Phys Ther" },
    { label: "Teyhen et al. 2012 — Test–retest & interrater reliability of the FMS", source: "J Athl Train" },
    // Medial knee displacement — causes + trainability
    { label: "Bell, Padua & Clark 2008 — Strength + flexibility profile of excessive medial knee displacement", source: "Arch Phys Med Rehabil" },
    { label: "Padua, Bell & Clark 2012 — Neuromuscular characteristics of medial knee displacement", source: "J Athl Train" },
    { label: "Macrum et al. 2012 — Limiting ankle dorsiflexion changes squat kinematics & muscle activation", source: "J Sport Rehab" },
    { label: "Bell et al. 2013 — 2D/3D knee valgus during squatting reduced after an exercise intervention", source: "J Athl Train" },
    // Injury-prediction caveat
    { label: "Bonazza et al. 2017 (meta) & Dorrel et al. 2015 (meta) — FMS injury-predictive value is limited", source: "AJSM / Sports Health" },
  ],
  evidenceGrade: "strong",
  caveats: [
    { en: "Evidence grade: STRONG as a reliable movement-quality screen for medial knee displacement + a corrective target (the valgus is trainable and closes on re-screen); WEAK as injury prediction — do NOT read an OHSA score as an injury-risk %.", is: "Sönnunarstig: STERKT sem áreiðanleg hreyfigæða-skimun fyrir miðlæga hné-hliðrun + leiðréttingar-markmið (valgus er þjálfanleg og lokast við endurskimun); VEIKT sem meiðsla-spá — lestu OHSA-skor EKKI sem meiðsla-áhættu %." },
    { en: "The screen partly reflects movement skill, not only dysfunction (Vidal 2018) — treat a poor result as \"worth coaching/training,\" not proof of a structural fault.", is: "Skimunin endurspeglar að hluta hreyfifærni, ekki bara vanstarfsemi (Vidal 2018) — meðhöndlaðu lélega útkomu sem „þess virði að þjálfa/kenna,\" ekki sönnun um byggingargalla." },
  ],
};

/** Single-leg hop for distance — limb symmetry (return-to-play). */
const HOP_FOR_DISTANCE: MovementTest = {
  slug: "hop_for_distance",
  name: { en: "Single-leg hop for distance", is: "Einfætt lengdarhopp" },
  category: "hop",
  description: {
    en: "Maximal single-leg hop, measured per leg. The limb symmetry index (L vs R) is a core return-to-play criterion.",
    is: "Hámarks einfætt hopp, mælt per fót. Útlima-samhverfuvísitalan (V vs H) er kjarna endurkomu-viðmið.",
  },
  laterality: "per_leg",
  capture: {
    views: "side",
    needsReps: true,
    needsLegs: true,
    standardisation: {
      en: "Side view, hands on hips, hop and stick the landing. Best of 3 per leg, same surface/footwear.",
      is: "Hliðarsýn, hendur á mjöðmum, hoppa og festu lendinguna. Besta af 3 per fót, sama yfirborð/skóbúnaður.",
    },
  },
  phases: [
    { key: "takeoff", label: { en: "Take-off", is: "Frákast" } },
    { key: "flight", label: { en: "Flight", is: "Flug" } },
    { key: "landing", label: { en: "Stuck landing", is: "Föst lending" } },
  ],
  variables: [
    { key: "hop_distance", label: { en: "Hop distance (per leg)", is: "Hopplengd (per fót)" }, unit: "cm", reliability: "moderate" },
    { key: "lsi", label: { en: "Limb symmetry index (L vs R)", is: "Útlima-samhverfuvísitala (V vs H)" }, unit: "%", reliability: "robust" },
    { key: "landing_control", label: { en: "Landing control (stuck vs hop)", is: "Lendingarstjórn (föst vs hopp)" }, unit: "band", reliability: "moderate" },
  ],
  thresholds: [
    {
      variableKey: "lsi",
      bands: [
        { id: "ok", label: { en: "Symmetric (>=90%)", is: "Samhverft (>=90%)" }, rule: "weaker/stronger >= 0.90", severity: "ok" },
        { id: "moderate", label: { en: "85–90%", is: "85–90%" }, rule: "0.85 <= ratio < 0.90", severity: "moderate" },
        { id: "marked", label: { en: "<85%", is: "<85%" }, rule: "ratio < 0.85", severity: "marked" },
      ],
      citation: "Reid 2007; Grindem 2016 (>=90% LSI RTP threshold)",
    },
  ],
  rules: [
    {
      id: "hop_asymmetry",
      match: { variableKey: "lsi", minSeverity: "moderate" },
      finding: { en: "Hop-distance asymmetry below the return-to-play threshold", is: "Hopplengdar-ósamhverfa undir endurkomu-viðmiði" },
      cause: { en: "Unilateral force/power deficit on the weaker leg", is: "Einhliða kraft/afl halli á veikari fæti" },
      lever: { en: "Unilateral strength + power to the weaker leg; re-test toward >=90% LSI before full clearance", is: "Einhliða styrkur + afl á veikari fót; endurpróf að >=90% LSI áður en full heimild" },
      strengthEmphasis: "unilateral",
      flag: "rtp",
      citation: "Grindem 2016; Reid 2007",
      evidenceGrade: "strong",
    },
  ],
  references: [
    { label: "Reid et al. 2007 — Hop testing provides a reliable and valid outcome measure", source: "Phys Ther" },
    { label: "Grindem et al. 2016 — Simple decision rules (incl. ≥90% LSI) reduce reinjury after ACL reconstruction", source: "Br J Sports Med" },
    { label: "Wellsandt et al. 2017 — Limb symmetry indexes can overestimate knee function after ACL injury", source: "J Orthop Sports Phys Ther" },
  ],
  evidenceGrade: "strong",
  caveats: [
    { en: "Evidence grade: STRONG as return-to-play decision support — a limb-symmetry index ≥90% is an evidence-based RTP criterion and passing it reduces reinjury risk (Grindem 2016; Reid 2007). Clearance is still a clinician decision, never the readiness colour.", is: "Sönnunarstig: STERKT sem stuðningur við endurkomu-ákvörðun — útlima-samhverfuvísitala ≥90% er sönnunarbyggt endurkomu-viðmið og að ná því dregur úr endur-meiðsla-áhættu (Grindem 2016; Reid 2007). Heimild er samt klínísk ákvörðun, aldrei readiness-liturinn." },
    { en: "LSI can OVERESTIMATE recovery when both legs are deconditioned (the uninvolved limb also weakens) — read it alongside the absolute hop distance, not on its own (Wellsandt 2017).", is: "LSI getur OFMETIÐ bata þegar báðir fætur eru afþjálfaðir (ómeiddi fóturinn veikist líka) — lestu hana ásamt raun-hopplengdinni, ekki eina og sér (Wellsandt 2017)." },
    { en: "Distance from side-view phone video is a moderate-precision estimate — a taped/marked distance is more accurate for a decision.", is: "Lengd úr hliðar-síma-myndbandi er miðlungs-nákvæm áætlun — mæld/merkt lengd er nákvæmari fyrir ákvörðun." },
  ],
};

export const SEED_MOVEMENT_TESTS: MovementTest[] = [
  SINGLE_LEG_DROP_JUMP,
  OVERHEAD_SQUAT_ASSESSMENT,
  HOP_FOR_DISTANCE,
];

export const MOVEMENT_CATEGORY_LABEL: Record<MovementCategory, Bi> = {
  mobility_screen: { en: "Mobility screen", is: "Hreyfanleika-skimun" },
  landing: { en: "Landing", is: "Lending" },
  jump: { en: "Jump", is: "Stökk" },
  hop: { en: "Hop", is: "Hopp" },
  balance: { en: "Balance", is: "Jafnvægi" },
  gait: { en: "Gait", is: "Göngulag" },
  strength_endurance: { en: "Strength-endurance", is: "Styrktar-úthald" },
};

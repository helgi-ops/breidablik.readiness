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
export type ExtractKind = "frontal_knee_valgus" | "knee_flexion" | "trunk_lean" | "rsi";
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
      en: "Front view for valgus + asymmetry, side view for knee-flexion depth + trunk. Fixed camera height/distance, same drop height, tight clothing. Repeat both legs.",
      is: "Framsýn fyrir valgus + ósamhverfu, hliðarsýn fyrir hnébeygju-dýpt + búk. Föst myndavélarhæð/fjarlægð, sama fallhæð, þröngur klæðnaður. Endurtaktu báða fætur.",
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
    { key: "knee_valgus_contact", label: { en: "Dynamic knee valgus at contact (FPPA)", is: "Kraga-hné við snertingu (FPPA)" }, unit: "deg/band", reliability: "robust", note: { en: "Frontal-plane projection angle — reliable from a front-view phone video.", is: "Framplans-vörpunarhorn — áreiðanlegt úr framsýnu símamyndbandi." }, extract: { kind: "frontal_knee_valgus", view: "front", phase: "initial_contact", bands: { moderate: 0.06, marked: 0.12, direction: "higher_worse" } } },
    { key: "knee_flexion_absorption", label: { en: "Knee-flexion absorption depth", is: "Hnébeygju-deyfingardýpt" }, unit: "deg/band", reliability: "moderate", note: { en: "Needs a side view.", is: "Þarf hliðarsýn." }, extract: { kind: "knee_flexion", view: "side", phase: "absorption", bands: { moderate: 70, marked: 55, direction: "lower_worse" } } },
    { key: "trunk_lean", label: { en: "Trunk lean at landing", is: "Búkhalli við lendingu" }, unit: "deg/band", reliability: "moderate", extract: { kind: "trunk_lean", view: "side", phase: "initial_contact", bands: { moderate: 15, marked: 25, direction: "higher_worse" } } },
    { key: "rsi", label: { en: "Reactive strength index (per leg)", is: "Viðbragðsstyrks-vísitala (per fót)" }, unit: "index", reliability: "low_precision", note: { en: "flight/contact time — marginal at 30 fps (~33 ms). Treat as a rough field estimate; prefer a force plate.", is: "flug/snertitími — ónákvæmt við 30 fps (~33 ms). Meðhöndla sem grófa vettvangsáætlun; kjóstu kraftplötu." }, extract: { kind: "rsi", view: "side", bands: { moderate: 0.5, marked: 0.3, direction: "lower_worse" } } },
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
    { label: "Padua et al. 2009 — The Landing Error Scoring System (LESS)", source: "Am J Sports Med" },
    { label: "Flanagan & Comyns 2008 — The use of contact time and the reactive strength index", source: "Strength Cond J" },
    { label: "Grindem et al. 2016 — Simple decision rules reduce reinjury risk after ACL reconstruction", source: "Br J Sports Med" },
  ],
  evidenceGrade: "strong",
};

/** Overhead squat assessment — a mobility/movement screen (NASM-CES style). */
const OVERHEAD_SQUAT_ASSESSMENT: MovementTest = {
  slug: "overhead_squat_assessment",
  name: { en: "Overhead squat assessment", is: "Yfirhöfuð-hnébeygju mat" },
  category: "mobility_screen",
  description: {
    en: "Bilateral squat with arms overhead. Screens movement-chain compensations (knee valgus, forward lean, heel rise, arms falling forward) that point to specific mobility/stability targets.",
    is: "Tvíhliða hnébeygja með hendur yfir höfði. Skimar hreyfikeðju-uppbætur (valgus, framhalli, hælalyfta, armar falla fram) sem benda á tiltekin hreyfanleika/stöðugleika markmið.",
  },
  laterality: "bilateral",
  capture: {
    views: "both",
    needsReps: true,
    needsLegs: false,
    standardisation: {
      en: "Front + side view, feet shoulder-width, arms fully overhead, 5 reps. Fixed camera height/distance.",
      is: "Fram- + hliðarsýn, fætur á axlabreidd, armar að fullu yfir höfði, 5 endurtekningar. Föst myndavélarhæð/fjarlægð.",
    },
  },
  phases: [
    { key: "descent", label: { en: "Descent", is: "Niðurferð" } },
    { key: "bottom", label: { en: "Bottom", is: "Botn" } },
    { key: "ascent", label: { en: "Ascent", is: "Uppferð" } },
  ],
  variables: [
    { key: "knee_valgus", label: { en: "Knees move inward (valgus)", is: "Hné fara inn (valgus)" }, unit: "band", reliability: "robust" },
    { key: "forward_lean", label: { en: "Excessive forward trunk lean", is: "Óhóflegur framhalli búks" }, unit: "band", reliability: "moderate" },
    { key: "heel_rise", label: { en: "Heels rise / arms fall forward", is: "Hælar lyftast / armar falla fram" }, unit: "band", reliability: "moderate" },
  ],
  thresholds: [
    {
      variableKey: "knee_valgus",
      bands: [
        { id: "ok", label: { en: "Knees track over feet", is: "Hné fylgja fótum" }, rule: "no medial collapse", severity: "ok" },
        { id: "moderate", label: { en: "Knees drift inward", is: "Hné reka inn" }, rule: "visible medial drift", severity: "moderate" },
      ],
      citation: "NASM-CES overhead squat compensations (Clark); Cook FMS",
    },
  ],
  rules: [
    {
      id: "ohsa_valgus",
      match: { variableKey: "knee_valgus", minSeverity: "moderate" },
      finding: { en: "Knees move inward on the overhead squat", is: "Hné fara inn í yfirhöfuð-hnébeygju" },
      cause: { en: "Under-active hip abductors/ER + possible ankle dorsiflexion restriction", is: "Vanvirkir mjaðma-fráfærar/útsnúningur + möguleg ökkla-uppbeygju takmörkun" },
      lever: { en: "Glute med/max activation + hip ER strength; ankle dorsiflexion mobility", is: "Virkjun glute med/max + mjaðma-útsnúnings styrkur; ökkla-uppbeygju hreyfanleiki" },
      strengthEmphasis: "hip_abductor_er",
      flag: null,
      citation: "NASM-CES (Clark); Rabin 2014",
      evidenceGrade: "moderate",
    },
    {
      id: "ohsa_forward_lean",
      match: { variableKey: "forward_lean", minSeverity: "moderate" },
      finding: { en: "Excessive forward lean / arms fall forward", is: "Óhóflegur framhalli / armar falla fram" },
      cause: { en: "Ankle dorsiflexion and/or thoracic/lat mobility restriction", is: "Ökkla-uppbeygju og/eða brjósthols/lats hreyfanleika takmörkun" },
      lever: { en: "Ankle dorsiflexion + thoracic/lat mobility; posterior-chain strength", is: "Ökkla-uppbeygja + brjósthols/lats hreyfanleiki; aftari-keðju styrkur" },
      strengthEmphasis: "mobility",
      flag: null,
      citation: "NASM-CES (Clark)",
      evidenceGrade: "moderate",
    },
  ],
  references: [
    { label: "Clark et al. — NASM Corrective Exercise (overhead squat assessment)", source: "NASM-CES" },
    { label: "Cook et al. — Functional Movement Screen validity/reliability", source: "Int J Sports Phys Ther" },
  ],
  evidenceGrade: "moderate",
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
    { label: "Grindem et al. 2016 — Simple decision rules after ACL reconstruction", source: "Br J Sports Med" },
  ],
  evidenceGrade: "strong",
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

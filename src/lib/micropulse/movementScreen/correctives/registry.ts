/**
 * Corrective-exercise library — the counterpart to the movement-test registry.
 * A movement-screen finding pulls an ordered corrective block across the NASM
 * continuum (inhibit → lengthen → activate → integrate); selection + progression
 * are ranked by MEASURED muscle activation (%MVIC) from primary EMG studies
 * (Ebert; Macadam; Bolgla), not by convention.
 *
 * Screening / training only — never a diagnosis, never the readiness colour.
 * Rules recommend the block; the coach confirms / overrides. A new exercise is a
 * `corrective_exercises` row (or a seed here) — data, not a pipeline change.
 * Reference studies inform the ranking; their text is never reproduced.
 */
import type { Bi, EvidenceGrade } from "../registry";

/** NASM corrective continuum — the ordering that makes a block coherent. */
export type CorrectivePhase = "inhibit" | "lengthen" | "activate" | "integrate";
/** Whether the target is released (overactive) or trained/mobilised (under-active/restricted). */
export type CorrectiveTargetKind = "release" | "mobilise" | "strengthen";
/** Ebert %MVIC strata for activation/loading exercises (glute progression). */
export type MvicBand = "low" | "moderate" | "high" | "very_high";

/**
 * THE ROUTING KEY. A movement compensation is the stable clinical vocabulary that
 * links a screen finding to the exercises that treat it. Screen variables, region
 * fields and VALD signals all resolve to a CompensationKey; every exercise (from
 * ANY expert / source) declares the compensations it `addresses`. To add a new
 * expert's exercises you tag them with these keys — no pipeline change. Extend the
 * union only when a genuinely new compensation is introduced (keep it small).
 */
export type CompensationKey =
  | "dynamic_valgus" | "hip_abductor_weakness" | "forward_trunk_lean" | "limited_dorsiflexion"
  | "low_reactive_strength" | "poor_absorption" | "landing_instability" | "limb_asymmetry";

/** Where an exercise came from — its contributing expert / evidence source.
 *  "custom" = added by a coach/admin through the app (a corrective_exercises row). */
export type ExerciseSource = "emg_library" | "king" | "custom";

export type CorrectiveExercise = {
  slug: string;
  name: Bi;
  cue: Bi;
  phase: CorrectivePhase;
  /** Muscle / quality, e.g. "Gluteus medius", "Ankle dorsiflexion". */
  target: Bi;
  targetKind: CorrectiveTargetKind;
  dose: Bi; // sets × reps or time
  frequency: Bi;
  /** For glute activation/loading — the measured %MVIC rank + its source. */
  mvic?: { band: MvicBand; pct?: string; citation: string };
  videoUrl?: string | null;
  citation: string;
  evidenceGrade: EvidenceGrade;
  /** Contributing source. Absent = the curated EMG / clinical library. */
  source?: ExerciseSource;
  /** The compensations this exercise treats (the routing key). Absent for the
   *  curated library, whose routing lives in the compensation → slug lists. */
  addresses?: CompensationKey[];
};

export const CORRECTIVE_PHASE_LABEL: Record<CorrectivePhase, Bi> = {
  inhibit: { en: "Inhibit (release)", is: "Hemja (losa)" },
  lengthen: { en: "Lengthen (mobilise)", is: "Lengja (liðka)" },
  activate: { en: "Activate (strengthen)", is: "Virkja (styrkja)" },
  integrate: { en: "Integrate (pattern)", is: "Samþætta (hreyfimynstur)" },
};

export const MVIC_BAND_LABEL: Record<MvicBand, Bi> = {
  low: { en: "low %MVIC (0–20)", is: "lágt %MVIC (0–20)" },
  moderate: { en: "moderate %MVIC (21–40)", is: "miðlungs %MVIC (21–40)" },
  high: { en: "high %MVIC (41–60)", is: "hátt %MVIC (41–60)" },
  very_high: { en: "very-high %MVIC (>61)", is: "mjög hátt %MVIC (>61)" },
};

const EMG_GMED = "Ebert (systematic review, Gmed %MVIC strata); Macadam (Gmed/Gmax activation review)";
const EMG_GMAX = "Macadam (Gmax activation review); gluteus-maximus rehab EMG reviews";
const EMG_WB = "Bolgla & Uhl (Gmed in five weight-bearing exercises)";
const ANKLE_DF = "Macrum 2012 (restricted ankle DF drives valgus)";

// ─────────────────────────────────────────────────────────────────────────────
// Seed library (v1) — the glute / ankle-DF / posterior-chain cluster the EMG
// literature covers best. Extend with a `corrective_exercises` row.
// ─────────────────────────────────────────────────────────────────────────────

export const SEED_CORRECTIVE_EXERCISES: CorrectiveExercise[] = [
  // ── Inhibit (release overactive) ──
  { slug: "smr_tfl_itband", name: { en: "Foam-roll TFL / IT band", is: "Rúllun TFL / IT-band" }, cue: { en: "Slow rolls, pause on tender spots.", is: "Hægar rúllur, staldraðu á aumum blettum." }, phase: "inhibit", target: { en: "TFL / IT band (overactive)", is: "TFL / IT-band (of-virkt)" }, targetKind: "release", dose: { en: "30–60 s / side", is: "30–60 s / hlið" }, frequency: { en: "before training", is: "fyrir æfingu" }, citation: "Bell/Padua cluster (release targets)", evidenceGrade: "moderate" },
  { slug: "smr_adductors", name: { en: "Foam-roll adductors", is: "Rúllun aðfærsluvöðva" }, cue: { en: "Inner thigh, slow.", is: "Innanvert læri, hægt." }, phase: "inhibit", target: { en: "Adductors (overactive)", is: "Aðfærsluvöðvar (of-virkir)" }, targetKind: "release", dose: { en: "30–60 s / side", is: "30–60 s / hlið" }, frequency: { en: "before training", is: "fyrir æfingu" }, citation: "Bell/Padua cluster", evidenceGrade: "moderate" },
  { slug: "smr_calf", name: { en: "Foam-roll calf (gastroc/soleus)", is: "Rúllun kálfa (gastroc/soleus)" }, cue: { en: "Cross legs for pressure.", is: "Krossaðu fætur fyrir þrýsting." }, phase: "inhibit", target: { en: "Gastroc / soleus (overactive)", is: "Gastroc / soleus (of-virkir)" }, targetKind: "release", dose: { en: "30–60 s / side", is: "30–60 s / hlið" }, frequency: { en: "before training", is: "fyrir æfingu" }, citation: `${ANKLE_DF}`, evidenceGrade: "moderate" },

  // ── Lengthen (static stretch + ankle-DF mobilisation) ──
  { slug: "calf_stretch_gastroc", name: { en: "Standing calf stretch (gastroc)", is: "Kálfateygja standandi (gastroc)" }, cue: { en: "Back knee straight, heel down.", is: "Aftara hné beint, hæll niðri." }, phase: "lengthen", target: { en: "Ankle dorsiflexion", is: "Ökkla-dorsiflexion" }, targetKind: "mobilise", dose: { en: "2 × 30 s / side", is: "2 × 30 s / hlið" }, frequency: { en: "daily", is: "daglega" }, citation: `${ANKLE_DF}`, evidenceGrade: "moderate" },
  { slug: "ankle_df_knee_to_wall", name: { en: "Knee-to-wall ankle mobilisation (banded)", is: "Hné-að-vegg ökkla-liðkun (teygja)" }, cue: { en: "Knee tracks over 2nd toe, heel stays down.", is: "Hné yfir 2. tá, hæll helst niðri." }, phase: "lengthen", target: { en: "Ankle dorsiflexion", is: "Ökkla-dorsiflexion" }, targetKind: "mobilise", dose: { en: "2 × 10 / side", is: "2 × 10 / hlið" }, frequency: { en: "daily", is: "daglega" }, citation: `${ANKLE_DF}`, evidenceGrade: "strong" },
  { slug: "hip_flexor_stretch", name: { en: "Half-kneeling hip-flexor stretch", is: "Mjaðma-beygju teygja í hálf-kné" }, cue: { en: "Tuck pelvis, squeeze back glute.", is: "Halla mjaðmagrind, kreistu aftari rasskinn." }, phase: "lengthen", target: { en: "Hip flexors (overactive)", is: "Mjaðma-beygjur (of-virkar)" }, targetKind: "mobilise", dose: { en: "2 × 30 s / side", is: "2 × 30 s / hlið" }, frequency: { en: "daily", is: "daglega" }, citation: "Forward-lean pattern (hip-flexor length)", evidenceGrade: "moderate" },

  // ── Activate (isolated strengthening, %MVIC-ranked low → very-high) ──
  { slug: "glute_bridge", name: { en: "Bilateral glute bridge", is: "Tvífætt rassbrú" }, cue: { en: "Ribs down, drive through heels.", is: "Rifbein niður, ýttu í gegnum hæla." }, phase: "activate", target: { en: "Gluteus maximus / medius", is: "Gluteus maximus / medius" }, targetKind: "strengthen", dose: { en: "2–3 × 12–15", is: "2–3 × 12–15" }, frequency: { en: "2–3×/wk (or warm-up primer)", is: "2–3×/viku (eða upphitunar-grunnur)" }, mvic: { band: "low", citation: "Ebert (bilateral bridge = low %MVIC)" }, citation: EMG_GMED, evidenceGrade: "moderate" },
  { slug: "clamshell", name: { en: "Clamshell (banded)", is: "Skel (teygja)" }, cue: { en: "Heels together, don't rock the pelvis.", is: "Hælar saman, ekki velta mjaðmagrind." }, phase: "activate", target: { en: "Gluteus medius", is: "Gluteus medius" }, targetKind: "strengthen", dose: { en: "2–3 × 12–15 / side", is: "2–3 × 12–15 / hlið" }, frequency: { en: "2–3×/wk", is: "2–3×/viku" }, mvic: { band: "moderate", citation: "Ebert (moderate %MVIC)" }, citation: EMG_GMED, evidenceGrade: "moderate" },
  { slug: "side_lying_hip_abduction", name: { en: "Side-lying hip abduction", is: "Mjaðma-fráfærsla á hlið" }, cue: { en: "Lead with the heel, slight external rotation.", is: "Leiddu með hælnum, örlítill útsnúningur." }, phase: "activate", target: { en: "Gluteus medius", is: "Gluteus medius" }, targetKind: "strengthen", dose: { en: "2–3 × 10–12 / side", is: "2–3 × 10–12 / hlið" }, frequency: { en: "2–3×/wk", is: "2–3×/viku" }, mvic: { band: "very_high", pct: "81–103 %MVIC", citation: "Macadam (side-lying abduction, top Gmed)" }, citation: EMG_GMED, evidenceGrade: "strong" },
  { slug: "half_kneeling_banded_hip_er", name: { en: "Half-kneeling banded hip external rotation", is: "Mjaðma-útsnúningur í hálf-kné með teygju" }, cue: { en: "Keep the pelvis still, rotate from the hip.", is: "Haltu mjaðmagrind kyrri, snúðu frá mjöðm." }, phase: "activate", target: { en: "Hip external rotators (glute med/max)", is: "Mjaðma-útsnúningar (glute med/max)" }, targetKind: "strengthen", dose: { en: "2–3 × 10–12 / side", is: "2–3 × 10–12 / hlið" }, frequency: { en: "2–3×/wk", is: "2–3×/viku" }, mvic: { band: "high", citation: "Macadam (dynamic ER, high Gmed/Gmax)" }, videoUrl: "https://www.youtube.com/watch?v=sWofU_ssCb0", citation: EMG_GMED, evidenceGrade: "moderate" },
  { slug: "standing_banded_hip_abduction", name: { en: "Standing hip abduction, band at the ankle", is: "Mjaðma-fráfærsla standandi, teygja við ökkla" }, cue: { en: "Stand tall on the stance leg, control the return.", is: "Stattu hátt á standfæti, stýrðu til baka." }, phase: "activate", target: { en: "Gluteus medius (stance leg)", is: "Gluteus medius (standfótur)" }, targetKind: "strengthen", dose: { en: "2–3 × 12 / side", is: "2–3 × 12 / hlið" }, frequency: { en: "2–3×/wk", is: "2–3×/viku" }, mvic: { band: "very_high", pct: "81–103 %MVIC", citation: "Macadam (standing banded abduction, top Gmed)" }, citation: EMG_GMED, evidenceGrade: "strong" },
  { slug: "side_plank_hip_abduction", name: { en: "Side plank with top-leg abduction (side bridge)", is: "Hliðarplanki með efri-fótar fráfærslu" }, cue: { en: "Straight line hips-to-shoulders, lift the top leg.", is: "Bein lína mjaðmir-axlir, lyftu efri fæti." }, phase: "activate", target: { en: "Gluteus medius + lateral trunk", is: "Gluteus medius + hliðar-búkur" }, targetKind: "strengthen", dose: { en: "2–3 × 8–10 / side", is: "2–3 × 8–10 / hlið" }, frequency: { en: "2–3×/wk", is: "2–3×/viku" }, mvic: { band: "very_high", pct: "≈103 %MVIC", citation: "Macadam (side bridge w/ abduction, top Gmed)" }, citation: EMG_GMED, evidenceGrade: "strong" },
  { slug: "quadruped_hip_extension", name: { en: "Quadruped hip extension", is: "Mjaðma-rétta í fjórfætling" }, cue: { en: "Heel to ceiling, ribs down, no low-back arch.", is: "Hæll í loft, rifbein niður, ekki mjóbaks-sveigja." }, phase: "activate", target: { en: "Gluteus maximus", is: "Gluteus maximus" }, targetKind: "strengthen", dose: { en: "2–3 × 12 / side", is: "2–3 × 12 / hlið" }, frequency: { en: "2–3×/wk", is: "2–3×/viku" }, mvic: { band: "moderate", citation: "Gmax rehab EMG reviews" }, citation: EMG_GMAX, evidenceGrade: "moderate" },

  // ── Integrate (weight-bearing / dynamic pattern, high Gmax/Gmed) ──
  { slug: "lateral_step_up", name: { en: "Lateral step-up", is: "Hliðar-uppstig" }, cue: { en: "Drive through the whole foot, knee over 2nd toe.", is: "Ýttu í gegnum allan fótinn, hné yfir 2. tá." }, phase: "integrate", target: { en: "Gluteus maximus / medius (unilateral)", is: "Gluteus maximus / medius (einhliða)" }, targetKind: "strengthen", dose: { en: "3 × 8 / side", is: "3 × 8 / hlið" }, frequency: { en: "2×/wk", is: "2×/viku" }, mvic: { band: "very_high", pct: "79–113 %MVIC Gmax", citation: "Macadam (lateral step-up, top Gmax)" }, citation: EMG_GMAX, evidenceGrade: "strong" },
  { slug: "crossover_step_up", name: { en: "Cross-over step-up", is: "Kross-uppstig" }, cue: { en: "Step across and up, keep the knee tracking out.", is: "Stígðu yfir og upp, haltu hné út." }, phase: "integrate", target: { en: "Gluteus maximus / medius", is: "Gluteus maximus / medius" }, targetKind: "strengthen", dose: { en: "3 × 8 / side", is: "3 × 8 / hlið" }, frequency: { en: "2×/wk", is: "2×/viku" }, mvic: { band: "very_high", pct: "79–113 %MVIC Gmax", citation: "Macadam (cross-over step-up, top Gmax)" }, citation: EMG_GMAX, evidenceGrade: "strong" },
  { slug: "single_leg_squat", name: { en: "Single-leg squat (to box)", is: "Einfætt hnébeygja (á kassa)" }, cue: { en: "Sit back, keep the knee over the foot.", is: "Settu þig aftur, haltu hné yfir fæti." }, phase: "integrate", target: { en: "Gluteus medius (weight-bearing control)", is: "Gluteus medius (álags-stjórn)" }, targetKind: "strengthen", dose: { en: "3 × 6–8 / side", is: "3 × 6–8 / hlið" }, frequency: { en: "2×/wk", is: "2×/viku" }, mvic: { band: "high", citation: "Bolgla (SL squat > SL stance)" }, citation: EMG_WB, evidenceGrade: "strong" },
  { slug: "rotational_single_leg_squat", name: { en: "Rotational single-leg squat", is: "Snúnings einfætt hnébeygja" }, cue: { en: "Reach across on the way down, resist the knee caving.", is: "Teygðu yfir á niðurleið, stöðvaðu hné-hrun." }, phase: "integrate", target: { en: "Gluteus maximus (rotational control)", is: "Gluteus maximus (snúnings-stjórn)" }, targetKind: "strengthen", dose: { en: "3 × 6 / side", is: "3 × 6 / hlið" }, frequency: { en: "2×/wk", is: "2×/viku" }, mvic: { band: "very_high", pct: "79–113 %MVIC Gmax", citation: "Macadam (rotational SL squat, top Gmax)" }, citation: EMG_GMAX, evidenceGrade: "strong" },
  { slug: "goblet_squat_knee_tracking", name: { en: "Goblet squat, knee-tracking cue", is: "Bikar-hnébeygja, hné-stýrings vísbending" }, cue: { en: "\"Knees out\" — track over the 2nd toe through the whole rep.", is: "„Hné út“ — yfir 2. tá alla hreyfinguna." }, phase: "integrate", target: { en: "Squat pattern (valgus control)", is: "Hnébeygju-mynstur (valgus-stjórn)" }, targetKind: "strengthen", dose: { en: "3 × 8", is: "3 × 8" }, frequency: { en: "2×/wk", is: "2×/viku" }, citation: "Bell 2013 (valgus reduced by intervention); integration of the above", evidenceGrade: "moderate" },
  { slug: "barbell_hip_thrust", name: { en: "Barbell hip thrust", is: "Stangar-mjaðmaýta (hip thrust)" }, cue: { en: "Ribs down, full hip extension, chin tucked.", is: "Rifbein niður, full mjaðma-rétta, haka inn." }, phase: "integrate", target: { en: "Gluteus maximus (posterior chain)", is: "Gluteus maximus (aftari keðja)" }, targetKind: "strengthen", dose: { en: "3 × 8–10", is: "3 × 8–10" }, frequency: { en: "2×/wk", is: "2×/viku" }, mvic: { band: "high", citation: "Gmax reviews (hip thrust = high Gmax)" }, citation: EMG_GMAX, evidenceGrade: "strong" },
  { slug: "split_squat", name: { en: "Rear-foot-elevated split squat", is: "Klofbeygja með aftara fót upphækkaðan" }, cue: { en: "Torso tall, drive through the front heel.", is: "Búkur uppréttur, ýttu í gegnum fremri hæl." }, phase: "integrate", target: { en: "Gluteus maximus + quad (unilateral)", is: "Gluteus maximus + framlæri (einhliða)" }, targetKind: "strengthen", dose: { en: "3 × 8 / side", is: "3 × 8 / hlið" }, frequency: { en: "2×/wk", is: "2×/viku" }, mvic: { band: "high", citation: "Gmax reviews (split squat = high Gmax)" }, citation: EMG_GMAX, evidenceGrade: "strong" },
  { slug: "goblet_squat_counterbalance", name: { en: "Counterbalance goblet squat to depth", is: "Mótvægis bikar-hnébeygja í dýpt" }, cue: { en: "Weight up front keeps the torso upright; sit to depth.", is: "Þyngd að framan heldur búk uppréttum; niður í dýpt." }, phase: "integrate", target: { en: "Upright squat pattern (forward-lean control)", is: "Uppréttt hnébeygju-mynstur (framhalla-stjórn)" }, targetKind: "strengthen", dose: { en: "3 × 8", is: "3 × 8" }, frequency: { en: "2×/wk", is: "2×/viku" }, citation: "Forward-lean integration (counterbalance keeps torso upright)", evidenceGrade: "moderate" },

  // ── Landing / reactive-strength / eccentric (single-leg drop jump signature) ──
  { slug: "single_leg_balance", name: { en: "Single-leg balance progression", is: "Einfætt jafnvægis-stigmögnun" }, cue: { en: "Quiet foot; progress eyes-closed / perturbation / unstable surface.", is: "Kyrr fótur; stigmagna með lokuð augu / truflun / óstöðugt undirlag." }, phase: "activate", target: { en: "Single-leg neuromuscular control", is: "Einfætt taugavöðva-stjórn" }, targetKind: "strengthen", dose: { en: "3 × 20–30 s / side", is: "3 × 20–30 s / hlið" }, frequency: { en: "2–3×/wk", is: "2–3×/viku" }, citation: "Ross & Guskiewicz 2005 (postural stability)", evidenceGrade: "moderate" },
  { slug: "eccentric_step_down", name: { en: "Slow eccentric step-down", is: "Hæg eccentric niðurstig" }, cue: { en: "3-second lower, keep the knee tracking over the foot.", is: "3 sek niður, haltu hné yfir fæti." }, phase: "integrate", target: { en: "Eccentric quad / glute control", is: "Eccentric framlæri / glute stjórn" }, targetKind: "strengthen", dose: { en: "3 × 6 / side", is: "3 × 6 / hlið" }, frequency: { en: "2×/wk", is: "2×/viku" }, citation: "Padua 2009 (LESS — absorption)", evidenceGrade: "moderate" },
  { slug: "drop_landing_soft_catch", name: { en: "Drop-landing, soft quiet catch", is: "Fall-lending, mjúkt hljóðlaust grip" }, cue: { en: "Land quiet, hips back, knees over toes, absorb.", is: "Lentu hljóðlaust, mjaðmir aftur, hné yfir tær, deyfðu." }, phase: "integrate", target: { en: "Landing mechanics + eccentric absorption", is: "Lendingartækni + eccentric deyfing" }, targetKind: "strengthen", dose: { en: "3 × 5", is: "3 × 5" }, frequency: { en: "2×/wk", is: "2×/viku" }, citation: "Padua 2009 (LESS)", evidenceGrade: "moderate" },
  { slug: "pogo_hops", name: { en: "Pogo hops (ankle stiffness)", is: "Pogo-hopp (ökkla-stífni)" }, cue: { en: "Fast off the floor, stiff ankles, minimal knee bend.", is: "Hratt af gólfi, stífir ökklar, lítil hné-beygja." }, phase: "integrate", target: { en: "Reactive strength (stretch-shortening cycle)", is: "Viðbragðsstyrkur (teygju-styttingar hringrás)" }, targetKind: "strengthen", dose: { en: "3 × 10", is: "3 × 10" }, frequency: { en: "2×/wk", is: "2×/viku" }, citation: "Flanagan & Comyns 2008 (RSI)", evidenceGrade: "moderate" },
  { slug: "single_leg_hops", name: { en: "Single-leg hops, stick the landing", is: "Einfætt hopp, festu lendinguna" }, cue: { en: "Hop and hold 2 s; quality over distance.", is: "Hoppaðu og haltu 2 s; gæði fram yfir lengd." }, phase: "integrate", target: { en: "Single-leg reactive strength", is: "Einfættur viðbragðsstyrkur" }, targetKind: "strengthen", dose: { en: "3 × 5 / side", is: "3 × 5 / hlið" }, frequency: { en: "2×/wk", is: "2×/viku" }, citation: "Flanagan & Comyns 2008; Grindem 2016 (RTP)", evidenceGrade: "moderate" },

  // ── Adductor / groin (athletic groin-pain track — intersegmental + gluteal + adductor loading) ──
  { slug: "ball_squeeze_isometric", name: { en: "Adductor ball-squeeze (isometric)", is: "Aðfærslu-boltakreisting (ísómetrísk)" }, cue: { en: "Squeeze a ball between the knees; test at 45° and 0° hip flexion.", is: "Kreistu bolta milli hnjáa; prófaðu við 45° og 0° mjaðma-beygju." }, phase: "activate", target: { en: "Hip adductors (isometric capacity)", is: "Mjaðma-aðfærsluvöðvar (ísómetrísk geta)" }, targetKind: "strengthen", dose: { en: "5 × 30 s (or 5 × 5 s hold)", is: "5 × 30 s (eða 5 × 5 s hald)" }, frequency: { en: "3–4×/wk", is: "3–4×/viku" }, mvic: { band: "high", citation: "Serner (adductor squeeze EMG)" }, citation: "Hölmich protocol (adductor-related groin pain); EMG of the hip adductor muscles in six clinical examination tests", evidenceGrade: "strong" },
  { slug: "side_lying_hip_adduction", name: { en: "Side-lying hip adduction", is: "Mjaðma-aðfærsla á hlið" }, cue: { en: "Bottom leg lifts to the top leg; slow and controlled.", is: "Neðri fótur lyftist upp að efri fæti; hægt og stýrt." }, phase: "activate", target: { en: "Hip adductors", is: "Mjaðma-aðfærsluvöðvar" }, targetKind: "strengthen", dose: { en: "3 × 12 / side", is: "3 × 12 / hlið" }, frequency: { en: "3×/wk", is: "3×/viku" }, mvic: { band: "high", citation: "EMG of the hip adductor muscles in six clinical examination tests" }, citation: "EMG of the hip adductor muscles in six clinical examination tests", evidenceGrade: "moderate" },
  { slug: "standing_hip_adduction_band", name: { en: "Standing banded hip adduction", is: "Mjaðma-aðfærsla standandi með teygju" }, cue: { en: "Pull the working leg across midline; keep the pelvis level.", is: "Dragðu vinnufót yfir miðlínu; haltu mjaðmagrind láréttri." }, phase: "activate", target: { en: "Hip adductors (stance control)", is: "Mjaðma-aðfærsluvöðvar (standstjórn)" }, targetKind: "strengthen", dose: { en: "3 × 12 / side", is: "3 × 12 / hlið" }, frequency: { en: "3×/wk", is: "3×/viku" }, mvic: { band: "moderate", citation: "EMG evaluation of hip adduction exercises for soccer players" }, citation: "EMG evaluation of hip adduction exercises for soccer players (exercise selection for groin injury)", evidenceGrade: "moderate" },
  { slug: "copenhagen_adduction", name: { en: "Copenhagen adduction", is: "Copenhagen-aðfærsla" }, cue: { en: "Side plank, top foot on a bench; lift the bottom leg to meet it.", is: "Hliðarplanki, efri fótur á bekk; lyftu neðri fæti upp á móti." }, phase: "integrate", target: { en: "Hip adductors (eccentric / long-lever)", is: "Mjaðma-aðfærsluvöðvar (eccentric / langur vogur)" }, targetKind: "strengthen", dose: { en: "3 × 6–10 / side (progress reps)", is: "3 × 6–10 / hlið (fjölgaðu endurt.)" }, frequency: { en: "2×/wk", is: "2×/viku" }, mvic: { band: "very_high", citation: "The Neuromuscular Effects of the Copenhagen Adductor Exercise (systematic review)" }, citation: "The Neuromuscular Effects of the Copenhagen Adductor Exercise (systematic review); Adductor Longus Activation During Common Hip Exercises", evidenceGrade: "strong" },

  // ── Hamstring / posterior-chain eccentric (ACL + linear-running phases) ──
  { slug: "nordic_hamstring", name: { en: "Nordic hamstring curl (eccentric)", is: "Nordic aftanlæri (eccentric)" }, cue: { en: "Lower slowly under control; catch and push back up.", is: "Síga hægt og stýrt; grípa og ýta til baka." }, phase: "integrate", target: { en: "Hamstrings (eccentric strength)", is: "Aftanlæri (eccentric styrkur)" }, targetKind: "strengthen", dose: { en: "3 × 5–8", is: "3 × 5–8" }, frequency: { en: "2×/wk", is: "2×/viku" }, mvic: { band: "very_high", citation: "Muscle Activation During Various Hamstring Exercises" }, citation: "Muscle Activation During Various Hamstring Exercises; hamstring-injury prevention reviews (Nordic)", evidenceGrade: "strong" },
  { slug: "single_leg_rdl", name: { en: "Single-leg Romanian deadlift", is: "Einfætt rúmensk réttstöðulyfta" }, cue: { en: "Hinge from the hip, flat back, control the descent.", is: "Halla frá mjöðm, flatt bak, stýrðu niðurleiðinni." }, phase: "integrate", target: { en: "Hamstrings / posterior chain (unilateral)", is: "Aftanlæri / aftari keðja (einhliða)" }, targetKind: "strengthen", dose: { en: "3 × 8 / side", is: "3 × 8 / hlið" }, frequency: { en: "2×/wk", is: "2×/viku" }, mvic: { band: "high", citation: "Muscle Activation During Various Hamstring Exercises" }, citation: "Muscle Activation During Various Hamstring Exercises", evidenceGrade: "moderate" },
  { slug: "spanish_squat_iso", name: { en: "Spanish squat (isometric hold)", is: "Spænsk hnébeygja (ísómetrískt hald)" }, cue: { en: "Band behind the knees; sit back and hold at 60–90°.", is: "Teygja aftan við hné; sittu aftur og haltu við 60–90°." }, phase: "activate", target: { en: "Quadriceps (isolated capacity)", is: "Framlæri (einangruð geta)" }, targetKind: "strengthen", dose: { en: "5 × 30–45 s", is: "5 × 30–45 s" }, frequency: { en: "3×/wk", is: "3×/viku" }, citation: "ACL Rehabilitation Progression: Where Are We Now? (impairment-phase quad capacity)", evidenceGrade: "moderate" },

  // ── Plyometric / SSC progression (bilateral → horizontal → lateral) ──
  { slug: "bilateral_box_jump_landing", name: { en: "Bilateral box jump, absorb the landing", is: "Tvífætt kassastökk, deyfðu lendinguna" }, cue: { en: "Jump up, step down; land soft and quiet on the box.", is: "Stökktu upp, stígðu niður; lentu mjúkt og hljóðlaust á kassanum." }, phase: "integrate", target: { en: "Bilateral stretch-shortening cycle", is: "Tvífætt teygju-styttingar hringrás" }, targetKind: "strengthen", dose: { en: "3 × 5", is: "3 × 5" }, frequency: { en: "2×/wk", is: "2×/viku" }, citation: "Comparison of gluteal and hamstring activation during five plyometric exercises", evidenceGrade: "moderate" },
  { slug: "horizontal_bound_stick", name: { en: "Horizontal bound, stick the landing", is: "Lárétt stökk, festu lendinguna" }, cue: { en: "Broad-jump forward; hold the landing 2 s before the next rep.", is: "Langstökk fram; haltu lendingu 2 s fyrir næstu endurt." }, phase: "integrate", target: { en: "Horizontal power + deceleration", is: "Láréttur kraftur + hemlun" }, targetKind: "strengthen", dose: { en: "3 × 4", is: "3 × 4" }, frequency: { en: "2×/wk", is: "2×/viku" }, citation: "Plyometric training reviews (horizontal SSC progression)", evidenceGrade: "moderate" },
  { slug: "lateral_hurdle_hop", name: { en: "Continuous lateral hurdle hop", is: "Samfellt hliðar-grindarhopp" }, cue: { en: "Side-to-side over a low (15 cm) hurdle; minimise ground time.", is: "Hlið-til-hliðar yfir lága (15 cm) grind; lágmarka gólftíma." }, phase: "integrate", target: { en: "Lateral reactive strength (groin RTP test-linked)", is: "Hliðlægur viðbragðsstyrkur (tengt groin RTP-prófi)" }, targetKind: "strengthen", dose: { en: "3 × 10 side-to-side", is: "3 × 10 hlið-til-hliðar" }, frequency: { en: "2×/wk", is: "2×/viku" }, citation: "King/Baida (lateral hurdle-hop RTP test — GCT, eccentric RFD)", evidenceGrade: "moderate" },

  // ── Change-of-direction / deceleration mechanics (final phase, mechanics re-training) ──
  { slug: "deceleration_mechanics_drill", name: { en: "Deceleration / cut-mechanics drill", is: "Hemlunar- / stefnubreytinga-tækniæfing" }, cue: { en: "Approach, plant on a wide base, chest up, absorb — then re-accelerate.", is: "Aðkoma, plantaðu á breiðri stöðu, bringa upp, deyfðu — svo endur-hraða." }, phase: "integrate", target: { en: "Change-of-direction / cutting mechanics", is: "Stefnubreytinga- / cut-tækni" }, targetKind: "strengthen", dose: { en: "4–6 quality reps / side", is: "4–6 gæða-endurt. / hlið" }, frequency: { en: "1–2×/wk", is: "1–2×/viku" }, citation: "Franklyn-Miller 2017 (CoD movement clusters); Daniels 2021 (cutting mechanics after rehab)", evidenceGrade: "moderate" },
];

export const CORRECTIVE_BY_SLUG: Record<string, CorrectiveExercise> = Object.fromEntries(
  SEED_CORRECTIVE_EXERCISES.map((e) => [e.slug, e]),
);

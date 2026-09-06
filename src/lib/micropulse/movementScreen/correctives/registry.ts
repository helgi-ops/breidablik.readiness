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
  videoUrl?: string;
  citation: string;
  evidenceGrade: EvidenceGrade;
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
];

export const CORRECTIVE_BY_SLUG: Record<string, CorrectiveExercise> = Object.fromEntries(
  SEED_CORRECTIVE_EXERCISES.map((e) => [e.slug, e]),
);

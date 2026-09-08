/**
 * Enda King program template — the concrete exercise inventory + doses that fill
 * the "exact exercises pending" gap in the rehab-track library, seeded from a real
 * King rehabilitation program (Anton L, Transition phase; `Anton L/Anton L Rehab.xlsx`).
 *
 * King runs THREE tracks in parallel during a phase (not a single linear list):
 *   • Motor Control  — intersegmental (trunk–pelvis–hip) control (the King base)
 *   • Run Mech / Plyo — linear running + plyometrics (King Level 2, "Aspetar Wk 1")
 *   • Strength        — isolated + loaded capacity (King Level 1)
 *
 * What is transferable vs owned (privacy):
 *   • Exercise NAMES, DOSES and King's phase framework are not protectable → stored.
 *   • The demonstration video FILES are the athlete's / King's personal content →
 *     NOT ingested. Each entry carries an OPTIONAL `videoUrl` that starts empty; a
 *     club may later fill it with its OWN re-recorded demo, or leave the text cue.
 *   • No athlete health data lives here — this is the neutral program template.
 *
 * Rehab-support / training only — never a diagnosis, never the readiness colour.
 * The treating clinician gates progression. Pure data module.
 */
import type { Bi } from "../registry";

export type KingTrack = "motor_control" | "run_mech" | "strength";

export type KingExercise = {
  slug: string;
  name: Bi;
  track: KingTrack;
  /** Sub-group within the track, e.g. Prep / Activation / Plyo / Run mechanics. */
  group?: Bi;
  /** The quality / muscle the exercise targets (general, from King's framework). */
  target: Bi;
  /** Sets × reps (× load / tempo) exactly as prescribed. */
  dose: Bi;
  cue?: Bi;
  /** Starts empty — the athlete's/King's demo videos are NOT stored. A club may
   *  add its own re-recorded demo later. */
  videoUrl?: string | null;
};

export const KING_TRACK_LABEL: Record<KingTrack, Bi> = {
  motor_control: { en: "Motor Control (intersegmental control)", is: "Motor Control (intersegmental stjórn)" },
  run_mech: { en: "Run Mechanics / Plyometrics (Level 2)", is: "Hlaupatækni / Plyometrics (Level 2)" },
  strength: { en: "Strength (Level 1)", is: "Styrkur (Level 1)" },
};

/** Where each King track sits on the movement-quality continuum / King level. */
export const KING_TRACK_CONTINUUM: Record<KingTrack, Bi> = {
  motor_control: { en: "Intersegmental-control base — trunk–pelvis–hip control (King's emphasis over isolated strength)", is: "Intersegmental-stjórnar grunnur — búkur–mjaðmagrind–mjöðm stjórn (áhersla Kings umfram einangraðan styrk)" },
  run_mech: { en: "Level 2 — linear running + plyometrics (SSC); improves eccentric RFD, shortens ground-contact time", is: "Level 2 — bein hlaup + plyometrics (SSC); bætir eccentric RFD, styttir gólftíma" },
  strength: { en: "Level 1 — isolated + loaded capacity on the involved limb", is: "Level 1 — einangruð + hlaðin geta á meidda fæti" },
};

const G = {
  prep: { en: "Prep", is: "Undirbúningur" },
  activation: { en: "Activation", is: "Virkjun" },
  plyo: { en: "Plyometrics", is: "Plyometrics" },
  runMech: { en: "Run mechanics", is: "Hlaupatækni" },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// The inventory (Anton L, Transition phase). Doses verbatim from the program.
// ─────────────────────────────────────────────────────────────────────────────

export const KING_PROGRAM: KingExercise[] = [
  // ── Motor Control — prep ──
  { slug: "king_oh_squat", name: { en: "Overhead squat", is: "Yfirhöfuðs hnébeygja" }, track: "motor_control", group: G.prep, target: { en: "Whole-body movement screen / prep", is: "Heildar-hreyfiskimun / undirbúningur" }, dose: { en: "Prep", is: "Undirbúningur" }, videoUrl: null },
  { slug: "king_slrdl_prep", name: { en: "Single-leg RDL (prep)", is: "Einfætt RDL (undirbúningur)" }, track: "motor_control", group: G.prep, target: { en: "Posterior chain / hip-hinge control", is: "Aftari keðja / mjaðma-hinge stjórn" }, dose: { en: "Prep", is: "Undirbúningur" }, videoUrl: null },
  { slug: "king_sl_calf_raise_prep", name: { en: "Single-leg calf raise (prep)", is: "Einfætt kálfalyfta (undirbúningur)" }, track: "motor_control", group: G.prep, target: { en: "Ankle / calf capacity", is: "Ökkli / kálfi geta" }, dose: { en: "Prep", is: "Undirbúningur" }, videoUrl: null },
  { slug: "king_deep_rotators_knees", name: { en: "Deep rotators on knees / hip hitch", is: "Djúpir snúningsvöðvar á hnjám / hip hitch" }, track: "motor_control", group: G.prep, target: { en: "Deep hip external rotators / pelvic control", is: "Djúpir mjaðma-útsnúningar / mjaðmagrindar-stjórn" }, dose: { en: "Prep", is: "Undirbúningur" }, videoUrl: null },
  { slug: "king_banded_hip_mobility", name: { en: "Banded hip mobility (Fig-4 + extension)", is: "Mjaðma-hreyfanleiki með teygju (Fig-4 + rétta)" }, track: "motor_control", group: G.prep, target: { en: "Hip mobility (flexion/ER + extension)", is: "Mjaðma-hreyfanleiki (beygja/ER + rétta)" }, dose: { en: "Prep", is: "Undirbúningur" }, videoUrl: null },

  // ── Motor Control — main ──
  { slug: "king_goblet_squat", name: { en: "Goblet squat", is: "Bikar-hnébeygja" }, track: "motor_control", target: { en: "Squat pattern / trunk control", is: "Hnébeygju-mynstur / búk-stjórn" }, dose: { en: "3 × 10", is: "3 × 10" }, videoUrl: null },
  { slug: "king_kneeling_knee_out", name: { en: "Kneeling knee-out", is: "Krjúpandi hné-út" }, track: "motor_control", target: { en: "Hip abductors / external rotators", is: "Mjaðma-fráfærslu / útsnúningsvöðvar" }, dose: { en: "3 × 12", is: "3 × 12" }, videoUrl: null },
  { slug: "king_iliopsoas_holds", name: { en: "Iliopsoas holds (single-leg)", is: "Iliopsoas-hald (einfætt)" }, track: "motor_control", target: { en: "Hip-flexor control", is: "Mjaðma-beygju stjórn" }, dose: { en: "3 × 8 (SL)", is: "3 × 8 (einf.)" }, videoUrl: null },
  { slug: "king_prone_fig4_knee_lift", name: { en: "Prone Fig-4 knee lift", is: "Fig-4 hné-lyfta á maga" }, track: "motor_control", target: { en: "Deep hip rotators / glute control", is: "Djúpir mjaðma-snúningar / glute-stjórn" }, dose: { en: "2 × 6", is: "2 × 6" }, videoUrl: null },
  { slug: "king_thoracic_rotation_partner", name: { en: "Thoracic rotation (partner press)", is: "Brjósthryggjar-snúningur (félagi ýtir)" }, track: "motor_control", target: { en: "Thoracic rotation mobility", is: "Brjósthryggjar-snúnings hreyfanleiki" }, dose: { en: "3 × 12", is: "3 × 12" }, videoUrl: null },
  { slug: "king_golf_swing_abs_rotation", name: { en: "Golf-swing abs rotation", is: "Golf-sveiflu kvið-snúningur" }, track: "motor_control", target: { en: "Rotational trunk control", is: "Snúnings búk-stjórn" }, dose: { en: "3 × 12", is: "3 × 12" }, videoUrl: null },
  { slug: "king_slrdl_foot_band", name: { en: "Single-leg RDL, foot band", is: "Einfætt RDL, teygja við fót" }, track: "motor_control", target: { en: "Posterior chain / balance (unilateral)", is: "Aftari keðja / jafnvægi (einhliða)" }, dose: { en: "3 × 8", is: "3 × 8" }, videoUrl: null },
  { slug: "king_sl_hip_thrust", name: { en: "Single-leg hip thrust", is: "Einfætt mjaðmaýta" }, track: "motor_control", target: { en: "Gluteus maximus / hip extension (unilateral)", is: "Gluteus maximus / mjaðma-rétta (einhliða)" }, dose: { en: "3 × 8", is: "3 × 8" }, videoUrl: null },
  { slug: "king_balloon_breathing", name: { en: "Balloon breathing", is: "Blöðru-öndun" }, track: "motor_control", target: { en: "Diaphragm / rib-cage position (trunk)", is: "Þind / rifbeina-staða (búkur)" }, dose: { en: "As prescribed", is: "Eftir fyrirmælum" }, videoUrl: null },
  { slug: "king_shoulder_shrug", name: { en: "Shoulder shrug", is: "Axla-ypping" }, track: "motor_control", target: { en: "Scapular / upper-trap control", is: "Herðablaðs- / efri-trap stjórn" }, dose: { en: "As prescribed", is: "Eftir fyrirmælum" }, videoUrl: null },
  { slug: "king_banded_calf_raise", name: { en: "Banded calf raise", is: "Kálfalyfta með teygju" }, track: "motor_control", target: { en: "Calf / ankle capacity", is: "Kálfi / ökkli geta" }, dose: { en: "As prescribed", is: "Eftir fyrirmælum" }, videoUrl: null },
  { slug: "king_posterior_cuff_side_lying", name: { en: "Posterior cuff, side-lying", is: "Aftari cuff, á hlið" }, track: "motor_control", target: { en: "Posterior rotator cuff", is: "Aftari snúnings-cuff" }, dose: { en: "As prescribed", is: "Eftir fyrirmælum" }, videoUrl: null },
  { slug: "king_step_up", name: { en: "Step-up", is: "Uppstig" }, track: "motor_control", target: { en: "Unilateral hip/knee control", is: "Einhliða mjaðma-/hné-stjórn" }, dose: { en: "As prescribed", is: "Eftir fyrirmælum" }, videoUrl: null },
  { slug: "king_wall_walk", name: { en: "Wall walk (shoulder)", is: "Veggur-ganga (öxl)" }, track: "motor_control", target: { en: "Scapular / shoulder control", is: "Herðablaðs- / axlar-stjórn" }, dose: { en: "As prescribed", is: "Eftir fyrirmælum" }, videoUrl: null },
  { slug: "king_thoracic_rotation_side_lying", name: { en: "Thoracic rotation, side-lying", is: "Brjósthryggjar-snúningur, á hlið" }, track: "motor_control", target: { en: "Thoracic rotation mobility", is: "Brjósthryggjar-snúnings hreyfanleiki" }, dose: { en: "As prescribed", is: "Eftir fyrirmælum" }, videoUrl: null },
  { slug: "king_kneeling_pelvic_tilt", name: { en: "2/3-point kneeling pelvic tilting", is: "2/3-punkta krjúpandi mjaðmagrindar-halli" }, track: "motor_control", target: { en: "Pelvic tilt / lumbo-pelvic control", is: "Mjaðmagrindar-halli / lendhryggs-stjórn" }, dose: { en: "As prescribed", is: "Eftir fyrirmælum" }, videoUrl: null },
  { slug: "king_balloon_abs", name: { en: "Balloon abs", is: "Blöðru-kviður" }, track: "motor_control", target: { en: "Deep abdominal / trunk control", is: "Djúp kvið- / búk-stjórn" }, dose: { en: "As prescribed", is: "Eftir fyrirmælum" }, videoUrl: null },
  { slug: "king_sl_toe_lifting", name: { en: "Single-leg toe lifting", is: "Einfætt tá-lyfta" }, track: "motor_control", target: { en: "Tibialis anterior / ankle control", is: "Tibialis anterior / ökkla-stjórn" }, dose: { en: "As prescribed", is: "Eftir fyrirmælum" }, videoUrl: null },
  { slug: "king_shoulder_cuff_side_lying", name: { en: "Shoulder cuff, side-lying", is: "Axlar-cuff, á hlið" }, track: "motor_control", target: { en: "Rotator cuff", is: "Snúnings-cuff" }, dose: { en: "As prescribed", is: "Eftir fyrirmælum" }, videoUrl: null },
  { slug: "king_tib_post_banded", name: { en: "Tibialis posterior, banded", is: "Tibialis posterior, með teygju" }, track: "motor_control", target: { en: "Tibialis posterior / foot control", is: "Tibialis posterior / fót-stjórn" }, dose: { en: "As prescribed", is: "Eftir fyrirmælum" }, videoUrl: null },
  { slug: "king_abs_rotation_shoulder_banded", name: { en: "Abs rotation, shoulder banded", is: "Kvið-snúningur, öxl með teygju" }, track: "motor_control", target: { en: "Rotational trunk control", is: "Snúnings búk-stjórn" }, dose: { en: "As prescribed", is: "Eftir fyrirmælum" }, videoUrl: null },
  { slug: "king_slrdl_hand_band", name: { en: "Single-leg RDL, hand band", is: "Einfætt RDL, teygja í hendi" }, track: "motor_control", target: { en: "Posterior chain / anti-rotation (unilateral)", is: "Aftari keðja / and-snúningur (einhliða)" }, dose: { en: "3 × 8", is: "3 × 8" }, videoUrl: null },

  // ── Run Mechanics / Plyometrics — activation ──
  { slug: "king_banded_fig4_hold", name: { en: "Banded Fig-4 hold", is: "Fig-4 hald með teygju" }, track: "run_mech", group: G.activation, target: { en: "Glute / hip stability (single-leg)", is: "Glute / mjaðma-stöðugleiki (einfætt)" }, dose: { en: "2 × 5", is: "2 × 5" }, videoUrl: null },
  { slug: "king_dl_pogos", name: { en: "Double-leg pogos", is: "Tvífætt pogos" }, track: "run_mech", group: G.activation, target: { en: "Ankle stiffness / reactive strength", is: "Ökkla-stífni / viðbragðsstyrkur" }, dose: { en: "2 × 10", is: "2 × 10" }, videoUrl: null },
  { slug: "king_alt_sl_pogos", name: { en: "Alternate / single-leg pogos", is: "Til skiptis / einfætt pogos" }, track: "run_mech", group: G.activation, target: { en: "Reactive strength (unilateral)", is: "Viðbragðsstyrkur (einhliða)" }, dose: { en: "2 × 10", is: "2 × 10" }, videoUrl: null },
  { slug: "king_dl_sl_drop_landings", name: { en: "Double- / single-leg drop landings", is: "Tví- / einfætt fall-lending" }, track: "run_mech", group: G.activation, target: { en: "Landing absorption / eccentric control", is: "Lendingar-deyfing / eccentric stjórn" }, dose: { en: "2 × 10", is: "2 × 10" }, videoUrl: null },

  // ── Run Mechanics / Plyometrics — plyo ──
  { slug: "king_line_hopping_side", name: { en: "Line hopping, side-to-side", is: "Línu-hopp, hlið-til-hliðar" }, track: "run_mech", group: G.plyo, target: { en: "Lateral reactive strength", is: "Hliðlægur viðbragðsstyrkur" }, dose: { en: "3 × 10", is: "3 × 10" }, videoUrl: null },
  { slug: "king_line_hopping_fwd_back", name: { en: "Line hopping, forward-back", is: "Línu-hopp, fram-aftur" }, track: "run_mech", group: G.plyo, target: { en: "Linear reactive strength", is: "Línulegur viðbragðsstyrkur" }, dose: { en: "3 × 10", is: "3 × 10" }, videoUrl: null },

  // ── Run Mechanics ──
  { slug: "king_banded_hiplock_switch", name: { en: "Banded hip-lock switch (knee straight)", is: "Banded hip-lock skipti (hné beint)" }, track: "run_mech", group: G.runMech, target: { en: "Hip-flexion / running posture", is: "Mjaðma-beygja / hlaupa-staða" }, dose: { en: "4 × 8", is: "4 × 8" }, videoUrl: null },
  { slug: "king_banded_hiplock_wall", name: { en: "Banded hip-lock wall drill", is: "Banded hip-lock vegg-æfing" }, track: "run_mech", group: G.runMech, target: { en: "Hip-flexion / running posture", is: "Mjaðma-beygja / hlaupa-staða" }, dose: { en: "4 × 8", is: "4 × 8" }, videoUrl: null },
  { slug: "king_banded_accel_box", name: { en: "Banded acceleration to box", is: "Banded hröðun að kassa" }, track: "run_mech", group: G.runMech, target: { en: "Acceleration mechanics", is: "Hröðunar-tækni" }, dose: { en: "As prescribed", is: "Eftir fyrirmælum" }, videoUrl: null },
  { slug: "king_banded_fwd_hop_stick", name: { en: "Banded forward hop & stick", is: "Banded fram-hopp & festa" }, track: "run_mech", group: G.runMech, target: { en: "Horizontal power / deceleration", is: "Láréttur kraftur / hemlun" }, dose: { en: "4 × 6", is: "4 × 6" }, videoUrl: null },
  { slug: "king_banded_lateral_pushoff", name: { en: "Banded lateral push-off", is: "Banded hliðlæg spyrna" }, track: "run_mech", group: G.runMech, target: { en: "Lateral push-off / change-of-direction", is: "Hliðlæg spyrna / stefnubreyting" }, dose: { en: "4 × 8", is: "4 × 8" }, videoUrl: null },
  { slug: "king_crossover_banded_step", name: { en: "Cross-over banded step", is: "Kross banded skref" }, track: "run_mech", group: G.runMech, target: { en: "Cross-over / change-of-direction mechanics", is: "Kross / stefnubreytinga-tækni" }, dose: { en: "4 × 8", is: "4 × 8" }, videoUrl: null },
  { slug: "king_oh_skipping_twist", name: { en: "Overhead skipping with a twist", is: "Yfirhöfuðs skipping með snúningi" }, track: "run_mech", group: G.runMech, target: { en: "Coordination / trunk rotation in gait", is: "Samhæfing / búk-snúningur í hlaupi" }, dose: { en: "4 × 6", is: "4 × 6" }, videoUrl: null },
  { slug: "king_strideouts_60m", name: { en: "Stride-outs, 60 m", is: "Stride-outs, 60 m" }, track: "run_mech", group: G.runMech, target: { en: "Sub-maximal running mechanics", is: "Undir-hámarks hlaupatækni" }, dose: { en: "60 m × 8 × 3 sets", is: "60 m × 8 × 3 sett" }, videoUrl: null },

  // ── Strength (Level 1) ──
  { slug: "king_sl_seated_cmj", name: { en: "Single-leg seated CMJ", is: "Einfætt sitjandi CMJ" }, track: "strength", target: { en: "Unilateral concentric power", is: "Einhliða concentric kraftur" }, dose: { en: "3 × 5 (20 → 30)", is: "3 × 5 (20 → 30)" }, videoUrl: null },
  { slug: "king_sl_landing", name: { en: "Single-leg landing", is: "Einfætt lending" }, track: "strength", target: { en: "Unilateral landing / eccentric control", is: "Einhliða lending / eccentric stjórn" }, dose: { en: "3 × 5 BW", is: "3 × 5 líkamsþyngd" }, videoUrl: null },
  { slug: "king_split_squat_bw", name: { en: "Split squat (bodyweight)", is: "Klofbeygja (líkamsþyngd)" }, track: "strength", target: { en: "Unilateral leg strength", is: "Einhliða fóta-styrkur" }, dose: { en: "3 × 8 BW", is: "3 × 8 líkamsþyngd" }, videoUrl: null },
  { slug: "king_split_stance_rdl", name: { en: "Split-stance RDL", is: "Klofstöðu RDL" }, track: "strength", target: { en: "Posterior chain (loaded)", is: "Aftari keðja (hlaðin)" }, dose: { en: "3 × 8 (50 kg)", is: "3 × 8 (50 kg)" }, videoUrl: null },
  { slug: "king_slrdl_jammer", name: { en: "Single-leg RDL, jammer", is: "Einfætt RDL, jammer" }, track: "strength", target: { en: "Posterior chain / balance (unilateral)", is: "Aftari keðja / jafnvægi (einhliða)" }, dose: { en: "4 × 8", is: "4 × 8" }, videoUrl: null },
  { slug: "king_press_up", name: { en: "Press-up", is: "Armbeygja" }, track: "strength", target: { en: "Upper-body / trunk", is: "Efri líkami / búkur" }, dose: { en: "3 × 8", is: "3 × 8" }, videoUrl: null },
  { slug: "king_calf_raise_seated", name: { en: "Seated calf raise", is: "Sitjandi kálfalyfta" }, track: "strength", target: { en: "Soleus / calf capacity", is: "Soleus / kálfa geta" }, dose: { en: "3 × 6 (40–50 kg)", is: "3 × 6 (40–50 kg)" }, videoUrl: null },
  { slug: "king_jammer_cable_row", name: { en: "Jammer / cable row", is: "Jammer / kaðal-róður" }, track: "strength", target: { en: "Posterior upper body / scapular", is: "Aftari efri líkami / herðablöð" }, dose: { en: "3 × 8", is: "3 × 8" }, videoUrl: null },
  { slug: "king_seated_knee_extension", name: { en: "Seated knee extension", is: "Sitjandi hné-rétta" }, track: "strength", target: { en: "Quadriceps (isolated)", is: "Framlæri (einangrað)" }, dose: { en: "3 × 8", is: "3 × 8" }, videoUrl: null },
  { slug: "king_leg_press_deep", name: { en: "Deep leg press", is: "Djúp fótpressa" }, track: "strength", target: { en: "Bilateral leg strength (deep ROM)", is: "Tvíhliða fóta-styrkur (djúpt ferðasvið)" }, dose: { en: "3 × 8", is: "3 × 8" }, videoUrl: null },
  { slug: "king_lateral_hip_banded_in_lunge", name: { en: "Lateral hip banded in-lunge", is: "Hliðlæg mjöðm banded in-lunge" }, track: "strength", target: { en: "Hip abductors / adductors in a lunge", is: "Mjaðma fráfærslu- / aðfærsluvöðvar í lunge" }, dose: { en: "3 × 8", is: "3 × 8" }, videoUrl: null },
];

export const KING_BY_SLUG: Record<string, KingExercise> = Object.fromEntries(KING_PROGRAM.map((e) => [e.slug, e]));

export function kingExercisesForTrack(track: KingTrack): KingExercise[] {
  return KING_PROGRAM.filter((e) => e.track === track);
}

/** The King weekly structure — three tracks running in parallel, with a load log. */
export const KING_WEEK_STRUCTURE: { label: Bi; detail: Bi } = {
  label: { en: "Weekly structure (Week 1 — off pitch)", is: "Vikuuppbygging (vika 1 — utan vallar)" },
  detail: {
    en: "Motor Control daily (am + pm) · Assessment Lab · Strength · Run Mechanics — the three tracks run in parallel. Log soreness (1–5) and RPE each session.",
    is: "Motor Control daglega (fh + eh) · Matslab · Styrkur · Hlaupatækni — þrír ferlar samhliða. Skráðu eymsli (1–5) og RPE hverja lotu.",
  },
};

export const KING_PROGRAM_CITATION = "Enda King rehabilitation program (Transition phase); King 2018 BJSM; Kotsifaki 2023 Aspetar ACL CPG (framework). Exercise names + doses are the transferable program; demonstration video files are not stored.";

/**
 * Movement-screen TEST CATALOGUE — the browsable menu of published movement-
 * quality / mobility / stability / balance / landing / hop assessments a coach
 * selects from. Grounded in the systematic-review evidence (Wijekulasuriya et al.
 * 2025, Sports Med-Open: 131 studies, 36 assessments), NOT proprietary systems.
 *
 * This is a lighter descriptor than a fully pose-instrumented MovementTest
 * (registry.ts) — most catalogue tests are coach-scored by eye/video (binary or
 * Likert), a few are pose-measurable. The instrumented tests (OHSA / SLDJ / hop)
 * are MEMBERS of this catalogue via `instrumentedSlug`.
 *
 * Evidence stance (encode on every entry): a screen identifies movement
 * characteristics that warrant further assessment or shape programming — it is
 * NOT a validated injury-prediction score (STRONG as a movement-quality /
 * programming target, WEAK as injury prediction). Composite scores are more
 * reliable than single-movement scores; rater experience + repeat count move the
 * confidence. Combine slow-bilateral + slow-unilateral + high-speed-bilateral +
 * high-speed-unilateral for a broad picture.
 *
 * Trademark: generic published tests are implemented with their standard
 * procedures; proprietary systems (FMS/SFMA/Y-Balance/AAA/MCS/MSST/FCS) are cited
 * as references, never reproduced or brand-badged — SEBT (open star-excursion
 * reach) is the in-product balance-reach. Screening/training only — not a
 * diagnosis, not the readiness colour; pain / red flags → clinician. Pure data.
 */
import type { Bi } from "./registry";

export type CatalogueCategory =
  | "squat_lower_limb"
  | "mobility"
  | "balance_motor_control"
  | "core_trunk"
  | "jump_landing"
  | "hop_agility"
  | "composite_system";

export type TestSpeed = "slow" | "high";
export type TestLaterality = "bilateral" | "unilateral" | "either";
/** How the test is scored (as the published assessments do). */
export type TestScoring = "binary" | "likert" | "composite" | "objective";

export type CatalogueTest = {
  slug: string;
  name: Bi;
  category: CatalogueCategory;
  speed: TestSpeed;
  laterality: TestLaterality;
  scoring: TestScoring;
  /** What the test screens for (plain, coach-facing). */
  screensFor: Bi;
  /** Can the pose pipeline read elements of it (else coach-scored by eye/video)? */
  poseMeasurable: boolean;
  /** Links to a fully instrumented MovementTest in registry.ts (a member). */
  instrumentedSlug?: string;
  /** Part of the shippable ~10–12-test "Standard movement screen". */
  defaultBattery?: boolean;
  /** Proprietary system — cite-only (do not reproduce/brand). Holds the note. */
  proprietary?: Bi;
  references: string;
};

export const CATALOGUE_CATEGORY_LABEL: Record<CatalogueCategory, Bi> = {
  squat_lower_limb: { en: "Squat / lower-limb (slow)", is: "Hnébeygja / neðri útlimir (hægt)" },
  mobility: { en: "Mobility", is: "Hreyfanleiki" },
  balance_motor_control: { en: "Balance / motor control", is: "Jafnvægi / hreyfistjórn" },
  core_trunk: { en: "Core / trunk / upper-body control", is: "Kjarni / búkur / efri-líkama stjórn" },
  jump_landing: { en: "Jumping / landing (high-speed bilateral)", is: "Stökk / lending (háhraði tvíhliða)" },
  hop_agility: { en: "Hop / agility (high-speed unilateral)", is: "Hopp / snerpa (háhraði einhliða)" },
  composite_system: { en: "Composite systems (reference)", is: "Samsett kerfi (til viðmiðunar)" },
};

export const CATALOGUE_SPEED_LABEL: Record<TestSpeed, Bi> = {
  slow: { en: "slow", is: "hægt" },
  high: { en: "high-speed", is: "háhraði" },
};
export const CATALOGUE_LATERALITY_LABEL: Record<TestLaterality, Bi> = {
  bilateral: { en: "bilateral", is: "tvíhliða" },
  unilateral: { en: "unilateral", is: "einhliða" },
  either: { en: "bi/unilateral", is: "tví-/einhliða" },
};
export const CATALOGUE_SCORING_LABEL: Record<TestScoring, Bi> = {
  binary: { en: "binary (pass/fail)", is: "tvíkosta (stenst/fellur)" },
  likert: { en: "Likert (graded)", is: "Likert (stigað)" },
  composite: { en: "composite score", is: "samsett skor" },
  objective: { en: "objective (distance/time)", is: "hlutlægt (lengd/tími)" },
};

/** The universal injury-prediction caveat carried by every screen. */
export const CATALOGUE_INJURY_CAVEAT: Bi = {
  en: "A movement-quality screen — it identifies characteristics for further assessment or programming, NOT a validated injury-risk score (strong as a movement/programming target, weak as injury prediction). Composite scores are more reliable than single-movement scores; confidence rises with rater experience + repeats. Pain / red flags → clinician. Never the readiness colour.",
  is: "Hreyfigæða-skimun — greinir eiginleika fyrir frekara mat eða þjálfun, EKKI staðfest meiðsla-áhættuskor (sterkt sem hreyfi-/þjálfunar-markmið, veikt sem meiðsla-spá). Samsett skor eru áreiðanlegri en stök-hreyfingar skor; öryggi eykst með reynslu matsmanns + endurtekningum. Verkur / rauð flögg → klíníker. Aldrei readiness-liturinn.",
};

export const CATALOGUE_REFERENCE = "Wijekulasuriya et al. 2025 (Sports Med-Open, movement-quality assessment systematic review, 131 studies / 36 assessments); FMS/SFMA (Cook et al.), Y-Balance/SEBT, LESS (Padua et al.), LEFT, MSST/MCS/AAA/FCS as named references.";

type Opt = { pose?: boolean; instrumentedSlug?: string; def?: boolean; proprietary?: Bi; ref?: string };
const t = (
  slug: string, en: string, is: string,
  category: CatalogueCategory, speed: TestSpeed, laterality: TestLaterality, scoring: TestScoring,
  screenEn: string, screenIs: string, opt: Opt = {},
): CatalogueTest => ({
  slug, name: { en, is }, category, speed, laterality, scoring,
  screensFor: { en: screenEn, is: screenIs },
  poseMeasurable: !!opt.pose,
  instrumentedSlug: opt.instrumentedSlug,
  defaultBattery: opt.def,
  proprietary: opt.proprietary,
  references: opt.ref ?? "Wijekulasuriya 2025 (systematic review)",
});

const PROP = (name: string): Bi => ({
  en: `${name} is a proprietary/branded system — cited as a reference; MicroPulse does not reproduce its manual/scoring or brand a feature with it.`,
  is: `${name} er sérstætt/vörumerkt kerfi — vitnað til viðmiðunar; MicroPulse endurgerir ekki handbók/skor þess né merkir eiginleika með því.`,
});

export const TEST_CATALOGUE: CatalogueTest[] = [
  // ── Squat / lower-limb (slow) ──
  t("overhead_squat", "Overhead squat", "Yfirhöfuð-hnébeygja", "squat_lower_limb", "slow", "bilateral", "likert", "Whole-chain movement quality — ankle/knee/hip/trunk/shoulder compensations.", "Heildar-hreyfigæði — ökkla/hné/mjaðma/búk/axla uppbætur.", { pose: true, instrumentedSlug: "overhead_squat_assessment", def: true }),
  t("bodyweight_deep_squat", "Bodyweight / deep squat", "Líkamsþyngd / djúp hnébeygja", "squat_lower_limb", "slow", "bilateral", "likert", "Squat depth, ankle DF, hip/trunk control.", "Hnébeygju-dýpt, ökkla-DF, mjaðma-/búk-stjórn.", {}),
  t("single_leg_squat", "Single-leg squat", "Einfætt hnébeygja", "squat_lower_limb", "slow", "unilateral", "likert", "Frontal-plane control — dynamic valgus, pelvic drop, side-to-side.", "Frontal-plana stjórn — dynamic valgus, mjaðmagrindar-fall, hlið-við-hlið.", { pose: true, def: true }),
  t("pistol_squat", "Pistol squat", "Pistol-hnébeygja", "squat_lower_limb", "slow", "unilateral", "likert", "Deep single-leg strength + control + mobility.", "Djúpur einfættur styrkur + stjórn + hreyfanleiki.", {}),
  t("squat_to_box", "Squat to box", "Hnébeygja á kassa", "squat_lower_limb", "slow", "bilateral", "likert", "Depth-standardised squat control.", "Dýptar-stöðluð hnébeygju-stjórn.", {}),
  t("step_down_forward", "Forward step-down", "Fram-niðurstig", "squat_lower_limb", "slow", "unilateral", "likert", "Eccentric single-leg control + valgus at a set height.", "Eccentric einfætt stjórn + valgus við fasta hæð.", { pose: true }),
  t("step_down_lateral", "Lateral step-down", "Hliðar-niðurstig", "squat_lower_limb", "slow", "unilateral", "likert", "Frontal-plane eccentric control.", "Frontal-plana eccentric stjórn.", {}),
  t("split_squat", "Split squat", "Klofbeygja", "squat_lower_limb", "slow", "unilateral", "likert", "Unilateral strength + trunk position.", "Einhliða styrkur + búk-staða.", {}),
  t("inline_lunge", "Inline lunge", "Inline lunge", "squat_lower_limb", "slow", "unilateral", "likert", "Split-stance stability, hip/ankle mobility, trunk control.", "Klofstöðu stöðugleiki, mjaðma-/ökkla-hreyfanleiki, búk-stjórn.", { def: true }),
  t("forward_lunge", "Forward lunge", "Fram-lunge", "squat_lower_limb", "slow", "unilateral", "likert", "Anterior loading control + valgus.", "Fremra álags-stjórn + valgus.", {}),
  t("reverse_lunge", "Reverse lunge", "Aftur-lunge", "squat_lower_limb", "slow", "unilateral", "likert", "Posterior-step control, less knee shear.", "Aftur-skref stjórn, minna hné-skrið.", {}),
  t("lateral_lunge", "Lateral lunge", "Hliðar-lunge", "squat_lower_limb", "slow", "unilateral", "likert", "Frontal-plane loading + adductor length.", "Frontal-plana álag + aðfærslu-lengd.", {}),
  t("crossover_lunge", "Crossover lunge", "Kross-lunge", "squat_lower_limb", "slow", "unilateral", "likert", "Transverse-plane control.", "Transverse-plana stjórn.", {}),
  t("walking_lunge", "Walking lunge", "Göngu-lunge", "squat_lower_limb", "slow", "unilateral", "likert", "Dynamic unilateral control over reps.", "Dýnamísk einhliða stjórn yfir endurtekningar.", {}),
  t("single_leg_rdl", "Single-leg RDL", "Einfætt RDL", "squat_lower_limb", "slow", "unilateral", "likert", "Hip-hinge control + posterior-chain + balance.", "Mjaðma-hinge stjórn + aftari keðja + jafnvægi.", {}),

  // ── Mobility ──
  t("knee_to_wall", "Weight-bearing lunge (knee-to-wall)", "Álags-lunge (hné-að-vegg)", "mobility", "slow", "unilateral", "objective", "Ankle dorsiflexion ROM (L vs R).", "Ökkla-dorsiflexion ferðasvið (H vs V).", { def: true }),
  t("active_slr", "Active straight-leg raise", "Virk beinfótar-lyfta", "mobility", "slow", "unilateral", "likert", "Hamstring length + lumbopelvic control.", "Aftanlæris-lengd + lendhryggs-mjaðmagrindar stjórn.", { def: true }),
  t("passive_slr", "Passive straight-leg raise", "Óvirk beinfótar-lyfta", "mobility", "slow", "unilateral", "objective", "Passive hamstring / posterior-chain length.", "Óvirk aftanlæris- / aftari-keðju lengd.", {}),
  t("thomas_test", "Thomas test", "Thomas-próf", "mobility", "slow", "unilateral", "binary", "Hip-flexor / rectus femoris length.", "Mjaðma-beygju / rectus femoris lengd.", {}),
  t("modified_thomas", "Modified Thomas test", "Breytt Thomas-próf", "mobility", "slow", "unilateral", "likert", "Hip-flexor, rec fem + TFL length differential.", "Mjaðma-beygju, rec fem + TFL lengdar-munur.", {}),
  t("hip_ir_er", "Hip internal / external rotation", "Mjaðma inn- / útsnúningur", "mobility", "slow", "either", "objective", "Hip rotational range (FAI / capsular limits).", "Mjaðma-snúnings ferðasvið (FAI / hulsu takmörk).", { def: true }),
  t("hip_flexion_extension", "Hip flexion / extension ROM", "Mjaðma beygja / rétta ferðasvið", "mobility", "slow", "either", "objective", "Sagittal hip range.", "Sagittal mjaðma-ferðasvið.", {}),
  t("faber", "FABER (Patrick)", "FABER (Patrick)", "mobility", "slow", "unilateral", "binary", "Hip / SIJ mobility + provocation.", "Mjaðma / spjaldliðs hreyfanleiki + framköllun.", {}),
  t("shoulder_flexion_overhead", "Shoulder flexion / overhead reach", "Axlar-beygja / yfirhöfuðs teygja", "mobility", "slow", "either", "likert", "Overhead shoulder mobility (drives OHSA arm drop).", "Yfirhöfuðs axlar-hreyfanleiki (veldur OHSA arm-falli).", { def: true }),
  t("shoulder_ir_er", "Shoulder internal / external rotation", "Axlar inn- / útsnúningur", "mobility", "slow", "either", "objective", "Cuff range; GIRD in overhead athletes.", "Cuff ferðasvið; GIRD hjá yfirhöfuðs íþróttamönnum.", {}),
  t("shoulder_combined_reach", "Combined shoulder reach (Apley-style)", "Samsett axlar-teygja (Apley-stíl)", "mobility", "slow", "either", "likert", "Combined shoulder mobility L vs R.", "Samsettur axlar-hreyfanleiki H vs V.", {}),
  t("thoracic_rotation", "Thoracic rotation", "Brjósthryggjar-snúningur", "mobility", "slow", "either", "objective", "Thoracic rotation range (limits overhead + rotation).", "Brjósthryggjar-snúnings ferðasvið (takmarkar yfirhöfuðs + snúning).", { def: true }),
  t("thoracic_extension", "Thoracic extension", "Brjósthryggjar-rétta", "mobility", "slow", "bilateral", "likert", "Thoracic extension mobility.", "Brjósthryggjar-réttu hreyfanleiki.", {}),
  t("cervical_rom", "Cervical ROM", "Hálshryggjar ferðasvið", "mobility", "slow", "either", "objective", "Neck range (flexion/extension/rotation/side-flexion).", "Háls-ferðasvið (beygja/rétta/snúningur/hliðar-beygja).", {}),
  t("multisegmental_flexion", "Multi-segmental flexion", "Fjöl-liða beygja", "mobility", "slow", "bilateral", "likert", "Whole-chain forward-bend mobility.", "Heildar-keðju fram-beygju hreyfanleiki.", {}),
  t("multisegmental_extension", "Multi-segmental extension", "Fjöl-liða rétta", "mobility", "slow", "bilateral", "likert", "Whole-chain backward-bend mobility.", "Heildar-keðju aftur-beygju hreyfanleiki.", {}),
  t("multisegmental_rotation", "Multi-segmental rotation", "Fjöl-liða snúningur", "mobility", "slow", "either", "likert", "Whole-chain rotational mobility.", "Heildar-keðju snúnings-hreyfanleiki.", {}),

  // ── Balance / motor control ──
  t("sebt_lower", "Star Excursion Balance Test (lower quarter)", "Star Excursion jafnvægispróf (neðri)", "balance_motor_control", "slow", "unilateral", "objective", "Dynamic single-leg reach + symmetry (open Y-Balance analogue).", "Dýnamísk einfætt teygja + samhverfa (opinn Y-Balance hliðstæða).", { def: true, ref: "SEBT (open); reference: Y-Balance Test (proprietary productised version)" }),
  t("y_balance", "Y-Balance Test", "Y-Balance próf", "balance_motor_control", "slow", "unilateral", "composite", "Productised SEBT (3-direction reach). Use the open SEBT in-product.", "Vöruvædd SEBT (3-átta teygja). Notaðu opna SEBT í vörunni.", { proprietary: PROP("Y-Balance Test®"), ref: "Y-Balance Test (Functional Movement Systems) — reference" }),
  t("sebt_upper", "Upper-quarter Y-Balance / reach", "Efri-fjórðungs jafnvægis-teygja", "balance_motor_control", "slow", "unilateral", "objective", "Shoulder-girdle stability + reach symmetry.", "Axlar-grindar stöðugleiki + teygju-samhverfa.", {}),
  t("single_leg_stance", "Single-leg stance", "Einfætt staða", "balance_motor_control", "slow", "unilateral", "likert", "Static single-leg balance (eyes open/closed).", "Kyrrstöðu einfætt jafnvægi (augu opin/lokuð).", {}),
  t("tandem_stance", "Tandem stance", "Tandem staða", "balance_motor_control", "slow", "bilateral", "likert", "Narrow-base static balance.", "Mjó-grunn kyrrstöðu jafnvægi.", {}),
  t("bess", "Balance Error Scoring System (BESS)", "BESS jafnvægis-skor", "balance_motor_control", "slow", "either", "composite", "Standardised static-balance error count (open).", "Staðlað kyrrstöðu-villu talning (opið).", {}),
  t("modified_bess", "Modified BESS", "Breytt BESS", "balance_motor_control", "slow", "either", "composite", "Shortened balance-error battery.", "Stytt jafnvægis-villu prófun.", {}),
  t("dynamic_leap_and_balance", "Dynamic leap-and-balance", "Dýnamískt stökk-og-jafnvægi", "balance_motor_control", "high", "unilateral", "likert", "Leap → land → stabilise control.", "Stökk → lending → stöðgun stjórn.", {}),
  t("motor_control_screen", "Motor Control Screen (MCS)", "Motor Control Screen (MCS)", "balance_motor_control", "slow", "either", "composite", "Cite-only proprietary motor-control battery.", "Aðeins tilvísun — sérstætt hreyfistjórnar kerfi.", { proprietary: PROP("Motor Control Screen (MCS)") }),

  // ── Core / trunk / upper-body control ──
  t("trunk_stability_pushup", "Trunk-stability push-up", "Búk-stöðugleika armbeygja", "core_trunk", "slow", "bilateral", "likert", "Anti-extension trunk stability under an upper-body press.", "And-réttu búk-stöðugleiki undir efri-líkama ýtu.", { def: true }),
  t("pushup", "Push-up (capacity)", "Armbeygja (geta)", "core_trunk", "slow", "bilateral", "objective", "Upper-body + trunk pressing capacity.", "Efri-líkama + búk ýtu-geta.", {}),
  t("rotary_stability_bird_dog", "Rotary stability / bird-dog", "Snúnings-stöðugleiki / bird-dog", "core_trunk", "slow", "unilateral", "likert", "Contralateral trunk anti-rotation control.", "Gagnlæg búk and-snúnings stjórn.", {}),
  t("plank", "Plank", "Planki", "core_trunk", "slow", "bilateral", "objective", "Anterior trunk endurance.", "Fremra búk-úthald.", {}),
  t("side_plank", "Side plank / side-bridge (± hip abduction)", "Hliðarplanki / hliðar-brú (± mjaðma-fráfærsla)", "core_trunk", "slow", "unilateral", "objective", "Lateral trunk + hip-abductor endurance.", "Hliðar-búkur + mjaðma-fráfærslu úthald.", {}),
  t("bridge", "Glute bridge", "Rassbrú", "core_trunk", "slow", "bilateral", "likert", "Posterior-chain activation + control.", "Aftari-keðju virkjun + stjórn.", {}),
  t("single_leg_bridge", "Single-leg bridge", "Einfætt rassbrú", "core_trunk", "slow", "unilateral", "objective", "Unilateral posterior-chain capacity + symmetry.", "Einhliða aftari-keðju geta + samhverfa.", {}),
  t("bridge_leg_extension", "Bridge with leg extension", "Rassbrú með fótréttu", "core_trunk", "slow", "unilateral", "likert", "Pelvic-control challenge under a moving limb.", "Mjaðmagrindar-stjórnar áskorun undir hreyfðum fæti.", {}),
  t("prone_hip_extension", "Prone hip extension", "Mjaðma-rétta á maga", "core_trunk", "slow", "unilateral", "likert", "Glute-vs-hamstring firing pattern.", "Glute-vs-aftanlæris virkjunar-mynstur.", {}),
  t("ckc_upper_extremity", "CKC upper-extremity stability", "CKC efri-útlima stöðugleiki", "core_trunk", "slow", "either", "objective", "Closed-chain shoulder-girdle stability.", "Lokaðrar-keðju axlar-grindar stöðugleiki.", {}),
  t("loaded_carry", "Loaded / farmer carry", "Hlaðin / farmer-burður", "core_trunk", "slow", "either", "objective", "Loaded trunk + grip + gait integrity.", "Hlaðið búk + grip + göngu-heilleiki.", {}),

  // ── Jumping / landing (high-speed bilateral) ──
  t("less", "Landing Error Scoring System (LESS)", "LESS lendingar-villu skor", "jump_landing", "high", "bilateral", "composite", "Jump-landing mechanics (open scoring) — valgus, trunk, depth. Scored on the drop vertical jump.", "Stökk-lendingar tækni (opið skor) — valgus, búkur, dýpt. Skorað á fall-lóðstökkinu.", { pose: true, ref: "Padua et al. (LESS, open scoring)" }),
  t("drop_vertical_jump", "Drop vertical jump", "Fall-lóðstökk", "jump_landing", "high", "bilateral", "likert", "Bilateral landing valgus + absorption (LESS-scorable).", "Tvíhliða lendingar-valgus + deyfing (LESS-skoranlegt).", { pose: true, def: true }),
  t("drop_jump_screen", "Drop-jump screen", "Fall-stökk skimun", "jump_landing", "high", "bilateral", "likert", "Reactive landing + re-jump quality.", "Viðbragðs-lending + endurstökk gæði.", { pose: true }),
  t("cmj", "Countermovement jump (CMJ)", "Gagnhreyfingar-stökk (CMJ)", "jump_landing", "high", "bilateral", "objective", "Concentric jump output (force-plate elsewhere).", "Concentric stökk-afköst (kraftplata annars staðar).", {}),
  t("squat_jump", "Squat jump", "Hnébeygju-stökk", "jump_landing", "high", "bilateral", "objective", "Concentric-only jump output (no SSC).", "Aðeins-concentric stökk-afköst (engin SSC).", {}),
  t("broad_jump", "Broad (standing long) jump", "Langstökk (kyrrstöðu)", "jump_landing", "high", "bilateral", "objective", "Horizontal power + landing control.", "Láréttur kraftur + lendingar-stjórn.", {}),
  t("single_leg_landing", "Single-leg landing", "Einfætt lending", "jump_landing", "high", "unilateral", "likert", "Unilateral landing valgus + absorption.", "Einhliða lendingar-valgus + deyfing.", { pose: true, instrumentedSlug: "single_leg_drop_jump" }),
  t("bilateral_to_unilateral_landing", "Bilateral jump → unilateral landing", "Tvíhliða stökk → einhliða lending", "jump_landing", "high", "unilateral", "likert", "Landing-limb control under a bilateral take-off.", "Lendingar-fótar stjórn undir tvíhliða spyrnu.", { pose: true }),
  t("repeated_jump", "Repeated jump", "Endurtekið stökk", "jump_landing", "high", "bilateral", "objective", "Fatigue-resistance of landing quality.", "Þreytu-þol lendingar-gæða.", {}),
  t("tuck_jump", "Tuck-jump assessment", "Tuck-jump mat", "jump_landing", "high", "bilateral", "composite", "Repeated-jump technique flaws (valgus, asymmetry, fatigue).", "Endurtekins-stökks tækni-gallar (valgus, ósamhverfa, þreyta).", { pose: true }),

  // ── Hop / agility (high-speed unilateral) ──
  t("single_hop_distance", "Single hop for distance", "Einfætt lengdarhopp", "hop_agility", "high", "unilateral", "objective", "Unilateral horizontal power + limb symmetry.", "Einhliða láréttur kraftur + útlima-samhverfa.", { pose: true, instrumentedSlug: "hop_for_distance", def: false }),
  t("triple_hop", "Triple hop for distance", "Þrefalt lengdarhopp", "hop_agility", "high", "unilateral", "objective", "Repeated unilateral power + symmetry.", "Endurtekinn einhliða kraftur + samhverfa.", {}),
  t("crossover_hop", "Crossover hop", "Kross-hopp", "hop_agility", "high", "unilateral", "objective", "Frontal-plane hop control + symmetry.", "Frontal-plana hopp-stjórn + samhverfa.", {}),
  t("six_m_timed_hop", "6-m timed hop", "6-m tímasett hopp", "hop_agility", "high", "unilateral", "objective", "Unilateral hop speed + symmetry.", "Einhliða hopp-hraði + samhverfa.", {}),
  t("lateral_hop", "Lateral / side hop", "Hliðar-hopp", "hop_agility", "high", "unilateral", "objective", "Frontal-plane reactive hop + control.", "Frontal-plana viðbragðs-hopp + stjórn.", {}),
  t("vertical_hop", "Single-leg vertical hop", "Einfætt lóð-hopp", "hop_agility", "high", "unilateral", "objective", "Unilateral vertical output + symmetry.", "Einhliða lóðrétt afköst + samhverfa.", {}),
  t("single_leg_hop_and_stick", "Single-leg hop-and-stick", "Einfætt hopp-og-festa", "hop_agility", "high", "unilateral", "likert", "Landing control + time-to-stabilise on one leg.", "Lendingar-stjórn + stöðgunartími á einum fæti.", { pose: true, def: true }),
  t("repeated_hop", "Repeated hop", "Endurtekið hopp", "hop_agility", "high", "unilateral", "objective", "Reactive-strength fatigue on one leg.", "Viðbragðsstyrks-þreyta á einum fæti.", {}),
  t("figure_8_hop", "Figure-8 hop", "Átta-hopp", "hop_agility", "high", "unilateral", "objective", "Change-of-direction hop control + speed.", "Stefnubreytinga hopp-stjórn + hraði.", {}),
  t("left", "Lower Extremity Functional Test (LEFT)", "LEFT neðri-útlima starfspróf", "hop_agility", "high", "either", "objective", "Multidirectional running-agility capacity (open).", "Fjöl-átta hlaupa-snerpu geta (opið).", {}),
  t("cod_mechanics", "Cutting / change-of-direction mechanics", "Cut / stefnubreytinga-tækni", "hop_agility", "high", "unilateral", "likert", "Deceleration + cut mechanics (valgus, trunk, plant).", "Hemlun + cut-tækni (valgus, búkur, plöntun).", { pose: true }),

  // ── Composite systems (reference-level, cite-only) ──
  t("fms", "Functional Movement Screen (FMS)", "Functional Movement Screen (FMS)", "composite_system", "slow", "either", "composite", "7 patterns scored 0–3 — cite-only; use the generic tests in-product.", "7 mynstur skoruð 0–3 — aðeins tilvísun; notaðu almennu prófin í vörunni.", { proprietary: PROP("FMS®"), ref: "Cook et al. — FMS (reference)" }),
  t("sfma", "Selective Functional Movement Assessment (SFMA)", "SFMA", "composite_system", "slow", "either", "composite", "Clinical, pain-present breakout system — cite-only, clinician tool.", "Klínískt, verkja-nærverandi kerfi — aðeins tilvísun, klíníker-tól.", { proprietary: PROP("SFMA®"), ref: "Cook et al. — SFMA (reference)" }),
  t("msst", "Movement Screening / Soccer Test (MSST)", "MSST", "composite_system", "slow", "either", "composite", "Named composite battery — cite-only.", "Nefnd samsett prófun — aðeins tilvísun.", { proprietary: PROP("MSST") }),
  t("athletic_ability_assessment", "Athletic Ability Assessment (AAA)", "Athletic Ability Assessment (AAA)", "composite_system", "slow", "either", "composite", "Named composite battery — cite-only.", "Nefnd samsett prófun — aðeins tilvísun.", { proprietary: PROP("AAA") }),
  t("fundamental_capacity_screen", "Fundamental Capacity Screen (FCS)", "Fundamental Capacity Screen (FCS)", "composite_system", "slow", "either", "composite", "Named capacity battery — cite-only.", "Nefnd getu-prófun — aðeins tilvísun.", { proprietary: PROP("FCS") }),
];

export const CATALOGUE_BY_SLUG: Record<string, CatalogueTest> = Object.fromEntries(TEST_CATALOGUE.map((x) => [x.slug, x]));

const CATEGORY_ORDER: CatalogueCategory[] = ["squat_lower_limb", "mobility", "balance_motor_control", "core_trunk", "jump_landing", "hop_agility", "composite_system"];

/** Catalogue grouped by category (display order). */
export function catalogueByCategory(): Array<{ category: CatalogueCategory; tests: CatalogueTest[] }> {
  return CATEGORY_ORDER
    .map((category) => ({ category, tests: TEST_CATALOGUE.filter((x) => x.category === category) }))
    .filter((g) => g.tests.length > 0);
}

/** The shippable ~10–12-test "Standard movement screen" (broad breadth). */
export function defaultBattery(): CatalogueTest[] {
  return TEST_CATALOGUE.filter((x) => x.defaultBattery);
}

// ─────────────────────────────────────────────────────────────────────────────
// OPERATIONAL LAYER — observation → hypothesis → confirmation.
// A movement deviation does NOT prove a muscle is weak/tight; it opens a
// HYPOTHESIS to confirm with a more specific test. Every result is tagged across
// 8 domains so one deviation is not collapsed into a single "weak glute". Visual
// movement classifications have variable reliability — never a standalone
// diagnosis or injury predictor.
// ─────────────────────────────────────────────────────────────────────────────

/** The 8 result domains a finding is tagged across (brief §data-model). */
export type ResultDomain =
  | "pain" | "mobility" | "movement_quality" | "motor_control"
  | "balance" | "strength" | "asymmetry" | "power_reactive";

export const DOMAIN_LABEL: Record<ResultDomain, Bi> = {
  pain: { en: "Pain / symptoms", is: "Verkur / einkenni" },
  mobility: { en: "Mobility / ROM", is: "Hreyfanleiki / ferðasvið" },
  movement_quality: { en: "Movement quality", is: "Hreyfigæði" },
  motor_control: { en: "Motor control", is: "Hreyfistjórn" },
  balance: { en: "Balance / stability", is: "Jafnvægi / stöðugleiki" },
  strength: { en: "Strength / capacity", is: "Styrkur / geta" },
  asymmetry: { en: "Left–right asymmetry", is: "Hægri–vinstri ósamhverfa" },
  power_reactive: { en: "Speed / power / reactive", is: "Hraði / kraftur / viðbragð" },
};

/** A canonical deficit the ledger aggregates observations into (across tests). */
export type DeficitKey =
  | "frontal_valgus_control" | "hip_abductor_control" | "ankle_dorsiflexion"
  | "posterior_chain_length" | "hip_rotation_mobility" | "thoracic_shoulder_mobility"
  | "trunk_core_control" | "landing_mechanics" | "unilateral_reactive_control"
  | "eccentric_control" | "dynamic_single_leg_control";

export const DEFICIT_LABEL: Record<DeficitKey, Bi> = {
  frontal_valgus_control: { en: "Frontal-plane knee control (valgus)", is: "Frontal-plana hné-stjórn (valgus)" },
  hip_abductor_control: { en: "Hip-abductor / pelvic control (glute med)", is: "Mjaðma-fráfærslu / mjaðmagrindar stjórn (glute med)" },
  ankle_dorsiflexion: { en: "Ankle dorsiflexion", is: "Ökkla-dorsiflexion" },
  posterior_chain_length: { en: "Posterior-chain / hamstring length", is: "Aftari-keðju / aftanlæris lengd" },
  hip_rotation_mobility: { en: "Hip-rotation mobility", is: "Mjaðma-snúnings hreyfanleiki" },
  thoracic_shoulder_mobility: { en: "Thoracic / shoulder mobility", is: "Brjósthryggjar / axlar hreyfanleiki" },
  trunk_core_control: { en: "Trunk / core control", is: "Búk / kjarna stjórn" },
  landing_mechanics: { en: "Landing mechanics", is: "Lendingar-tækni" },
  unilateral_reactive_control: { en: "Unilateral reactive control / LSI", is: "Einhliða viðbragðs-stjórn / LSI" },
  eccentric_control: { en: "Eccentric control", is: "Eccentric stjórn" },
  dynamic_single_leg_control: { en: "Dynamic single-leg control", is: "Dýnamísk einfætt stjórn" },
};

/** One observable deviation: what it may investigate (hypothesis) + confirmation. */
export type Observation = {
  key: string;
  observation: Bi;
  /** The hypothesis/-es the deviation opens — NOT a diagnosis. */
  investigate: Bi;
  /** Catalogue slugs (+ a couple of built-in confirmation moves) to run next. */
  confirmationTests: string[];
  /** The canonical deficit this observation contributes to (ledger aggregation). */
  deficitKey: DeficitKey;
  domains: ResultDomain[];
  poseMeasurable?: boolean;
  /** Recorded per L/R side. */
  sided?: boolean;
};

export type TestOperational = { challenges: Bi; observations: Observation[] };

const CONFIRM_HEEL_ELEVATED = "heel_elevated_squat_retest"; // built-in confirmation move
const CONFIRM_ISOLATED_HIP = "isolated_hip_abductor_strength"; // built-in confirmation move

const o = (
  key: string, obEn: string, obIs: string, invEn: string, invIs: string,
  deficitKey: DeficitKey, domains: ResultDomain[], confirmationTests: string[],
  opt: { pose?: boolean; sided?: boolean } = {},
): Observation => ({
  key, observation: { en: obEn, is: obIs }, investigate: { en: invEn, is: invIs },
  confirmationTests, deficitKey, domains, poseMeasurable: opt.pose, sided: opt.sided,
});

/** Operational layer for the default battery (extensible — new tests add a row). */
export const TEST_OPERATIONAL: Record<string, TestOperational> = {
  overhead_squat: {
    challenges: { en: "Integrated ankle / knee / hip / pelvis / trunk / thoracic / shoulder under a bilateral overhead squat.", is: "Samþætt ökkli / hné / mjöðm / mjaðmagrind / búkur / brjósthryggur / öxl undir tvíhliða yfirhöfuðs-hnébeygju." },
    observations: [
      o("knees_inward", "Knees move inward (valgus)", "Hné fara inn (valgus)", "Frontal-plane hip / knee / foot control — hip-abductor/ER capacity, ankle DF, foot mechanics", "Frontal-plana mjaðma / hné / fót stjórn — mjaðma-fráfærsla/ER geta, ökkla-DF, fót-vélbúnaður", "frontal_valgus_control", ["movement_quality", "motor_control", "strength"], ["hip_ir_er", "knee_to_wall", "sebt_lower", "single_leg_landing", CONFIRM_ISOLATED_HIP], { pose: true, sided: true }),
      o("forward_lean", "Excessive forward trunk lean", "Óhóflegur framhalli búks", "Ankle-dorsiflexion restriction and/or hip-mobility / posterior-chain — not a single cause", "Skert ökkla-dorsiflexion og/eða mjaðma-hreyfanleiki / aftari keðja — ekki ein orsök", "ankle_dorsiflexion", ["mobility", "movement_quality"], ["knee_to_wall", "thomas_test", CONFIRM_HEEL_ELEVATED], { pose: true }),
      o("heel_rise", "Heels rise / weight shifts forward", "Hælar lyftast / þyngd færist fram", "Ankle-dorsiflexion ROM", "Ökkla-dorsiflexion ferðasvið", "ankle_dorsiflexion", ["mobility"], ["knee_to_wall", CONFIRM_HEEL_ELEVATED], { sided: true }),
      o("arms_fall_forward", "Arms fall forward", "Handleggir falla fram", "Thoracic / latissimus / shoulder mobility", "Brjósthryggjar / latissimus / axlar hreyfanleiki", "thoracic_shoulder_mobility", ["mobility"], ["shoulder_flexion_overhead", "thoracic_rotation"]),
    ],
  },
  single_leg_squat: {
    challenges: { en: "Single-leg frontal-plane control, eccentric depth, and left–right symmetry.", is: "Einfætt frontal-plana stjórn, eccentric dýpt og hægri–vinstri samhverfa." },
    observations: [
      o("medial_knee_valgus", "Medial knee displacement (valgus)", "Miðlægt hné-hrun (valgus)", "Hip strength/control, hip ROM, ankle DF, foot mechanics, balance, fatigue", "Mjaðma-styrkur/stjórn, mjaðma-ROM, ökkla-DF, fót-vélbúnaður, jafnvægi, þreyta", "frontal_valgus_control", ["movement_quality", "motor_control", "strength"], ["hip_ir_er", "knee_to_wall", "sebt_lower", "single_leg_landing", CONFIRM_ISOLATED_HIP], { pose: true, sided: true }),
      o("pelvic_drop", "Contralateral pelvic drop (Trendelenburg)", "Gagnlægt mjaðmagrindar-fall (Trendelenburg)", "Hip-abductor strength/capacity + trunk strategy + balance", "Mjaðma-fráfærslu styrkur/geta + búk-stefna + jafnvægi", "hip_abductor_control", ["strength", "motor_control", "balance"], ["sebt_lower", "single_leg_hop_and_stick", CONFIRM_ISOLATED_HIP], { pose: true, sided: true }),
      o("trunk_shift", "Trunk lean / shift over the stance leg", "Búk-halli / færsla yfir standfót", "Trunk-control strategy", "Búk-stjórnar stefna", "trunk_core_control", ["motor_control"], ["trunk_stability_pushup"], { sided: true }),
      o("poor_depth_control", "Poor eccentric depth / control", "Léleg eccentric dýpt / stjórn", "Eccentric control + capacity", "Eccentric stjórn + geta", "eccentric_control", ["motor_control", "strength"], ["step_down_forward"], { sided: true }),
    ],
  },
  inline_lunge: {
    challenges: { en: "Split-stance stability, front-knee tracking, hip/ankle mobility, trunk & pelvis control.", is: "Klofstöðu stöðugleiki, fram-hné rakning, mjaðma-/ökkla-hreyfanleiki, búk- og mjaðmagrindar stjórn." },
    observations: [
      o("front_knee_valgus", "Front-knee valgus / poor tracking", "Fram-hné valgus / léleg rakning", "Frontal/transverse hip-knee-foot control", "Frontal/transverse mjaðma-hné-fót stjórn", "frontal_valgus_control", ["movement_quality", "motor_control"], ["hip_ir_er", "knee_to_wall", "single_leg_squat"], { pose: true, sided: true }),
      o("trunk_pelvis_loss", "Loss of trunk / pelvis control", "Tap á búk- / mjaðmagrindar stjórn", "Trunk / anti-rotation control", "Búk / and-snúnings stjórn", "trunk_core_control", ["motor_control", "balance"], ["trunk_stability_pushup"], { sided: true }),
      o("restricted_depth", "Restricted depth / hip stiffness", "Skert dýpt / mjaðma-stífni", "Hip-rotation / ankle mobility restriction", "Mjaðma-snúnings / ökkla hreyfanleika skerðing", "hip_rotation_mobility", ["mobility"], ["hip_ir_er", "knee_to_wall"], { sided: true }),
    ],
  },
  knee_to_wall: {
    challenges: { en: "Weight-bearing ankle dorsiflexion ROM (max toe-to-wall distance, heel down, knee touches wall), each side.", is: "Álags ökkla-dorsiflexion ferðasvið (hámarks tá-að-vegg fjarlægð, hæll niðri, hné snertir vegg), hvor hlið." },
    observations: [
      o("reduced_df", "Reduced or asymmetric dorsiflexion (cm)", "Skert eða ósamhverf dorsiflexion (cm)", "Ankle-dorsiflexion ROM restriction — a driver of squat valgus / forward lean", "Ökkla-dorsiflexion skerðing — orsök hnébeygju-valgus / framhalla", "ankle_dorsiflexion", ["mobility", "asymmetry"], [CONFIRM_HEEL_ELEVATED], { sided: true }),
    ],
  },
  active_slr: {
    challenges: { en: "Hamstring / posterior-chain length + lumbopelvic control (active raise).", is: "Aftanlæris / aftari-keðju lengd + lendhryggs-mjaðmagrindar stjórn (virk lyfta)." },
    observations: [
      o("restricted_active_raise", "Restricted active raise (passive may be normal)", "Skert virk lyfta (óvirk gæti verið eðlileg)", "If passive is normal → motor control / strength / tolerance, NOT tissue length", "Ef óvirk er eðlileg → hreyfistjórn / styrkur / þol, EKKI vefjalengd", "posterior_chain_length", ["mobility", "motor_control"], ["passive_slr", CONFIRM_ISOLATED_HIP], { sided: true }),
    ],
  },
  hip_ir_er: {
    challenges: { en: "Hip internal + external rotation ROM (degrees), each side.", is: "Mjaðma inn- + útsnúnings ferðasvið (gráður), hvor hlið." },
    observations: [
      o("reduced_rotation", "Reduced / asymmetric hip rotation (deg)", "Skertur / ósamhverfur mjaðma-snúningur (gráður)", "Hip-mobility restriction — feeds valgus + groin loading", "Mjaðma-hreyfanleika skerðing — fæðir valgus + nára-álag", "hip_rotation_mobility", ["mobility", "asymmetry"], ["faber"], { sided: true }),
    ],
  },
  shoulder_flexion_overhead: {
    challenges: { en: "Overhead shoulder mobility + combined reach, symmetry.", is: "Yfirhöfuðs axlar-hreyfanleiki + samsett teygja, samhverfa." },
    observations: [
      o("restricted_overhead", "Restricted overhead reach / combined mobility", "Skert yfirhöfuðs teygja / samsett hreyfanleiki", "Shoulder + thoracic mobility restriction", "Axlar + brjósthryggjar hreyfanleika skerðing", "thoracic_shoulder_mobility", ["mobility", "asymmetry"], ["thoracic_rotation", "shoulder_ir_er"], { sided: true }),
    ],
  },
  thoracic_rotation: {
    challenges: { en: "Seated thoracic-rotation ROM (degrees), each side.", is: "Sitjandi brjósthryggjar-snúnings ferðasvið (gráður), hvor hlið." },
    observations: [
      o("reduced_thoracic_rotation", "Reduced / asymmetric thoracic rotation (deg)", "Skertur / ósamhverfur brjósthryggjar-snúningur (gráður)", "Thoracic mobility restriction (rotation + overhead sports)", "Brjósthryggjar hreyfanleika skerðing (snúnings- + yfirhöfuðs-íþróttir)", "thoracic_shoulder_mobility", ["mobility", "asymmetry"], ["shoulder_flexion_overhead"], { sided: true }),
    ],
  },
  sebt_lower: {
    challenges: { en: "Dynamic single-leg reach (anterior / posteromedial / posterolateral, % leg length), each side.", is: "Dýnamísk einfætt teygja (fremri / posteromedial / posterolateral, % fótleggjar), hvor hlið." },
    observations: [
      o("anterior_asymmetry", "Anterior reach asymmetry (> 4 cm) / low composite", "Fremri teygju-ósamhverfa (> 4 cm) / lágt samsett", "Dynamic single-leg control + ankle DF + hip control", "Dýnamísk einfætt stjórn + ökkla-DF + mjaðma-stjórn", "dynamic_single_leg_control", ["balance", "motor_control", "asymmetry"], ["knee_to_wall", "single_leg_squat"], { sided: true }),
    ],
  },
  trunk_stability_pushup: {
    challenges: { en: "Anti-extension trunk stability under an upper-body press (moves as one unit).", is: "And-réttu búk-stöðugleiki undir efri-líkama ýtu (hreyfist sem ein heild)." },
    observations: [
      o("lumbar_sag_lag", "Lumbar sag / lag (does not move as one unit)", "Mjóbaks-sig / töf (hreyfist ekki sem ein heild)", "Trunk / core anti-extension control + capacity", "Búk / kjarna and-réttu stjórn + geta", "trunk_core_control", ["motor_control", "strength"], ["rotary_stability_bird_dog"]),
    ],
  },
  drop_vertical_jump: {
    challenges: { en: "Bilateral jump-landing mechanics (LESS): valgus at contact + peak, trunk flexion, foot position, stiffness, symmetry.", is: "Tvíhliða stökk-lendingar tækni (LESS): valgus við snertingu + hámark, búk-beygja, fót-staða, stífni, samhverfa." },
    observations: [
      o("landing_valgus", "Knee valgus at initial contact / peak", "Hné-valgus við fyrstu snertingu / hámark", "Landing mechanics / ACL-relevant kinematics — hip control + neuromuscular", "Lendingar-tækni / ACL-tengd hreyfifræði — mjaðma-stjórn + taugavöðva", "landing_mechanics", ["movement_quality", "power_reactive"], ["single_leg_landing", "single_leg_hop_and_stick", "hip_ir_er"], { pose: true, sided: true }),
      o("landing_stiffness", "Stiff landing / low trunk & knee flexion", "Stíf lending / lítil búk- & hné-beygja", "Eccentric absorption / landing strategy", "Eccentric deyfing / lendingar-stefna", "eccentric_control", ["motor_control"], ["single_leg_landing"]),
    ],
  },
  single_leg_hop_and_stick: {
    challenges: { en: "Unilateral high-speed landing control + limb symmetry (stick vs hop/step; hop distance → LSI).", is: "Einhliða háhraða lendingar-stjórn + útlima-samhverfa (festa vs hopp/skref; hopp-lengd → LSI)." },
    observations: [
      o("poor_stick", "Cannot stick the landing / extra hops / valgus", "Nær ekki að festa lendingu / auka-hopp / valgus", "Unilateral reactive control + landing mechanics", "Einhliða viðbragðs-stjórn + lendingar-tækni", "unilateral_reactive_control", ["balance", "power_reactive", "motor_control"], ["sebt_lower", "single_leg_landing"], { pose: true, sided: true }),
      o("lsi_deficit", "Limb-symmetry index < 90% (hop distance)", "Útlima-samhverfa < 90% (hopp-lengd)", "Between-limb capacity / reactive-strength deficit (RTP-relevant)", "Milli-útlima geta / viðbragðsstyrks halli (RTP-tengt)", "unilateral_reactive_control", ["asymmetry", "power_reactive"], ["single_hop_distance"], { sided: true }),
    ],
  },
};

/** The observation→hypothesis→confirmation layer for a test (if seeded). */
export function operationalFor(slug: string): TestOperational | null {
  return TEST_OPERATIONAL[slug] ?? null;
}

/** The compensation-≠-diagnosis rule, shown on the form + every observation set. */
export const HYPOTHESIS_RULE: Bi = {
  en: "A movement deviation does NOT prove a muscle is weak or tight — it opens a HYPOTHESIS to confirm with a more specific test. Visual movement classifications have variable reliability/validity; this is never a standalone diagnosis or injury predictor. Pain / red flags → clinician.",
  is: "Hreyfi-frávik SANNAR ekki að vöðvi sé veikur eða stífur — það opnar TILGÁTU sem staðfesta þarf með sértækara prófi. Sjónrænar hreyfi-flokkanir hafa breytilega áreiðanleika/réttmæti; þetta er aldrei sjálfstæð greining eða meiðsla-spá. Verkur / rauð flögg → klíníker.",
};

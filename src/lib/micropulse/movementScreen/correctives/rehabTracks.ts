/**
 * Rehab / return-to-play tracks — the movement-quality continuum in Enda King's
 * published spirit. A track is a PHASED continuum (strength → SSC/plyometric →
 * change-of-direction/cutting → sprint), each phase gated by symmetry + strength
 * EXIT CRITERIA, closing on a re-test (ties back to the movement-test framework).
 *
 * King's principles the tracks encode (from his publications, cited per phase):
 *  1. Movement quality / intersegmental (trunk–pelvis–hip) control over isolated
 *     strength (King 2018 BJSM groin; Baida 2021 — hip strength ≈11% of HAGOS gain).
 *  2. Biomechanics- and asymmetry-led — target the movement strategy + limb
 *     symmetry, not the strength number alone (King 2018/2019/2021 AJSM, ACLR).
 *  3. Movement-pattern clusters — strategy-specific, not one-size-fits-all
 *     (Franklyn-Miller 2017 BJSM).
 *  4. Criteria-based progression — jump/CMJ/SLDJ + limb-symmetry + isokinetic
 *     gates (Kotsifaki 2023 Aspetar ACL CPG; Crotty 2022).
 *
 * King's papers establish WHAT to target and HOW to test; the exact per-phase
 * exercise lists live in his (paid) course material, NOT reproduced here. Each
 * phase's slots are filled from the primary EMG / loading studies in the club's
 * research folder (Ebert; Macadam; Bolgla; Copenhagen adductor review; hamstring
 * EMG; plyometric EMG) — cite the papers, never the course.
 *
 * REHAB-SUPPORT / training only — never a diagnosis, never the readiness colour.
 * Nothing auto-advances a phase; the treating clinician / coach gates every step.
 * Pure module — no DB.
 */
import type { Bi } from "../registry";
import { CORRECTIVE_BY_SLUG, type CorrectiveExercise } from "./registry";
import type { CompensationKey } from "./mapping";
import type { QualityKey } from "@/lib/micropulse/unifiedDeficits/quality";

export type RehabTrackKey = "acl_knee" | "athletic_groin" | "ankle" | "lumbar_spine";

/** Where a phase sits on the continuum. King's strength→plyo→cutting→sprint, plus
 *  the low-back additions: clearance (clinician gate), motor-control (trunk
 *  endurance) and mobility (regional-interdependence contributors). */
export type ContinuumStage = "clearance" | "motor_control" | "mobility" | "strength" | "ssc_plyometric" | "cutting_mechanics" | "sprint";

/** A gate that must be met (clinician-judged) before advancing to the next phase.
 *  `pending` = the exact threshold awaits full-text extraction of the source CPG. */
export type ExitCriterion = { label: Bi; source: string; pending?: boolean };

export type RehabPhase = {
  key: string;
  order: number;
  name: Bi;
  /** The King principle this phase operationalises (the "why"). */
  focus: Bi;
  continuumStage: ContinuumStage;
  /** Exercise slots, filled from folder EMG (resolved to library entries at read). */
  slugs: string[];
  exitCriteria: ExitCriterion[];
  citation: string;
};

export type RehabTrack = {
  key: RehabTrackKey;
  name: Bi;
  /** King's framework for this track in one plain line. */
  summary: Bi;
  principles: Bi[];
  phases: RehabPhase[];
  caveat: Bi;
  citation: string;
  /** Prominent, track-specific safety gate (e.g. low-back red flags / cauda equina).
   *  Rendered above everything else — stop-and-refer, not advisory. */
  redFlags?: Bi;
  /** Coach page that carries the staged clinical protocol (e.g. /coach/low-back). */
  coachPath?: string;
};

// Exit-criteria building blocks. LSI ≥90% is the widely-used symmetry gate
// (Grindem 2016); the precise CPG thresholds (Kotsifaki 2023) are marked pending
// until the full text is extracted.
const LSI_SLDJ: ExitCriterion = { label: { en: "Single-leg drop-jump limb-symmetry ≥ 90%", is: "Einfætt fall-stökk útlima-samhverfa ≥ 90%" }, source: "Grindem 2016; Crotty 2022 (SLDJ↔strength)" };
const LSI_CMJ: ExitCriterion = { label: { en: "CMJ / hop-battery limb-symmetry ≥ 90%", is: "CMJ / hopp-prófa útlima-samhverfa ≥ 90%" }, source: "Grindem 2016" };
const ISOK_QUAD: ExitCriterion = { label: { en: "Isokinetic quadriceps LSI ≥ 90% (exact CPG threshold pending)", is: "Ísókínetísk framlæris-LSI ≥ 90% (nákvæmt CPG-viðmið í bið)" }, source: "Kotsifaki 2023 Aspetar ACL CPG", pending: true };

const CAVEAT_REHAB: Bi = {
  en: "Rehab-support framework in Enda King's spirit — a phased movement-quality continuum, not his course content. It informs training between clinical milestones; it is NOT a diagnosis, a clearance, or the readiness colour. The treating clinician gates every phase advance and clears return-to-play. Pain / red flags → clinician.",
  is: "Endurhæfingar-stuðnings umgjörð í anda Enda King — þrepaskiptur hreyfigæða-ferill, ekki námsefni hans. Styður þjálfun milli klínískra áfanga; er EKKI greining, heimild til leiks né lita-mat. Meðhöndlandi klíníker stýrir hverju þrepa-skrefi og heimilar endurkomu. Verkur / rauð flögg → klíníker.",
};

export const REHAB_TRACKS: Record<RehabTrackKey, RehabTrack> = {
  acl_knee: {
    key: "acl_knee",
    name: { en: "ACL / knee track", is: "ACL / hné ferill" },
    summary: { en: "Restore intersegmental control and limb symmetry, then progress strength → plyometric → cutting → sprint against symmetry gates.", is: "Endurheimta intersegmental stjórn og útlima-samhverfu, síðan styrkur → plyometric → cutting → sprettur með samhverfu-viðmiðum." },
    principles: [
      { en: "Biomechanical asymmetries persist ~9 months after ACLR — target the movement strategy + symmetry, not the strength number alone.", is: "Lífaflfræðileg ósamhverfa varir ~9 mánuði eftir ACLR — beindu að hreyfi-stefnu + samhverfu, ekki bara styrktar-tölunni." },
      { en: "Biomechanics — not strength or performance — differentiates re-injury (King 2021).", is: "Lífaflfræði — ekki styrkur eða frammistaða — skilur á milli endurmeiðsla (King 2021)." },
      { en: "Progress in order and only through symmetry/strength gates; nothing auto-advances.", is: "Framvinda í röð og einungis gegnum samhverfu-/styrktar-viðmið; ekkert stigmagnast sjálfkrafa." },
    ],
    phases: [
      { key: "acl_impairment", order: 1, name: { en: "1 · Impairment / isolated strength", is: "1 · Skerðing / einangraður styrkur" }, focus: { en: "Rebuild quad / hamstring / glute capacity on the involved limb.", is: "Endurbyggja framlæris- / aftanlæris- / glute-getu á meiddum fæti." }, continuumStage: "strength", slugs: ["spanish_squat_iso", "glute_bridge", "nordic_hamstring", "quadruped_hip_extension"], exitCriteria: [{ label: { en: "Full knee ROM, no effusion; involved-limb strength within tolerance", is: "Full hné-hreyfing, engin bólga; styrkur meidds fótar innan marka" }, source: "ACL Rehabilitation Progression (impairment phase)" }], citation: "ACL Rehabilitation Progression: Where Are We Now?; Ebert/Macadam (glute %MVIC)" },
      { key: "acl_strength_control", order: 2, name: { en: "2 · Bilateral → unilateral strength + intersegmental control", is: "2 · Tvífætt → einfætt styrkur + intersegmental stjórn" }, focus: { en: "Trunk–pelvis–hip control during single-leg tasks (King's intersegmental emphasis) + close the limb gap.", is: "Búkur–mjaðmagrind–mjöðm stjórn í einfættum verkefnum (intersegmental áhersla Kings) + loka útlima-mun." }, continuumStage: "strength", slugs: ["clamshell", "side_lying_hip_abduction", "standing_banded_hip_abduction", "single_leg_squat", "lateral_step_up", "split_squat", "single_leg_rdl", "single_leg_balance"], exitCriteria: [{ label: { en: "Symmetrical single-leg squat control; no dynamic valgus", is: "Samhverf einfætt hnébeygju-stjórn; enginn dynamic valgus" }, source: "King 2018/2019 (movement strategy)" }], citation: "King 2018/2019 AJSM (intersegmental control); Ebert/Macadam/Bolgla (%MVIC)" },
      { key: "acl_plyometric", order: 3, name: { en: "3 · Plyometric / SSC progression", is: "3 · Plyometric / SSC stigmögnun" }, focus: { en: "Bilateral → unilateral, in-place → horizontal SSC; restore landing absorption + reactive strength.", is: "Tvífætt → einfætt, á staðnum → láréttur SSC; endurheimta lendingar-deyfingu + viðbragðsstyrk." }, continuumStage: "ssc_plyometric", slugs: ["drop_landing_soft_catch", "eccentric_step_down", "bilateral_box_jump_landing", "pogo_hops", "horizontal_bound_stick", "single_leg_hops"], exitCriteria: [LSI_SLDJ, LSI_CMJ], citation: "Kotsifaki 2023 (jump/land criteria); Flanagan & Comyns 2008 (RSI); plyometric EMG reviews" },
      { key: "acl_cutting_sprint", order: 4, name: { en: "4 · Cutting / deceleration mechanics + sprint", is: "4 · Cutting / hemlunar-tækni + sprettur" }, focus: { en: "Re-train change-of-direction + deceleration mechanics, then return-to-sprint (VBT-guided).", is: "Endurþjálfa stefnubreytingar + hemlunar-tækni, síðan endurkoma í sprett (VBT-stýrt)." }, continuumStage: "cutting_mechanics", slugs: ["lateral_hurdle_hop", "deceleration_mechanics_drill"], exitCriteria: [ISOK_QUAD, { label: { en: "Symmetrical cutting mechanics; return-to-sprint programme completed (VBT)", is: "Samhverf cutting-tækni; endurkomu-spretts prógramm klárað (VBT)" }, source: "Daniels 2021 (cutting); Forelli 2024 (VBT return-to-sprint)", pending: true }], citation: "Franklyn-Miller 2017 (CoD clusters); Daniels 2021; Forelli 2024 (VBT)" },
    ],
    caveat: CAVEAT_REHAB,
    citation: "King 2018/2019/2021 AJSM; Kotsifaki 2023 BJSM (Aspetar ACL CPG); Crotty 2022; Forelli 2024 IJSPT",
  },

  athletic_groin: {
    key: "athletic_groin",
    name: { en: "Athletic groin-pain track", is: "Nára-verkja ferill (íþrótta)" },
    summary: { en: "The King/Baida 3-level programme: intersegmental control through strength → linear running → change-of-direction mechanics, gated by clinical milestones.", is: "King/Baida 3-þrepa prógrammið: intersegmental stjórn gegnum styrk → hlaup í beinni línu → stefnubreytinga-tækni, stýrt af klínískum áföngum." },
    principles: [
      { en: "Focus on intersegmental control + gluteal function, not isolated hip strength (Baida 2021: hip strength ≈11% of the HAGOS improvement).", is: "Áhersla á intersegmental stjórn + glute-virkni, ekki einangraðan mjaðma-styrk (Baida 2021: mjaðma-styrkur ≈11% af HAGOS-bata)." },
      { en: "Progression individualised, gated by clinical milestones (symmetrical hip flexion/IR ROM, pain-free 45°+0° squeeze, Thomas test, running programmes) — clinician-judged.", is: "Framvinda einstaklingsmiðuð, stýrt af klínískum áföngum (samhverf mjaðma-beygja/IR hreyfing, verkjalaus 45°+0° kreisting, Thomas-próf, hlaupa-prógrömm) — klíníker metur." },
      { en: "Movement-cluster-specific change-of-direction re-training (Franklyn-Miller 2017).", is: "Hreyfi-klasa-sértæk stefnubreytinga-endurþjálfun (Franklyn-Miller 2017)." },
    ],
    phases: [
      { key: "groin_strength", order: 1, name: { en: "Level 1 · Strength (capacity + gluteal/intersegmental control)", is: "Þrep 1 · Styrkur (geta + glute/intersegmental stjórn)" }, focus: { en: "Build adductor + gluteal capacity and trunk–pelvis–hip control; reduced gluteal activation is characteristic of AGP.", is: "Byggja aðfærslu- + glute-getu og búk–mjaðmagrind–mjöðm stjórn; minnkuð glute-virkni einkennir AGP." }, continuumStage: "strength", slugs: ["ball_squeeze_isometric", "side_lying_hip_adduction", "standing_hip_adduction_band", "clamshell", "side_lying_hip_abduction", "quadruped_hip_extension", "copenhagen_adduction"], exitCriteria: [{ label: { en: "Symmetrical hip flexion + IR ROM; pain-free squeeze test at 45° and 0°; Thomas test — all clinician-judged", is: "Samhverf mjaðma-beygja + IR hreyfing; verkjalaust kreistingar-próf við 45° og 0°; Thomas-próf — klíníker metur" }, source: "King 2018; Baida/Gore 2022 (clinical milestones)" }], citation: "King 2018 BJSM; Baida 2021; Copenhagen adductor review; adductor EMG (six clinical tests / soccer players)" },
      { key: "groin_linear_running", order: 2, name: { en: "Level 2 · Linear running + plyometrics (SSC)", is: "Þrep 2 · Bein hlaup + plyometrics (SSC)" }, focus: { en: "Linear running progression with SSC work — improves eccentric RFD and shortens ground-contact time.", is: "Bein hlaupa-stigmögnun með SSC vinnu — bætir eccentric RFD og styttir gólftíma." }, continuumStage: "ssc_plyometric", slugs: ["pogo_hops", "bilateral_box_jump_landing", "horizontal_bound_stick", "nordic_hamstring", "single_leg_rdl"], exitCriteria: [{ label: { en: "Completed linear running programmes; lateral hurdle-hop test symmetry (GCT, eccentric RFD, impulse)", is: "Kláruð bein hlaupa-prógrömm; hliðar-grindarhopps próf samhverfa (GCT, eccentric RFD, impuls)" }, source: "Baida/Gore 2022 (lateral hurdle hop RTP test)" }], citation: "King 2018; Baida/Gore 2022; plyometric EMG reviews; hamstring EMG" },
      { key: "groin_cod", order: 3, name: { en: "Level 3 · Change-of-direction mechanics", is: "Þrep 3 · Stefnubreytinga-tækni" }, focus: { en: "Reactive cut re-training, movement-cluster-specific — the final gate before return to play.", is: "Viðbragðs-cut endurþjálfun, hreyfi-klasa-sértæk — síðasta hlið fyrir endurkomu." }, continuumStage: "cutting_mechanics", slugs: ["lateral_hurdle_hop", "deceleration_mechanics_drill", "single_leg_hops"], exitCriteria: [{ label: { en: "Reactive change-of-direction mechanics restored; all clinical milestones met (mean ~9.8 wk, ~4.7 physio visits)", is: "Viðbragðs-stefnubreytinga-tækni endurheimt; allir klínískir áfangar náðir (meðaltal ~9,8 vikur, ~4,7 sjúkraþjálfunar-heimsóknir)" }, source: "King 2018; Baida/Gore 2022; Franklyn-Miller 2017 (CoD clusters)" }], citation: "Franklyn-Miller 2017 BJSM; King 2018; Baida/Gore 2022" },
    ],
    caveat: CAVEAT_REHAB,
    citation: "King 2018 BJSM (intersegmental groin rehab, n=205); Baida 2021 AJSM; Franklyn-Miller 2017 BJSM",
  },

  ankle: {
    key: "ankle",
    name: { en: "Ankle track", is: "Ökkla ferill" },
    summary: { en: "Restore dorsiflexion mobility, then neuromuscular / proprioceptive control, then criteria-based return — for chronic ankle instability and the ankle-DF driver of valgus/lean.", is: "Endurheimta dorsiflexion hreyfanleika, síðan taugavöðva- / proprioceptive stjórn, síðan viðmiðaða endurkomu — fyrir langvinnan ökkla-óstöðugleika og ökkla-DF drifkraft valgus/halla." },
    principles: [
      { en: "Neuromuscular / proprioceptive training is the core of chronic-ankle-instability rehab (Lin, Delahunt & King 2012).", is: "Taugavöðva- / proprioceptive þjálfun er kjarni endurhæfingar við langvinnan ökkla-óstöðugleika (Lin, Delahunt & King 2012)." },
      { en: "Restricted ankle dorsiflexion drives dynamic valgus and forward lean — restore it early (Macrum 2012).", is: "Skert ökkla-dorsiflexion drífur dynamic valgus og framhalla — endurheimta snemma (Macrum 2012)." },
      { en: "Return decisions are criteria-based, not time-based (lateral-ankle-sprain RTS review).", is: "Endurkomu-ákvarðanir eru viðmiðaðar, ekki tíma-miðaðar (yfirlit um endurkomu eftir ökkla-tognun)." },
    ],
    phases: [
      { key: "ankle_impairment", order: 1, name: { en: "1 · Mobility / impairment", is: "1 · Hreyfanleiki / skerðing" }, focus: { en: "Restore ankle dorsiflexion and calf length.", is: "Endurheimta ökkla-dorsiflexion og kálfa-lengd." }, continuumStage: "strength", slugs: ["smr_calf", "calf_stretch_gastroc", "ankle_df_knee_to_wall"], exitCriteria: [{ label: { en: "Symmetrical knee-to-wall dorsiflexion; no pain", is: "Samhverf hné-að-vegg dorsiflexion; enginn verkur" }, source: "Macrum 2012 (ankle DF)" }], citation: "Macrum 2012; lateral-ankle-sprain RTS review" },
      { key: "ankle_neuromuscular", order: 2, name: { en: "2 · Neuromuscular / proprioceptive control", is: "2 · Taugavöðva- / proprioceptive stjórn" }, focus: { en: "Single-leg balance + perturbation progression to restore joint-position control.", is: "Einfætt jafnvægi + truflunar-stigmögnun til að endurheimta liðstöðu-stjórn." }, continuumStage: "strength", slugs: ["single_leg_balance", "standing_banded_hip_abduction", "eccentric_step_down"], exitCriteria: [{ label: { en: "Balance / time-to-stabilisation symmetry restored", is: "Jafnvægi / stöðgunartíma samhverfa endurheimt" }, source: "Lin, Delahunt & King 2012; Ross & Guskiewicz 2005" }], citation: "Lin, Delahunt & King 2012 (ankle NMT); Ross & Guskiewicz 2005" },
      { key: "ankle_return", order: 3, name: { en: "3 · Plyometric / criteria-based return", is: "3 · Plyometric / viðmiðuð endurkoma" }, focus: { en: "Reactive hopping and landing, then criteria-based return to sport.", is: "Viðbragðs-hopp og lending, síðan viðmiðuð endurkoma í íþrótt." }, continuumStage: "ssc_plyometric", slugs: ["pogo_hops", "single_leg_hops", "lateral_hurdle_hop"], exitCriteria: [LSI_SLDJ, { label: { en: "Hop-test symmetry ≥ 90%; criteria-based RTS met", is: "Hopp-prófs samhverfa ≥ 90%; viðmiðuð endurkoma náð" }, source: "Criteria-based RTS after lateral ankle sprain (systematic review)" }], citation: "Clanton 2012; lateral-ankle-sprain criteria-based RTS review; Flanagan & Comyns 2008" },
    ],
    caveat: CAVEAT_REHAB,
    citation: "Lin, Delahunt & King 2012; Macrum 2012; criteria-based RTS after lateral ankle sprain (systematic review)",
  },

  lumbar_spine: {
    key: "lumbar_spine",
    name: { en: "Low-back track", is: "Mjóbaks-ferill" },
    summary: { en: "For clinician-cleared NON-SPECIFIC mechanical low-back pain (+ asymptomatic capacity prehab): settle, build trunk endurance + motor control, restore hip/T-spine mobility to load-share off the spine, then loaded hinge → power → running. Capacity + motor control + mobility + load management — not a named lesion.", is: "Fyrir klíníker-heimilaðan ÓSÉRTÆKAN vélrænan mjóbaksverk (+ einkennalausa getu-prehab): róa, byggja búk-þol + hreyfistjórn, endurheimta mjaðma/brjósthryggjar hreyfanleika til að dreifa álagi frá hryggnum, síðan hlaðinn hinge → afl → hlaup. Geta + hreyfistjórn + hreyfanleiki + álagsstjórn — ekki nefnd meinsemd." },
    principles: [
      { en: "Most LBP is non-specific — no identifiable pain-generating structure (Maher 2017, Lancet). Target capacity, motor control and load, not a named lesion.", is: "Flestur mjóbaksverkur er ósértækur — engin greinanleg verkjagjafa-bygging (Maher 2017, Lancet). Beindu að getu, hreyfistjórn og álagi, ekki nefndri meinsemd." },
      { en: "Exercise helps LBP, but no single type is clearly superior (Hayden 2021 Cochrane; Saragiotto 2016). The McGill big-3 is a reasonable trunk-endurance base, coach-overridable — not proven-best.", is: "Æfing hjálpar við mjóbaksverk, en engin ein tegund er skýrt betri (Hayden 2021 Cochrane; Saragiotto 2016). McGill big-3 er sanngjarn búk-þol grunnur, hnekkjanlegur — ekki sannaður bestur." },
      { en: "Regional interdependence — hip mobility (esp. IR) and thoracic-spine stiffness load the lumbar spine; hip-hinge patterning spares it.", is: "Regional interdependence — mjaðma-hreyfanleiki (sérstaklega IR) og brjósthryggjar-stífni hlaða mjóbakið; mjaðma-hinge mynstur hlífir því." },
      { en: "Load matters: sudden training-load spikes associate with LBP (prior-LBP = higher risk). Individualise and monitor for management, never prediction.", is: "Álag skiptir máli: skyndilegir álags-toppar tengjast mjóbaksverk (fyrri LBP = meiri áhætta). Einstaklingsmiðaðu og vaktaðu fyrir stjórnun, aldrei spá." },
      { en: "A directional-preference (centralisation / McKenzie) sub-group exists — clinician-assessed, not a coach default.", is: "Stefnu-vals (centralisation / McKenzie) undirhópur er til — metinn af klíníker, ekki sjálfgefið hjá þjálfara." },
    ],
    phases: [
      { key: "lumbar_clearance", order: 1, name: { en: "1 · Screen / clearance (clinician)", is: "1 · Skimun / heimild (klíníker)" }, focus: { en: "Clinician confirms non-specific mechanical LBP — red flags & radicular signs ruled out; directional-preference / structural calls are clinician territory. Record a baseline outcome measure (Oswestry ODI or RMDQ).", is: "Klíníker staðfestir ósértækan vélrænan mjóbaksverk — rauð flögg & radicular einkenni útilokuð; stefnu-val / byggingar-mat er klíníker-svæði. Skráðu grunn-útkomumælingu (Oswestry ODI eða RMDQ)." }, continuumStage: "clearance", slugs: [], exitCriteria: [{ label: { en: "Red flags & radicular signs ruled out; non-specific mechanical LBP (clinician); baseline ODI / RMDQ recorded", is: "Rauð flögg & radicular einkenni útilokuð; ósértækur vélrænn mjóbaksverkur (klíníker); grunn ODI / RMDQ skráð" }, source: "Maher 2017 (Lancet); clinician" }], citation: "Maher, Underwood & Buchbinder 2017 (Lancet, non-specific LBP)" },
      { key: "lumbar_foundation", order: 2, name: { en: "2 · Settle + foundation", is: "2 · Róa + grunnur" }, focus: { en: "Reduce provocation, normalise the daily pattern (sitting / hinge), restore pain-free ROM; begin the trunk-endurance / motor-control base (McGill big-3 — endurance holds, not max reps) + breathing / bracing.", is: "Draga úr ertingu, eðlilegt daglegt mynstur (seta / hinge), endurheimta verkjalausa hreyfingu; byrja búk-þol / hreyfistjórnar grunn (McGill big-3 — þol-hald, ekki hámark) + öndun / spennu." }, continuumStage: "motor_control", slugs: ["mcgill_curl_up", "mcgill_side_bridge", "bird_dog", "pallof_press"], exitCriteria: [{ label: { en: "Provocation settled; pain-free daily pattern; holds the big-3 endurance base", is: "Erting róuð; verkjalaust daglegt mynstur; heldur big-3 þol-grunni" }, source: "Hayden 2021 (Cochrane); McGill" }], citation: "Hayden 2021 (Cochrane, exercise for LBP); Saragiotto 2016; McGill (big-3)" },
      { key: "lumbar_mobility", order: 3, name: { en: "2b · Mobility contributors", is: "2b · Hreyfanleika-þættir" }, focus: { en: "Address the hip (esp. IR) + thoracic-spine restrictions the screen flags, and hip-hinge patterning to load-share off the spine (regional interdependence). These are also the OHSA forward-lean / hinge drivers — findings de-duplicate with the corrective plan.", is: "Taka á mjaðma- (sérstaklega IR) + brjósthryggjar-takmörkunum sem skimun flaggar, og mjaðma-hinge mynstri til að dreifa álagi frá hryggnum (regional interdependence). Þetta eru líka OHSA framhalla- / hinge drifkraftar — niðurstöður sameinast við leiðréttingar-planið." }, continuumStage: "mobility", slugs: ["hip_ir_mobility", "thoracic_rotation_mobility", "hip_flexor_stretch", "hip_hinge_dowel"], exitCriteria: [{ label: { en: "Symmetrical hip IR + T-spine rotation; a competent hip-hinge that spares the spine", is: "Samhverfur mjaðma-IR + brjósthryggjar-snúningur; hæft mjaðma-hinge sem hlífir hryggnum" }, source: "Regional interdependence (hip IR + T-spine → lumbar load)" }], citation: "Regional interdependence (hip IR + T-spine); Saragiotto 2016 (motor-control exercise)" },
      { key: "lumbar_strength", order: 4, name: { en: "3 · Loaded strengthening", is: "3 · Hlaðin styrking" }, focus: { en: "Progressive hip-hinge loading (RDL / hip thrust / KB), carries + anti-flexion / anti-rotation (Pallof, suitcase carry), posterior-chain capacity; build trunk endurance under load. Football emphasis = strength-endurance + rotational tolerance.", is: "Stigvaxandi mjaðma-hinge álag (RDL / hip thrust / KB), göngur + and-beygja / and-snúningur (Pallof, ferðatöskuganga), aftari-keðju geta; byggja búk-þol undir álagi. Fótbolta-áhersla = styrk-þol + snúnings-þol." }, continuumStage: "strength", slugs: ["hip_hinge_dowel", "single_leg_rdl", "barbell_hip_thrust", "suitcase_carry", "pallof_press"], exitCriteria: [{ label: { en: "Tolerates progressive loaded hinge + carries without provocation; trunk-endurance benchmarks met (clinician)", is: "Þolir stigvaxandi hlaðinn hinge + göngur án ertingar; búk-þol viðmið náð (klíníker)" }, source: "Hayden 2021 (Cochrane); clinician" }], citation: "Hayden 2021 (Cochrane, exercise for LBP); McGill (loaded trunk endurance)" },
      { key: "lumbar_power", order: 5, name: { en: "4 · Power / plyometric + rotational", is: "4 · Afl / plyometric + snúningur" }, focus: { en: "Energy-storage and rotational power (med-ball throws, chops) once strength benchmarks are met.", is: "Orku-geymsla og snúnings-afl (med-ball köst, chops) þegar styrktar-viðmið eru náð." }, continuumStage: "ssc_plyometric", slugs: [], exitCriteria: [{ label: { en: "Strength benchmarks met; tolerates rotational power loading (criteria-based, clinician)", is: "Styrktar-viðmið náð; þolir snúnings-afl álag (viðmiðað, klíníker)" }, source: "Saragiotto 2016; clinician" }], citation: "Saragiotto 2016 (motor-control exercise); McGill (rotational tolerance)" },
      { key: "lumbar_rts", order: 6, name: { en: "5 · Running / sport reintegration → RTS", is: "5 · Hlaup / endurkoma í íþrótt → RTS" }, focus: { en: "Graded running → sprint / cutting → sport-specific, criteria-gated; ongoing load-management (avoid sudden spikes; prior-LBP = higher risk).", is: "Stigvaxandi hlaup → sprettur / cutting → íþrótta-sértækt, viðmiða-stýrt; áframhaldandi álagsstjórn (forðast skyndi-toppa; fyrri LBP = meiri áhætta)." }, continuumStage: "sprint", slugs: [], exitCriteria: [{ label: { en: "Graded running → sprint / cutting tolerated; sport-specific criteria met (clinician)", is: "Stigvaxandi hlaup → sprettur / cutting þolað; íþrótta-sértæk viðmið náð (klíníker)" }, source: "Athlete load–LBP association (load management); clinician", pending: true }], citation: "Maher 2017 (Lancet); athlete load–LBP association (load management)" },
    ],
    redFlags: {
      en: "STOP and refer to a clinician immediately for ANY red flag: leg pain / numbness or radicular signs, saddle anaesthesia, bladder / bowel change, night pain, significant trauma, or systemic features (fever, unexplained weight loss). Cauda equina is an emergency. This track is only for non-specific mechanical LBP a clinician has cleared; directional-preference (centralisation) programming is clinician-assessed.",
      is: "STOPP og vísaðu STRAX til klíníkers við HVAÐA rauða flaggi sem er: fótverkur / dofi eða radicular einkenni, hnakk-deyfing (saddle), breyting á þvag- / þarmastarfsemi, næturverkur, umtalsvert áfall, eða almenn einkenni (hiti, óútskýrt þyngdartap). Cauda equina er neyðartilvik. Þessi ferill er aðeins fyrir ósértækan vélrænan mjóbaksverk sem klíníker hefur heimilað; stefnu-vals (centralisation) meðferð er metin af klíníker.",
    },
    coachPath: "/coach/low-back",
    caveat: CAVEAT_REHAB,
    citation: "Maher, Underwood & Buchbinder 2017 (Lancet); Hayden 2021 (Cochrane); Saragiotto 2016 (Cochrane); McGill (Low Back Disorders — big-3); regional interdependence",
  },
};

/** A screen/region compensation → the rehab track + entry phase it belongs in. */
const COMPENSATION_REHAB: Partial<Record<CompensationKey, { track: RehabTrackKey; phaseKey: string }>> = {
  dynamic_valgus: { track: "acl_knee", phaseKey: "acl_strength_control" },
  hip_abductor_weakness: { track: "acl_knee", phaseKey: "acl_strength_control" },
  limb_asymmetry: { track: "acl_knee", phaseKey: "acl_strength_control" },
  landing_instability: { track: "acl_knee", phaseKey: "acl_strength_control" },
  poor_absorption: { track: "acl_knee", phaseKey: "acl_plyometric" },
  low_reactive_strength: { track: "acl_knee", phaseKey: "acl_plyometric" },
  limited_dorsiflexion: { track: "ankle", phaseKey: "ankle_impairment" },
  trunk_antirotation: { track: "lumbar_spine", phaseKey: "lumbar_foundation" },
  // forward_trunk_lean → movement-quality corrective only (no rehab track).
};

export type RehabPhaseView = {
  key: string;
  order: number;
  name: Bi;
  focus: Bi;
  continuumStage: ContinuumStage;
  indicated: boolean;
  isEntry: boolean;
  exercises: CorrectiveExercise[];
  exitCriteria: ExitCriterion[];
  citation: string;
  /** Persisted progression overlay — the player has reached / is at this phase
   *  (set by overlayTrackProgress; false until a progress row exists). */
  reached: boolean;
  isCurrent: boolean;
};
export type RehabTrackStatus = "active" | "paused" | "completed" | "discharged";
export type RehabTrackProgress = { currentPhaseKey: string; status: RehabTrackStatus };
export type RehabTrackView = {
  track: RehabTrackKey;
  name: Bi;
  summary: Bi;
  principles: Bi[];
  caveat: Bi;
  citation: string;
  entryPhaseKey: string;
  phases: RehabPhaseView[];
  redFlags?: Bi;
  coachPath?: string;
  /** "rehab" = an ACTIVE injury drives this track (clinician gates advancement —
   *  entry is forced to the earliest phase). "prehab" = no active injury; the
   *  screen findings suggest a movement-quality progression, entry at the
   *  screen-indicated phase. The two read very differently to a coach. */
  mode: "rehab" | "prehab";
  /** What the LATEST screen recommends as the entry phase (always set). */
  screenRecommendedPhaseKey: string;
  /** The persisted, clinician-gated tracked phase + status (undefined = not yet
   *  entered into tracking; the card offers to seed it from the recommendation). */
  trackedPhaseKey?: string;
  trackedStatus?: RehabTrackStatus;
  /** The tracked phase differs from what the latest screen recommends — surfaced
   *  for the clinician to reconcile, NEVER auto-resolved. */
  divergesFromScreen: boolean;
};

/** The unified-ledger qualities a track's progression confirms/resolves (the
 *  deficit-ledger loop). Mirrors classifyRehabTrack's quality sets. */
export const TRACK_QUALITIES: Record<RehabTrackKey, QualityKey[]> = {
  acl_knee: ["landing_valgus", "landing_stability", "limb_asymmetry"],
  athletic_groin: ["adductor_capacity"],
  ankle: ["ankle_dorsiflexion_mobility"],
  lumbar_spine: ["trunk_antirotation"],
};

/** classifyRehabTrack's free-text track string → the continuum RehabTrackKey (only
 *  the injuries that HAVE a movement-quality continuum; tendon/staged-loading
 *  injuries — jumper's knee, Achilles, calf, hamstring — have their own protocol
 *  pages, not a RehabTrackView, so they return undefined here). */
export function injuryTrackKey(track: string | null | undefined): RehabTrackKey | undefined {
  switch (track) {
    case "acl_knee": return "acl_knee";
    case "adductor_groin": return "athletic_groin";
    case "low_back": return "lumbar_spine";
    default: return undefined;
  }
}

/**
 * Given the anchor compensations from a player's screen (+ region), pick the
 * dominant rehab track and mark which phases the findings indicate + where to
 * start (the earliest indicated phase). Returns null when no compensation maps
 * to a track (e.g. only a forward-lean movement-quality flag). Pure.
 */
export function rehabTrackForCompensations(
  compKeys: CompensationKey[],
  opts: { forceTrackKey?: RehabTrackKey; injured?: boolean } = {},
): RehabTrackView | null {
  const hits = compKeys.map((k) => COMPENSATION_REHAB[k]).filter((x): x is { track: RehabTrackKey; phaseKey: string } => !!x);

  let track: RehabTrackKey;
  if (opts.forceTrackKey) {
    // An ACTIVE injury is authoritative — show ITS track regardless of the screen.
    track = opts.forceTrackKey;
  } else {
    if (!hits.length) return null;
    // Dominant track = the one the most compensations point to (tie → acl_knee).
    const counts = new Map<RehabTrackKey, number>();
    for (const h of hits) counts.set(h.track, (counts.get(h.track) ?? 0) + 1);
    track = hits[0].track;
    let best = -1;
    for (const [t, n] of counts) if (n > best || (n === best && t === "acl_knee")) { best = n; track = t; }
  }

  const indicatedPhaseKeys = new Set(hits.filter((h) => h.track === track).map((h) => h.phaseKey));
  const def = REHAB_TRACKS[track];
  // Entry: an injured (forced) track starts at the EARLIEST phase — the clinician
  // gates every advance, so the screen must never auto-advance a hurt player.
  // Without an injury, entry is the earliest screen-indicated phase (prehab).
  const entryPhase = opts.forceTrackKey
    ? def.phases.reduce((a, b) => (a.order <= b.order ? a : b))
    : def.phases.find((p) => p.order === Math.min(...def.phases.filter((p) => indicatedPhaseKeys.has(p.key)).map((p) => p.order)))!;

  const phases: RehabPhaseView[] = def.phases.map((p) => ({
    key: p.key,
    order: p.order,
    name: p.name,
    focus: p.focus,
    continuumStage: p.continuumStage,
    indicated: indicatedPhaseKeys.has(p.key),
    isEntry: p.key === entryPhase.key,
    exercises: p.slugs.map((s) => CORRECTIVE_BY_SLUG[s]).filter((e): e is CorrectiveExercise => !!e),
    exitCriteria: p.exitCriteria,
    citation: p.citation,
    reached: false, // set by overlayTrackProgress when a persisted row exists
    isCurrent: false,
  }));

  return {
    track,
    name: def.name,
    summary: def.summary,
    principles: def.principles,
    caveat: def.caveat,
    citation: def.citation,
    entryPhaseKey: entryPhase.key,
    phases,
    redFlags: def.redFlags,
    coachPath: def.coachPath,
    mode: opts.injured ? "rehab" : "prehab",
    screenRecommendedPhaseKey: entryPhase.key,
    divergesFromScreen: false,
  };
}

/**
 * Overlay the PERSISTED, clinician-gated progression onto a computed view — WITHOUT
 * changing the track definitions. The screen recommendation stays as
 * `screenRecommendedPhaseKey`; the tracked phase is authoritative for reached /
 * isCurrent; a divergence between the two is surfaced (never auto-resolved). If
 * there is no progress row, the view is returned unchanged (untracked). Pure.
 */
export function overlayTrackProgress(view: RehabTrackView, progress: RehabTrackProgress | null): RehabTrackView {
  if (!progress) return view;
  const trackedOrder = view.phases.find((p) => p.key === progress.currentPhaseKey)?.order ?? -1;
  return {
    ...view,
    trackedPhaseKey: progress.currentPhaseKey,
    trackedStatus: progress.status,
    divergesFromScreen: view.screenRecommendedPhaseKey !== progress.currentPhaseKey,
    phases: view.phases.map((p) => ({ ...p, reached: p.order <= trackedOrder, isCurrent: p.key === progress.currentPhaseKey })),
  };
}

export const CONTINUUM_STAGE_LABEL: Record<ContinuumStage, Bi> = {
  clearance: { en: "Clearance", is: "Heimild" },
  motor_control: { en: "Motor control", is: "Hreyfistjórn" },
  mobility: { en: "Mobility", is: "Hreyfanleiki" },
  strength: { en: "Strength", is: "Styrkur" },
  ssc_plyometric: { en: "Plyometric / SSC", is: "Plyometric / SSC" },
  cutting_mechanics: { en: "Cutting / CoD mechanics", is: "Cutting / stefnubreytinga-tækni" },
  sprint: { en: "Sprint", is: "Sprettur" },
};

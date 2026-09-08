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

export type RehabTrackKey = "acl_knee" | "athletic_groin" | "ankle";

/** Where a phase sits on King's strength→plyo→cutting→sprint continuum. */
export type ContinuumStage = "strength" | "ssc_plyometric" | "cutting_mechanics" | "sprint";

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
};
export type RehabTrackView = {
  track: RehabTrackKey;
  name: Bi;
  summary: Bi;
  principles: Bi[];
  caveat: Bi;
  citation: string;
  entryPhaseKey: string;
  phases: RehabPhaseView[];
};

/**
 * Given the anchor compensations from a player's screen (+ region), pick the
 * dominant rehab track and mark which phases the findings indicate + where to
 * start (the earliest indicated phase). Returns null when no compensation maps
 * to a track (e.g. only a forward-lean movement-quality flag). Pure.
 */
export function rehabTrackForCompensations(compKeys: CompensationKey[]): RehabTrackView | null {
  const hits = compKeys.map((k) => COMPENSATION_REHAB[k]).filter((x): x is { track: RehabTrackKey; phaseKey: string } => !!x);
  if (!hits.length) return null;

  // Dominant track = the one the most compensations point to (tie → acl_knee).
  const counts = new Map<RehabTrackKey, number>();
  for (const h of hits) counts.set(h.track, (counts.get(h.track) ?? 0) + 1);
  let track: RehabTrackKey = hits[0].track;
  let best = -1;
  for (const [t, n] of counts) if (n > best || (n === best && t === "acl_knee")) { best = n; track = t; }

  const indicatedPhaseKeys = new Set(hits.filter((h) => h.track === track).map((h) => h.phaseKey));
  const def = REHAB_TRACKS[track];
  const entryOrder = Math.min(...def.phases.filter((p) => indicatedPhaseKeys.has(p.key)).map((p) => p.order));
  const entryPhase = def.phases.find((p) => p.order === entryOrder)!;

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
  };
}

export const CONTINUUM_STAGE_LABEL: Record<ContinuumStage, Bi> = {
  strength: { en: "Strength", is: "Styrkur" },
  ssc_plyometric: { en: "Plyometric / SSC", is: "Plyometric / SSC" },
  cutting_mechanics: { en: "Cutting / CoD mechanics", is: "Cutting / stefnubreytinga-tækni" },
  sprint: { en: "Sprint", is: "Sprettur" },
};

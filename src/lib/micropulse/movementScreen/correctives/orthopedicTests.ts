/**
 * Orthopedic special-test recommender — a referral aid, NOT a diagnosis. After a
 * movement screen (findings → compensations) OR when the coach names the body
 * region the player is dealing with, the system suggests WHICH clinician-performed
 * special tests to consider to confirm / differentiate the picture. Routed by the
 * same two keys as everything else: the CompensationKey (screen-driven) and the
 * RegionKey (coach-driven).
 *
 * MicroPulse recommends the tests; a CLINICIAN performs and interprets them. These
 * are not something the coach diagnoses with. Screening / training + referral
 * support only — never a diagnosis, never the readiness colour. Pure data module.
 *
 * Copyright: the region taxonomy (foot/ankle, knee, hip/pelvis, lumbar, thoracic,
 * shoulder) follows the joint-chapter structure of Magee, Orthopedic Physical
 * Assessment — factual structure, not reproduced content. Test NAMES are standard
 * and non-protectable; the explanations here are MicroPulse's own, grounded in
 * Magee + primary/open sources (Doha agreement for groin; validated special-test
 * studies). Magee is cited as further reading, NOT reproduced — for full test
 * procedures a clinician should use a licensed copy of Magee or an open source.
 */
import type { Bi } from "../registry";
import type { CompensationKey } from "./registry";
import type { RegionKey } from "../vision/regions";
import { compensationLabel } from "./mapping";

export type OrthoTest = {
  id: string;
  name: Bi;
  region: RegionKey;
  /** What structure / quality the test examines. */
  assesses: Bi;
  /** What a positive / limited finding points toward (clinician interprets). */
  indicates: Bi;
  /** Screen compensations that should prompt this test (screen-driven routing).
   *  Empty = region-driven only (a screen can't imply it). */
  addresses: CompensationKey[];
  citation: string;
  /** Trauma / pain / suspected-pathology context → refer before any loading. */
  refer?: boolean;
};

// Standard orthopedic / special tests. Cited to test-accuracy reviews; the exact
// clinical thresholds are the clinician's, not the app's.
export const ORTHO_TESTS: OrthoTest[] = [
  // ── Hip / groin ──
  { id: "faber", name: { en: "FABER (Patrick)", is: "FABER (Patrick)" }, region: "hip", assesses: { en: "Hip / sacroiliac / anterior hip", is: "Mjöðm / spjaldliður / fremri mjöðm" }, indicates: { en: "Intra-articular hip or SIJ involvement; groin pain provocation", is: "Innan-liðar mjöðm eða spjaldliður; nára-verkja framköllun" }, addresses: ["dynamic_valgus", "hip_abductor_weakness", "limb_asymmetry"], citation: "Reiman 2013 (hip special-test accuracy)" },
  { id: "fadir", name: { en: "FADIR (impingement)", is: "FADIR (klemmupróf)" }, region: "hip", assesses: { en: "Femoroacetabular impingement / labrum", is: "Femoroacetabular klemma / labrum" }, indicates: { en: "Anterior hip impingement / labral irritation", is: "Fremri mjaðma-klemma / labrum erting" }, addresses: ["hip_abductor_weakness"], citation: "Reiman 2013" },
  { id: "thomas", name: { en: "Thomas test", is: "Thomas-próf" }, region: "hip", assesses: { en: "Hip-flexor / rectus femoris length", is: "Mjaðma-beygju / rectus femoris lengd" }, indicates: { en: "Tight hip flexors / rec fem — a forward-lean driver", is: "Stífar mjaðma-beygjur / rec fem — orsök framhalla" }, addresses: ["forward_trunk_lean"], citation: "Clark; hip-flexor length testing" },
  { id: "hip_ir_er_rom", name: { en: "Hip IR / ER ROM", is: "Mjaðma IR / ER liðferill" }, region: "hip", assesses: { en: "Hip rotational range", is: "Mjaðma-snúnings ferðasvið" }, indicates: { en: "Reduced IR (FAI / capsular) alters knee/pelvis control", is: "Skert IR (FAI / hulsu) breytir hné-/mjaðmagrindar-stjórn" }, addresses: ["dynamic_valgus", "hip_abductor_weakness"], citation: "Reiman 2013" },
  { id: "trendelenburg", name: { en: "Trendelenburg / single-leg stance", is: "Trendelenburg / einfætt staða" }, region: "hip", assesses: { en: "Gluteus medius function (pelvic control)", is: "Gluteus medius virkni (mjaðmagrindar-stjórn)" }, indicates: { en: "Contralateral pelvic drop → hip-abductor weakness", is: "Mótlægt mjaðmagrindar-fall → mjaðma-fráfærslu veikleiki" }, addresses: ["hip_abductor_weakness", "dynamic_valgus"], citation: "Bramah 2018; Powers 2010" },
  { id: "adductor_squeeze", name: { en: "Adductor squeeze (45° & 0°)", is: "Aðfærslu-kreisting (45° & 0°)" }, region: "hip", assesses: { en: "Adductor-related groin (isometric)", is: "Aðfærslu-tengd nára (ísómetrísk)" }, indicates: { en: "Pain / weakness → adductor-related groin pain", is: "Verkur / veikleiki → aðfærslu-tengd nára-verkur" }, addresses: [], citation: "Hölmich; King 2018 (groin clinical milestone); Doha agreement 2015", refer: true },
  { id: "groin_five_entity_palpation", name: { en: "Groin differential — five clinical entities", is: "Nára-aðgreining — fimm klínísk fyrirbæri" }, region: "hip", assesses: { en: "Adductor / iliopsoas / inguinal / pubic / hip-related groin (Doha)", is: "Aðfærslu- / iliopsoas- / nára- / lífbeins- / mjaðma-tengd nára (Doha)" }, indicates: { en: "Localises the groin source (clinician's differential, Doha agreement)", is: "Staðsetur uppruna nára-verkjar (aðgreining klíníkers, Doha samkomulag)" }, addresses: [], citation: "Doha agreement 2015 (groin pain classification)", refer: true },
  { id: "ober", name: { en: "Ober test", is: "Ober-próf" }, region: "hip", assesses: { en: "ITB / TFL length", is: "ITB / TFL lengd" }, indicates: { en: "Tight ITB/TFL — a lateral-knee / valgus contributor", is: "Stíft ITB/TFL — þáttur í hliðar-hné / valgus" }, addresses: ["dynamic_valgus"], citation: "ITB length testing" },

  // ── Knee ──
  { id: "single_leg_decline_squat", name: { en: "Single-leg / decline squat", is: "Einfætt / halla hnébeygja" }, region: "knee", assesses: { en: "Patellofemoral load + frontal-plane control", is: "Patellofemoral álag + frontal-plana stjórn" }, indicates: { en: "Valgus collapse / anterior-knee pain provocation", is: "Valgus-hrun / fremri hné-verkja framköllun" }, addresses: ["dynamic_valgus", "poor_absorption"], citation: "Crossley; PFP clinical testing" },
  { id: "lachman_anterior_drawer_knee", name: { en: "Lachman / anterior drawer / pivot-shift", is: "Lachman / fremri skúffupróf / pivot-shift" }, region: "knee", assesses: { en: "Anterior cruciate ligament integrity", is: "Fremra krossband heilleiki" }, indicates: { en: "Laxity → ACL involvement; with a trauma history → refer, do not load", is: "Slaki → ACL aðkoma; með áverkasögu → tilvísun, ekki hlaða" }, addresses: [], citation: "Benjaminse 2006 (ACL test accuracy)", refer: true },
  { id: "thessaly_mcmurray", name: { en: "Thessaly / McMurray", is: "Thessaly / McMurray" }, region: "knee", assesses: { en: "Meniscus", is: "Liðþófi" }, indicates: { en: "Joint-line pain / click → meniscal involvement", is: "Liðlínu-verkur / smellur → liðþófa aðkoma" }, addresses: [], citation: "Meniscal test-accuracy reviews", refer: true },

  // ── Ankle / foot ──
  { id: "knee_to_wall_df", name: { en: "Knee-to-wall dorsiflexion", is: "Hné-að-vegg dorsiflexion" }, region: "ankle_foot", assesses: { en: "Weight-bearing ankle dorsiflexion ROM", is: "Álags ökkla-dorsiflexion ferðasvið" }, indicates: { en: "Reduced / asymmetric DF — a valgus & forward-lean driver", is: "Skert / ósamhverf DF — orsök valgus & framhalla" }, addresses: ["limited_dorsiflexion", "dynamic_valgus", "forward_trunk_lean"], citation: "Bennell 1998; Macrum 2012" },
  { id: "anterior_drawer_ankle", name: { en: "Anterior drawer / talar tilt (ankle)", is: "Fremri skúffupróf / talar tilt (ökkli)" }, region: "ankle_foot", assesses: { en: "Lateral ankle ligaments (ATFL/CFL)", is: "Hliðlæg ökkla-liðbönd (ATFL/CFL)" }, indicates: { en: "Laxity → prior lateral sprain / instability", is: "Slaki → fyrri hliðlæg tognun / óstöðugleiki" }, addresses: [], citation: "Lateral-ankle-sprain assessment reviews" },
  { id: "sl_balance_sebt", name: { en: "Single-leg balance / Y-balance (SEBT)", is: "Einfætt jafnvægi / Y-balance (SEBT)" }, region: "ankle_foot", assesses: { en: "Dynamic postural control / proprioception", is: "Dýnamísk stöðustjórn / proprioception" }, indicates: { en: "Asymmetric reach → chronic ankle instability / control deficit", is: "Ósamhverft teygju → langvinn ökkla-óstöðugleiki / stjórn-halli" }, addresses: ["landing_instability", "limb_asymmetry"], citation: "Lin, Delahunt & King 2012; Ross & Guskiewicz 2005" },
  { id: "heel_raise_endurance", name: { en: "Single-leg heel-raise endurance", is: "Einfætt hæl-lyftu úthald" }, region: "ankle_foot", assesses: { en: "Calf / plantar-flexor capacity", is: "Kálfa / plantar-flexor geta" }, indicates: { en: "Reduced reps / asymmetry → calf capacity deficit", is: "Færri endurt. / ósamhverfa → kálfa-getu halli" }, addresses: ["limb_asymmetry"], citation: "Hébert-Losier (heel-raise norms)" },

  // ── Shoulder ──
  { id: "hawkins_neer", name: { en: "Hawkins-Kennedy / Neer", is: "Hawkins-Kennedy / Neer" }, region: "shoulder", assesses: { en: "Subacromial impingement", is: "Subacromial klemma" }, indicates: { en: "Pain arc → subacromial involvement (clinician)", is: "Verkjabogi → subacromial aðkoma (klíníker)" }, addresses: [], citation: "Shoulder impingement test reviews" },
  { id: "empty_can_jobe", name: { en: "Empty can (Jobe)", is: "Empty can (Jobe)" }, region: "shoulder", assesses: { en: "Supraspinatus", is: "Supraspinatus" }, indicates: { en: "Weakness / pain → supraspinatus involvement", is: "Veikleiki / verkur → supraspinatus aðkoma" }, addresses: [], citation: "Cuff test-accuracy reviews" },
  { id: "shoulder_rom_cuff", name: { en: "Shoulder ER/IR ROM + cuff strength", is: "Axlar ER/IR ferðasvið + cuff styrkur" }, region: "shoulder", assesses: { en: "Rotator-cuff range + strength", is: "Snúnings-cuff ferðasvið + styrkur" }, indicates: { en: "GIRD / cuff weakness (overhead athlete)", is: "GIRD / cuff veikleiki (yfirhöfuðs íþróttamaður)" }, addresses: [], citation: "Cuff assessment reviews" },

  // ── Lumbar / thoracic ──
  { id: "aslr", name: { en: "Active straight-leg raise (ASLR)", is: "Virk beinfótar-lyfta (ASLR)" }, region: "lumbar", assesses: { en: "Lumbopelvic load transfer / control", is: "Lendhryggs-mjaðmagrindar álags-flutningur / stjórn" }, indicates: { en: "Poor load transfer → lumbopelvic control deficit", is: "Lélegur álags-flutningur → lendhryggs-mjaðmagrindar stjórn-halli" }, addresses: ["forward_trunk_lean"], citation: "Mens (ASLR); lumbopelvic control" },
  { id: "prone_instability", name: { en: "Prone instability test", is: "Óstöðugleika-próf á maga" }, region: "lumbar", assesses: { en: "Segmental lumbar stability", is: "Hlutbundinn lendhryggs-stöðugleiki" }, indicates: { en: "Positive → benefit from stabilisation work", is: "Jákvætt → gagn af stöðgunar-vinnu" }, addresses: [], citation: "Lumbar clinical-prediction rules" },
  { id: "thoracic_rotation_rom", name: { en: "Seated thoracic-rotation ROM", is: "Sitjandi brjósthryggjar-snúnings ferðasvið" }, region: "thoracic", assesses: { en: "Thoracic rotation range", is: "Brjósthryggjar-snúnings ferðasvið" }, indicates: { en: "Reduced / asymmetric → limits overhead & rotation quality", is: "Skert / ósamhverft → takmarkar yfirhöfuðs- & snúnings-gæði" }, addresses: [], citation: "Thoracic mobility assessment" },
];

export const ORTHO_CAVEAT: Bi = {
  en: "Suggested orthopedic special tests for a CLINICIAN to perform and interpret — a referral aid, not a diagnosis and not something the coach scores. It never changes the readiness colour. Pain / red flags → clinician.",
  is: "Tillögur að klínískum sérprófum fyrir KLÍNÍKER að framkvæma og túlka — tilvísunar-hjálp, ekki greining og ekki eitthvað sem þjálfarinn skorar. Breytir aldrei readiness-litnum. Verkur / rauð flögg → klíníker.",
};

/** Magee is cited as further reading, never reproduced. */
export const MAGEE_REFERENCE: Bi = {
  en: "Further reading (procedures): Magee DJ, Orthopedic Physical Assessment. Explanations here are MicroPulse's own (Magee + Doha agreement + validated special-test studies); for full test procedures use a licensed copy of Magee or an open clinical source.",
  is: "Frekari lesning (framkvæmd): Magee DJ, Orthopedic Physical Assessment. Skýringar hér eru MicroPulse eigin (Magee + Doha samkomulag + staðfestar sérprófs-rannsóknir); fyrir fulla framkvæmd prófa notaðu leyfiseintak af Magee eða opna klíníska heimild.",
};

/** THE finding → assessment-ideas map. Each screen compensation (the finding)
 *  carries a MicroPulse-authored plain rationale ("what a clinician would look at
 *  next / why here") + the tests to consider + a refer flag. This is the coach's
 *  deliverable: an explanation, in plain language, not a diagnosis. */
type AssessmentSuggestion = { rationale: Bi; refer?: boolean; testIds: string[] };
export const ASSESSMENT_SUGGESTIONS: Partial<Record<CompensationKey, AssessmentSuggestion>> = {
  dynamic_valgus: {
    rationale: {
      en: "Knees caving in on a squat or landing usually trace to weak hip control or limited ankle dorsiflexion. A clinician would check hip-abductor strength/control (Trendelenburg), hip mobility (FADIR / FABER / hip IR-ER), ITB/hip-flexor length (Ober / Thomas) and weight-bearing ankle dorsiflexion (knee-to-wall).",
      is: "Þegar hné falla inn í hnébeygju eða lendingu má oftast rekja það til veikrar mjaðma-stjórnar eða skerts ökkla-dorsiflexion. Klíníker myndi skoða mjaðma-fráfærslu styrk/stjórn (Trendelenburg), mjaðma-hreyfanleika (FADIR / FABER / mjaðma IR-ER), ITB/mjaðma-beygju lengd (Ober / Thomas) og álags ökkla-dorsiflexion (hné-að-vegg).",
    },
    testIds: ["trendelenburg", "hip_ir_er_rom", "fadir", "faber", "ober", "single_leg_decline_squat", "knee_to_wall_df"],
  },
  hip_abductor_weakness: {
    rationale: {
      en: "A contralateral pelvic drop points to gluteus-medius / pelvic control. A clinician would confirm with Trendelenburg / single-leg stance and screen hip mobility (FADIR / hip IR-ER).",
      is: "Mótlægt mjaðmagrindar-fall bendir á gluteus medius / mjaðmagrindar-stjórn. Klíníker myndi staðfesta með Trendelenburg / einfættri stöðu og skima mjaðma-hreyfanleika (FADIR / mjaðma IR-ER).",
    },
    testIds: ["trendelenburg", "fadir", "hip_ir_er_rom"],
  },
  forward_trunk_lean: {
    rationale: {
      en: "A forward-leaning or shallow squat often reflects restricted ankle dorsiflexion or hip mobility. A clinician would measure weight-bearing dorsiflexion (knee-to-wall) and hip-flexor length / hip-flexion ROM (Thomas).",
      is: "Framhallandi eða grunn hnébeygja endurspeglar oft skert ökkla-dorsiflexion eða mjaðma-hreyfanleika. Klíníker myndi mæla álags-dorsiflexion (hné-að-vegg) og mjaðma-beygju lengd / mjaðma-beygju ferðasvið (Thomas).",
    },
    testIds: ["knee_to_wall_df", "thomas", "hip_ir_er_rom"],
  },
  limited_dorsiflexion: {
    rationale: {
      en: "Limited or asymmetric ankle dorsiflexion drives both valgus and forward lean. A clinician would measure it directly (weight-bearing knee-to-wall) and check the lateral ankle if there is a sprain history.",
      is: "Skert eða ósamhverft ökkla-dorsiflexion drífur bæði valgus og framhalla. Klíníker myndi mæla það beint (álags hné-að-vegg) og skoða hliðlægan ökkla ef tognunar-saga er til staðar.",
    },
    testIds: ["knee_to_wall_df", "anterior_drawer_ankle"],
  },
  landing_instability: {
    rationale: {
      en: "Poor single-leg landing control can be proprioceptive (ankle) or a knee-stability concern. A clinician screens dynamic postural control (Y-balance) and hip control — and, with any trauma history or giving-way, the knee ligaments (Lachman / pivot-shift) before any loading.",
      is: "Léleg einfætt lendingar-stjórn getur verið proprioceptive (ökkli) eða hné-stöðugleika-mál. Klíníker skimar dýnamíska stöðustjórn (Y-balance) og mjaðma-stjórn — og, með áverkasögu eða „giving-way“, hné-liðbönd (Lachman / pivot-shift) áður en nokkuð er hlaðið.",
    },
    refer: true,
    testIds: ["sl_balance_sebt", "trendelenburg", "lachman_anterior_drawer_knee"],
  },
  low_reactive_strength: {
    rationale: {
      en: "Low reactive strength is a training quality, not a pathology — but if it is one-sided a clinician would rule out a lingering ankle or knee issue (Y-balance, ankle ligaments).",
      is: "Lágur viðbragðsstyrkur er þjálfunar-eiginleiki, ekki meinafræði — en sé hann einhliða myndi klíníker útiloka viðvarandi ökkla- eða hné-vandamál (Y-balance, ökkla-liðbönd).",
    },
    testIds: ["sl_balance_sebt", "anterior_drawer_ankle"],
  },
  poor_absorption: {
    rationale: {
      en: "Stiff, low-absorption landing is usually an eccentric-control quality. If it is painful or one-sided, a clinician would examine the knee (patellofemoral / ligament) before loading.",
      is: "Stíf lending með lítilli deyfingu er oftast eccentric-stjórnar eiginleiki. Sé hún sársaukafull eða einhliða myndi klíníker skoða hnéð (patellofemoral / liðbönd) áður en hlaðið er.",
    },
    testIds: ["single_leg_decline_squat", "lachman_anterior_drawer_knee"],
  },
  limb_asymmetry: {
    rationale: {
      en: "A left/right asymmetry warrants a clinician's side-to-side comparison — hip control (Trendelenburg), calf capacity (single-leg heel-raise) and dynamic control (Y-balance) — to find what drives the gap.",
      is: "Hægri/vinstri ósamhverfa kallar á samanburð klíníkers milli hliða — mjaðma-stjórn (Trendelenburg), kálfa-getu (einfætt hæl-lyfta) og dýnamíska stjórn (Y-balance) — til að finna hvað veldur muninum.",
    },
    testIds: ["trendelenburg", "heel_raise_endurance", "sl_balance_sebt"],
  },
};

/** A groin-pain path that is NOT a movement-quality compensation — surfaced when
 *  the coach names the hip/groin region or a finding is pain-flagged. Always refer. */
export const GROIN_SUGGESTION: AssessmentSuggestion & { label: Bi } = {
  label: { en: "Groin pain on hip loading", is: "Nára-verkur við mjaðma-álag" },
  rationale: {
    en: "Groin pain provoked by hip loading needs a clinician's differential (Doha agreement) across the five clinical entities — adductor, iliopsoas, inguinal, pubic and hip-related — before any loading. Refer.",
    is: "Nára-verkur sem kemur við mjaðma-álag þarf aðgreiningu klíníkers (Doha samkomulag) yfir fimm klínísk fyrirbæri — aðfærslu-, iliopsoas-, nára-, lífbeins- og mjaðma-tengd — áður en nokkuð er hlaðið. Vísaðu áfram.",
  },
  refer: true,
  testIds: ["adductor_squeeze", "groin_five_entity_palpation", "fadir", "hip_ir_er_rom"],
};

export type AssessmentIdea = {
  finding: CompensationKey;
  findingLabel: Bi;
  rationale: Bi;
  refer: boolean;
  groups: Array<{ region: RegionKey; tests: OrthoTest[] }>;
};

const TEST_BY_ID: Record<string, OrthoTest> = Object.fromEntries(ORTHO_TESTS.map((t) => [t.id, t]));

/** Build the "clinical assessment ideas" for a set of screen findings. */
export function buildAssessmentIdeas(compKeys: CompensationKey[]): { ideas: AssessmentIdea[]; anyRefer: boolean } {
  const ideas: AssessmentIdea[] = [];
  for (const key of compKeys) {
    const s = ASSESSMENT_SUGGESTIONS[key];
    if (!s) continue;
    const tests = s.testIds.map((id) => TEST_BY_ID[id]).filter((t): t is OrthoTest => !!t);
    ideas.push({
      finding: key,
      findingLabel: compensationLabel(key),
      rationale: s.rationale,
      refer: !!s.refer || tests.some((t) => t.refer),
      groups: groupOrthoByRegion(tests),
    });
  }
  return { ideas, anyRefer: ideas.some((i) => i.refer) };
}

/** Screen-driven: tests whose compensations intersect the fired ones. */
export function orthoTestsForCompensations(compKeys: CompensationKey[]): OrthoTest[] {
  const set = new Set(compKeys);
  return ORTHO_TESTS.filter((t) => t.addresses.some((a) => set.has(a)));
}

/** Coach-driven: all tests for a body region the coach names. */
export function orthoTestsForRegion(region: RegionKey): OrthoTest[] {
  return ORTHO_TESTS.filter((t) => t.region === region);
}

/** Group a set of tests by region (for display). */
export function groupOrthoByRegion(tests: OrthoTest[]): Array<{ region: RegionKey; tests: OrthoTest[] }> {
  const order: RegionKey[] = ["hip", "knee", "ankle_foot", "lumbar", "thoracic", "shoulder", "cervical"];
  const by = new Map<RegionKey, OrthoTest[]>();
  for (const t of tests) { const a = by.get(t.region) ?? []; a.push(t); by.set(t.region, a); }
  return order.filter((r) => by.has(r)).map((r) => ({ region: r, tests: by.get(r)! }));
}

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
 */
import type { Bi } from "../registry";
import type { CompensationKey } from "./registry";
import type { RegionKey } from "../vision/regions";

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
  { id: "adductor_squeeze", name: { en: "Adductor squeeze (45° & 0°)", is: "Aðfærslu-kreisting (45° & 0°)" }, region: "hip", assesses: { en: "Adductor-related groin (isometric)", is: "Aðfærslu-tengd nára (ísómetrísk)" }, indicates: { en: "Pain / weakness → adductor-related groin pain", is: "Verkur / veikleiki → aðfærslu-tengd nára-verkur" }, addresses: [], citation: "Hölmich; King 2018 (groin clinical milestone)" },
  { id: "ober", name: { en: "Ober test", is: "Ober-próf" }, region: "hip", assesses: { en: "ITB / TFL length", is: "ITB / TFL lengd" }, indicates: { en: "Tight ITB/TFL — a lateral-knee / valgus contributor", is: "Stíft ITB/TFL — þáttur í hliðar-hné / valgus" }, addresses: ["dynamic_valgus"], citation: "ITB length testing" },

  // ── Knee ──
  { id: "single_leg_decline_squat", name: { en: "Single-leg / decline squat", is: "Einfætt / halla hnébeygja" }, region: "knee", assesses: { en: "Patellofemoral load + frontal-plane control", is: "Patellofemoral álag + frontal-plana stjórn" }, indicates: { en: "Valgus collapse / anterior-knee pain provocation", is: "Valgus-hrun / fremri hné-verkja framköllun" }, addresses: ["dynamic_valgus", "poor_absorption"], citation: "Crossley; PFP clinical testing" },
  { id: "lachman_anterior_drawer_knee", name: { en: "Lachman / anterior drawer", is: "Lachman / fremri skúffupróf" }, region: "knee", assesses: { en: "Anterior cruciate ligament integrity", is: "Fremra krossband heilleiki" }, indicates: { en: "Laxity → ACL involvement (clinician)", is: "Slaki → ACL aðkoma (klíníker)" }, addresses: [], citation: "Benjaminse 2006 (ACL test accuracy)" },
  { id: "thessaly_mcmurray", name: { en: "Thessaly / McMurray", is: "Thessaly / McMurray" }, region: "knee", assesses: { en: "Meniscus", is: "Liðþófi" }, indicates: { en: "Joint-line pain / click → meniscal involvement", is: "Liðlínu-verkur / smellur → liðþófa aðkoma" }, addresses: [], citation: "Meniscal test-accuracy reviews" },

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

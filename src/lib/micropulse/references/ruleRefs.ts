/**
 * Full references for the short citations in the training-programme rules ("Carling 2018" → authors, title,
 * journal, year, DOI). The rules keep writing the short form in their `evidence` / `cite` text; this file is where a
 * short form resolves to the paper, so an article, a PDF or a "Show details" line can print the full reference.
 *
 * Scope (2026-11-23): every short citation in docs/aefingakerfi-reglur.md. Papers that already have a full entry in
 * the goal-plan / speed-method registries are reused from there, never copied (see `findRefByShort`).
 *
 * How each entry was checked: PubMed record (E-utilities esummary) or Crossref, and the abstract read against what
 * the rule says. `verifiedFrom: "abstract"` means MicroPulse read the abstract, not the full text.
 * A short citation that could not be pinned to one paper is listed in `UNRESOLVED_SHORTS` with the reason; it is
 * never guessed.
 */
import { SPEED_REFS } from "@/lib/micropulse/speedMethods";
import { ACCEL_REFS } from "@/lib/micropulse/goalPlan/acceleration";
import { BRAKING_REFS } from "@/lib/micropulse/goalPlan/braking";
import { GYM_REFS } from "@/lib/micropulse/goalPlan/gymGoals";
import { JUMP_REFS } from "@/lib/micropulse/goalPlan/jump";
import { RX_REFS } from "@/lib/micropulse/goalPlan/liftRx";
import type { GoalRef } from "@/lib/micropulse/goalPlan/types";

/** New entries for the rule citations (papers no other registry holds). */
export const RULE_REFS: Record<string, GoalRef> = {
  arnason2008: { key: "arnason2008", short: "Arnason 2008", cite: "Arnason A, Andersen TE, Holme I, Engebretsen L, Bahr R. Prevention of hamstring strains in elite soccer: an intervention study. Scand J Med Sci Sports 2008;18(1):40–48. doi:10.1111/j.1600-0838.2006.00634.x PMID 17355322", verifiedFrom: "abstract" },
  bourne2017: { key: "bourne2017", short: "Bourne 2017", cite: "Bourne MN, Duhig SJ, Timmins RG, Williams MD, Opar DA, Al Najjar A, Kerr GK, Shield AJ. Impact of the Nordic hamstring and hip extension exercises on hamstring architecture and morphology: implications for injury prevention. Br J Sports Med 2017;51(5):469–477. doi:10.1136/bjsports-2016-096130 PMID 27660368", verifiedFrom: "abstract" },
  carling2018: { key: "carling2018", short: "Carling 2018", cite: "Carling C, Lacome M, McCall A, Dupont G, Le Gall F, Simpson B, Buchheit M. Monitoring of Post-match Fatigue in Professional Soccer: Welcome to the Real World. Sports Med 2018;48(12):2695–2702. doi:10.1007/s40279-018-0935-z PMID 29740792", verifiedFrom: "abstract" },
  claudino2017: { key: "claudino2017", short: "Claudino 2017", cite: "Claudino JG, Cronin J, Mezêncio B, McMaster DT, McGuigan M, Tricoli V, Amadio AC, Serrão JC. The countermovement jump to monitor neuromuscular status: A meta-analysis. J Sci Med Sport 2017;20(4):397–402. doi:10.1016/j.jsams.2016.08.011 PMID 27663764", verifiedFrom: "abstract" },
  edouard2019: { key: "edouard2019", short: "Edouard 2019", cite: "Edouard P, Mendiguchia J, Guex K, Lahti J, Samozino P, Morin JB. Sprinting: a potential vaccine for hamstring injury? Sport Perform Sci Rep 2019;48:v1.", verifiedFrom: "abstract" },
  fessi2016: { key: "fessi2016", short: "Fessi 2016", cite: "Fessi MS, Zarrouk N, Di Salvo V, Filetti C, Barker AR, Moalla W. Effects of tapering on physical match activities in professional soccer players. J Sports Sci 2016;34(24):2189–2194. doi:10.1080/02640414.2016.1171891 PMID 27065344", verifiedFrom: "abstract" },
  foster1998: { key: "foster1998", short: "Foster 1998", cite: "Foster C. Monitoring training in athletes with reference to overtraining syndrome. Med Sci Sports Exerc 1998;30(7):1164–1168. doi:10.1097/00005768-199807000-00023 PMID 9662690", verifiedFrom: "abstract" },
  gathercole2015: { key: "gathercole2015", short: "Gathercole 2015", cite: "Gathercole R, Sporer B, Stellingwerff T, Sleivert G. Alternative countermovement-jump analysis to quantify acute neuromuscular fatigue. Int J Sports Physiol Perform 2015;10(1):84–92. doi:10.1123/ijspp.2013-0413 PMID 24912201", verifiedFrom: "abstract" },
  grgic2018: { key: "grgic2018", short: "Grgic 2018", cite: "Grgic J, Schoenfeld BJ, Davies TB, Lazinica B, Krieger JW, Pedisic Z. Effect of Resistance Training Frequency on Gains in Muscular Strength: A Systematic Review and Meta-Analysis. Sports Med 2018;48(5):1207–1220. doi:10.1007/s40279-018-0872-x PMID 29470825", verifiedFrom: "abstract" },
  gullett2009: { key: "gullett2009", short: "Gullett 2009", cite: "Gullett JC, Tillman MD, Gutierrez GM, Chow JW. A biomechanical comparison of back and front squats in healthy trained individuals. J Strength Cond Res 2009;23(1):284–292. doi:10.1519/JSC.0b013e31818546bb PMID 19002072", verifiedFrom: "abstract" },
  hader2019: { key: "hader2019", short: "Hader 2019", cite: "Hader K, Rumpf MC, Hertzog M, Kilduff LP, Girard O, Silva JR. Monitoring the Athlete Match Response: Can External Load Variables Predict Post-match Acute and Residual Fatigue in Soccer? A Systematic Review with Meta-analysis. Sports Med Open 2019;5(1):48. doi:10.1186/s40798-019-0219-7 PMID 31820260", verifiedFrom: "abstract" },
  haroy2019: { key: "haroy2019", short: "Harøy 2019", cite: "Harøy J, Clarsen B, Wiger EG, Øyen MG, Serner A, Thorborg K, Hölmich P, Andersen TE, Bahr R. The Adductor Strengthening Programme prevents groin problems among male football players: a cluster-randomised controlled trial. Br J Sports Med 2019;53(3):150–157. doi:10.1136/bjsports-2017-098937 PMID 29891614", verifiedFrom: "abstract" },
  harrison2019: { key: "harrison2019", short: "Harrison 2019", cite: "Harrison PW, James LP, McGuigan MR, Jenkins DG, Kelly VG. Resistance Priming to Enhance Neuromuscular Performance in Sport: Evidence, Potential Mechanisms and Directions for Future Research. Sports Med 2019;49(10):1499–1514. doi:10.1007/s40279-019-01136-3 PMID 31203499", verifiedFrom: "abstract" },
  helms2016: { key: "helms2016", short: "Helms 2016", cite: "Helms ER, Cronin J, Storey A, Zourdos MC. Application of the Repetitions in Reserve-Based Rating of Perceived Exertion Scale for Resistance Training. Strength Cond J 2016;38(4):42–49. doi:10.1519/SSC.0000000000000218 PMID 27531969", verifiedFrom: "abstract" },
  hoffhelgerud2004: { key: "hoffhelgerud2004", short: "Hoff & Helgerud 2004", cite: "Hoff J, Helgerud J. Endurance and strength training for soccer players: physiological considerations. Sports Med 2004;34(3):165–180. doi:10.2165/00007256-200434030-00003 PMID 14987126", verifiedFrom: "abstract" },
  issurin2010: { key: "issurin2010", short: "Issurin 2010", cite: "Issurin VB. New horizons for the methodology and physiology of training periodization. Sports Med 2010;40(3):189–206. doi:10.2165/11319770-000000000-00000 PMID 20199119", verifiedFrom: "abstract" },
  krause2015: { key: "krause2015", short: "Krause 2015", cite: "Krause DA, Boyd MS, Hager AN, Smoyer EC, Thompson AT, Hollman JH. Reliability and accuracy of a goniometer mobile device application for video measurement of the functional movement screen deep squat test. Int J Sports Phys Ther 2015;10(1):37–44. PMID 25709861", verifiedFrom: "abstract" },
  lauersen2018: { key: "lauersen2018", short: "Lauersen 2018", cite: "Lauersen JB, Andersen TE, Andersen LB. Strength training as superior, dose-dependent and safe prevention of acute and overuse sports injuries: a systematic review, qualitative analysis and meta-analysis. Br J Sports Med 2018;52(24):1557–1563. doi:10.1136/bjsports-2018-099078 PMID 30131332", verifiedFrom: "abstract" },
  malone2015: { key: "malone2015", short: "Malone 2015", cite: "Malone JJ, Di Michele R, Morgans R, Burgess D, Morton JP, Drust B. Seasonal training-load quantification in elite English premier league soccer players. Int J Sports Physiol Perform 2015;10(4):489–497. doi:10.1123/ijspp.2014-0352 PMID 25393111", verifiedFrom: "abstract" },
  mann2015: { key: "mann2015", short: "Mann 2015", cite: "Mann JB, Ivey PA, Sayers SP. Velocity-based training in football. Strength Cond J 2015;37(6):52–57. doi:10.1519/SSC.0000000000000177", verifiedFrom: "abstract" },
  mchugh2003: { key: "mchugh2003", short: "McHugh 2003", cite: "McHugh MP. Recent advances in the understanding of the repeated bout effect: the protective effect against muscle damage from a single bout of eccentric exercise. Scand J Med Sci Sports 2003;13(2):88–97. doi:10.1034/j.1600-0838.2003.02477.x PMID 12641640", verifiedFrom: "abstract" },
  moalla2021: { key: "moalla2021", short: "Moalla 2021", cite: "Moalla W, Fessi MS, Nouira S, Mendez-Villanueva A, Di Salvo V, Ahmaidi S. Optimal Pretaper Phase on Physical Match Performance in Professional Soccer. Int J Sports Physiol Perform 2021;16(10):1483–1489. doi:10.1123/ijspp.2020-0334 PMID 33761460", verifiedFrom: "abstract" },
  mujikapadilla2000: { key: "mujikapadilla2000", short: "Mujika & Padilla 2000", cite: "Mujika I, Padilla S. Detraining: loss of training-induced physiological and performance adaptations. Part I: short term insufficient training stimulus. Sports Med 2000;30(2):79–87. doi:10.2165/00007256-200030020-00002 PMID 10966148", verifiedFrom: "abstract" },
  nedelec2012: { key: "nedelec2012", short: "Nédélec 2012", cite: "Nédélec M, McCall A, Carling C, Legall F, Berthoin S, Dupont G. Recovery in soccer: part I - post-match fatigue and time course of recovery. Sports Med 2012;42(12):997–1015. doi:10.2165/11635270-000000000-00000 PMID 23046224", verifiedFrom: "abstract" },
  ntoumanis2021: { key: "ntoumanis2021", short: "Ntoumanis 2021", cite: "Ntoumanis N, Ng JYY, Prestwich A, Quested E, Hancox JE, Thøgersen-Ntoumani C, Deci EL, Ryan RM, Lonsdale C, Williams GC. A meta-analysis of self-determination theory-informed intervention studies in the health domain: effects on motivation, health behavior, physical, and psychological health. Health Psychol Rev 2021;15(2):214–244. doi:10.1080/17437199.2020.1718529 PMID 31983293", verifiedFrom: "abstract" },
  post2017: { key: "post2017", short: "Post 2017", cite: "Post EG, Olson M, Trigsted S, Hetzel S, Bell DR. The Reliability and Discriminative Ability of the Overhead Squat Test for Observational Screening of Medial Knee Displacement. J Sport Rehabil 2017;26(1). doi:10.1123/jsr.2015-0178 PMID 27834577", verifiedFrom: "abstract" },
  rodriguezrosell2020: { key: "rodriguezrosell2020", short: "Rodríguez-Rosell 2020", cite: "Rodríguez-Rosell D, Yáñez-García JM, Mora-Custodio R, Pareja-Blanco F, Ravelo-García AG, Ribas-Serna J, González-Badillo JJ. Velocity-based resistance training: impact of velocity loss in the set on neuromuscular performance and hormonal response. Appl Physiol Nutr Metab 2020;45(8):817–828. doi:10.1139/apnm-2019-0829 PMID 32017598", verifiedFrom: "abstract" },
  rossguskiewicz2005: { key: "rossguskiewicz2005", short: "Ross & Guskiewicz 2005", cite: "Ross SE, Guskiewicz KM, Yu B. Single-leg jump-landing stabilization times in subjects with functionally unstable ankles. J Athl Train 2005;40(4):298–304. PMID 16404451", verifiedFrom: "abstract" },
  schaber2021: { key: "schaber2021", short: "Schaber 2021", cite: "Schaber M, Guiser Z, Brauer L, Jackson R, Banyasz J, Miletti R, Hassen-Miller A. The Neuromuscular Effects of the Copenhagen Adductor Exercise: A Systematic Review. Int J Sports Phys Ther 2021;16(5):1210–1221. doi:10.26603/001c.27975 PMID 34631242", verifiedFrom: "abstract" },
  schoenfeld2019: { key: "schoenfeld2019", short: "Schoenfeld 2019", cite: "Schoenfeld BJ, Contreras B, Krieger J, Grgic J, Delcastillo K, Belliard R, Alto A. Resistance Training Volume Enhances Muscle Hypertrophy but Not Strength in Trained Men. Med Sci Sports Exerc 2019;51(1):94–103. doi:10.1249/MSS.0000000000001764 PMID 30153194", verifiedFrom: "abstract" },
  vanderhorst2015: { key: "vanderhorst2015", short: "van der Horst 2015", cite: "van der Horst N, Smits DW, Petersen J, Goedhart EA, Backx FJ. The preventive effect of the nordic hamstring exercise on hamstring injuries in amateur soccer players: a randomized controlled trial. Am J Sports Med 2015;43(6):1316–1323. doi:10.1177/0363546515574057 PMID 25794868", verifiedFrom: "abstract" },
  vandyk2019: { key: "vandyk2019", short: "van Dyk 2019", cite: "van Dyk N, Behan FP, Whiteley R. Including the Nordic hamstring exercise in injury prevention programmes halves the rate of hamstring injuries: a systematic review and meta-analysis of 8459 athletes. Br J Sports Med 2019;53(21):1362–1370. doi:10.1136/bjsports-2018-100045 PMID 30808663", verifiedFrom: "abstract" },
};

/** Other spellings of the same short citation used in the rule text. */
const SHORT_ALIASES: Record<string, string> = {
  "Mujika 2000": "Mujika & Padilla 2000",
  "Harøy et al. 2019": "Harøy 2019",
  "van Dyk et al. 2019": "van Dyk 2019",
  "Ntoumanis et al. 2021": "Ntoumanis 2021",
};

/**
 * Short citations used in the rules that could not be pinned to one paper. Each stays in the rule text as written;
 * the coach decides whether to replace it. Never resolved by guessing.
 */
export const UNRESOLVED_SHORTS: Record<string, { en: string; is: string }> = {
  "Bishop 2020": {
    en: "The code comment gives J Athl Train 2020;55:1062–1070, which matches no PubMed record. Bishop published several limb-asymmetry papers around 2020; which one is meant is not recorded.",
    is: "Athugasemdin í kóðanum gefur J Athl Train 2020;55:1062–1070, sem passar ekki við neina færslu á PubMed. Bishop birti nokkrar greinar um ósamhverfu um 2020 og ekki er skráð hver þeirra er átt við.",
  },
  "Buchheit 2024": {
    en: "Cited as \"The 11 Principles of Microcycle Periodization\"; no such paper found on PubMed or Crossref.",
    is: "Vitnað í sem „The 11 Principles of Microcycle Periodization“; engin slík grein fannst á PubMed eða Crossref.",
  },
  "Comfort 2018": {
    en: "Comfort published several isometric mid-thigh pull papers in 2018–2019; which one supports the rule is not recorded.",
    is: "Comfort birti nokkrar greinar um ísómetrískt mid-thigh pull 2018–2019 og ekki er skráð hver þeirra styður regluna.",
  },
  "Gabbett 2017": {
    en: "Gabbett co-wrote several load-monitoring papers in 2017; which one is meant is not recorded. The best-known acute:chronic paper is Gabbett 2016.",
    is: "Gabbett var meðhöfundur að nokkrum greinum um álagsvöktun 2017 og ekki er skráð hver er átt við. Þekktasta greinin um skammtíma- og langtímaálag er Gabbett 2016.",
  },
  "Lim 2020": {
    en: "No 2020 paper by Lim (or Lim & Childs) on long isometrics and tendons was found. The closest is Lim & Wong 2018 (patellar tendinopathy).",
    is: "Engin grein eftir Lim (eða Lim & Childs) frá 2020 um langar ísómetrískar æfingar og sinar fannst. Næst kemst Lim & Wong 2018 (sinakvilli í hnéskeljarsin).",
  },
  "Rønnestad 2023": {
    en: "No 2023 paper by Rønnestad on microdosing was found. The microdosing work in football is Cuthbert's (framework 2021, thesis 2022); Rønnestad's in-season strength paper is from 2011.",
    is: "Engin grein eftir Rønnestad frá 2023 um örskammta fannst. Rannsóknirnar á örskömmtum í fótbolta eru eftir Cuthbert (rammi 2021, doktorsritgerð 2022); grein Rønnestad um styrk á keppnistímabili er frá 2011.",
  },
};

const ALL_REFS: GoalRef[] = [
  ...Object.values(RULE_REFS),
  ...Object.values(SPEED_REFS),
  ...Object.values(ACCEL_REFS),
  ...Object.values(BRAKING_REFS),
  ...Object.values(JUMP_REFS),
  ...Object.values(GYM_REFS),
  ...Object.values(RX_REFS),
];

/** "Dos’Santos  2019" and "Dos'Santos 2019" are the same short. */
function norm(s: string): string {
  return s.normalize("NFC").replace(/[’ʼ]/g, "'").replace(/\s+/g, " ").trim();
}

const BY_SHORT: Map<string, GoalRef> = (() => {
  const m = new Map<string, GoalRef>();
  for (const r of ALL_REFS) if (!m.has(norm(r.short))) m.set(norm(r.short), r);
  return m;
})();

/** The full reference for a short citation, or null when it is unresolved or unknown. */
export function findRefByShort(short: string): GoalRef | null {
  const s = norm(short);
  const canonical = SHORT_ALIASES[s] ?? s;
  return BY_SHORT.get(norm(canonical)) ?? null;
}

/**
 * Every known short citation found in a citation text ("Carling 2018; Nédélec 2012 o.fl."), in order of
 * appearance, with its full reference — or with the reason it is unresolved.
 */
export function fullRefsFor(text: string): Array<{ short: string; ref: GoalRef | null; unresolved: { en: string; is: string } | null }> {
  const t = norm(text);
  const shorts = [...BY_SHORT.keys(), ...Object.keys(SHORT_ALIASES), ...Object.keys(UNRESOLVED_SHORTS)];
  const hits: Array<{ at: number; short: string }> = [];
  for (const s of shorts) {
    const at = t.indexOf(norm(s));
    if (at >= 0) hits.push({ at, short: s });
  }
  hits.sort((a, b) => a.at - b.at || b.short.length - a.short.length);
  const seen = new Set<string>();
  const out: Array<{ short: string; ref: GoalRef | null; unresolved: { en: string; is: string } | null }> = [];
  for (const h of hits) {
    const ref = findRefByShort(h.short);
    const id = ref?.key ?? h.short;
    if (seen.has(id)) continue;
    // A short inside a longer one already taken ("Harøy 2019" inside "Harøy et al. 2019"'s alias) is the same paper.
    if (out.some((o) => o.short.length > h.short.length && o.short.includes(h.short))) continue;
    seen.add(id);
    out.push({ short: h.short, ref, unresolved: ref ? null : UNRESOLVED_SHORTS[h.short] ?? null });
  }
  return out;
}

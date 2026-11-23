/**
 * Full references for the short citations in the training-programme rules ("Carling 2018" → authors, title,
 * journal, year, DOI). The rules keep writing the short form in their `evidence` / `cite` text; this file is where a
 * short form resolves to the paper, so an article, a PDF or a "Show details" line can print the full reference.
 *
 * Scope (2026-11-23): every short citation in docs/aefingakerfi-reglur.md and in the rule code
 * (strengthProgramming/, planIntent/, goalPlan/, periodization/, plannedSessionLoad.ts). Papers that already have a
 * full entry in the goal-plan / speed-method registries are reused from there, never copied (see `findRefByShort`).
 *
 * How each entry was checked: the PubMed record (E-utilities esummary) or, for journals PubMed does not index, the
 * Crossref record; the abstract was read against what the rule says where the match was not obvious from the title.
 * `verifiedFrom: "abstract"` means MicroPulse did not read the full text. A paper the code cites by the year it went
 * online, while the issue came out later, carries "Published ahead of print <year>".
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
  anderson2016: { key: "anderson2016", short: "Anderson 2016", cite: "Anderson L, Orme P, Di Michele R, Close GL, Morgans R, Drust B, Morton JP. Quantification of training load during one-, two- and three-game week schedules in professional soccer players from the English Premier League: implications for carbohydrate periodisation. J Sports Sci 2016;34(13):1250–1259. doi:10.1080/02640414.2015.1106574 PMID 26536538", verifiedFrom: "abstract" },
  arnason2008: { key: "arnason2008", short: "Arnason 2008", cite: "Arnason A, Andersen TE, Holme I, Engebretsen L, Bahr R. Prevention of hamstring strains in elite soccer: an intervention study. Scand J Med Sci Sports 2008;18(1):40–48. doi:10.1111/j.1600-0838.2006.00634.x PMID 17355322", verifiedFrom: "abstract" },
  balsalobrefernandez2021: { key: "balsalobrefernandez2021", short: "Balsalobre-Fernández 2021", cite: "Balsalobre-Fernández C, Torres-Ronda L. The Implementation of Velocity-Based Training Paradigm for Team Sports: Framework, Technologies, Practical Recommendations and Challenges. Sports (Basel) 2021;9(4). doi:10.3390/sports9040047 PMID 33808302", verifiedFrom: "abstract" },
  bangsbo2008: { key: "bangsbo2008", short: "Bangsbo 2008", cite: "Bangsbo J, Iaia FM, Krustrup P. The Yo-Yo intermittent recovery test : a useful tool for evaluation of physical performance in intermittent sports. Sports Med 2008;38(1):37–51. doi:10.2165/00007256-200838010-00004 PMID 18081366", verifiedFrom: "abstract" },
  benavidesubric2020: { key: "benavidesubric2020", short: "Benavides-Ubric 2020", cite: "Benavides-Ubric A, Díez-Fernández DM, Rodríguez-Pérez MA, Ortega-Becerra M, Pareja-Blanco F. Analysis of the Load-Velocity Relationship in Deadlift Exercise. J Sports Sci Med 2020;19(3):452–459. PMID 32874097", verifiedFrom: "abstract" },
  bishop2018: { key: "bishop2018", short: "Bishop 2018", cite: "Bishop C, Turner A, Read P. Effects of inter-limb asymmetries on physical and sports performance: a systematic review. J Sports Sci 2018;36(10):1135–1144. doi:10.1080/02640414.2017.1361894 PMID 28767317", verifiedFrom: "abstract" },
  bosquet2007: { key: "bosquet2007", short: "Bosquet 2007", cite: "Bosquet L, Montpetit J, Arvisais D, Mujika I. Effects of tapering on performance: a meta-analysis. Med Sci Sports Exerc 2007;39(8):1358–1365. doi:10.1249/mss.0b013e31806010e0 PMID 17762369", verifiedFrom: "abstract" },
  bourne2017: { key: "bourne2017", short: "Bourne 2017", cite: "Bourne MN, Duhig SJ, Timmins RG, Williams MD, Opar DA, Al Najjar A, Kerr GK, Shield AJ. Impact of the Nordic hamstring and hip extension exercises on hamstring architecture and morphology: implications for injury prevention. Br J Sports Med 2017;51(5):469–477. doi:10.1136/bjsports-2016-096130 PMID 27660368", verifiedFrom: "abstract" },
  bourne2018: { key: "bourne2018", short: "Bourne 2018", cite: "Bourne MN, Timmins RG, Opar DA, Pizzari T, Ruddy JD, Sims C, Williams MD, Shield AJ. An Evidence-Based Framework for Strengthening Exercises to Prevent Hamstring Injury. Sports Med 2018;48(2):251–267. doi:10.1007/s40279-017-0796-x PMID 29116573", verifiedFrom: "abstract" },
  brzycki1993: { key: "brzycki1993", short: "Brzycki 1993", cite: "Brzycki M. Strength testing—predicting a one-rep max from reps-to-fatigue. J Phys Educ Recreat Dance 1993;64(1):88–90. doi:10.1080/07303084.1993.10606684", verifiedFrom: "abstract" },
  buchheit2008: { key: "buchheit2008", short: "Buchheit 2008", cite: "Buchheit M. The 30-15 intermittent fitness test: accuracy for individualizing interval training of young intermittent sport players. J Strength Cond Res 2008;22(2):365–374. doi:10.1519/JSC.0b013e3181635b2e PMID 18550949", verifiedFrom: "abstract" },
  buchheitlaursen2013: { key: "buchheitlaursen2013", short: "Buchheit & Laursen 2013", cite: "Buchheit M, Laursen PB. High-intensity interval training, solutions to the programming puzzle: Part I: cardiopulmonary emphasis. Sports Med 2013;43(5):313–338. doi:10.1007/s40279-013-0029-x PMID 23539308", verifiedFrom: "abstract" },
  carling2018: { key: "carling2018", short: "Carling 2018", cite: "Carling C, Lacome M, McCall A, Dupont G, Le Gall F, Simpson B, Buchheit M. Monitoring of Post-match Fatigue in Professional Soccer: Welcome to the Real World. Sports Med 2018;48(12):2695–2702. doi:10.1007/s40279-018-0935-z PMID 29740792", verifiedFrom: "abstract" },
  casamichana2022: { key: "casamichana2022", short: "Casamichana 2022", cite: "Casamichana D, Martín-García A, Díaz AG, Bradley PS, Castellano J. Accumulative weekly load in a professional football team: with special reference to match playing time and game position. Biol Sport 2022;39(1):115–124. doi:10.5114/biolsport.2021.102924 PMID 35173370", verifiedFrom: "abstract" },
  claudino2017: { key: "claudino2017", short: "Claudino 2017", cite: "Claudino JG, Cronin J, Mezêncio B, McMaster DT, McGuigan M, Tricoli V, Amadio AC, Serrão JC. The countermovement jump to monitor neuromuscular status: A meta-analysis. J Sci Med Sport 2017;20(4):397–402. doi:10.1016/j.jsams.2016.08.011 PMID 27663764", verifiedFrom: "abstract" },
  clemente2019: { key: "clemente2019", short: "Clemente 2019", cite: "Clemente FM, Owen A, Serra-Olivares J, Nikolaidis PT, van der Linden CMI, Mendes B. Characterization of the Weekly External Load Profile of Professional Soccer Teams from Portugal and the Netherlands. J Hum Kinet 2019;66:155–164. doi:10.2478/hukin-2018-0054 PMID 30988849", verifiedFrom: "abstract" },
  contreras2017: { key: "contreras2017", short: "Contreras 2017", cite: "Contreras B, Vigotsky AD, Schoenfeld BJ, Beardsley C, McMaster DT, Reyneke JH, Cronin JB. Effects of a Six-Week Hip Thrust vs. Front Squat Resistance Training Program on Performance in Adolescent Males: A Randomized Controlled Trial. J Strength Cond Res 2017;31(4):999–1008. doi:10.1519/JSC.0000000000001510 PMID 27253835", verifiedFrom: "abstract" },
  cormie2011: { key: "cormie2011", short: "Cormie 2011", cite: "Cormie P, McGuigan MR, Newton RU. Developing maximal neuromuscular power: part 2 - training considerations for improving maximal power production. Sports Med 2011;41(2):125–146. doi:10.2165/11538500-000000000-00000 PMID 21244105", verifiedFrom: "abstract" },
  cuthbert2024: { key: "cuthbert2024", short: "Cuthbert 2024", cite: "Cuthbert M, Haff GG, McMahon JJ, Evans M, Comfort P. Microdosing: a conceptual framework for use as programming strategy for resistance training in team sports. Strength Cond J 2024;46(2):180–201. doi:10.1519/SSC.0000000000000786", verifiedFrom: "abstract" },
  dalen2019: { key: "dalen2019", short: "Dalen 2019", cite: "Dalen T, Sandmæl S, Stevens TGA, Hjelde GH, Kjøsnes TN, Wisløff U. Differences in Acceleration and High-Intensity Activities Between Small-Sided Games and Peak Periods of Official Matches in Elite Soccer Players. J Strength Cond Res 2021;35(7):2018–2024. Published ahead of print 2019. doi:10.1519/JSC.0000000000003081 PMID 30741867", verifiedFrom: "abstract" },
  davies2021: { key: "davies2021", short: "Davies 2021", cite: "Davies TB, Tran DL, Hogan CM, Haff GG, Latella C. Chronic Effects of Altering Resistance Training Set Configurations Using Cluster Sets: A Systematic Review and Meta-Analysis. Sports Med 2021;51(4):707–736. doi:10.1007/s40279-020-01408-3 PMID 33475986", verifiedFrom: "abstract" },
  diprampero1986: { key: "diprampero1986", short: "di Prampero 1986", cite: "di Prampero PE. The energy cost of human locomotion on land and in water. Int J Sports Med 1986;7(2):55–72. doi:10.1055/s-2008-1025736 PMID 3519480", verifiedFrom: "abstract" },
  duhig2016: { key: "duhig2016", short: "Duhig 2016", cite: "Duhig S, Shield AJ, Opar D, Gabbett TJ, Ferguson C, Williams M. Effect of high-speed running on hamstring strain injury risk. Br J Sports Med 2016;50(24):1536–1540. doi:10.1136/bjsports-2015-095679 PMID 27288515", verifiedFrom: "abstract" },
  dupont2010: { key: "dupont2010", short: "Dupont 2010", cite: "Dupont G, Nedelec M, McCall A, McCormack D, Berthoin S, Wisløff U. Effect of 2 soccer matches in a week on physical performance and injury rate. Am J Sports Med 2010;38(9):1752–1758. doi:10.1177/0363546510361236", verifiedFrom: "abstract" },
  edouard2019: { key: "edouard2019", short: "Edouard 2019", cite: "Edouard P, Mendiguchia J, Guex K, Lahti J, Samozino P, Morin JB. Sprinting: a potential vaccine for hamstring injury? Sport Perform Sci Rep 2019;48:v1.", verifiedFrom: "abstract" },
  elbadry2019: { key: "elbadry2019", short: "Elbadry 2019", cite: "Elbadry N, Hamza A, Pietraszewski P, Alexe DI, Lupu G. Effect of the French Contrast Method on Explosive Strength and Kinematic Parameters of the Triple Jump Among Female College Athletes. J Hum Kinet 2019;69:225–230. doi:10.2478/hukin-2019-0047 PMID 31666904", verifiedFrom: "abstract" },
  evans2019: { key: "evans2019", short: "Evans 2019", cite: "Evans TW, McLester CN, Howard JS, McLester JR, Calloway JP. Comparison of Muscle Activation Between Back Squats and Belt Squats. J Strength Cond Res 2019;33 Suppl 1:S52–S59. doi:10.1519/JSC.0000000000002052 PMID 28595237", verifiedFrom: "abstract" },
  fessi2016: { key: "fessi2016", short: "Fessi 2016", cite: "Fessi MS, Zarrouk N, Di Salvo V, Filetti C, Barker AR, Moalla W. Effects of tapering on physical match activities in professional soccer players. J Sports Sci 2016;34(24):2189–2194. doi:10.1080/02640414.2016.1171891 PMID 27065344", verifiedFrom: "abstract" },
  flanagancomyns2008: { key: "flanagancomyns2008", short: "Flanagan & Comyns 2008", cite: "Flanagan EP, Comyns TM. The use of contact time and the reactive strength index to optimize fast stretch-shortening cycle training. Strength Cond J 2008;30(5):32–38. doi:10.1519/SSC.0b013e318187e25b", verifiedFrom: "abstract" },
  foster1998: { key: "foster1998", short: "Foster 1998", cite: "Foster C. Monitoring training in athletes with reference to overtraining syndrome. Med Sci Sports Exerc 1998;30(7):1164–1168. doi:10.1097/00005768-199807000-00023 PMID 9662690", verifiedFrom: "abstract" },
  gabbett2016: { key: "gabbett2016", short: "Gabbett 2016", cite: "Gabbett TJ. The training-injury prevention paradox: should athletes be training smarter and harder?. Br J Sports Med 2016;50(5):273–280. doi:10.1136/bjsports-2015-095788 PMID 26758673", verifiedFrom: "abstract" },
  gathercole2015: { key: "gathercole2015", short: "Gathercole 2015", cite: "Gathercole R, Sporer B, Stellingwerff T, Sleivert G. Alternative countermovement-jump analysis to quantify acute neuromuscular fatigue. Int J Sports Physiol Perform 2015;10(1):84–92. doi:10.1123/ijspp.2013-0413 PMID 24912201", verifiedFrom: "abstract" },
  gonzalezbadillosanchezmedina2010: { key: "gonzalezbadillosanchezmedina2010", short: "González-Badillo & Sánchez-Medina 2010", cite: "González-Badillo JJ, Sánchez-Medina L. Movement velocity as a measure of loading intensity in resistance training. Int J Sports Med 2010;31(5):347–352. doi:10.1055/s-0030-1248333", verifiedFrom: "abstract" },
  grgic2018: { key: "grgic2018", short: "Grgic 2018", cite: "Grgic J, Schoenfeld BJ, Davies TB, Lazinica B, Krieger JW, Pedisic Z. Effect of Resistance Training Frequency on Gains in Muscular Strength: A Systematic Review and Meta-Analysis. Sports Med 2018;48(5):1207–1220. doi:10.1007/s40279-018-0872-x PMID 29470825", verifiedFrom: "abstract" },
  gualtieri2023: { key: "gualtieri2023", short: "Gualtieri 2023", cite: "Gualtieri A, Rampinini E, Dello Iacono A, Beato M. High-speed running and sprinting in professional adult soccer: Current thresholds definition, match demands and training strategies. A systematic review. Front Sports Act Living 2023;5:1116293. doi:10.3389/fspor.2023.1116293 PMID 36860737", verifiedFrom: "abstract" },
  gullett2009: { key: "gullett2009", short: "Gullett 2009", cite: "Gullett JC, Tillman MD, Gutierrez GM, Chow JW. A biomechanical comparison of back and front squats in healthy trained individuals. J Strength Cond Res 2009;23(1):284–292. doi:10.1519/JSC.0b013e31818546bb PMID 19002072", verifiedFrom: "abstract" },
  hader2019: { key: "hader2019", short: "Hader 2019", cite: "Hader K, Rumpf MC, Hertzog M, Kilduff LP, Girard O, Silva JR. Monitoring the Athlete Match Response: Can External Load Variables Predict Post-match Acute and Residual Fatigue in Soccer? A Systematic Review with Meta-analysis. Sports Med Open 2019;5(1):48. doi:10.1186/s40798-019-0219-7 PMID 31820260", verifiedFrom: "abstract" },
  haff2008: { key: "haff2008", short: "Haff 2008", cite: "Haff GG, Hobbs RT, Haff EE, Sands WA, Pierce KC, Stone MH. Cluster training: a novel method for introducing training program variation. Strength Cond J 2008;30(1):67–76. doi:10.1519/SSC.0b013e31816383e1", verifiedFrom: "abstract" },
  haffnimphius2012: { key: "haffnimphius2012", short: "Haff & Nimphius 2012", cite: "Haff GG, Nimphius S. Training principles for power. Strength Cond J 2012;34(6):2–12. doi:10.1519/SSC.0b013e31826db467", verifiedFrom: "abstract" },
  hansen2011: { key: "hansen2011", short: "Hansen 2011", cite: "Hansen KT, Cronin JB, Pickering SL, Newton MJ. Does cluster loading enhance lower body power development in preseason preparation of elite rugby union players?. J Strength Cond Res 2011;25(8):2118–2126. doi:10.1519/JSC.0b013e318220b6a3 PMID 21747288", verifiedFrom: "abstract" },
  hardee2012: { key: "hardee2012", short: "Hardee 2012", cite: "Hardee JP, Triplett NT, Utter AC, Zwetsloot KA, Mcbride JM. Effect of interrepetition rest on power output in the power clean. J Strength Cond Res 2012;26(4):883–889. doi:10.1519/JSC.0b013e3182474370 PMID 22228112", verifiedFrom: "abstract" },
  haroy2019: { key: "haroy2019", short: "Harøy 2019", cite: "Harøy J, Clarsen B, Wiger EG, Øyen MG, Serner A, Thorborg K, Hölmich P, Andersen TE, Bahr R. The Adductor Strengthening Programme prevents groin problems among male football players: a cluster-randomised controlled trial. Br J Sports Med 2019;53(3):150–157. doi:10.1136/bjsports-2017-098937 PMID 29891614", verifiedFrom: "abstract" },
  harrison2019: { key: "harrison2019", short: "Harrison 2019", cite: "Harrison PW, James LP, McGuigan MR, Jenkins DG, Kelly VG. Resistance Priming to Enhance Neuromuscular Performance in Sport: Evidence, Potential Mechanisms and Directions for Future Research. Sports Med 2019;49(10):1499–1514. doi:10.1007/s40279-019-01136-3 PMID 31203499", verifiedFrom: "abstract" },
  hecker2019: { key: "hecker2019", short: "Hecker 2019", cite: "Hecker KA, Carlson LA, Lawrence MA. Effects of the Safety Squat Bar on Trunk and Lower-Body Mechanics During a Back Squat. J Strength Cond Res 2019;33 Suppl 1:S45–S51. doi:10.1519/JSC.0000000000002912 PMID 30363042", verifiedFrom: "abstract" },
  helms2016: { key: "helms2016", short: "Helms 2016", cite: "Helms ER, Cronin J, Storey A, Zourdos MC. Application of the Repetitions in Reserve-Based Rating of Perceived Exertion Scale for Resistance Training. Strength Cond J 2016;38(4):42–49. doi:10.1519/SSC.0000000000000218 PMID 27531969", verifiedFrom: "abstract" },
  hillhaas2011: { key: "hillhaas2011", short: "Hill-Haas 2011", cite: "Hill-Haas SV, Dawson B, Impellizzeri FM, Coutts AJ. Physiology of small-sided games training in football: a systematic review. Sports Med 2011;41(3):199–220. doi:10.2165/11539740-000000000-00000 PMID 21395363", verifiedFrom: "abstract" },
  hirschfrost2019: { key: "hirschfrost2019", short: "Hirsch & Frost 2019", cite: "Hirsch SM, Frost DM. Considerations for Velocity-Based Training: The Instruction to Move \"As Fast As Possible\" Is Less Effective Than a Target Velocity. J Strength Cond Res 2021;35(Suppl 1):S89–S94. Published ahead of print 2019. doi:10.1519/JSC.0000000000003233 PMID 31268998", verifiedFrom: "abstract" },
  hoffhelgerud2004: { key: "hoffhelgerud2004", short: "Hoff & Helgerud 2004", cite: "Hoff J, Helgerud J. Endurance and strength training for soccer players: physiological considerations. Sports Med 2004;34(3):165–180. doi:10.2165/00007256-200434030-00003 PMID 14987126", verifiedFrom: "abstract" },
  impellizzeri2020: { key: "impellizzeri2020", short: "Impellizzeri 2020", cite: "Impellizzeri FM, Tenan MS, Kempton T, Novak A, Coutts AJ. Acute:Chronic Workload Ratio: Conceptual Issues and Fundamental Pitfalls. Int J Sports Physiol Perform 2020;15(6):907–913. doi:10.1123/ijspp.2019-0864 PMID 32502973", verifiedFrom: "abstract" },
  impellizzeri2021: { key: "impellizzeri2021", short: "Impellizzeri 2021", cite: "Impellizzeri FM, McCall A, van Smeden M. Why methods matter in a meta-analysis: a reappraisal showed inconclusive injury preventive effect of Nordic hamstring exercise. J Clin Epidemiol 2021;140:111–124. doi:10.1016/j.jclinepi.2021.09.007 PMID 34520846", verifiedFrom: "abstract" },
  ishoi2016: { key: "ishoi2016", short: "Ishøi 2016", cite: "Ishøi L, Sørensen CN, Kaae NM, Jørgensen LB, Hölmich P, Serner A. Large eccentric strength increase using the Copenhagen Adduction exercise in football: A randomized controlled trial. Scand J Med Sci Sports 2016;26(11):1334–1342. doi:10.1111/sms.12585 PMID 26589483", verifiedFrom: "abstract" },
  issurin2010: { key: "issurin2010", short: "Issurin 2010", cite: "Issurin VB. New horizons for the methodology and physiology of training periodization. Sports Med 2010;40(3):189–206. doi:10.2165/11319770-000000000-00000 PMID 20199119", verifiedFrom: "abstract" },
  jarosz2025: { key: "jarosz2025", short: "Jarosz 2025", cite: "Jarosz J, Szwarc A. Isometric Conditioning Activity and Jump Performance: Impact of Training Status in Male Participants. J Clin Med 2025;14(17). doi:10.3390/jcm14176214 PMID 40943974", verifiedFrom: "abstract" },
  jeong2011: { key: "jeong2011", short: "Jeong 2011", cite: "Jeong TS, Reilly T, Morton J, Bae SW, Drust B. Quantification of the physiological loading of one week of \"pre-season\" and one week of \"in-season\" training in professional soccer players. J Sports Sci 2011;29(11):1161–1166. doi:10.1080/02640414.2011.583671 PMID 21777053", verifiedFrom: "abstract" },
  jukic2020: { key: "jukic2020", short: "Jukic 2020", cite: "Jukic I, Ramos AG, Helms ER, McGuigan MR, Tufano JJ. Acute Effects of Cluster and Rest Redistribution Set Structures on Mechanical, Metabolic, and Perceptual Fatigue During and After Resistance Training: A Systematic Review and Meta-analysis. Sports Med 2020;50(12):2209–2236. doi:10.1007/s40279-020-01344-2 PMID 32901442", verifiedFrom: "abstract" },
  kohavi2018: { key: "kohavi2018", short: "Kohavi 2018", cite: "Kohavi B, Beato M, Laver L, Freitas TT, Chung LH, Dello Iacono A. Effectiveness of Field-Based Resistance Training Protocols on Hip Muscle Strength Among Young Elite Football Players. Clin J Sport Med 2020;30(5):470–477. Published ahead of print 2018. doi:10.1097/JSM.0000000000000649 PMID 30418198", verifiedFrom: "abstract" },
  krause2015: { key: "krause2015", short: "Krause 2015", cite: "Krause DA, Boyd MS, Hager AN, Smoyer EC, Thompson AT, Hollman JH. Reliability and accuracy of a goniometer mobile device application for video measurement of the functional movement screen deep squat test. Int J Sports Phys Ther 2015;10(1):37–44. PMID 25709861", verifiedFrom: "abstract" },
  krustrup2003: { key: "krustrup2003", short: "Krustrup 2003", cite: "Krustrup P, Mohr M, Amstrup T, Rysgaard T, Johansen J, Steensberg A, Pedersen PK, Bangsbo J. The yo-yo intermittent recovery test: physiological response, reliability, and validity. Med Sci Sports Exerc 2003;35(4):697–705. doi:10.1249/01.MSS.0000058441.94520.32 PMID 12673156", verifiedFrom: "abstract" },
  lauersen2018: { key: "lauersen2018", short: "Lauersen 2018", cite: "Lauersen JB, Andersen TE, Andersen LB. Strength training as superior, dose-dependent and safe prevention of acute and overuse sports injuries: a systematic review, qualitative analysis and meta-analysis. Br J Sports Med 2018;52(24):1557–1563. doi:10.1136/bjsports-2018-099078 PMID 30131332", verifiedFrom: "abstract" },
  lesinski2014: { key: "lesinski2014", short: "Lesinski 2014", cite: "Lesinski M, Muehlbauer T, Büsch D, Granacher U. [Effects of complex training on strength and speed performance in athletes: a systematic review. Effects of complex training on athletic performance]. Sportverletz Sportschaden 2014;28(2):85–107. doi:10.1055/s-0034-1366145 PMID 24599505", verifiedFrom: "abstract" },
  losarcos2017: { key: "losarcos2017", short: "Los Arcos 2017", cite: "Los Arcos A, Mendez-Villanueva A, Martínez-Santos R. In-season training periodization of professional soccer players. Biol Sport 2017;34(2):149–155. doi:10.5114/biolsport.2017.64588 PMID 28566808", verifiedFrom: "abstract" },
  loturco2015: { key: "loturco2015", short: "Loturco 2015", cite: "Loturco I, Pereira LA, Kobal R, Zanetti V, Kitamura K, Abad CCC, Nakamura FY. Transference effect of vertical and horizontal plyometrics on sprint performance of high-level U-20 soccer players. J Sports Sci 2015;33(20):2182–2191. doi:10.1080/02640414.2015.1081394", verifiedFrom: "abstract" },
  lovell2018: { key: "lovell2018", short: "Lovell 2018", cite: "Lovell R, Knox M, Weston M, Siegler JC, Brennan S, Marshall PWM. Hamstring injury prevention in soccer: before or after training? Scand J Med Sci Sports 2018;28(2):658–666. doi:10.1111/sms.12925", verifiedFrom: "abstract" },
  lum2026: { key: "lum2026", short: "Lum 2026", cite: "Lum D, Oranchuk DJ, Chen SE, Kong PW. Comparing the Effects of Push and Hold Isometric Training on Strength and Musculotendinous Adaptations: A Within-Subject Randomized Controlled Trial. J Strength Cond Res 2026;40(9):1050–1058. doi:10.1519/JSC.0000000000005475 PMID 42647753", verifiedFrom: "abstract" },
  mackey2021: { key: "mackey2021", short: "Mackey 2021", cite: "Mackey ER, Riemann BL. Biomechanical Differences Between the Bulgarian Split-Squat and Back Squat. Int J Exerc Sci 2021;14(1):533–543. doi:10.70252/CIYT8956 PMID 34055144", verifiedFrom: "abstract" },
  malone2015: { key: "malone2015", short: "Malone 2015", cite: "Malone JJ, Di Michele R, Morgans R, Burgess D, Morton JP, Drust B. Seasonal training-load quantification in elite English premier league soccer players. Int J Sports Physiol Perform 2015;10(4):489–497. doi:10.1123/ijspp.2014-0352 PMID 25393111", verifiedFrom: "abstract" },
  malone2018: { key: "malone2018", short: "Malone 2018", cite: "Malone S, Owen A, Mendes B, Hughes B, Collins K, Gabbett TJ. High-speed running and sprinting as an injury risk factor in soccer: Can well-developed physical qualities reduce the risk?. J Sci Med Sport 2018;21(3):257–262. doi:10.1016/j.jsams.2017.05.016 PMID 28595870", verifiedFrom: "abstract" },
  mann2015: { key: "mann2015", short: "Mann 2015", cite: "Mann JB, Ivey PA, Sayers SP. Velocity-based training in football. Strength Cond J 2015;37(6):52–57. doi:10.1519/SSC.0000000000000177", verifiedFrom: "abstract" },
  marchetti2016: { key: "marchetti2016", short: "Marchetti 2016", cite: "Marchetti PH, Jarbas da Silva J, Jon Schoenfeld B, Nardi PS, Pecoraro SL, D'Andréa Greve JM, Hartigan E. Muscle Activation Differs between Three Different Knee Joint-Angle Positions during a Maximal Isometric Back Squat Exercise. J Sports Med (Hindawi Publ Corp) 2016;2016:3846123. doi:10.1155/2016/3846123 PMID 27504484", verifiedFrom: "abstract" },
  martingarcia2018: { key: "martingarcia2018", short: "Martín-García 2018", cite: "Martín-García A, Gómez Díaz A, Bradley PS, Morera F, Casamichana D. Quantification of a Professional Football Team's External Load Using a Microcycle Structure. J Strength Cond Res 2018;32(12):3511–3518. doi:10.1519/JSC.0000000000002816 PMID 30199452", verifiedFrom: "abstract" },
  mchugh2003: { key: "mchugh2003", short: "McHugh 2003", cite: "McHugh MP. Recent advances in the understanding of the repeated bout effect: the protective effect against muscle damage from a single bout of eccentric exercise. Scand J Med Sci Sports 2003;13(2):88–97. doi:10.1034/j.1600-0838.2003.02477.x PMID 12641640", verifiedFrom: "abstract" },
  moalla2021: { key: "moalla2021", short: "Moalla 2021", cite: "Moalla W, Fessi MS, Nouira S, Mendez-Villanueva A, Di Salvo V, Ahmaidi S. Optimal Pretaper Phase on Physical Match Performance in Professional Soccer. Int J Sports Physiol Perform 2021;16(10):1483–1489. doi:10.1123/ijspp.2020-0334 PMID 33761460", verifiedFrom: "abstract" },
  mujikapadilla2000: { key: "mujikapadilla2000", short: "Mujika & Padilla 2000", cite: "Mujika I, Padilla S. Detraining: loss of training-induced physiological and performance adaptations. Part I: short term insufficient training stimulus. Sports Med 2000;30(2):79–87. doi:10.2165/00007256-200030020-00002 PMID 10966148", verifiedFrom: "abstract" },
  mujikapadilla2003: { key: "mujikapadilla2003", short: "Mujika & Padilla 2003", cite: "Mujika I, Padilla S. Scientific bases for precompetition tapering strategies. Med Sci Sports Exerc 2003;35(7):1182–1187. doi:10.1249/01.MSS.0000074448.73931.11 PMID 12840640", verifiedFrom: "abstract" },
  nedelec2012: { key: "nedelec2012", short: "Nédélec 2012", cite: "Nédélec M, McCall A, Carling C, Legall F, Berthoin S, Dupont G. Recovery in soccer: part I - post-match fatigue and time course of recovery. Sports Med 2012;42(12):997–1015. doi:10.2165/11635270-000000000-00000 PMID 23046224", verifiedFrom: "abstract" },
  ntoumanis2021: { key: "ntoumanis2021", short: "Ntoumanis 2021", cite: "Ntoumanis N, Ng JYY, Prestwich A, Quested E, Hancox JE, Thøgersen-Ntoumani C, Deci EL, Ryan RM, Lonsdale C, Williams GC. A meta-analysis of self-determination theory-informed intervention studies in the health domain: effects on motivation, health behavior, physical, and psychological health. Health Psychol Rev 2021;15(2):214–244. doi:10.1080/17437199.2020.1718529 PMID 31983293", verifiedFrom: "abstract" },
  olivalozano2020: { key: "olivalozano2020", short: "Oliva-Lozano 2020", cite: "Oliva-Lozano JM, Gómez-Carmona CD, Pino-Ortega J, Moreno-Pérez V, Rodríguez-Pérez MA. Match and Training High Intensity Activity-Demands Profile During a Competitive Mesocycle in Youth Elite Soccer Players. J Hum Kinet 2020;75:195–205. doi:10.2478/hukin-2020-0050 PMID 33312307", verifiedFrom: "abstract" },
  oliveira2019: { key: "oliveira2019", short: "Oliveira 2019", cite: "Oliveira R, Brito J, Martins A, Mendes B, Calvete F, Carriço S, Ferraz R, Marques MC. In-season training load quantification of one-, two- and three-game week schedules in a top European professional soccer team. Physiol Behav 2019;201:146–156. doi:10.1016/j.physbeh.2018.11.036 PMID 30529511", verifiedFrom: "abstract" },
  oneill2019: { key: "oneill2019", short: "O'Neill 2019", cite: "O'Neill S, Barry S, Watson P. Plantarflexor strength and endurance deficits associated with mid-portion Achilles tendinopathy: The role of soleus. Phys Ther Sport 2019;37:69–76. doi:10.1016/j.ptsp.2019.03.002 PMID 30884279", verifiedFrom: "abstract" },
  opar2013: { key: "opar2013", short: "Opar 2013", cite: "Opar DA, Piatkowski T, Williams MD, Shield AJ. A novel device using the Nordic hamstring exercise to assess eccentric knee flexor strength: a reliability and retrospective injury study. J Orthop Sports Phys Ther 2013;43(9):636–640. doi:10.2519/jospt.2013.4837 PMID 23886674", verifiedFrom: "abstract" },
  oranchuk2019: { key: "oranchuk2019", short: "Oranchuk 2019", cite: "Oranchuk DJ, Storey AG, Nelson AR, Cronin JB. Isometric training and long-term adaptations: Effects of muscle length, intensity, and intent: A systematic review. Scand J Med Sci Sports 2019;29(4):484–503. doi:10.1111/sms.13375 PMID 30580468", verifiedFrom: "abstract" },
  oteroesquina2017: { key: "oteroesquina2017", short: "Otero-Esquina 2017", cite: "Otero-Esquina C, de Hoyo Lora M, Gonzalo-Skok Ó, Domínguez-Cobo S, Sánchez H. Is strength-training frequency a key factor to develop performance adaptations in young elite soccer players?. Eur J Sport Sci 2017;17(10):1241–1251. doi:10.1080/17461391.2017.1378372 PMID 28944722", verifiedFrom: "abstract" },
  otto2012: { key: "otto2012", short: "Otto 2012", cite: "Otto WH 3rd, Coburn JW, Brown LE, Spiering BA. Effects of weightlifting vs. kettlebell training on vertical jump, strength, and body composition. J Strength Cond Res 2012;26(5):1199–1202. doi:10.1519/JSC.0b013e31824f233e PMID 22344061", verifiedFrom: "abstract" },
  owen2017: { key: "owen2017", short: "Owen 2017", cite: "Owen AL, Lago-Peñas C, Gómez MÁ, Mendes B, Dellal A. Analysis of a training mesocycle and positional quantification in elite European soccer players. Int J Sports Sci Coach 2017;12(5):665–676. doi:10.1177/1747954117727851", verifiedFrom: "abstract" },
  polglass2019: { key: "polglass2019", short: "Polglass 2019", cite: "Polglass G, Burrows A, Willett M. Impact of a modified progressive Copenhagen adduction exercise programme on hip adduction strength and postexercise muscle soreness in professional footballers. BMJ Open Sport Exerc Med 2019;5(1):e000570. doi:10.1136/bmjsem-2019-000570 PMID 31673404", verifiedFrom: "abstract" },
  post2017: { key: "post2017", short: "Post 2017", cite: "Post EG, Olson M, Trigsted S, Hetzel S, Bell DR. The Reliability and Discriminative Ability of the Overhead Squat Test for Observational Screening of Medial Knee Displacement. J Sport Rehabil 2017;26(1). doi:10.1123/jsr.2015-0178 PMID 27834577", verifiedFrom: "abstract" },
  ralston2017: { key: "ralston2017", short: "Ralston 2017", cite: "Ralston GW, Kilgore L, Wyatt FB, Baker JS. The Effect of Weekly Set Volume on Strength Gain: A Meta-Analysis. Sports Med 2017;47(12):2585–2601. doi:10.1007/s40279-017-0762-7 PMID 28755103", verifiedFrom: "abstract" },
  robbins2010: { key: "robbins2010", short: "Robbins 2010", cite: "Robbins DW, Young WB, Behm DG, Payne WR. Agonist-antagonist paired set resistance training: a brief review. J Strength Cond Res 2010;24(10):2873–2882. doi:10.1519/JSC.0b013e3181f00bfc PMID 20733520", verifiedFrom: "abstract" },
  rodriguezrosell2020: { key: "rodriguezrosell2020", short: "Rodríguez-Rosell 2020", cite: "Rodríguez-Rosell D, Yáñez-García JM, Mora-Custodio R, Pareja-Blanco F, Ravelo-García AG, Ribas-Serna J, González-Badillo JJ. Velocity-based resistance training: impact of velocity loss in the set on neuromuscular performance and hormonal response. Appl Physiol Nutr Metab 2020;45(8):817–828. doi:10.1139/apnm-2019-0829 PMID 32017598", verifiedFrom: "abstract" },
  rossguskiewicz2005: { key: "rossguskiewicz2005", short: "Ross & Guskiewicz 2005", cite: "Ross SE, Guskiewicz KM, Yu B. Single-leg jump-landing stabilization times in subjects with functionally unstable ankles. J Athl Train 2005;40(4):298–304. PMID 16404451", verifiedFrom: "abstract" },
  sanchezmedina2011: { key: "sanchezmedina2011", short: "Sánchez-Medina 2011", cite: "Sánchez-Medina L, González-Badillo JJ. Velocity loss as an indicator of neuromuscular fatigue during resistance training. Med Sci Sports Exerc 2011;43(9):1725–1734. doi:10.1249/MSS.0b013e318213f880 PMID 21311352", verifiedFrom: "abstract" },
  schaber2021: { key: "schaber2021", short: "Schaber 2021", cite: "Schaber M, Guiser Z, Brauer L, Jackson R, Banyasz J, Miletti R, Hassen-Miller A. The Neuromuscular Effects of the Copenhagen Adductor Exercise: A Systematic Review. Int J Sports Phys Ther 2021;16(5):1210–1221. doi:10.26603/001c.27975 PMID 34631242", verifiedFrom: "abstract" },
  schoenfeld2019: { key: "schoenfeld2019", short: "Schoenfeld 2019", cite: "Schoenfeld BJ, Contreras B, Krieger J, Grgic J, Delcastillo K, Belliard R, Alto A. Resistance Training Volume Enhances Muscle Hypertrophy but Not Strength in Trained Men. Med Sci Sports Exerc 2019;51(1):94–103. doi:10.1249/MSS.0000000000001764 PMID 30153194", verifiedFrom: "abstract" },
  seitzhaff2016: { key: "seitzhaff2016", short: "Seitz & Haff 2016", cite: "Seitz LB, Haff GG. Factors Modulating Post-Activation Potentiation of Jump, Sprint, Throw, and Upper-Body Ballistic Performances: A Systematic Review with Meta-Analysis. Sports Med 2016;46(2):231–240. doi:10.1007/s40279-015-0415-7 PMID 26508319", verifiedFrom: "abstract" },
  selkowitz2013: { key: "selkowitz2013", short: "Selkowitz 2013", cite: "Selkowitz DM, Beneck GJ, Powers CM. Which exercises target the gluteal muscles while minimizing activation of the tensor fascia lata? Electromyographic assessment using fine-wire electrodes. J Orthop Sports Phys Ther 2013;43(2):54–64. doi:10.2519/jospt.2013.4116 PMID 23160432", verifiedFrom: "abstract" },
  silva2018: { key: "silva2018", short: "Silva 2018", cite: "Silva JR, Rumpf MC, Hertzog M, Castagna C, Farooq A, Girard O, Hader K. Acute and Residual Soccer Match-Related Fatigue: A Systematic Review and Meta-analysis. Sports Med 2018;48(3):539–583. doi:10.1007/s40279-017-0798-8 PMID 29098658", verifiedFrom: "abstract" },
  speirs2016: { key: "speirs2016", short: "Speirs 2016", cite: "Speirs DE, Bennett MA, Finn CV, Turner AP. Unilateral vs. Bilateral Squat Training for Strength, Sprints, and Agility in Academy Rugby Players. J Strength Cond Res 2016;30(2):386–392. doi:10.1519/JSC.0000000000001096 PMID 26200193", verifiedFrom: "abstract" },
  stanley2013: { key: "stanley2013", short: "Stanley 2013", cite: "Stanley J, Peake JM, Buchheit M. Cardiac parasympathetic reactivation following exercise: implications for training prescription. Sports Med 2013;43(12):1259–1277. doi:10.1007/s40279-013-0083-4 PMID 23912805", verifiedFrom: "abstract" },
  stevens2017: { key: "stevens2017", short: "Stevens 2017", cite: "Stevens TGA, de Ruiter CJ, Twisk JWR, Savelsbergh GJP, Beek PJ. Quantification of in-season training load relative to match load in professional Dutch Eredivisie football players. Sci Med Football 2017;1(2):117–125. doi:10.1080/24733938.2017.1282163", verifiedFrom: "abstract" },
  stockbrugger2003: { key: "stockbrugger2003", short: "Stockbrugger 2003", cite: "Stockbrugger BA, Haennel RG. Contributing factors to performance of a medicine ball explosive power test: a comparison between jump and nonjump athletes. J Strength Cond Res 2003;17(4):768–774. doi:10.1519/1533-4287(2003)017<0768:cftpoa>2.0.co;2 PMID 14636108", verifiedFrom: "abstract" },
  suchomel2016: { key: "suchomel2016", short: "Suchomel 2016", cite: "Suchomel TJ, Nimphius S, Stone MH. The Importance of Muscular Strength in Athletic Performance. Sports Med 2016;46(10):1419–1449. doi:10.1007/s40279-016-0486-0 PMID 26838985", verifiedFrom: "abstract" },
  suchomeldeweese2014: { key: "suchomeldeweese2014", short: "Suchomel & DeWeese 2014", cite: "Suchomel TJ, DeWeese BH, Beckham GK, Serrano AJ, Sole CJ. The jump shrug. Strength Cond J 2014;36(3):43–47. doi:10.1519/SSC.0000000000000064", verifiedFrom: "abstract" },
  teixeira2021: { key: "teixeira2021", short: "Teixeira 2021", cite: "Teixeira JE, Forte P, Ferraz R, Leal M, Ribeiro J, Silva AJ, Barbosa TM, Monteiro AM. Monitoring Accumulated Training and Match Load in Football: A Systematic Review. Int J Environ Res Public Health 2021;18(8). doi:10.3390/ijerph18083906 PMID 33917802", verifiedFrom: "abstract" },
  timmins2016: { key: "timmins2016", short: "Timmins 2016", cite: "Timmins RG, Bourne MN, Shield AJ, Williams MD, Lorenzen C, Opar DA. Short biceps femoris fascicles and eccentric knee flexor weakness increase the risk of hamstring injury in elite football (soccer): a prospective cohort study. Br J Sports Med 2016;50(24):1524–1535. doi:10.1136/bjsports-2015-095362 PMID 26675089", verifiedFrom: "abstract" },
  tufano2017: { key: "tufano2017", short: "Tufano 2017", cite: "Tufano JJ, Brown LE, Haff GG. Theoretical and Practical Aspects of Different Cluster Set Structures: A Systematic Review. J Strength Cond Res 2017;31(3):848–867. doi:10.1519/JSC.0000000000001581 PMID 27465625", verifiedFrom: "abstract" },
  vanderhorst2015: { key: "vanderhorst2015", short: "van der Horst 2015", cite: "van der Horst N, Smits DW, Petersen J, Goedhart EA, Backx FJ. The preventive effect of the nordic hamstring exercise on hamstring injuries in amateur soccer players: a randomized controlled trial. Am J Sports Med 2015;43(6):1316–1323. doi:10.1177/0363546515574057 PMID 25794868", verifiedFrom: "abstract" },
  vandyk2019: { key: "vandyk2019", short: "van Dyk 2019", cite: "van Dyk N, Behan FP, Whiteley R. Including the Nordic hamstring exercise in injury prevention programmes halves the rate of hamstring injuries: a systematic review and meta-analysis of 8459 athletes. Br J Sports Med 2019;53(21):1362–1370. doi:10.1136/bjsports-2018-100045 PMID 30808663", verifiedFrom: "abstract" },
  vanrenterghem2017: { key: "vanrenterghem2017", short: "Vanrenterghem 2017", cite: "Vanrenterghem J, Nedergaard NJ, Robinson MA, Drust B. Training Load Monitoring in Team Sports: A Novel Framework Separating Physiological and Biomechanical Load-Adaptation Pathways. Sports Med 2017;47(11):2135–2142. doi:10.1007/s40279-017-0714-2 PMID 28283992", verifiedFrom: "abstract" },
  wagle2017: { key: "wagle2017", short: "Wagle 2017", cite: "Wagle JP, Taber CB, Cunanan AJ, Bingham GE, Carroll KM, DeWeese BH, Sato K, Stone MH. Accentuated eccentric loading for training and performance: a review. Sports Med 2017;47(12):2473–2495. doi:10.1007/s40279-017-0755-6", verifiedFrom: "abstract" },
  weakley2017: { key: "weakley2017", short: "Weakley 2017", cite: "Weakley JJS, Till K, Read DB, Roe GAB, Darrall-Jones J, Phibbs PJ, Jones B. The effects of traditional, superset, and tri-set resistance training structures on perceived intensity and physiological responses. Eur J Appl Physiol 2017;117(9):1877–1889. doi:10.1007/s00421-017-3680-3 PMID 28698987", verifiedFrom: "abstract" },
  // Sources behind VALD focus, test benchmarks, recovery, isometric protocols, development levers and position
  // prescriptions (OTHER_CITATION_SOURCES), checked 2026-11-23.
  altarribabartes2020: { key: "altarribabartes2020", short: "Altarriba-Bartes 2020", cite: "Altarriba-Bartes A, Peña J, Vicens-Bordas J, Milà-Villaroel R, Calleja-González J. Post-competition recovery strategies in elite male soccer players. Effects on performance: A systematic review and meta-analysis. PLoS One 2020;15(10):e0240135. doi:10.1371/journal.pone.0240135 PMID 33007044", verifiedFrom: "abstract" },
  baar2019: { key: "baar2019", short: "Baar 2019", cite: "Baar K. Stress Relaxation and Targeted Nutrition to Treat Patellar Tendinopathy. Int J Sport Nutr Exerc Metab 2019;29(4):453–457. doi:10.1123/ijsnem.2018-0231 PMID 30299199", verifiedFrom: "abstract" },
  beckham2013: { key: "beckham2013", short: "Beckham 2013", cite: "Beckham G, Mizuguchi S, Carter C, Sato K, Ramsey M, Lamont H, Hornsby G, Haff G, Stone M. Relationships of isometric mid-thigh pull variables to weightlifting performance. J Sports Med Phys Fitness 2013;53(5):573–581. PMID 23903539", verifiedFrom: "abstract" },
  blazevichbabault2019: { key: "blazevichbabault2019", short: "Blazevich & Babault 2019", cite: "Blazevich AJ, Babault N. Post-activation Potentiation Versus Post-activation Performance Enhancement in Humans: Historical Perspective, Underlying Mechanisms, and Current Issues. Front Physiol 2019;10:1359. doi:10.3389/fphys.2019.01359 PMID 31736781", verifiedFrom: "abstract" },
  bojsenmoller2005: { key: "bojsenmoller2005", short: "Bojsen-Møller 2005", cite: "Bojsen-Møller J, Magnusson SP, Rasmussen LR, Kjaer M, Aagaard P. Muscle performance during maximal isometric and dynamic contractions is influenced by the stiffness of the tendinous structures. J Appl Physiol (1985) 2005;99(3):986–994. doi:10.1152/japplphysiol.01305.2004 PMID 15860680", verifiedFrom: "abstract" },
  brownstein2017: { key: "brownstein2017", short: "Brownstein 2017", cite: "Brownstein CG, Dent JP, Parker P, Hicks KM, Howatson G, Goodall S, Thomas K. Etiology and Recovery of Neuromuscular Fatigue following Competitive Soccer Match-Play. Front Physiol 2017;8:831. doi:10.3389/fphys.2017.00831 PMID 29118716", verifiedFrom: "abstract" },
  burgess2007: { key: "burgess2007", short: "Burgess 2007", cite: "Burgess KE, Connick MJ, Graham-Smith P, Pearson SJ. Plyometric vs. isometric training influences on tendon properties and muscle output. J Strength Cond Res 2007;21(3):986–989. doi:10.1519/R-20235.1 PMID 17685695", verifiedFrom: "abstract" },
  comfort2011: { key: "comfort2011", short: "Comfort 2011", cite: "Comfort P, Allen M, Graham-Smith P. Comparisons of peak ground reaction force and rate of force development during variations of the power clean. J Strength Cond Res 2011;25(5):1235–1239. doi:10.1519/JSC.0b013e3181d6dc0d PMID 21522071", verifiedFrom: "abstract" },
  cook2016: { key: "cook2016", short: "Cook 2016", cite: "Cook JL, Rio E, Purdam CR, Docking SI. Revisiting the continuum model of tendon pathology: what is its merit in clinical practice and research? Br J Sports Med 2016;50(19):1187–1191. doi:10.1136/bjsports-2015-095422 PMID 27127294", verifiedFrom: "abstract" },
  demanuele2021: { key: "demanuele2021", short: "D'Emanuele 2021", cite: "D'Emanuele S, Maffiuletti NA, Tarperi C, Rainoldi A, Schena F, Boccia G. Rate of Force Development as an Indicator of Neuromuscular Fatigue: A Scoping Review. Front Hum Neurosci 2021;15:701916. doi:10.3389/fnhum.2021.701916 PMID 34305557", verifiedFrom: "abstract" },
  disalvo2007: { key: "disalvo2007", short: "Di Salvo 2007", cite: "Di Salvo V, Baron R, Tschan H, Calderon Montero FJ, Bachl N, Pigozzi F. Performance characteristics according to playing position in elite soccer. Int J Sports Med 2007;28(3):222–227. doi:10.1055/s-2006-924294 PMID 17024626", verifiedFrom: "abstract" },
  doeven2018: { key: "doeven2018", short: "Doeven 2018", cite: "Doeven SH, Brink MS, Kosse SJ, Lemmink KAPM. Postmatch recovery of physical performance and biochemical markers in team ball sports: a systematic review. BMJ Open Sport Exerc Med 2018;4(1):e000264. doi:10.1136/bmjsem-2017-000264 PMID 29527320", verifiedFrom: "abstract" },
  drayton2025: { key: "drayton2025", short: "Drayton 2025", cite: "Drayton AM, Hamad MJ, Spyrou K. The Time Course of Postmatch Physical Impairments in Professional Soccer: A Systematic Review. J Strength Cond Res 2025;39(11):e1345–e1355. doi:10.1519/JSC.0000000000005252 PMID 40845278", verifiedFrom: "abstract" },
  goom2016: { key: "goom2016", short: "Goom 2016", cite: "Goom TS, Malliaras P, Reiman MP, Purdam CR. Proximal Hamstring Tendinopathy: Clinical Aspects of Assessment and Management. J Orthop Sports Phys Ther 2016;46(6):483–493. doi:10.2519/jospt.2016.5986 PMID 27084841", verifiedFrom: "abstract" },
  goulart2022: { key: "goulart2022", short: "Goulart 2022", cite: "Goulart KNO, Coimbra CC, Campos HO, Drummond LR, Ogando PHM, Brown G, Couto BP, Duffield R, Wanner SP. Fatigue and Recovery Time Course After Female Soccer Matches: A Systematic Review And Meta-analysis. Sports Med Open 2022;8(1):72. doi:10.1186/s40798-022-00466-3 PMID 35657571", verifiedFrom: "abstract" },
  grindem2016: { key: "grindem2016", short: "Grindem 2016", cite: "Grindem H, Snyder-Mackler L, Moksnes H, Engebretsen L, Risberg MA. Simple decision rules can reduce reinjury risk by 84% after ACL reconstruction: the Delaware-Oslo ACL cohort study. Br J Sports Med 2016;50(13):804–808. doi:10.1136/bjsports-2016-096031 PMID 27162233", verifiedFrom: "abstract" },
  jonesvanhatalo2017: { key: "jonesvanhatalo2017", short: "Jones & Vanhatalo 2017", cite: "Jones AM, Vanhatalo A. The 'Critical Power' Concept: Applications to Sports Performance with a Focus on Intermittent High-Intensity Exercise. Sports Med 2017;47(Suppl 1):65–78. doi:10.1007/s40279-017-0688-0 PMID 28332113", verifiedFrom: "abstract" },
  kubo2001: { key: "kubo2001", short: "Kubo 2001", cite: "Kubo K, Kanehisa H, Fukunaga T. Effects of different duration isometric contractions on tendon elasticity in human quadriceps muscles. J Physiol 2001;536(Pt 2):649–655. doi:10.1111/j.1469-7793.2001.0649c.xd PMID 11600697", verifiedFrom: "abstract" },
  kyritsis2016: { key: "kyritsis2016", short: "Kyritsis 2016", cite: "Kyritsis P, Bahr R, Landreau P, Miladi R, Witvrouw E. Likelihood of ACL graft rupture: not meeting six clinical discharge criteria before return to sport is associated with a four times greater risk of rupture. Br J Sports Med 2016;50(15):946–951. doi:10.1136/bjsports-2015-095908 PMID 27215935", verifiedFrom: "abstract" },
  lumbarbosa2019: { key: "lumbarbosa2019", short: "Lum & Barbosa 2019", cite: "Lum D, Barbosa TM. Brief Review: Effects of Isometric Strength Training on Strength and Dynamic Performance. Int J Sports Med 2019;40(6):363–375. doi:10.1055/a-0863-4539 PMID 30943568", verifiedFrom: "abstract" },
  lum2022: { key: "lum2022", short: "Lum 2022", cite: "Lum D, Soh SK, Teo CJH, Wong OQH, Lee MJC. Effects of Performing Isometric Bench Press Training at Single Versus Multiple Joint Positions on Strength and Power Performance. Int J Sports Physiol Perform 2022;17(7):1061–1069. doi:10.1123/ijspp.2021-0461 PMID 35361735", verifiedFrom: "abstract" },
  lum2023: { key: "lum2023", short: "Lum 2023", cite: "Lum D, Joseph R, Ong KY, Tang JM, Suchomel TJ. Comparing the Effects of Long-Term vs. Periodic Inclusion of Isometric Strength Training on Strength and Dynamic Performances. J Strength Cond Res 2023;37(2):305–314. doi:10.1519/JSC.0000000000004276 PMID 35544357", verifiedFrom: "abstract" },
  lum2024: { key: "lum2024", short: "Lum 2024", cite: "Lum D, Yang Ong K, Haischer MH. Postactivation Performance Enhancement With Maximal Isometric Contraction on Power-Clean Performance Across Multiple Sets. Int J Sports Physiol Perform 2024;19(3):265–270. doi:10.1123/ijspp.2023-0383 PMID 38157842", verifiedFrom: "abstract" },
  leger1982: { key: "leger1982", short: "Léger 1982", cite: "Léger LA, Lambert J. A maximal multistage 20-m shuttle run test to predict VO2 max. Eur J Appl Physiol Occup Physiol 1982;49(1):1–12. doi:10.1007/BF00428958 PMID 7201922", verifiedFrom: "abstract" },
  maffiuletti2016: { key: "maffiuletti2016", short: "Maffiuletti 2016", cite: "Maffiuletti NA, Aagaard P, Blazevich AJ, Folland J, Tillin N, Duchateau J. Rate of force development: physiological and methodological considerations. Eur J Appl Physiol 2016;116(6):1091–1116. doi:10.1007/s00421-016-3346-6 PMID 26941023", verifiedFrom: "abstract" },
  neyroud2016: { key: "neyroud2016", short: "Neyroud 2016", cite: "Neyroud D, Kayser B, Place N. Are There Critical Fatigue Thresholds? Aggregated vs. Individual Data. Front Physiol 2016;7:376. doi:10.3389/fphys.2016.00376 PMID 27630575", verifiedFrom: "abstract" },
  opar2015: { key: "opar2015", short: "Opar 2015", cite: "Opar DA, Williams MD, Timmins RG, Hickey J, Duhig SJ, Shield AJ. Eccentric hamstring strength and hamstring injury risk in Australian footballers. Med Sci Sports Exerc 2015;47(4):857–865. doi:10.1249/MSS.0000000000000465 PMID 25137368", verifiedFrom: "abstract" },
  petersen2011: { key: "petersen2011", short: "Petersen 2011", cite: "Petersen J, Thorborg K, Nielsen MB, Budtz-Jørgensen E, Hölmich P. Preventive effect of eccentric training on acute hamstring injuries in men's soccer: a cluster-randomized controlled trial. Am J Sports Med 2011;39(11):2296–2303. doi:10.1177/0363546511419277 PMID 21825112", verifiedFrom: "abstract" },
  querido2022: { key: "querido2022", short: "Querido 2022", cite: "Querido SM, Radaelli R, Brito J, Vaz JR, Freitas SR. Analysis of Recovery Methods' Efficacy Applied up to 72 Hours Postmatch in Professional Football: A Systematic Review With Graded Recommendations. Int J Sports Physiol Perform 2022;17(9):1326–1342. doi:10.1123/ijspp.2022-0038 PMID 35961644", verifiedFrom: "abstract" },
  rio2015: { key: "rio2015", short: "Rio 2015", cite: "Rio E, Kidgell D, Purdam C, Gaida J, Moseley GL, Pearce AJ, Cook J. Isometric exercise induces analgesia and reduces inhibition in patellar tendinopathy. Br J Sports Med 2015;49(19):1277–1283. doi:10.1136/bjsports-2014-094386 PMID 25979840", verifiedFrom: "abstract" },
  schoenfeld2021: { key: "schoenfeld2021", short: "Schoenfeld 2021", cite: "Schoenfeld BJ, Grgic J, Van Every DW, Plotkin DL. Loading Recommendations for Muscle Strength, Hypertrophy, and Local Endurance: A Re-Examination of the Repetition Continuum. Sports (Basel) 2021;9(2). doi:10.3390/sports9020032 PMID 33671664", verifiedFrom: "abstract" },
  silbernagelcrossley2015: { key: "silbernagelcrossley2015", short: "Silbernagel & Crossley 2015", cite: "Silbernagel KG, Crossley KM. A Proposed Return-to-Sport Program for Patients With Midportion Achilles Tendinopathy: Rationale and Implementation. J Orthop Sports Phys Ther 2015;45(11):876–886. doi:10.2519/jospt.2015.5885 PMID 26390272", verifiedFrom: "abstract" },
  skiba2012: { key: "skiba2012", short: "Skiba 2012", cite: "Skiba PF, Chidnok W, Vanhatalo A, Jones AM. Modeling the expenditure and reconstitution of work capacity above critical power. Med Sci Sports Exerc 2012;44(8):1526–1532. doi:10.1249/MSS.0b013e3182517a80 PMID 22382171", verifiedFrom: "abstract" },
  suchomel2015: { key: "suchomel2015", short: "Suchomel 2015", cite: "Suchomel TJ, Comfort P, Stone MH. Weightlifting pulling derivatives: rationale for implementation and application. Sports Med 2015;45(6):823–839. doi:10.1007/s40279-015-0314-y PMID 25689955", verifiedFrom: "abstract" },
  tillinbishop2009: { key: "tillinbishop2009", short: "Tillin & Bishop 2009", cite: "Tillin NA, Bishop D. Factors modulating post-activation potentiation and its effect on performance of subsequent explosive activities. Sports Med 2009;39(2):147–166. doi:10.2165/00007256-200939020-00004 PMID 19203135", verifiedFrom: "abstract" },
  tillinfolland2014: { key: "tillinfolland2014", short: "Tillin & Folland 2014", cite: "Tillin NA, Folland JP. Maximal and explosive strength training elicit distinct neuromuscular adaptations, specific to the training stimulus. Eur J Appl Physiol 2014;114(2):365–374. doi:10.1007/s00421-013-2781-x PMID 24292019", verifiedFrom: "abstract" },
  comfort2019: { key: "comfort2019", short: "Comfort 2019", cite: "Comfort P, Dos'Santos T, Beckham GK, Stone MH, Guppy SN, Haff GG. Standardization and methodological considerations for the isometric midthigh pull. Strength Cond J 2019;41(2):57–79. doi:10.1519/SSC.0000000000000433", verifiedFrom: "abstract" },
  deweese2016: { key: "deweese2016", short: "DeWeese 2016", cite: "DeWeese BH, Suchomel TJ, Serrano AJ, Burton JD, Scruggs SK, Taber CB. Pull from the knee. Strength Cond J 2016;38(1):79–85. doi:10.1519/SSC.0000000000000194", verifiedFrom: "abstract" },
  ju2022: { key: "ju2022", short: "Ju 2022", cite: "Ju W, Doran D, Hawkins R, Gómez-Díaz A, Martin-Garcia A, Ade J, Laws A, Evans M, Bradley P. Contextualised peak periods of play in English Premier League matches. Biol Sport 2022;39(4):973–983. doi:10.5114/biolsport.2022.112083", verifiedFrom: "abstract" },
  lum2021: { key: "lum2021", short: "Lum 2021", cite: "Lum D, Barbosa TM, Joseph R, Balasekaran G. Effects of two isometric strength training methods on jump and sprint performances: a randomized controlled trial. J Sci Sport Exerc 2021;3(2):115–124. doi:10.1007/s42978-020-00095-w", verifiedFrom: "abstract" },
  lumhowatson2025: { key: "lumhowatson2025", short: "Lum & Howatson 2025", cite: "Lum D, Howatson G. Comparing the acute effects of a session of isometric strength training with heavy resistance training on neuromuscular function. J Sci Sport Exerc 2025;7(1):40–49. doi:10.1007/s42978-023-00241-0", verifiedFrom: "abstract" },
  lumcomfortoranchuk2026: { key: "lumcomfortoranchuk2026", short: "Lum, Comfort & Oranchuk 2026", cite: "Lum D, Comfort P, Oranchuk DJ. Getting stronger without moving an inch: a randomized controlled trial utilizing maximal isometric co-contraction. J Funct Morphol Kinesiol 2026;11(2):221. doi:10.3390/jfmk11020221", verifiedFrom: "abstract" },
  maeo2018: { key: "maeo2018", short: "Maeo 2018", cite: "Maeo S, Shan X, Otsuka S, Kanehisa H, Kawakami Y. Single-joint eccentric knee extension training preferentially trains the rectus femoris within the quadriceps muscles. Transl Sports Med 2018;1(5):212–220. doi:10.1002/tsm2.38", verifiedFrom: "abstract" },
  tambaar2025: { key: "tambaar2025", short: "Tam & Baar 2025", cite: "Tam KT, Baar K. Using load to improve tendon/ligament tissue engineering and develop novel treatments for tendinopathy. Matrix Biol 2025;135:39–54. doi:10.1016/j.matbio.2024.12.001", verifiedFrom: "abstract" },
  // The papers that misattributed citations really meant (2026-11-23): the code's own title or journal names them.
  vretaros2022: { key: "vretaros2022", short: "Vretaros 2022", cite: "Vretaros A. Microdosing of Strength Training in Basketball During Congested Game Weeks: A Practical-Methodological Approach. Academia Letters 2022;5409. doi:10.20935/AL5409", verifiedFrom: "record" },
  canadasgarcia2026: { key: "canadasgarcia2026", short: "Cañadas-García 2026", cite: "Cañadas-García E, de la Rubia A, Weldon A, González-García J, Giráldez-Costas V, García-Sánchez C. Resistance priming strategies in professional Spanish soccer: a survey study into the practices and perceptions of strength and conditioning coaches. Biol Sport 2026;43:661–670. doi:10.5114/biolsport.2026.156228 PMID 41994355", verifiedFrom: "abstract" },
  jaroszgawel2025: { key: "jaroszgawel2025", short: "Jarosz, Gawel & Socha 2025", cite: "Jarosz J, Gawel D, Socha I, Ewertowska P, Wilk M, Lum D, Krzysztofik M. Acute Effects of Isometric Conditioning Activity with Different Set Volumes on Countermovement Jump Performance in Highly Trained Male Volleyball Players. Appl Sci 2025;15(5):2393. doi:10.3390/app15052393", verifiedFrom: "abstract" },
  seraphin2025: { key: "seraphin2025", short: "Seraphin 2025", cite: "Seraphin A, Edson C, Price C, Jones B, Jagielo A, Mullner J. Normative Performance Test Metrics in Professional Female Club Soccer. J Sports Med Allied Health Sci 2025;10(3). doi:10.25035/jsmahs.10.03.01", verifiedFrom: "abstract" },
  cookpurdam2012: { key: "cookpurdam2012", short: "Cook & Purdam 2012", cite: "Cook JL, Purdam C. Is compressive load a factor in the development of tendinopathy? Br J Sports Med 2012;46(3):163–168. doi:10.1136/bjsports-2011-090414 PMID 22113234", verifiedFrom: "abstract" },
  // Edwards 2018 is the open review in Sports (the reference the blog gives), not the retracted J Strength Cond Res
  // study; Cormack 2008 is the primary study for FT:CT (2026-11-23).
  edwards2018: { key: "edwards2018", short: "Edwards 2018", cite: "Edwards T, Spiteri T, Piggott B, Bonhotal J, Haff GG, Joyce C. Monitoring and Managing Fatigue in Basketball. Sports (Basel) 2018;6(1):19. doi:10.3390/sports6010019 PMID 29910323", verifiedFrom: "full_text" },
  cormacknewtonmcguigan2008: { key: "cormacknewtonmcguigan2008", short: "Cormack, Newton & McGuigan 2008", cite: "Cormack SJ, Newton RU, McGuigan MR. Neuromuscular and endocrine responses of elite players to an Australian rules football match. Int J Sports Physiol Perform 2008;3(3):359–374. doi:10.1123/ijspp.3.3.359 PMID 19211947", verifiedFrom: "abstract" },
};

/** Other spellings of the same short citation used in the rule text ("et al." is dropped before this is read). */
const SHORT_ALIASES: Record<string, string> = {
  "Mujika 2000": "Mujika & Padilla 2000",
  "Mujika 2003": "Mujika & Padilla 2003",
  "Arcos 2017": "Los Arcos 2017",
  "Flanagan 2008": "Flanagan & Comyns 2008",
  // "Cormie, McGuigan & Newton 2010a/2011" — the same papers as Cormie 2010a/b and Cormie 2011.
  "McGuigan & Newton 2010a": "Cormie 2010a",
  "McGuigan & Newton 2010b": "Cormie 2010b",
  "McGuigan & Newton 2011": "Cormie 2011",
  // "Mann, Ivey & Sayers 2015" — the same article as Mann 2015.
  "Ivey & Sayers 2015": "Mann 2015",
  // "Vanrenterghem, Nedergaard, Robinson & Drust 2017".
  "Robinson & Drust 2017": "Vanrenterghem 2017",
  // "Lum, Oranchuk, Chen, Kong 2026".
  "Kong 2026": "Lum 2026",
  "de Villarreal 2009": "Sáez de Villarreal 2009",
  "Lim & Childs 2020": "Lim 2020",
  // "Bangsbo/Krustrup 2008" (Yo-Yo) — the same article as Bangsbo 2008.
  "Krustrup 2008": "Bangsbo 2008",
  // "Lum, Oranchuk," + line break + "Chen, Kong 2026".
  "Chen, Kong 2026": "Lum 2026",
  // A second Lum 2026 paper, named by its author list.
  "Lum, Comfort, Oranchuk 2026": "Lum, Comfort & Oranchuk 2026",
  "Lum 2025": "Lum & Howatson 2025",
  // Cormack published two 2008 Australian-football papers; the match study is named by its author list.
  "Cormack, Newton & McGuigan 2008": "Cormack, Newton & McGuigan 2008",
  // A second Jarosz 2025 paper (set volumes), named by its author list.
  "Jarosz, Gawel, Socha, Ewertowska, Wilk, Lum, Krzysztofik 2025": "Jarosz, Gawel & Socha 2025",
};

/**
 * Short citations used in the rules that could not be pinned to one paper. Each stays in the rule text as written;
 * the coach decides whether to replace it. Never resolved by guessing.
 */
export const UNRESOLVED_SHORTS: Record<string, { en: string; is: string }> = {
  "Bencivenga 2024": {
    en: "No 2024 paper by Bencivenga on French contrast training was found on PubMed or Crossref.",
    is: "Engin grein eftir Bencivenga frá 2024 um French contrast fannst á PubMed eða Crossref.",
  },
  "Bishop 2020": {
    en: "The code comment gives J Athl Train 2020;55:1062–1070, which matches no PubMed record. Bishop published several limb-asymmetry papers around 2020; which one is meant is not recorded.",
    is: "Athugasemdin í kóðanum gefur J Athl Train 2020;55:1062–1070, sem passar ekki við neina færslu á PubMed. Bishop birti nokkrar greinar um ósamhverfu um 2020 og ekki er skráð hver þeirra er átt við.",
  },
  "Buchheit 2019": {
    en: "Cited for the locomotor/mechanical day framework; Buchheit wrote several pieces on this around 2019 (some in books), and which one is meant is not recorded.",
    is: "Vitnað í vegna skiptingar í hlaupa- og hreyfidaga; Buchheit skrifaði nokkur verk um þetta um 2019 (sum í bókum) og ekki er skráð hvert er átt við.",
  },
  "Buchheit 2024": {
    en: "Cited as \"The 11 Principles of Microcycle Periodization\"; no such paper found on PubMed or Crossref.",
    is: "Vitnað í sem „The 11 Principles of Microcycle Periodization“; engin slík grein fannst á PubMed eða Crossref.",
  },
  "Cazorla 1990": {
    en: "A French field-test publication (VAM-Eval) that PubMed and Crossref do not index; not checked against the source.",
    is: "Frönsk útgáfa um vallarpróf (VAM-Eval) sem PubMed og Crossref skrá ekki; ekki borin saman við frumheimild.",
  },
  "Comfort 2015": {
    en: "Comfort co-wrote several 2015 papers on the mid-thigh pull and on pulling derivatives; which one supports the statement is not recorded.",
    is: "Comfort var meðhöfundur að nokkrum greinum 2015 um mid-thigh pull og togæfingar; ekki er skráð hver styður fullyrðinguna.",
  },
  "Comfort 2018": {
    en: "Comfort published several isometric mid-thigh pull papers in 2018–2019; which one supports the rule is not recorded.",
    is: "Comfort birti nokkrar greinar um ísómetrískt mid-thigh pull 2018–2019 og ekki er skráð hver þeirra styður regluna.",
  },
  "Cuenca-Fernández 2024": {
    en: "No 2024 paper by Cuenca-Fernández on isometric conditioning and jumping was found.",
    is: "Engin grein eftir Cuenca-Fernández frá 2024 um ísómetríska upphitun og hopp fannst.",
  },
  "DeWeese 2013": {
    en: "No 2013 paper by DeWeese on the box step-up or sprint push-off was found.",
    is: "Engin grein eftir DeWeese frá 2013 um uppstig á kassa eða spyrnu í spretti fannst.",
  },
  "Dietz & Peterson 2012": {
    en: "A book: Dietz C, Peterson B. Triphasic Training. Bye Dietz Sport Enterprise, 2012. Not a journal paper; not checked against the source.",
    is: "Bók: Dietz C, Peterson B. Triphasic Training. Bye Dietz Sport Enterprise, 2012. Ekki tímaritsgrein; ekki borin saman við frumheimild.",
  },
  "Epley 1985": {
    en: "A coaching chart (Epley B. Poundage chart. Boyd Epley Workout, 1985), not a journal paper; the formula is widely reproduced but was not checked against the source.",
    is: "Tafla úr þjálfun (Epley B. Poundage chart. Boyd Epley Workout, 1985), ekki tímaritsgrein; formúlan er víða endurbirt en var ekki borin saman við frumheimild.",
  },
  "Gabbett 2017": {
    en: "Gabbett co-wrote several load-monitoring papers in 2017; which one is meant is not recorded. The best-known acute:chronic paper is Gabbett 2016.",
    is: "Gabbett var meðhöfundur að nokkrum greinum um álagsvöktun 2017 og ekki er skráð hver er átt við. Þekktasta greinin um skammtíma- og langtímaálag er Gabbett 2016.",
  },
  "Helms 2020": {
    en: "No 2020 paper by Helms on single-leg hinges or asymmetry was found; his 2020 paper is on regulating and monitoring resistance training.",
    is: "Engin grein eftir Helms frá 2020 um einfóta mjaðmalyftur eða ósamhverfu fannst; grein hans frá 2020 fjallar um stýringu og vöktun styrktarþjálfunar.",
  },
  "Howatson & Milak 2009": {
    en: "Howatson & Milak 2009 is about muscle damage after repeated sprints. It does not compare light work the day after with total rest, which is what the rule cites it for.",
    is: "Howatson & Milak 2009 fjallar um vöðvaskemmdir eftir endurtekna spretti. Hún ber ekki saman létta vinnu daginn eftir við algera hvíld, sem reglan vitnar í hana fyrir.",
  },
  "Krzysztofik 2023": {
    en: "Krzysztofik's group published several isometric post-activation papers around 2023; which one is meant is not recorded.",
    is: "Hópur Krzysztofik birti nokkrar greinar um ísómetríska upphitun fyrir sprengikraft um 2023 og ekki er skráð hver er átt við.",
  },
  "Lake 2018": {
    en: "Lake co-wrote several 2018 force-plate papers; none is on an angle-specific isometric primer, and which one is meant is not recorded.",
    is: "Lake var meðhöfundur að nokkrum greinum 2018 um kraftplötur; engin fjallar um ísómetríska upphitun í tilteknu horni og ekki er skráð hver er átt við.",
  },
  "Lim 2020": {
    en: "No 2020 paper by Lim (or Lim & Childs) on long isometrics and tendons was found. The closest is Lim & Wong 2018 (patellar tendinopathy).",
    is: "Engin grein eftir Lim (eða Lim & Childs) frá 2020 um langar ísómetrískar æfingar og sinar fannst. Næst kemst Lim & Wong 2018 (sinakvilli í hnéskeljarsin).",
  },
  "Liu 2023": {
    en: "No 2023 paper by Liu on French contrast training in football was found.",
    is: "Engin grein eftir Liu frá 2023 um French contrast í fótbolta fannst.",
  },
  "Lombardi 1989": {
    en: "A book: Lombardi VP. Beginning Weight Training. W.C. Brown, 1989. Not a journal paper; not checked against the source.",
    is: "Bók: Lombardi VP. Beginning Weight Training. W.C. Brown, 1989. Ekki tímaritsgrein; ekki borin saman við frumheimild.",
  },
  "Loturco 2019": {
    en: "Loturco published several 2019 papers on optimum power loads; which one gives about 20% of 1RM is not recorded.",
    is: "Loturco birti nokkrar greinar 2019 um álag sem gefur mestan kraft; ekki er skráð hver gefur um 20% af 1RM.",
  },
  "McKinlay 2018": {
    en: "McKinlay 2018 is a plyometric and resistance training study in young footballers; it is not about rotational power or kicking speed, which is what the exercise cites it for.",
    is: "McKinlay 2018 er rannsókn á hoppum og styrktarþjálfun ungra fótboltamanna; hún fjallar ekki um snúningskraft eða sparkhraða, sem æfingin vitnar í hana fyrir.",
  },
  "Oranchuk 2023": {
    en: "Oranchuk published several 2023 papers; none is clearly the isometric training source the code means.",
    is: "Oranchuk birti nokkrar greinar 2023; engin þeirra er augljóslega heimildin um ísómetríska þjálfun sem kóðinn á við.",
  },
  "Reiman 2014": {
    en: "Reiman's 2014 papers are on hip examination and femoroacetabular impingement; none is on joint-by-joint mobility before squatting.",
    is: "Greinar Reiman frá 2014 fjalla um skoðun á mjöðm og klemmu í mjaðmalið; engin fjallar um liðleika lið fyrir lið fyrir hnébeygju.",
  },
  "Rønnestad 2023": {
    en: "No 2023 paper by Rønnestad on microdosing was found. The microdosing work in football is Cuthbert's (framework 2024, thesis 2022); Rønnestad's in-season strength paper is from 2011.",
    is: "Engin grein eftir Rønnestad frá 2023 um örskammta fannst. Rannsóknirnar á örskömmtum í fótbolta eru eftir Cuthbert (rammi 2024, doktorsritgerð 2022); grein Rønnestad um styrk á keppnistímabili er frá 2011.",
  },
  "Schoenfeld 2024": {
    en: "No 2024 paper by Schoenfeld on minimal-dose resistance training was found.",
    is: "Engin grein eftir Schoenfeld frá 2024 um lágmarksskammt styrktarþjálfunar fannst.",
  },
  "Suchomel & Stone 2017": {
    en: "No 2017 paper by Suchomel & Stone on the dumbbell or unilateral snatch was found.",
    is: "Engin grein eftir Suchomel & Stone frá 2017 um snörun með handlóði eða á öðrum fæti fannst.",
  },
  "Suchomel 2019": {
    en: "Suchomel et al. 2019 is a two-part review on eccentric training (Part 1 methods, Part 2 practical recommendations); which part is meant is not recorded.",
    is: "Suchomel o.fl. 2019 er yfirlitsgrein í tveimur hlutum um eccentric þjálfun (1. hluti aðferðir, 2. hluti ráðleggingar); ekki er skráð hvor hlutinn er átt við.",
  },
  "Welch 2019": {
    en: "No 2019 paper by Welch on French contrast training was found.",
    is: "Engin grein eftir Welch frá 2019 um French contrast fannst.",
  },
  "Buchheit 2013": {
    en: "Buchheit published several 2013 papers, including the two-part HIIT review with Laursen (Part I and Part II); which one this lever means is not recorded.",
    is: "Buchheit birti nokkrar greinar 2013, þar á meðal yfirlitsgreinina um HIIT með Laursen í tveimur hlutum; ekki er skráð hvaða grein er átt við.",
  },
  "Buchheit 2014": {
    en: "Buchheit published several 2014 football papers (sprint mechanics, repeated sprints, match running); which one is meant is not recorded.",
    is: "Buchheit birti nokkrar greinar um fótbolta 2014 (sprettfræði, endurteknir sprettir, hlaup í leik); ekki er skráð hver er átt við.",
  },
  "Delaney 2017": {
    en: "Delaney published several papers on peak running intensity around 2017 (rugby league, rugby union, soccer); which one this lever means is not recorded.",
    is: "Delaney birti nokkrar greinar um hámarks hlaupaákefð um 2017 (rugby league, rugby union, fótbolti); ekki er skráð hver er átt við.",
  },
  "Dos'Santos 2022": {
    en: "Dos'Santos co-wrote several 2022 papers on change of direction and turning demands; which one is meant is not recorded.",
    is: "Dos'Santos var meðhöfundur að nokkrum greinum 2022 um stefnubreytingar og snúninga í leik; ekki er skráð hver er átt við.",
  },
  "Esteve 2018": {
    en: "Esteve 2018 reports preseason adductor squeeze strength and past groin pain in 303 players; it gives no left–right asymmetry thresholds, which the code cites it for.",
    is: "Esteve 2018 fjallar um styrk aðlægra vöðva og fyrri náraverki hjá 303 leikmönnum; hún gefur engin mörk fyrir mun á hægri og vinstri, sem kóðinn vitnar í hana fyrir.",
  },
  "Hägglund 2013": {
    en: "Hägglund 2013 (UEFA Injury Study) finds previous injury and kicking leg as risk factors; it does not measure strength, so it does not support the groin strength-gap read.",
    is: "Hägglund 2013 (UEFA-rannsóknin) sýnir fyrri meiðsli og spyrnufót sem áhættuþætti; hún mælir ekki styrk og styður því ekki lesturinn á styrkbili í nára.",
  },
  "King 2018": {
    en: "King's 2018 papers on athletic groin pain cover rehabilitation and biomechanics; none identifies absolute adductor weakness as a risk factor, which the code cites it for.",
    is: "Greinar King frá 2018 um náraverki fjalla um endurhæfingu og hreyfifræði; engin sýnir veikleika aðlægra vöðva sem áhættuþátt, sem kóðinn vitnar í fyrir.",
  },
  "Kotsifaki 2024": {
    en: "No 2024 paper by Kotsifaki (with Heiderscheit and Buchheit) on groin strength was found on PubMed or Crossref.",
    is: "Engin grein eftir Kotsifaki (með Heiderscheit og Buchheit) frá 2024 um styrk í nára fannst á PubMed eða Crossref.",
  },
  "Lanza 2019": {
    en: "Two different papers are cited as Lanza 2019. The one with the full author list (Lanza, Castelli … Cyrino) was not found. Lanza, Balshaw & Folland 2019 (Eur J Appl Physiol, joint-angle specificity) exists but may not be the one meant.",
    is: "Tvær ólíkar greinar eru nefndar Lanza 2019. Sú með fullum höfundalista (Lanza, Castelli … Cyrino) fannst ekki. Lanza, Balshaw & Folland 2019 (Eur J Appl Physiol, horn liðar) er til en er ekki endilega sú sem átt er við.",
  },
  "Marques & Buchheit 2026": {
    en: "\"Jump Height Lies\", Sport Performance & Science Reports #293. SPSR is not indexed by PubMed or Crossref, so it was not checked against a record.",
    is: "„Jump Height Lies“, Sport Performance & Science Reports #293. PubMed og Crossref skrá ekki SPSR, svo hún var ekki borin saman við færslu.",
  },
  "Petrigna 2019": {
    en: "Petrigna 2019 reviews jump-test methods in adolescents; it gives no team-sport CMJ power values, which the code cites it for.",
    is: "Petrigna 2019 er yfirlit yfir aðferðir í hoppprófum hjá unglingum; hún gefur engin gildi fyrir afl í hoppi í hópíþróttum, sem kóðinn vitnar í hana fyrir.",
  },
  "Pettitt 2016": {
    en: "Pettitt 2016 is about critical speed from a 3-minute all-out test, not MAS from a 4-minute run, which the code cites it for.",
    is: "Pettitt 2016 fjallar um critical speed úr 3 mínútna hámarksprófi, ekki MAS úr 4 mínútna hlaupi, sem kóðinn vitnar í hana fyrir.",
  },
  "Power 2023": {
    en: "No 2023 paper by Power on progressive isometric loading for tendinopathy was found on PubMed or Crossref.",
    is: "Engin grein eftir Power frá 2023 um stigvaxandi ísómetrískt álag við sinakvilla fannst á PubMed eða Crossref.",
  },
  "Read 2022": {
    en: "No 2022 NordBord norm paper by Read for senior male soccer was found; the closest 2022 NordBord paper is a reliability study by Bishop et al.",
    is: "Engin grein eftir Read frá 2022 með NordBord-viðmiðum fyrir fullorðna karla í fótbolta fannst; næst kemst áreiðanleikarannsókn Bishop o.fl. 2022.",
  },
  "Sandford 2019": {
    en: "Sandford's 2019 papers are on 800 m and 1500 m runners; none gives football sprint-speed norms, and which one is meant is not recorded.",
    is: "Greinar Sandford frá 2019 fjalla um 800 m og 1500 m hlaupara; engin gefur viðmið um sprettihraða í fótbolta og ekki er skráð hver er átt við.",
  },
  "Thomas 2017": {
    en: "Two different 2017 papers fit: Thomas et al. (Med Sci Sports Exerc, simulated match) and Brownstein … Thomas (Front Physiol, competitive match). The code uses \"Thomas 2017\" for both; which is meant in each place is not clear.",
    is: "Tvær greinar frá 2017 passa: Thomas o.fl. (Med Sci Sports Exerc, hermdur leikur) og Brownstein … Thomas (Front Physiol, keppnisleikur). Kóðinn notar „Thomas 2017“ um báðar; ekki er ljóst hvor er átt við hverju sinni.",
  },
  "Toth 2019": {
    en: "No 2019 paper by Toth on jump norms in junior soccer was found on PubMed or Crossref.",
    is: "Engin grein eftir Toth frá 2019 um hoppviðmið í unglingafótbolta fannst á PubMed eða Crossref.",
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

/** "Dos’Santos  2019", "Dos'Santos 2019" and "Dos'Santos et al. 2019" are the same short. */
function norm(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[’ʼ]/g, "'")
    .replace(/ et al\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The registry form of a short. A full author list ("Lum, Barbosa, Joseph, Balasekaran 2021") reads as its
 * first author ("Lum 2021") unless an alias names the list itself (two papers by one first author in a year).
 */
function canonical(short: string): string {
  const s = norm(short);
  if (SHORT_ALIASES[s]) return norm(SHORT_ALIASES[s]);
  const list = s.match(/^([^,]+), .* ((?:19|20)\d{2}[ab]?)$/);
  if (!list) return s;
  const first = `${list[1]} ${list[2]}`;
  return norm(SHORT_ALIASES[first] ?? first);
}

const BY_SHORT: Map<string, GoalRef> = (() => {
  const m = new Map<string, GoalRef>();
  for (const r of ALL_REFS) if (!m.has(norm(r.short))) m.set(norm(r.short), r);
  return m;
})();

/** The full reference for a short citation, or null when it is unresolved or unknown. */
export function findRefByShort(short: string): GoalRef | null {
  return BY_SHORT.get(canonical(short)) ?? null;
}

/** Why a short citation is unresolved, or null when it resolves or is unknown. */
export function unresolvedReason(short: string): { en: string; is: string } | null {
  return UNRESOLVED_SHORTS[canonical(short)] ?? null;
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
  const taken: Array<{ at: number; end: number }> = [];
  const out: Array<{ short: string; ref: GoalRef | null; unresolved: { en: string; is: string } | null }> = [];
  for (const h of hits) {
    const end = h.at + norm(h.short).length;
    // A short inside a longer one already taken ("de Villarreal 2009" inside "Sáez de Villarreal 2009") is the same.
    if (taken.some((x) => h.at >= x.at && end <= x.end)) continue;
    const ref = findRefByShort(h.short);
    const id = ref?.key ?? canonical(h.short);
    if (seen.has(id)) continue;
    seen.add(id);
    taken.push({ at: h.at, end });
    out.push({ short: h.short, ref, unresolved: ref ? null : unresolvedReason(h.short) });
  }
  return out;
}

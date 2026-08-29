"use client";

/**
 * Coach view — RTP Testing Guide (reference, linked from VALD Assessment).
 *
 * "Which objective tests do I run for which injury before return-to-play?" — a
 * per-injury map of the VALD device batteries (ForceDecks / NordBord / ForceFrame)
 * + field tests + the typical criteria a player should meet, each cited.
 *
 * EDUCATIONAL reference only. Criteria-based benchmarks vary by grade, sport and
 * individual; the return-to-play CLEARANCE decision belongs to the treating
 * clinician / medical team. This page never marks a player injured or available,
 * and never touches the readiness colour (injury status is coach/medical only).
 *
 * Not in the sidebar — reached via the "Which tests for which injury?" link on the
 * VALD Assessment page (/coach/rtp). Print button → Save as PDF.
 */

import Link from "next/link";
import { useLang } from "@/lib/lang";

type Bi = { EN: string; IS: string };
type Device = "ForceDecks" | "NordBord" | "ForceFrame" | "Field" | "Clinical";

type TestItem = { device: Device; name: Bi; detail: Bi };
type InjuryProtocol = {
  key: string;
  title: Bi;
  tests: TestItem[];
  criteria: Bi[];
  /** The clinician's confirming special test(s) — assessment, not treatment. */
  clinical?: Bi;
  /** What to rule out — the differential-diagnosis prompt (never a diagnosis itself). */
  differential?: Bi;
  citation: string;
  rehabHref?: string;
};

const DEVICE_STYLE: Record<Device, { bg: string; text: string; label: string }> = {
  ForceDecks: { bg: "bg-blue-50", text: "text-blue-700", label: "ForceDecks" },
  NordBord:   { bg: "bg-emerald-50", text: "text-emerald-700", label: "NordBord" },
  ForceFrame: { bg: "bg-violet-50", text: "text-violet-700", label: "ForceFrame" },
  Field:      { bg: "bg-amber-50", text: "text-amber-700", label: "Field / Vettvangur" },
  Clinical:   { bg: "bg-rose-50", text: "text-rose-700", label: "Clinical / Klínískt" },
};

const PROTOCOLS: InjuryProtocol[] = [
  {
    key: "hamstring",
    title: { EN: "Hamstring strain", IS: "Hamstring-tognun" },
    rehabHref: "/coach/hamstring-rehab",
    tests: [
      { device: "NordBord", name: { EN: "Eccentric hamstring strength", IS: "Sérvirkur hamstring-styrkur" },
        detail: { EN: "Peak force (N) each leg + between-limb imbalance. The primary hamstring RTP test.", IS: "Hámarkskraftur (N) hvor fótur + munur milli fóta. Aðal RTP-próf hamstring." } },
      { device: "ForceDecks", name: { EN: "CMJ + single-leg jump", IS: "CMJ + einfóta stökk" },
        detail: { EN: "Jump height and single-leg limb symmetry (LSI) for explosive capacity.", IS: "Stökkhæð og einfóta samhverfa (LSI) fyrir sprengikraft." } },
      { device: "Field", name: { EN: "Max-velocity sprint", IS: "Hámarkshraða spretthlaup" },
        detail: { EN: "Pain-free return to top sprint speed (GPS max velocity) — most re-injuries are at speed.", IS: "Sársaukalaus endurkoma á hámarks-spretthraða (GPS max velocity) — flest endurmeiðsli verða á hraða." } },
    ],
    criteria: [
      { EN: "Eccentric strength within ~10% of the uninjured leg (NordBord imbalance ≤10–15%).", IS: "Sérvirkur styrkur innan ~10% af óslasaða fæti (NordBord munur ≤10–15%)." },
      { EN: "Full pain-free range + pain-free max-velocity sprint.", IS: "Fullt sársaukalaust hreyfisvið + sársaukalaust hámarkshraða-hlaup." },
    ],
    clinical: { EN: "Resisted knee flexion + palpation to localise the lesion.", IS: "Mótstöðu hnébeygja + þreifing til að staðsetja meiðsli." },
    differential: { EN: "Rule out lumbar / sciatic referral (slump, SLR) and a proximal tendon avulsion.", IS: "Útiloka lendar- / settaugar-leiðni (slump, SLR) og nærlæga sina-rifu." },
    citation: "Opar/Bourne (NordBord); van Dyk 2017; Askling H-test",
  },
  {
    key: "quadriceps",
    title: { EN: "Quadriceps strain (rectus femoris)", IS: "Fjórhöfða-tognun (rectus femoris)" },
    tests: [
      { device: "ForceDecks", name: { EN: "IMTP / isometric knee-extension", IS: "IMTP / ísómetrísk hné-rétta" },
        detail: { EN: "Knee-extension strength limb-symmetry against the uninjured leg.", IS: "Hné-réttu styrks samhverfa gegn óslasaða fæti." } },
      { device: "ForceDecks", name: { EN: "CMJ + single-leg jump", IS: "CMJ + einfóta stökk" },
        detail: { EN: "Jump height / power symmetry before explosive load.", IS: "Stökkhæðar- / kraft-samhverfa fyrir sprengi-álag." } },
      { device: "Field", name: { EN: "Max sprint + kicking", IS: "Hámarks-sprettur + spyrnur" },
        detail: { EN: "Pain-free top-speed sprint and kicking (rectus femoris loads hardest here).", IS: "Sársaukalaus hámarkshraði og spyrnur (rectus femoris álagast mest þar)." } },
    ],
    criteria: [
      { EN: "Knee-extension strength ≥90% LSI, full pain-free range.", IS: "Hné-réttu styrkur ≥90% LSI, fullt sársaukalaust svið." },
      { EN: "Pain-free max-velocity sprint and kicking.", IS: "Sársaukalaus hámarkshraði og spyrnur." },
    ],
    clinical: { EN: "Resisted knee extension + Ely's test (rectus femoris).", IS: "Mótstöðu hné-rétta + Ely's próf (rectus femoris)." },
    differential: { EN: "Rule out femoral / hip referral and, after a contusion, myositis ossificans.", IS: "Útiloka lær- / mjaðma-leiðni og, eftir mar, myositis ossificans." },
    citation: "Sherry/Erickson; muscle-strain RTP principles",
  },
  {
    key: "acl",
    title: { EN: "ACL reconstruction / knee", IS: "Krossbands-aðgerð / hné" },
    tests: [
      { device: "ForceDecks", name: { EN: "Single-leg hop battery + CMJ", IS: "Einfóta hopp-röð + CMJ" },
        detail: { EN: "Hop LSI and RSI-modified symmetry — reactive strength and landing control.", IS: "Hopp-LSI og RSI-modified samhverfa — hvarfkraftur og lendingar-stjórn." } },
      { device: "ForceDecks", name: { EN: "IMTP / isometric knee-extension", IS: "IMTP / ísómetrísk hné-rétta" },
        detail: { EN: "Quadriceps strength limb-symmetry — the strongest re-injury predictor.", IS: "Fjórhöfða-styrks samhverfa — sterkasti endurmeiðsla-forspáþátturinn." } },
      { device: "Field", name: { EN: "On-field criteria + time", IS: "Vettvangs-viðmið + tími" },
        detail: { EN: "Change-of-direction, agility and sport-specific drills; criteria-based, not time-only.", IS: "Stefnubreytingar, snerpa og íþrótta-sértækar æfingar; viðmiðabundið, ekki bara tími." } },
    ],
    criteria: [
      { EN: "Quadriceps + hop LSI ≥90% of the uninjured leg (each drops re-injury risk).", IS: "Fjórhöfða- + hopp-LSI ≥90% af óslasaða fæti (hvort um sig lækkar áhættu)." },
      { EN: "Criteria-based clearance — delaying RTP toward ~9 months markedly lowers re-injury.", IS: "Viðmiðabundin klárun — að seinka RTP að ~9 mánuðum lækkar endurmeiðsli verulega." },
    ],
    clinical: { EN: "Lachman (most sensitive) + anterior drawer + pivot shift.", IS: "Lachman (næmast) + fremri skúffa + pivot shift." },
    differential: { EN: "Rule out meniscal, collateral-ligament and PCL involvement.", IS: "Útiloka liðþófa-, hliðarbands- og PCL-þátttöku." },
    citation: "Grindem 2016 (BJSM); Kyritsis 2016; Buckthorpe 2019",
  },
  {
    key: "mcl",
    title: { EN: "MCL sprain (medial knee)", IS: "Innra hliðarbands-tognun (MCL)" },
    tests: [
      { device: "ForceDecks", name: { EN: "Single-leg hop + CMJ", IS: "Einfóta hopp + CMJ" },
        detail: { EN: "Hop LSI and landing control under load.", IS: "Hopp-LSI og lendingar-stjórn undir álagi." } },
      { device: "Field", name: { EN: "Change-of-direction / cutting", IS: "Stefnubreytingar / skurðir" },
        detail: { EN: "Pain-free cutting at speed — valgus load is the provocation.", IS: "Sársaukalausir skurðir á hraða — valgus-álag er ögrunin." } },
      { device: "Field", name: { EN: "Clinical valgus stability", IS: "Klínísk valgus-stöðugleiki" },
        detail: { EN: "Ligament laxity / end-feel assessed by the clinician (grade-dependent).", IS: "Bandslaki / endapunktur metinn af sérfræðingi (gráðu-háð)." } },
    ],
    criteria: [
      { EN: "Pain-free valgus load and full range, hop LSI ≥90%.", IS: "Sársaukalaust valgus-álag og fullt svið, hopp-LSI ≥90%." },
      { EN: "Pain-free change-of-direction / cutting at speed.", IS: "Sársaukalausar stefnubreytingar / skurðir á hraða." },
    ],
    clinical: { EN: "Valgus stress at 0° and 30° grades the sprain (laxity + end-feel).", IS: "Valgus-álag við 0° og 30° gráðar tognunina (slaki + endapunktur)." },
    differential: { EN: "Rule out medial-meniscus and ACL involvement.", IS: "Útiloka innri liðþófa- og ACL-þátttöku." },
    citation: "Grade-based MCL RTP (clinical + criteria)",
  },
  {
    key: "groin",
    title: { EN: "Adductor / groin", IS: "Aðleiðara / nári" },
    rehabHref: "/coach/adductor-groin",
    tests: [
      { device: "ForceFrame", name: { EN: "Isometric adductor squeeze", IS: "Ísómetrísk aðleiðara-kreisting" },
        detail: { EN: "Adduction force each leg + the adduction : abduction ratio. The key groin test.", IS: "Aðfærslu-kraftur hvor fótur + aðfærsla : fráfærsla hlutfall. Lykil nára-prófið." } },
      { device: "ForceFrame", name: { EN: "Hip abduction + rotation", IS: "Mjaðma-fráfærsla + snúningur" },
        detail: { EN: "Surrounding hip strength to balance the adductor load.", IS: "Umliggjandi mjaðmastyrkur til að jafna aðleiðara-álag." } },
    ],
    criteria: [
      { EN: "Adductor strength restored to ≥90% of the uninjured side / baseline, pain-free squeeze.", IS: "Aðleiðara-styrkur endurheimtur í ≥90% af óslasaðri hlið / grunngildi, sársaukalaus kreisting." },
      { EN: "Adduction : abduction ratio ≈ 0.9–1.0 (deficit is a recognised risk marker).", IS: "Aðfærsla : fráfærsla hlutfall ≈ 0.9–1.0 (skortur er þekktur áhættuþáttur)." },
    ],
    clinical: { EN: "Resisted adduction (squeeze) + palpation of the adductor origin.", IS: "Mótstöðu aðfærsla (kreisting) + þreifing á aðleiðara-upptök." },
    differential: { EN: "Rule out hip (FADIR/FABER), inguinal / sports hernia and pubic-related pain.", IS: "Útiloka mjöðm (FADIR/FABER), nára- / íþrótta-kviðslit og lífbeins-tengda verki." },
    citation: "Esteve 2020; Serner; Doha/Copenhagen agreement",
  },
  {
    key: "ankle",
    title: { EN: "Ankle sprain (I–II)", IS: "Ökkla-tognun (I–II)" },
    rehabHref: "/coach/ankle-sprain",
    tests: [
      { device: "ForceDecks", name: { EN: "CMJ + single-leg hop", IS: "CMJ + einfóta hopp" },
        detail: { EN: "Jump/hop limb symmetry and landing control.", IS: "Stökk/hopp samhverfa og lendingar-stjórn." } },
      { device: "Field", name: { EN: "Single-leg balance / Y-balance", IS: "Einfóta jafnvægi / Y-balance" },
        detail: { EN: "Dynamic postural control — reach symmetry between limbs.", IS: "Dýnamísk stöðustjórn — teygju-samhverfa milli fóta." } },
      { device: "Field", name: { EN: "Single-leg heel-raise", IS: "Einfóta hælalyfta" },
        detail: { EN: "Calf endurance reps to symmetry.", IS: "Kálfa-úthald í endurtekningum að samhverfu." } },
    ],
    criteria: [
      { EN: "Hop + balance LSI ≥90%, full pain-free range, no swelling on load.", IS: "Hopp- + jafnvægis-LSI ≥90%, fullt sársaukalaust svið, engin bólga við álag." },
    ],
    clinical: { EN: "Anterior drawer + talar tilt (lateral-ligament laxity, ATFL/CFL).", IS: "Fremri skúffa + talar tilt (utanverð bandslaki, ATFL/CFL)." },
    differential: { EN: "Rule out fracture (Ottawa rules), high-ankle syndesmosis (squeeze / ER test) and peroneal injury.", IS: "Útiloka beinbrot (Ottawa-reglur), há-ökkla syndesmosis (kreisting / ER-próf) og peroneal-meiðsli." },
    citation: "Doherty 2017; PEACE & LOVE",
  },
  {
    key: "patellar",
    title: { EN: "Patellar tendinopathy (jumper's knee)", IS: "Hnéskeljar-sinabólga (stökkhné)" },
    rehabHref: "/coach/jumpers-knee",
    tests: [
      { device: "Field", name: { EN: "Single-leg decline squat (pain)", IS: "Einfóta halla-hnébeygja (sársauki)" },
        detail: { EN: "Load-related pain ≤3/10 monitored session-to-session (VISA-P tracking).", IS: "Álags-tengdur sársauki ≤3/10 fylgt milli æfinga (VISA-P eftirfylgni)." } },
      { device: "ForceDecks", name: { EN: "CMJ + single-leg jump", IS: "CMJ + einfóta stökk" },
        detail: { EN: "Symmetry of jump height / power before return to jumping load.", IS: "Samhverfa stökkhæðar / krafts fyrir endurkomu í stökk-álag." } },
    ],
    criteria: [
      { EN: "Load-related pain ≤3/10 and settling by next morning; jump symmetry restored.", IS: "Álags-sársauki ≤3/10 og gengur til baka fyrir næsta morgun; stökk-samhverfa endurheimt." },
    ],
    clinical: { EN: "Palpation of the inferior patellar pole + loaded single-leg decline squat.", IS: "Þreifing á neðri hnéskeljar-pól + hlaðin einfóta halla-hnébeygja." },
    differential: { EN: "Rule out fat-pad (Hoffa), patellofemoral pain and, in youth, Osgood-Schlatter.", IS: "Útiloka fitupúða (Hoffa), patellofemoral verki og, hjá unglingum, Osgood-Schlatter." },
    citation: "Cook & Purdam; VISA-P",
  },
  {
    key: "achilles",
    title: { EN: "Achilles tendinopathy", IS: "Achilles-sinabólga" },
    rehabHref: "/coach/achilles-tendinopathy",
    tests: [
      { device: "Field", name: { EN: "Single-leg heel-raise endurance", IS: "Einfóta hælalyfta-úthald" },
        detail: { EN: "Reps + height to symmetry with the uninjured side.", IS: "Endurtekningar + hæð að samhverfu við óslasaða hlið." } },
      { device: "ForceDecks", name: { EN: "Hop + CMJ symmetry", IS: "Hopp + CMJ samhverfa" },
        detail: { EN: "Reactive strength before return to running/jumping.", IS: "Hvarfkraftur fyrir endurkomu í hlaup/stökk." } },
    ],
    criteria: [
      { EN: "Heel-raise endurance to symmetry, load-related pain ≤3/10, VISA-A trending up.", IS: "Hælalyfta-úthald að samhverfu, álags-sársauki ≤3/10, VISA-A á uppleið." },
    ],
    clinical: { EN: "Thompson (calf-squeeze) to exclude rupture; palpation / arc sign for tendinopathy.", IS: "Thompson (kálfa-kreisting) til að útiloka rifu; þreifing / arc-merki fyrir sinabólgu." },
    differential: { EN: "Rule out complete rupture, retrocalcaneal bursitis and posterior ankle impingement.", IS: "Útiloka fullkomna rifu, retrocalcaneal slímsekksbólgu og aftari ökkla-klemmu." },
    citation: "Silbernagel; VISA-A",
  },
  {
    key: "calf",
    title: { EN: "Calf strain (gastrocnemius / soleus)", IS: "Kálfa-tognun (gastrocnemius / soleus)" },
    tests: [
      { device: "Field", name: { EN: "Single-leg heel-raise endurance", IS: "Einfóta hælalyfta-úthald" },
        detail: { EN: "Reps + height to symmetry (straight knee = gastroc, bent knee = soleus). The key calf RTP test.", IS: "Endurtekningar + hæð að samhverfu (bein hné = gastroc, beygt hné = soleus). Aðal RTP-próf kálfa." } },
      { device: "ForceFrame", name: { EN: "Isometric plantarflexion strength", IS: "Ísómetrísk plantarflexion-styrkur" },
        detail: { EN: "Peak plantarflexion force each leg + L/R symmetry (ankle attachment) — a strength complement to the endurance heel-raise.", IS: "Hámarks plantarflexion-kraftur hvor fótur + samhverfa (ökkla-búnaður) — styrk-viðbót við úthalds-hælalyftu." } },
      { device: "ForceDecks", name: { EN: "CMJ + single-leg hop", IS: "CMJ + einfóta hopp" },
        detail: { EN: "Reactive strength / hop symmetry before running & jumping load.", IS: "Hvarfkraftur / hopp-samhverfa fyrir hlaupa- og stökk-álag." } },
      { device: "Field", name: { EN: "Max-velocity sprint", IS: "Hámarkshraða-hlaup" },
        detail: { EN: "Pain-free top speed — calf strains recur at speed and on fatigue.", IS: "Sársaukalaus hámarkshraði — kálfa-tognanir koma aftur á hraða og við þreytu." } },
    ],
    criteria: [
      { EN: "Heel-raise reps + height within ~10% of the uninjured side; plantarflexion strength symmetric where measured.", IS: "Hælalyfta-endurtekningar + hæð innan ~10% af óslasaðri hlið; plantarflexion-styrkur samhverfur þar sem mælt er." },
      { EN: "Pain-free hopping and max-velocity sprint.", IS: "Sársaukalaus hopp og hámarkshraða-hlaup." },
    ],
    clinical: { EN: "Thompson test (excludes Achilles rupture) + resisted plantarflexion.", IS: "Thompson próf (útilokar Achilles-rifu) + mótstöðu plantarflexion." },
    differential: { EN: "Rule out DVT (clinical suspicion → urgent referral), Achilles rupture and Baker's cyst.", IS: "Útiloka DVT (klínískur grunur → bráðatilvísun), Achilles-rifu og Baker-blöðru." },
    citation: "Green & Pizzari 2017; Hébert-Losier (heel-raise norms)",
  },
  {
    key: "abdominal",
    title: { EN: "Abdominal / oblique strain (abdominal wall)", IS: "Kviðvöðva- / skávöðva-tognun (kviðveggur)" },
    tests: [
      { device: "Field", name: { EN: "Resisted trunk flexion + rotation", IS: "Mótstöðu kvið-beygja + snúningur" },
        detail: { EN: "Pain provocation on resisted flexion / rotation to each side.", IS: "Sársauka-ögrun við mótstöðu-beygju / snúning til hvorrar hliðar." } },
      { device: "Field", name: { EN: "Trunk-flexor & side-plank endurance", IS: "Kvið-beygju- & hliðarplanka-úthald" },
        detail: { EN: "Hold times, left/right symmetry — trunk endurance is the practical objective marker.", IS: "Haldtími, hægri/vinstri samhverfa — kvið-úthald er hagnýti hlutlægi mælikvarðinn." } },
      { device: "Field", name: { EN: "Sport-specific loading", IS: "Íþrótta-sértækt álag" },
        detail: { EN: "Pain-free kicking / throwing / overhead action at full effort.", IS: "Sársaukalaus spyrna / kast / yfir-höfuð hreyfing á fullu álagi." } },
    ],
    criteria: [
      { EN: "Pain-free resisted trunk flexion + rotation and full trunk range.", IS: "Sársaukalaus mótstöðu kvið-beygja + snúningur og fullt bol-svið." },
      { EN: "Trunk endurance restored to symmetry; pain-free kicking / throwing.", IS: "Kvið-úthald endurheimt að samhverfu; sársaukalaus spyrna / kast." },
      { EN: "No standard force-plate battery here — objective testing is clinical / field; screen for hip-flexor & athletic-groin overlap.", IS: "Engin stöðluð kraftplötu-röð hér — hlutlæg prófun er klínísk / vettvangur; skimaðu fyrir mjaðmabeygju- & íþrótta-nára skörun." },
    ],
    clinical: { EN: "Resisted trunk flexion / rotation + palpation of the abdominal wall.", IS: "Mótstöðu bol-beygja / snúningur + þreifing á kviðvegg." },
    differential: { EN: "Rule out inguinal / sports hernia, hip-flexor strain and referred / visceral pain.", IS: "Útiloka nára- / íþrótta-kviðslit, mjaðmabeygju-tognun og leidda / innyfla-verki." },
    citation: "McGill trunk endurance; clinical criteria (limited RTP evidence)",
  },
];

export default function RtpTestingGuidePage() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const t = (b: Bi) => (isEN ? b.EN : b.IS);

  return (
    <div id="rtpguide" className="mx-auto w-full max-w-4xl p-4 md:p-6">
      <style>{`@media print {@page{size:A4 portrait;margin:14mm} body *{visibility:hidden} #rtpguide,#rtpguide *{visibility:visible} #rtpguide{position:absolute;left:0;top:0;width:100%} .rtp-noprint{display:none!important} .rtp-card{break-inside:avoid}}`}</style>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/coach/rtp" className="rtp-noprint text-xs text-zinc-500 hover:text-zinc-700">← {isEN ? "VALD Assessment" : "VALD-mat"}</Link>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-zinc-900">{isEN ? "RTP Testing Guide" : "RTP prófunar-leiðbeiningar"}</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            {isEN
              ? "Which objective tests to run for which injury before return-to-play — the VALD device batteries (ForceDecks, NordBord, ForceFrame) and field tests, with the criteria a player typically meets."
              : "Hvaða hlutlægu próf á að keyra við hvaða meiðsli fyrir endurkomu — VALD tækja-raðir (ForceDecks, NordBord, ForceFrame) og vettvangs-próf, með viðmiðum sem leikmaður uppfyllir að jafnaði."}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="rtp-noprint rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          {isEN ? "Print / Save as PDF" : "Prenta / Vista sem PDF"}
        </button>
      </div>

      {/* Educational disclaimer */}
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900">
        {isEN
          ? "Educational reference only. Thresholds are typical guides that vary by injury grade, sport and individual — the return-to-play clearance decision belongs to the treating clinician / medical team. Always test the uninjured limb as the player's own reference (limb symmetry, LSI)."
          : "Aðeins fræðsluviðmið. Viðmiðunargildi eru dæmigerð og breytast eftir gráðu meiðsla, íþrótt og einstaklingi — ákvörðun um endurkomu er í höndum meðhöndlandi sérfræðings / læknateymis. Prófaðu alltaf óslasaða útlim sem viðmið leikmannsins (samhverfa, LSI)."}
      </div>

      {/* Device legend */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          { d: "ForceDecks" as Device, what: { EN: "Force plates — CMJ, single-leg hop, IMTP: jump height, RSI, limb symmetry.", IS: "Kraftplötur — CMJ, einfóta hopp, IMTP: stökkhæð, RSI, samhverfa." } },
          { d: "NordBord" as Device, what: { EN: "Nordic device — eccentric hamstring strength + left/right imbalance.", IS: "Nordic tæki — sérvirkur hamstring-styrkur + hægri/vinstri munur." } },
          { d: "ForceFrame" as Device, what: { EN: "Isometric frame — adductor squeeze, hip & shoulder strength, ratios.", IS: "Ísómetrískur rammi — aðleiðara-kreisting, mjaðma- & axlar-styrkur, hlutföll." } },
        ].map(({ d, what }) => (
          <div key={d} className={`rounded-lg border border-zinc-200 p-2.5 ${DEVICE_STYLE[d].bg}`}>
            <div className={`text-xs font-bold ${DEVICE_STYLE[d].text}`}>{DEVICE_STYLE[d].label}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-zinc-600">{t(what)}</div>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        {isEN
          ? "Each injury also lists the clinician's confirming special test and a “rule out” differential prompt — for the physical exam alongside the objective tests. These follow standard orthopedic assessment references: Magee, Orthopedic Physical Assessment; Vizniak, Orthopedic Conditions; Meadows, Differential Diagnosis for the Orthopedic PT."
          : "Hvert meiðsli sýnir líka staðfestandi special-próf sérfræðingsins og „útiloka“ mismunagreiningar-vísbendingu — fyrir líkamsskoðunina samhliða hlutlægu prófunum. Þetta fylgir stöðluðum bæklunar-mats heimildum: Magee, Orthopedic Physical Assessment; Vizniak, Orthopedic Conditions; Meadows, Differential Diagnosis for the Orthopedic PT."}
      </p>

      {/* General principles */}
      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">{isEN ? "General principles" : "Almenn viðmið"}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-zinc-700">
          <li>{isEN ? "Criteria-based, not calendar-based — meet the tests, not just the weeks." : "Viðmiðabundið, ekki dagatals-bundið — uppfylla prófin, ekki bara vikurnar."}</li>
          <li>{isEN ? "Limb symmetry (LSI) ≥90% of the uninjured side is a common strength/hop gate." : "Samhverfa (LSI) ≥90% af óslasaðri hlið er algengt styrk-/hopp-viðmið."}</li>
          <li>{isEN ? "Pain-free at the demand being returned to (sprint speed, jump load, change of direction)." : "Sársaukalaust við það álag sem er verið að fara aftur í (spretthraði, stökk-álag, stefnubreytingar)."}</li>
          <li>{isEN ? "Re-test against the player's own pre-injury baseline where one exists." : "Endurprófaðu gegn eigin grunngildi leikmannsins fyrir meiðsli þar sem það er til."}</li>
        </ul>
      </div>

      {/* Injury cards */}
      <div className="mt-4 space-y-3">
        {PROTOCOLS.map((p) => (
          <div key={p.key} className="rtp-card rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-zinc-900">{t(p.title)}</h3>
              {p.rehabHref && (
                <Link href={p.rehabHref} className="rtp-noprint text-xs font-medium text-violet-700 hover:underline">
                  {isEN ? "Rehab protocol →" : "Endurhæfingar-prógramm →"}
                </Link>
              )}
            </div>

            <div className="mt-2 space-y-1.5">
              {p.tests.map((test, i) => (
                <div key={i} className="flex flex-wrap items-start gap-2 text-[13px]">
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${DEVICE_STYLE[test.device].bg} ${DEVICE_STYLE[test.device].text}`}>
                    {DEVICE_STYLE[test.device].label}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium text-zinc-800">{t(test.name)}</span>
                    <span className="text-zinc-600"> — {t(test.detail)}</span>
                  </span>
                </div>
              ))}
              {p.clinical && (
                <div className="flex flex-wrap items-start gap-2 text-[13px]">
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${DEVICE_STYLE.Clinical.bg} ${DEVICE_STYLE.Clinical.text}`}>
                    {DEVICE_STYLE.Clinical.label}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium text-zinc-800">{isEN ? "Confirming special test" : "Staðfestandi special-próf"}</span>
                    <span className="text-zinc-600"> — {t(p.clinical)}</span>
                  </span>
                </div>
              )}
            </div>

            <div className="mt-3 rounded-lg bg-zinc-50 p-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{isEN ? "Typical clearance criteria" : "Dæmigerð klárunar-viðmið"}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-zinc-700">
                {p.criteria.map((c, i) => <li key={i}>{t(c)}</li>)}
              </ul>
            </div>

            {p.differential && (
              <div className="mt-2 flex items-start gap-1.5 text-[12px] text-zinc-600">
                <span className="mt-[1px] shrink-0 text-[10px] font-semibold uppercase tracking-wide text-rose-600">{isEN ? "Rule out" : "Útiloka"}</span>
                <span>{t(p.differential)}</span>
              </div>
            )}

            <div className="mt-2 text-[11px] text-zinc-400">{isEN ? "Reference" : "Heimild"}: {p.citation}</div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-zinc-400">
        {isEN
          ? "This guide summarises common criteria-based return-to-play test batteries and is not a substitute for clinical judgement. It does not clear players, set availability, or change the readiness colour."
          : "Þessar leiðbeiningar draga saman algengar viðmiðabundnar RTP prófunar-raðir og koma ekki í stað klínísks mats. Þær klára ekki leikmenn, setja ekki tiltækni og breyta ekki readiness-litnum."}
      </p>
    </div>
  );
}

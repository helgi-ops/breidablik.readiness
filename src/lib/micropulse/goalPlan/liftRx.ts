/**
 * "Speed & power" lota 7: every gym lift in a plan gets its full set of training variables (load, how hard, the speed
 * of each rep, rest, warm-up, when to add weight, how often, order) plus a "With a bar-speed device" part.
 *
 * Pure and client-safe. `withRx` reads each block the plans already have (method + the English text, like `slotFor`
 * in swaps.ts) and adds `rx`; it never changes a block's `what` or `dose`, so the plans and their golden hashes stay
 * as they are. The sets × reps in `rx` are read from the dose itself.
 *
 * Every line says where its number comes from: a study behind the method's card, another study, or MicroPulse's own
 * guide (not tested). Studies were read in full before a number went in; a number that could not be checked is
 * written as MicroPulse's guide, never as a study number.
 */

import { SPEED_METHODS, SPEED_REFS } from "@/lib/micropulse/speedMethods";
import { VBT_LOAD_STEP_PCT, VBT_TOLERANCE_MS } from "@/lib/micropulse/vbtMethods";
import { ACCEL_REFS } from "./acceleration";
import { BRAKING_REFS } from "./braking";
import { GYM_METHODS, GYM_REFS } from "./gymGoals";
import { JUMP_REFS } from "./jump";
import { QUALITY_LIBRARIES } from "./qualityLibrary";
import type { TrainingLevel } from "./levels";
import { swapMark } from "./swaps";
import { isGymQuality, type Bi, type GoalPlan, type GoalQuality, type GoalRef } from "./types";

/** Where a number comes from. `study` lines are resolved by `withRx` into `plan_study` / `other_study`. `session` =
 *  read from the session the coach (or the engine) sent to the player's Today (lota 8, `todayLiftRx.ts`). */
export type RxSource = "plan_study" | "other_study" | "micropulse" | "session";
export type RxLine = { text: Bi; source: RxSource; refs?: string[] };

export type RxRowKey = "load" | "effort" | "tempo" | "rest" | "warmup" | "progression" | "frequency" | "order" | "note";
export type RxBarKey = "target" | "stop" | "adjust" | "feedback" | "coach" | "none";

/** `general` = a Today lift with no profile (lota 8): only the session's own lines, nothing filled in. */
export type LiftProfile = "heavy" | "technique" | "rdl" | "jump_squat" | "pull" | "nordic" | "eccentric" | "squat_fast" | "youth" | "general";

/** One lift's full prescription. */
export type LiftRx = {
  profile: LiftProfile;
  exercise: Bi;
  sets: string;
  reps: string;
  rows: Partial<Record<RxRowKey, RxLine>>;
  barSpeed: { key: RxBarKey; line: RxLine }[];
};

export type RxContext = { quality: GoalQuality; level: TrainingLevel; youth: boolean };

// ─── Labels ──────────────────────────────────────────────────────────────────────────────────────────────────────

export const RX_ROW_ORDER: RxRowKey[] = ["order", "load", "effort", "tempo", "rest", "warmup", "progression", "frequency", "note"];

export const RX_ROW_LABEL: Record<RxRowKey, Bi> = {
  order: { en: "Order", is: "Röð" },
  load: { en: "Load", is: "Þyngd" },
  effort: { en: "How hard", is: "Hversu erfitt" },
  tempo: { en: "Speed of each rep", is: "Hraði hverrar endurtekningar" },
  rest: { en: "Rest between sets", is: "Hvíld milli setta" },
  warmup: { en: "Warm-up", is: "Upphitun" },
  progression: { en: "When to add weight", is: "Hvenær á að þyngja" },
  frequency: { en: "How often", is: "Hversu oft" },
  note: { en: "Note", is: "Athugið" },
};

export const RX_BAR_LABEL: Record<RxBarKey, Bi> = {
  target: { en: "Target speed", is: "Markhraði" },
  stop: { en: "Stop the set", is: "Hætta setti" },
  adjust: { en: "Change the weight", is: "Breyta þyngd" },
  feedback: { en: "Feedback", is: "Endurgjöf" },
  coach: { en: "Your coach's rule", is: "Regla þjálfarans" },
  none: { en: "Not used", is: "Ekki notaður" },
};

export const RX_BAR_TITLE: Bi = { en: "With a bar-speed device", is: "Með stangarhraðamæli" };
export const RX_SETS_LABEL: Bi = { en: "Sets × reps", is: "Sett × endurtekningar" };
export const RX_DETAILS_TOGGLE: Bi = { en: "All the details", is: "Öll smáatriði" };

export const RX_SOURCE_LABEL: Record<RxSource, Bi> = {
  plan_study: { en: "From the studies behind this method", is: "Úr rannsóknunum á bak við aðferðina" },
  other_study: { en: "From another study", is: "Úr annarri rannsókn" },
  micropulse: { en: "MicroPulse guide, not tested", is: "Viðmið MicroPulse, ekki prófað" },
  session: { en: "Set in this session", is: "Sett í þessari æfingu" },
};

/** Lines a player sees on Today (plain, no sources): the rest stay with the coach. */
export const RX_PLAYER_ROWS: RxRowKey[] = ["load", "effort", "tempo", "rest"];

// ─── Sources ─────────────────────────────────────────────────────────────────────────────────────────────────────

const NEW_REFS: Record<string, GoalRef> = {
  vanderka2020: {
    key: "vanderka2020",
    short: "Vanderka 2020",
    cite: "Vanderka M, Bezák A, Longová K, Krčmár M, Walker S. Use of visual feedback during jump-squat training aids improvement in sport-specific tests in athletes. J Strength Cond Res 2020;34(8):2250–2257. doi:10.1519/JSC.0000000000002634",
    verifiedFrom: "full_text",
  },
  weakley2021: {
    key: "weakley2021",
    short: "Weakley 2021",
    cite: "Weakley J, Mann B, Banyard H, McLaren S, Scott T, Garcia-Ramos A. Velocity-based training: from theory to application. Strength Cond J 2021;43(2):31–49.",
    verifiedFrom: "full_text",
  },
  thompson2021: {
    key: "thompson2021",
    short: "Thompson 2021",
    cite: "Thompson SW, Rogerson D, Ruddock A, Banyard HG, Barnes A. Pooled versus individualized load–velocity profiling in the free-weight back squat and power clean. Int J Sports Physiol Perform 2021. doi:10.1123/ijspp.2020-0534",
    verifiedFrom: "full_text",
  },
  cuthbert2021: {
    key: "cuthbert2021",
    short: "Cuthbert 2021",
    cite: "Cuthbert M, Haff GG, Arent SM, Ripley N, McMahon JJ, Evans M, Comfort P. Effects of variations in resistance training frequency on strength development in well-trained populations and implications for in-season athlete training: a systematic review and meta-analysis. Sports Med 2021;51:1967–1982.",
    verifiedFrom: "full_text",
  },
  zourdos2016: {
    key: "zourdos2016",
    short: "Zourdos 2016",
    cite: "Zourdos MC, Klemp A, Dolan C, Quiles JM, Schau KA, Jo E, Helms E, Esgro B, Duncan S, Garcia Merino S, Blanco R. Novel resistance training-specific rating of perceived exertion scale measuring repetitions in reserve. J Strength Cond Res 2016;30(1):267–275.",
    verifiedFrom: "full_text",
  },
  cormie2007: {
    key: "cormie2007",
    short: "Cormie 2007",
    cite: "Cormie P, McCaulley GO, Triplett NT, McBride JM. Optimal loading for maximal power output during lower-body resistance exercises. Med Sci Sports Exerc 2007;39(2):340–349.",
    verifiedFrom: "full_text",
  },
};

/** Every source an `rx` line may cite. */
export const RX_REFS: Record<string, GoalRef> = {
  ...NEW_REFS,
  seitz2014: ACCEL_REFS.seitz2014,
  hernandezbelmonte2022: ACCEL_REFS.hernandezbelmonte2022,
  jukic2022: ACCEL_REFS.jukic2022,
  randell2011: ACCEL_REFS.randell2011,
  suchomel2017: ACCEL_REFS.suchomel2017,
  thapa2021: JUMP_REFS.thapa2021,
  parejablanco2017: JUMP_REFS.parejablanco2017,
  gonzalezbadillo2015: JUMP_REFS.gonzalezbadillo2015,
  chen2025: BRAKING_REFS.chen2025,
  ishoi2018: SPEED_REFS.ishoi2018,
  cormie2010a: GYM_REFS.cormie2010a,
};

// ─── Building blocks ─────────────────────────────────────────────────────────────────────────────────────────────

/** A line taken from a study (resolved to plan_study / other_study later). */
const S = (en: string, is: string, ...refs: string[]): RxLine => ({ text: { en, is }, source: "other_study", refs });
/** MicroPulse's own guide. */
const M = (en: string, is: string): RxLine => ({ text: { en, is }, source: "micropulse" });

const DOWN_UP = S(
  "Down under control, then up as fast as possible, every rep, even when the bar moves slowly.",
  "Stjórnað niður, síðan eins hratt upp og hægt er, í hverri endurtekningu, líka þegar stöngin fer hægt.",
  "parejablanco2017",
);

const ADJUST = S(
  `If the first rep is more than ${VBT_TOLERANCE_MS.toFixed(2)} m/s faster than the target, add ${VBT_LOAD_STEP_PCT[0]}–${VBT_LOAD_STEP_PCT[1]}% of max; if slower, take ${VBT_LOAD_STEP_PCT[0]}–${VBT_LOAD_STEP_PCT[1]}% off.`,
  `Ef fyrsta endurtekning er meira en ${VBT_TOLERANCE_MS.toFixed(2).replace(".", ",")} m/s hraðari en markið, bættu við ${VBT_LOAD_STEP_PCT[0]}–${VBT_LOAD_STEP_PCT[1]}% af hámarki; ef hún er hægari, taktu ${VBT_LOAD_STEP_PCT[0]}–${VBT_LOAD_STEP_PCT[1]}% af.`,
  "weakley2021",
);

const OWN_TARGET = S(
  "The player's own speed: note the speed of the first good rep at this weight and use it as the target next time. A group table is not accurate enough for free-weight squats (players differ by more than 10% at heavy weights).",
  "Hraði leikmannsins sjálfs: skráðu hraða fyrstu góðu endurtekningar við þessa þyngd og notaðu hann sem mark næst. Meðaltalstafla er ekki nógu nákvæm fyrir hnébeygju með lausri stöng (leikmenn munar meira en 10% við þungar þyngdir).",
  "thompson2021",
);

const NOT_USED = (en: string, is: string): { key: RxBarKey; line: RxLine }[] => [{ key: "none", line: M(en, is) }];

/** Bi of a number with a comma in Icelandic. */
const isNum = (s: string) => s.replace(/(\d)\.(\d)/g, "$1,$2");

// ─── Parsing a block ─────────────────────────────────────────────────────────────────────────────────────────────

const SETS_RE = /(\d+(?:–\d+)?)\s*×\s*(\d+(?:–\d+)?)/;

type Segment = { name: string; sets: string; reps: string; rest: string };

/** The parts of a dose that name sets × reps, with the words before (the exercise) and after (the qualifiers). */
function segments(dose: string): Segment[] {
  return dose
    .split(" · ")
    .map((part) => {
      const m = SETS_RE.exec(part);
      if (!m) return null;
      return { name: part.slice(0, m.index).trim(), sets: m[1], reps: m[2], rest: part.slice(m.index + m[0].length).trim() };
    })
    .filter((x): x is Segment => x != null);
}

type BlockIn = { method: string; what: Bi; dose: Bi };

function stripWhat(w: Bi): Bi {
  return {
    en: w.en.replace(/^In the team gym session: /, "").replace(/^Gym: /, "").replace(/, after the running$/, ""),
    is: w.is.replace(/^Á styrktaræfingu liðsins: /, "").replace(/^Salur: /, "").replace(/, á eftir hlaupunum$/, ""),
  };
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function profileOf(b: BlockIn, segEn: Segment, index: number, ctx: RxContext): LiftProfile | null {
  const swap = swapMark(b);
  switch (b.method) {
    case "nordic":
      return "nordic";
    case "eccentric_strength":
      return "eccentric";
    case "jump_squat":
      return swap?.option === "jump_shrug" || swap?.option === "hang_high_pull" ? "pull" : "jump_squat";
    case "squat_bar_speed":
      return b.what.en === "Light jump squats" || /jump squats/i.test(b.what.en) ? "jump_squat" : "squat_fast";
    case "heavy_strength": {
      if (/^Squat and lunge/.test(b.what.en)) return "youth";
      if (index > 0 && /^Romanian deadlift/i.test(segEn.name)) return "rdl";
      if (/technique first/.test(b.what.en) || /technique first/.test(segEn.rest) || ctx.youth) return "technique";
      return "heavy";
    }
    default:
      return null;
  }
}

// ─── The profiles ────────────────────────────────────────────────────────────────────────────────────────────────

type Built = Omit<LiftRx, "exercise" | "sets" | "reps" | "profile">;

function heavyRx(seg: Segment, ctx: RxContext, swapOption: string | undefined): Built {
  const light = seg.sets === "2" && seg.reps === "3";
  const pct = /(about )?(\d+–\d+)% of max/.exec(seg.rest)?.[2] ?? null;
  const restMin = /(\d+(?:–\d+)?) min rest/.exec(seg.rest)?.[1] ?? null;
  const adv = ctx.level === "advanced";
  const range = pct ?? (adv ? "80–90" : "75–85");
  const load =
    range === "80–90"
      ? S(`About 80–90% of max: a weight the player could lift 1–2 more times.`, `Um 80–90% af hámarki: þyngd sem leikmaðurinn gæti lyft 1–2 sinnum oftar.`, "thapa2021")
      : S(`About ${range}% of max: a weight the player could lift 1–2 more times (60–85% of max went with the biggest sprint gains across 15 studies).`, `Um ${range}% af hámarki: þyngd sem leikmaðurinn gæti lyft 1–2 sinnum oftar (60–85% af hámarki fylgdu mestu bætingunni í spretti í 15 rannsóknum).`, "seitz2014");
  const legPress = swapOption === "leg_press";
  return {
    rows: {
      // The range is named so the session shows a load on the light week too (2026-11-18: it showed "2 × 3" and no %).
      load: light ? M(`Light week: the same weight as last week (about ${range}% of max), fewer sets.`, `Létt vika: sama þyngd og síðast (um ${range}% af hámarki), færri sett.`) : load,
      effort: S("Never to failure. Stopping sets early (about half the reps possible) gave the same or bigger gains with about half the reps.", "Aldrei í þrot. Að hætta settum snemma (um helmingur mögulegra endurtekninga) gaf sömu eða meiri bætingu með um helmingi færri endurtekningum.", "hernandezbelmonte2022"),
      tempo: DOWN_UP,
      rest: restMin
        ? M(`${restMin} min.`, `${restMin} mín.`)
        : adv
          ? M("3 min.", "3 mín.")
          : M("2–3 min.", "2–3 mín."),
      warmup: M("2–3 lighter sets building up to the working weight.", "2–3 léttari sett upp að vinnuþyngdinni."),
      progression: light
        ? M("No change this week.", "Engin breyting þessa viku.")
        : M("Add 2.5–5 kg next time when every set kept depth and technique and the last rep was not a grind.", "Bættu 2,5–5 kg við næst þegar öll sett héldu dýpt og tækni og síðasta endurtekningin var ekki strögl."),
      note: S("Without a device: split each set into 2s with 30 s rest to keep every rep fast (one session measured, not a training study).", "Án mælis: skiptu hverju setti í tvennur með 30 sek hvíld svo hver endurtekning haldist hröð (mælt á einni æfingu, ekki þjálfunarrannsókn).", "jukic2022"),
    },
    barSpeed: legPress
      ? NOT_USED("No study here used a bar-speed device on the leg press: use the load and how-hard lines.", "Engin rannsókn hér notaði stangarhraðamæli í fótapressu: notaðu línurnar um þyngd og erfiði.")
      : [
          { key: "target", line: OWN_TARGET },
          {
            key: "stop",
            line: S(
              "Stop the set when the bar has slowed by about 10–20% from the fastest rep. In season, nearer 10%, and lower the closer the match.",
              "Hættu settinu þegar stöngin hefur hægt á sér um 10–20% frá hröðustu endurtekningunni. Á tímabili nær 10%, og lægra því nær sem leikurinn er.",
              "weakley2021",
            ),
          },
          { key: "adjust", line: ADJUST },
        ],
  };
}

function techniqueRx(seg: Segment, ctx: RxContext): Built {
  const light = /\blight\b/.test(seg.rest) || (seg.sets === "2" && seg.reps === "3");
  return {
    rows: {
      load: light
        ? M("Light: the same weight as last time or less.", "Létt: sama þyngd og síðast eða minna.")
        : ctx.youth
          ? M("A weight the player could lift 2–3 more times; never above 75% of max (MicroPulse rule for under-18s).", "Þyngd sem leikmaðurinn gæti lyft 2–3 sinnum oftar; aldrei yfir 75% af hámarki (regla MicroPulse fyrir undir 18 ára).")
          : M("A weight the player could lift 2–3 more times (about 65–75% of max, if the max is known).", "Þyngd sem leikmaðurinn gæti lyft 2–3 sinnum oftar (um 65–75% af hámarki, ef það er þekkt)."),
      effort: M("Stop with 2–3 reps left. Technique before weight.", "Hættu með 2–3 endurtekningar eftir. Tækni á undan þyngd."),
      tempo: DOWN_UP,
      rest: M("About 2 min.", "Um 2 mín."),
      warmup: M("1–2 lighter sets.", "1–2 léttari sett."),
      progression: M("Add a little weight when every set looks like the first: same depth, knees in line, back flat.", "Bættu við smá þyngd þegar öll sett líta út eins og það fyrsta: sama dýpt, hné í línu, bak beint."),
    },
    barSpeed: [
      { key: "feedback", line: S("Show the speed after every rep so the player keeps pushing up fast.", "Sýndu hraðann eftir hverja endurtekningu svo leikmaðurinn haldi áfram að ýta hratt upp.", "randell2011") },
      { key: "stop", line: S("Stop the set if the bar slows by more than about 20%.", "Hættu settinu ef stöngin hægir á sér um meira en um 20%.", "weakley2021") },
    ],
  };
}

function rdlRx(): Built {
  return {
    rows: {
      load: M("Moderate: a weight the player could lift 2–3 more times.", "Miðlungs: þyngd sem leikmaðurinn gæti lyft 2–3 sinnum oftar."),
      effort: M("Stop with 2–3 reps left; stop at once if the back rounds.", "Hættu með 2–3 endurtekningar eftir; hættu strax ef bakið bognar."),
      tempo: M("2–3 s down with a flat back, hips pushed back; stand up at normal speed.", "2–3 sek niður með beint bak, mjaðmir aftur; upp á venjulegum hraða."),
      rest: M("90 s–2 min.", "90 sek–2 mín."),
      warmup: M("1 lighter set.", "1 léttara sett."),
      progression: M("Add weight when every rep keeps a flat back and the bar close to the legs.", "Bættu við þyngd þegar hver endurtekning heldur beinu baki og stöngin er nálægt fótunum."),
    },
    barSpeed: NOT_USED("This lift is about control, not speed.", "Þessi lyfta snýst um stjórn, ekki hraða."),
  };
}

function jumpSquatRx(swapOption: string | undefined): Built {
  const dumbbells = swapOption === "dumbbells";
  return {
    rows: {
      load: S(
        "Light: from body weight up to about 30–45% of the squat max. Power was highest at body weight in one study; a trial with athletes used about 45% of a 3-rep max. The jump must stay fast.",
        "Létt: frá eigin þyngd upp í um 30–45% af hámarki í hnébeygju. Aflið var mest við eigin þyngd í einni rannsókn; þjálfunarrannsókn með íþróttamönnum notaði um 45% af 3 endurtekninga hámarki. Hoppið verður að haldast hratt.",
        "cormie2007",
        "vanderka2020",
      ),
      effort: M("Every jump as high as possible; stop the set when the jumps get lower.", "Hvert hopp eins hátt og hægt er; hættu settinu þegar hoppin lækka."),
      tempo: S("Short dip, then jump at once as high as possible; land soft and reset before the next one.", "Stutt beygja, síðan strax upp eins hátt og hægt er; lentu mjúkt og núllstilltu fyrir næsta.", "vanderka2020"),
      rest: S("About 3 min (full rest), as in the tested programme.", "Um 3 mín (full hvíld), eins og í prófuðu áætluninni.", "vanderka2020"),
      warmup: M("1 set of jumps with body weight, then 1 light set.", "1 sett af hoppum með eigin þyngd, síðan 1 létt sett."),
      progression: M("Add a little weight only while the jump height holds.", "Bættu aðeins við þyngd meðan hoppin halda hæð."),
    },
    barSpeed: dumbbells
      ? NOT_USED("Most devices need a bar: with dumbbells, watch the jump height instead.", "Flestir mælar þurfa stöng: með handlóðum, fylgstu frekar með hæð hoppsins.")
      : [
          { key: "feedback", line: S("Show the player the speed after every jump: athletes who saw it improved more.", "Sýndu leikmanninum hraðann eftir hvert hopp: íþróttamenn sem sáu hann bættu sig meira.", "randell2011", "vanderka2020") },
          { key: "target", line: M("No target speed: no study tested one for jump squats.", "Enginn markhraði: engin rannsókn prófaði hann fyrir hnébeygjuhopp.") },
          { key: "stop", line: S("Stop the set when the speed drops about 10% below the best jump.", "Hættu settinu þegar hraðinn fellur um 10% undir besta hoppið.", "weakley2021") },
        ],
  };
}

/** Body-weight jump squats (the gym-only goals, 2026-11-18): Cormie 2010a's programme used them on 2 of its 3 days. */
function bodyJumpSquatRx(): Built {
  return {
    rows: {
      load: S("Body weight only, no added weight: the tested programme used body-weight jump squats on 2 of its 3 days a week.", "Eigin þyngd eingöngu, engin aukaþyngd: prófaða áætlunin notaði hnébeygjuhopp með eigin þyngd 2 af 3 dögum vikunnar.", "cormie2010a"),
      effort: M("Every jump as high as possible; stop the set when the jumps get lower.", "Hvert hopp eins hátt og hægt er; hættu settinu þegar hoppin lækka."),
      tempo: M("Short dip, then jump at once as high as possible; land soft and reset before the next one.", "Stutt beygja, síðan strax upp eins hátt og hægt er; lentu mjúkt og núllstilltu fyrir næsta."),
      rest: S("About 3 min (full rest), as in the tested programme.", "Um 3 mín (full hvíld), eins og í prófuðu áætluninni.", "cormie2010a"),
      warmup: M("A few easy jumps first.", "Nokkur létt hopp fyrst."),
      progression: M("No added weight in this block; the plan adds sets week by week while the jumps keep their height.", "Engin aukaþyngd í þessari blokk; áætlunin bætir við settum viku fyrir viku meðan hoppin halda hæð."),
    },
    barSpeed: NOT_USED("No bar: watch the jump height instead.", "Engin stöng: fylgstu frekar með hæð hoppsins."),
  };
}

function pullRx(): Built {
  return {
    rows: {
      load: S("30–45% of a hang power clean max. Without that max: start with an empty bar and add weight only while every rep stays fast and high.", "30–45% af hámarki í hang power clean. Án þess hámarks: byrjaðu með tóma stöng og bættu aðeins við meðan hver endurtekning helst hröð og há.", "suchomel2017"),
      effort: M("Every rep fast; stop the set when the bar or the jump slows.", "Hver endurtekning hröð; hættu settinu þegar stöngin eða hoppið hægir á sér."),
      tempo: M("Short dip from just above the knees, then explode up; lower the bar under control.", "Stutt beygja rétt fyrir ofan hné, síðan sprengja upp; láttu stöngina síga stjórnað niður."),
      rest: M("About 2 min.", "Um 2 mín."),
      warmup: M("Teach first: mid-thigh pull from blocks, with a stick or an empty bar.", "Kenndu fyrst: tog frá miðju læri af kubbum, með prik eða tóma stöng."),
      progression: M("Add weight only while every rep stays fast and high.", "Bættu aðeins við þyngd meðan hver endurtekning helst hröð og há."),
    },
    barSpeed: [
      { key: "feedback", line: S("Show the speed after every rep.", "Sýndu hraðann eftir hverja endurtekningu.", "weakley2021") },
      { key: "target", line: M("No target speed: none was tested for these pulls.", "Enginn markhraði: enginn var prófaður fyrir þessi tog.") },
      { key: "stop", line: S("Stop the set when the speed drops about 10% below the best rep.", "Hættu settinu þegar hraðinn fellur um 10% undir bestu endurtekninguna.", "weakley2021") },
    ],
  };
}

function nordicRx(): Built {
  return {
    rows: {
      load: S("Body weight; a partner holds the ankles.", "Eigin þyngd; félagi heldur um ökklana.", "ishoi2018"),
      effort: S("Hold the fall for as long as possible on every rep.", "Haltu fallinu eins lengi og hægt er í hverri endurtekningu.", "ishoi2018"),
      tempo: S("Lean forward as slowly as possible with the body straight; catch with the hands and push back up with the arms.", "Hallaðu fram eins hægt og hægt er með beinan líkama; gríptu með höndunum og ýttu þér upp aftur með höndunum.", "ishoi2018"),
      rest: S("Take turns with the partner: one set each, so the rest is the partner's set.", "Skiptist á við félagann: eitt sett hvor, svo hvíldin er sett félagans.", "ishoi2018"),
      warmup: M("1–2 easy reps over a short range.", "1–2 léttar endurtekningar yfir stutt svið."),
      progression: S("Add reps when every rep is slow all the way down. The tested 10-week programme went from 2 × 5 to 3 sets of 12, 10 and 8 over 5 weeks; this plan stays lower.", "Bættu við endurtekningum þegar hver endurtekning er hæg alla leið niður. Prófaða 10 vikna áætlunin fór úr 2 × 5 í 3 sett af 12, 10 og 8 á 5 vikum; þessi áætlun er lægri.", "ishoi2018"),
      note: S("After football, not before, and 48 h between sessions, as in the tested programme.", "Á eftir fótbolta, ekki á undan, og 48 klst milli æfinga, eins og í prófuðu áætluninni.", "ishoi2018"),
    },
    barSpeed: NOT_USED("Body-weight exercise: a bar-speed device is not used.", "Æfing með eigin þyngd: stangarhraðamælir er ekki notaður."),
  };
}

function eccentricRx(): Built {
  return {
    rows: {
      load: M("Body weight or light dumbbells at first.", "Eigin þyngd eða létt handlóð til að byrja með."),
      effort: M("Stop the set when the 3 s down can't be held or the knee drifts in.", "Hættu settinu þegar 3 sek niður haldast ekki eða hnéð leitar inn."),
      tempo: S("3 s down, normal speed up.", "3 sek niður, venjulegur hraði upp.", "chen2025"),
      rest: M("About 90 s.", "Um 90 sek."),
      warmup: M("1 set with body weight.", "1 sett með eigin þyngd."),
      progression: M("Add weight when every rep holds the 3 s and the knee stays in line.", "Bættu við þyngd þegar hver endurtekning heldur 3 sek og hnéð helst í línu."),
    },
    barSpeed: NOT_USED("This exercise is slow on purpose.", "Þessi æfing er hæg viljandi."),
  };
}

/** Bar speed → %1RM in the professional footballers' programme (Smith machine full squat). */
const PAREJA_PCT: [number, string][] = [[1.0, "55–60"], [0.9, "65"], [0.8, "70"]];

function squatFastRx(seg: Segment): Built {
  const ms = /bar about (\d\.\d) m\/s/.exec(seg.rest)?.[1] ?? null;
  const pct = ms ? PAREJA_PCT.find(([v]) => Math.abs(v - Number(ms)) < 0.01)?.[1] ?? null : null;
  return {
    rows: {
      load: ms && pct
        ? S(`About ${pct}% of max (the bar about ${ms} m/s on a Smith machine in the tested programme).`, `Um ${pct}% af hámarki (stöngin um ${isNum(ms)} m/s í Smith-vél í prófuðu áætluninni).`, "parejablanco2017")
        : M("The same weight as last week.", "Sama þyngd og í síðustu viku."),
      effort: S("Far from failure: stop well before the bar slows (about half the reps the player could do).", "Langt frá þroti: hættu vel áður en stöngin hægir á sér (um helmingur þeirra endurtekninga sem leikmaðurinn gæti gert).", "hernandezbelmonte2022"),
      tempo: DOWN_UP,
      rest: S("4 min, as in the tested programme.", "4 mín, eins og í prófuðu áætluninni.", "parejablanco2017"),
      warmup: M("2 lighter sets.", "2 léttari sett."),
      progression: S("Heavier every week or two: the tested programme went from about 50% to 70% of max in 6 weeks, chosen by bar speed.", "Þyngra á viku eða tveggja vikna fresti: prófaða áætlunin fór úr um 50% í 70% af hámarki á 6 vikum, valið eftir stangarhraða.", "parejablanco2017"),
    },
    barSpeed: [
      ms
        ? { key: "target", line: S(`First rep of the first set at about ${ms} m/s (the tested programme kept within 0.03 m/s).`, `Fyrsta endurtekning fyrsta setts á um ${isNum(ms)} m/s (prófaða áætlunin hélt sig innan 0,03 m/s).`, "parejablanco2017") }
        : { key: "target", line: M("The same speed as last week at the same weight.", "Sami hraði og í síðustu viku við sömu þyngd.") },
      { key: "stop", line: S("Stop each set at a 15% speed loss: the jump went up with 15% and not with 30%.", "Hættu hverju setti við 15% hraðatap: stökkið hækkaði með 15% en ekki með 30%.", "parejablanco2017") },
      { key: "adjust", line: ADJUST },
    ],
  };
}

function youthRx(): Built {
  return {
    rows: {
      load: M("About 60% of max; never above 75% (MicroPulse rule for under-18s).", "Um 60% af hámarki; aldrei yfir 75% (regla MicroPulse fyrir undir 18 ára)."),
      effort: S("Far from failure: stop with several reps left. Technique before weight.", "Langt frá þroti: hættu með nokkrar endurtekningar eftir. Tækni á undan þyngd.", "gonzalezbadillo2015"),
      tempo: S("Down under control, up as fast as possible.", "Stjórnað niður, eins hratt upp og hægt er.", "gonzalezbadillo2015"),
      rest: M("About 2 min.", "Um 2 mín."),
      warmup: M("1 set with body weight.", "1 sett með eigin þyngd."),
      progression: M("Add weight only with the coach's OK, when technique holds.", "Bættu aðeins við þyngd með samþykki þjálfara, þegar tæknin heldur."),
    },
    barSpeed: [
      { key: "target", line: S("A weight that moves at about 1.0 m/s or faster (about 56% of max in the youth footballers' study).", "Þyngd sem fer á um 1,0 m/s eða hraðar (um 56% af hámarki í rannsókninni á ungum fótboltamönnum).", "gonzalezbadillo2015") },
      { key: "feedback", line: S("Show the speed after every rep.", "Sýndu hraðann eftir hverja endurtekningu.", "gonzalezbadillo2015") },
    ],
  };
}

// ─── One block → its lifts ───────────────────────────────────────────────────────────────────────────────────────

/** The lifts in one block, or [] for anything that is not a gym lift (sprints, jumps without load, tests). */
export function rxForBlock(b: BlockIn, ctx: RxContext): LiftRx[] {
  const en = segments(b.dose.en);
  if (!en.length) return [];
  const is = segments(b.dose.is);
  const sameShape = is.length === en.length;
  const swapOption = swapMark(b)?.option;
  const whatName = stripWhat(b.what);
  const out: LiftRx[] = [];
  en.forEach((seg, i) => {
    const profile = profileOf(b, seg, i, ctx);
    if (!profile) return;
    const nameEn = seg.name || whatName.en;
    const nameIs = (sameShape ? is[i].name : "") || whatName.is;
    const built =
      profile === "heavy" ? heavyRx(seg, ctx, swapOption)
      : profile === "technique" ? techniqueRx(seg, ctx)
      : profile === "rdl" ? rdlRx()
      : profile === "jump_squat" ? (/^Body-weight jump squats/.test(b.what.en) && !swapOption ? bodyJumpSquatRx() : jumpSquatRx(swapOption))
      : profile === "pull" ? pullRx()
      : profile === "nordic" ? nordicRx()
      : profile === "eccentric" ? eccentricRx()
      : profile === "squat_fast" ? squatFastRx(seg)
      : youthRx();
    out.push({ profile, exercise: { en: cap(nameEn), is: cap(nameIs) }, sets: seg.sets, reps: seg.reps, ...built });
  });
  return out;
}

/** The lift profiles a single session line can be read as (lota 8): no plan, so no level ramp or light week. */
export type SessionLiftProfile = "heavy" | "rdl" | "jump_squat" | "pull" | "nordic";

/**
 * MicroPulse's full lines for one lift outside a plan (lota 8, Today's session): the same profiles as the plans, read at
 * the intermediate level and never as a light week. The caller keeps only the lines the session itself leaves open.
 */
export function rxForProfile(profile: SessionLiftProfile): Pick<LiftRx, "rows" | "barSpeed"> {
  const seg: Segment = { name: "", sets: "", reps: "", rest: "" };
  const ctx: RxContext = { quality: "acceleration", level: "intermediate", youth: false };
  return profile === "heavy" ? heavyRx(seg, ctx, undefined)
    : profile === "rdl" ? rdlRx()
    : profile === "jump_squat" ? jumpSquatRx(undefined)
    : profile === "pull" ? pullRx()
    : nordicRx();
}

// ─── Order, frequency and sources across a plan ──────────────────────────────────────────────────────────────────

const POWER: LiftProfile[] = ["jump_squat", "pull", "squat_fast"];

const FREQ_EVIDENCE: Partial<Record<LiftProfile, RxLine>> = {
  heavy: S("Spreading the same weekly sets over more days did no better than fewer days; in season, 1 session a week kept strength for 12 weeks.", "Að dreifa sömu settum vikunnar á fleiri daga gerði ekki betur en færri dagar; á tímabili hélt 1 æfing á viku styrknum í 12 vikur.", "cuthbert2021"),
  squat_fast: S("The tested programme: 3× a week for 6 weeks.", "Prófaða áætlunin: 3× í viku í 6 vikur.", "parejablanco2017"),
  jump_squat: S("The tested programme: 3× a week for 6 weeks.", "Prófaða áætlunin: 3× í viku í 6 vikur.", "vanderka2020"),
  nordic: S("The tested programme built up from 1 to 3 sessions a week.", "Prófaða áætlunin byggðist upp úr 1 í 3 æfingar á viku.", "ishoi2018"),
};

function methodRefs(quality: GoalQuality, method: string): Set<string> {
  if (quality === "top_speed") {
    const m = SPEED_METHODS.find((x) => x.key === method);
    return new Set((m?.findings ?? []).map((f) => f.ref as string));
  }
  const methods = isGymQuality(quality) ? GYM_METHODS : QUALITY_LIBRARIES[quality].methods;
  const m = methods.find((x) => x.key === method);
  return new Set((m?.findings ?? []).map((f) => f.ref));
}

function resolve(line: RxLine, refs: Set<string>): RxLine {
  if (line.source === "micropulse") return line;
  return { ...line, source: (line.refs ?? []).some((r) => refs.has(r)) ? "plan_study" : "other_study" };
}

type PlanIn<B> = { weeks: { sessions: { blocks: B[] }[] }[] };

/** The method whose card a lift's study lines are checked against (a pull swap uses the pulls card). */
function cardMethod(b: BlockIn, rx: LiftRx): string {
  if (rx.profile === "pull") return "pulling_derivatives";
  return b.method;
}

/**
 * The same plan with `rx` on every gym block: order in the session, how often in the week, and each study line
 * marked as from the method's own studies or another study. `what`, `dose` and every counter stay as they are.
 */
export function withRx<B extends BlockIn, P extends PlanIn<B>>(plan: P, ctx: RxContext): P {
  return {
    ...plan,
    weeks: plan.weeks.map((w) => {
      const perSession = w.sessions.map((s) => s.blocks.map((b) => rxForBlock(b, ctx)));
      const freq = new Map<LiftProfile, number>();
      for (const lifts of perSession) for (const p of new Set(lifts.flat().map((r) => r.profile))) freq.set(p, (freq.get(p) ?? 0) + 1);
      return {
        ...w,
        sessions: w.sessions.map((s, si) => {
          const flat = perSession[si].flat();
          let k = 0;
          return {
            ...s,
            blocks: s.blocks.map((b, bi) => {
              const lifts = perSession[si][bi];
              if (!lifts.length) return b;
              const rx = lifts.map((r) => {
                const idx = k++;
                const prev = idx > 0 ? flat[idx - 1] : null;
                const powerBefore = !POWER.includes(r.profile) && flat.slice(0, idx).some((x) => POWER.includes(x.profile));
                const order: RxLine = M(
                  `${idx + 1} of ${flat.length} in the gym${prev ? `, after: ${prev.exercise.en}` : ", first"}${powerBefore ? " (power first, strength after)" : ""}.`,
                  `${idx + 1}. af ${flat.length} í salnum${prev ? `, á eftir: ${prev.exercise.is}` : ", fyrst"}${powerBefore ? " (kraftur fyrst, styrkur á eftir)" : ""}.`,
                );
                const n = freq.get(r.profile) ?? 1;
                const ev = FREQ_EVIDENCE[r.profile];
                const frequency: RxLine = ev
                  ? { ...ev, text: { en: `${n}× a week in this plan. ${ev.text.en}`, is: `${n}× í viku í þessari áætlun. ${ev.text.is}` } }
                  : M(`${n}× a week in this plan.`, `${n}× í viku í þessari áætlun.`);
                const refs = methodRefs(ctx.quality, cardMethod(b, r));
                const rows = Object.fromEntries(
                  Object.entries({ ...r.rows, order, frequency }).map(([key, line]) => [key, resolve(line as RxLine, refs)]),
                ) as LiftRx["rows"];
                return { ...r, rows, barSpeed: r.barSpeed.map((x) => ({ ...x, line: resolve(x.line, refs) })) };
              });
              return { ...b, rx };
            }),
          };
        }),
      };
    }),
  } as P;
}

/** The context a stored goal plan's lifts are read with (its quality, level and the under-18 rules). */
export function rxContextOf(plan: Pick<GoalPlan, "quality" | "level" | "youthLevel">): RxContext {
  return { quality: plan.quality, level: plan.level ?? "intermediate", youth: plan.youthLevel === true };
}

/**
 * A goal plan with `rx` on its gym blocks. Derived on read from the frozen blocks (exercise, sets × reps, the dose
 * line), never stored: storing it would triple the plan that Today reads every morning.
 */
export function goalPlanWithRx<P extends GoalPlan>(plan: P): P {
  return plan.status === "ok" ? withRx(plan, rxContextOf(plan)) : plan;
}

/** Every distinct lift in a plan (same exercise and same lines), for the PDF's "every variable" section. */
export function distinctLifts(plan: PlanIn<{ rx?: LiftRx[] }>): LiftRx[] {
  const seen = new Map<string, LiftRx>();
  for (const w of plan.weeks) for (const s of w.sessions) for (const b of s.blocks) for (const r of b.rx ?? []) {
    const rest = Object.entries(r.rows).filter(([k]) => k !== "order" && k !== "frequency");
    const key = JSON.stringify([r.exercise.en, rest, r.barSpeed]);
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}

/** The sources a set of lifts cites, in first-use order. */
export function rxRefsUsed(lifts: LiftRx[]): GoalRef[] {
  const keys: string[] = [];
  const add = (l: RxLine) => (l.refs ?? []).forEach((k) => keys.includes(k) || keys.push(k));
  for (const r of lifts) {
    Object.values(r.rows).forEach((l) => l && add(l));
    r.barSpeed.forEach((x) => add(x.line));
  }
  return keys.map((k) => RX_REFS[k]).filter((r): r is GoalRef => r != null);
}

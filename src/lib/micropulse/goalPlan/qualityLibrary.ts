/**
 * Programme Library "Speed & power" tab, lota 1: the method libraries for acceleration, braking and jump height,
 * next to the existing top-speed library (`@/lib/micropulse/speedMethods`). Pure and client-safe. Coach-only
 * reference: nothing here is sent to a player.
 *
 * The methods ARE the goal plans' own methods (ACCEL_METHODS / BRAKING_METHODS / JUMP_METHODS) and the references
 * are the same maps, so the library and the player's 8-week plan can never disagree about a dose or a source.
 * This module only adds the coach's layered read on top: a verdict, 2–3 plain facts with their source, how the
 * methods are grouped, and what the research does not show.
 *
 * Wording rules (tested): no "prevents / predicts / causes injury"; a sled is never better than sprints.
 */

import { ACCEL_METHODS, ACCEL_REFS } from "./acceleration";
import { BRAKING_METHODS, BRAKING_REFS } from "./braking";
import { JUMP_METHODS, JUMP_REFS } from "./jump";
import type { Bi, GoalMethod, GoalRef } from "./types";

/** The three pitch goals with their own library page (top speed has `speedMethods`; the gym-only goals use the
 *  heavy-strength / jump-squat / pull cards in `gymGoals.ts`). */
export type LibraryQuality = "acceleration" | "braking" | "jump";

export const LIBRARY_QUALITIES: LibraryQuality[] = ["acceleration", "braking", "jump"];

export type LibraryFact = { text: Bi; refs: string[] };

export type QualityLibrary = {
  quality: LibraryQuality;
  title: Bi;
  /** One sentence: what works. Shown first and boldest. */
  verdict: Bi;
  /** 2–3 plain facts, each with its source. Shown without a click. */
  facts: LibraryFact[];
  methods: GoalMethod[];
  refs: Record<string, GoalRef>;
  /** What the research does not show. */
  caveats: Bi[];
};

export type MethodBasis = GoalMethod["basis"];

export const BASIS_ORDER: MethodBasis[] = ["trial", "review", "rule"];

/** Chip on each method card. */
export const BASIS_LABEL: Record<MethodBasis, Bi> = {
  trial: { en: "Tested", is: "Prófað" },
  review: { en: "From a review", is: "Úr yfirliti" },
  rule: { en: "MicroPulse rule", is: "Regla MicroPulse" },
};

/** Heading over each group of method cards. */
export const BASIS_INTRO: Record<MethodBasis, Bi> = {
  trial: { en: "Tested in training studies: start here", is: "Prófað í þjálfunarrannsóknum: byrjaðu hér" },
  review: { en: "Recommended by reviews, not tested as written", is: "Mælt með í yfirlitsgreinum, ekki prófað eins og hér er sett fram" },
  rule: { en: "MicroPulse's own rule", is: "Regla MicroPulse" },
};

export const LIBRARY_SOURCE_NOTE: Bi = {
  en: "These are the same methods and doses the players' 8-week goal plans use. Fixed text from the cited studies, not AI. Each finding says whether MicroPulse read the full paper or only its abstract.",
  is: "Þetta eru sömu aðferðir og skammtar og 8 vikna markmiðsáætlanir leikmanna nota. Fastur texti úr rannsóknunum sem vísað er í, ekki gervigreind. Hver niðurstaða segir hvort MicroPulse las greinina alla eða aðeins útdráttinn.",
};

export const QUALITY_LIBRARIES: Record<LibraryQuality, QualityLibrary> = {
  acceleration: {
    quality: "acceleration",
    title: { en: "Acceleration: what works", is: "Hröðun: hvað virkar" },
    verdict: {
      en: "Short sprints from a standing start and heavy leg strength make the first steps faster; a sled is an option, not an upgrade.",
      is: "Stuttir sprettir frá kyrrstöðu og þungur fótastyrkur gera fyrstu skrefin hraðari; sleði er valkostur, ekki betri leið.",
    },
    facts: [
      {
        text: { en: "Sprint training in footballers made 5 m 3.4% faster and 20 m 2.6% faster.", is: "Sprettþjálfun hjá fótboltamönnum gerði 5 m 3,4% hraðari og 20 m 2,6% hraðari." },
        refs: ["mendiguchia2020"],
      },
      {
        text: { en: "More strength gain went with more sprint gain, and two gym sessions a week did as well as more.", is: "Meiri styrktarbæting fór saman við meiri sprettbætingu, og tvær styrktaræfingar á viku dugðu eins vel og fleiri." },
        refs: ["seitz2014"],
      },
      {
        text: { en: "Sled sprints were no better than the same sprints without a sled.", is: "Sleðasprettir voru ekki betri en sömu sprettir án sleða." },
        refs: ["alcaraz2018", "petrakos2016"],
      },
    ],
    methods: ACCEL_METHODS,
    refs: ACCEL_REFS,
    caveats: [
      { en: "Sled sprints are not shown to beat the same sprints without a sled; none of the reviews sets an age limit for sleds.", is: "Sleðasprettir eru ekki sýndir betri en sömu sprettir án sleða; ekkert yfirlitanna setur aldursmörk fyrir sleða." },
      { en: "Expect smaller gains in season than in pre-season.", is: "Búast má við minni bætingu á keppnistímabili en á undirbúningstímabili." },
      { en: "The strength-to-sprint link is from group results, and a 2022 re-analysis found Seitz 2014's effect sizes inflated.", is: "Tengsl styrks og spretta byggja á hópniðurstöðum, og endurgreining 2022 fann áhrifastærðir Seitz 2014 ofmetnar." },
      { en: "Youth evidence is low certainty, and few trials reported injuries or safety.", is: "Vissa um unglinga er lítil og fáar rannsóknir sögðu frá meiðslum eða öryggi." },
    ],
  },
  braking: {
    quality: "braking",
    title: { en: "Braking: what works", is: "Bremsun: hvað virkar" },
    verdict: {
      en: "Teach the stop: short braking and cutting drills twice a week in place of the warm-up made cuts faster in 6 weeks. That braking itself improves in adults is not yet shown.",
      is: "Kenndu stoppið: stuttar bremsu- og stefnubreytingaræfingar tvisvar í viku í stað upphitunar gerðu stefnubreytingar hraðari á 6 vikum. Að bremsunin sjálf batni hjá fullorðnum er ekki enn sýnt.",
    },
    facts: [
      {
        text: { en: "Youth footballers, 6 weeks: the 70° cut got 9–12% faster and cutting technique better; the control group's did not change.", is: "Unglingar í fótbolta, 6 vikur: 70° stefnubreyting varð 9–12% hraðari og tæknin betri; samanburðarhópurinn breyttist ekki." },
        refs: ["dossantos2019"],
      },
      {
        text: { en: "Thigh strength while lowering is the clearest link with good braking. A link, not proof.", is: "Styrkur framan á læri á niðurleið tengist góðri bremsun skýrast. Tengsl, ekki sönnun." },
        refs: ["harper2022"],
      },
      {
        text: { en: "In adults, 12 trials showed no gain in braking itself, but none of them trained braking on purpose.", is: "Hjá fullorðnum sýndu 12 rannsóknir enga bætingu á bremsuninni sjálfri, en engin þeirra æfði bremsun sérstaklega." },
        refs: ["marvin2024"],
      },
    ],
    methods: BRAKING_METHODS,
    refs: BRAKING_REFS,
    caveats: [
      { en: "The tested drills improved pre-planned cutting tests; the weeks reacting to a partner were not measured on their own.", is: "Prófuðu æfingarnar bættu fyrirfram ákveðin stefnubreytingarpróf; vikurnar með viðbrögðum við félaga voru ekki mældar sérstaklega." },
      { en: "Slow-lowering strength helped sharp turns (90° or more) in adolescents, not shallow cuts, and rests on few studies.", is: "Styrkur með hægri niðurleið hjálpaði í kröppum snúningum (90° eða meira) hjá unglingum, ekki í grunnum beygjum, og byggir á fáum rannsóknum." },
      { en: "No trial measured injuries. Braking training may help protect against injury, but that is not proven.", is: "Engin rannsókn mældi meiðsli. Bremsuþjálfun gæti verndað gegn meiðslum, en það er ekki sannað." },
      { en: "GPS counts how often a player brakes hard, not how well.", is: "GPS telur hve oft leikmaður bremsar hart, ekki hve vel." },
    ],
  },
  jump: {
    quality: "jump",
    title: { en: "Jump height: what works", is: "Stökkhæð: hvað virkar" },
    verdict: {
      en: "Jump training reliably raises jump height; weights on top add a little at most, and players short of strength gain most from lifting heavy first.",
      is: "Hoppþjálfun hækkar stökkið áreiðanlega; lyftingar ofan á bæta lítið við í mesta lagi, og leikmenn sem vantar styrk græða mest á því að lyfta þungt fyrst.",
    },
    facts: [
      {
        text: { en: "Across 56 studies, jumps raised jump height by about 4 cm; longer blocks, more sessions and more jumps a session went with bigger gains.", is: "Í 56 rannsóknum hækkuðu hopp stökkið um u.þ.b. 4 cm; lengri blokkir, fleiri æfingar og fleiri hopp á æfingu fóru saman við meiri bætingu." },
        refs: ["saezdevillarreal2009", "markovic2007"],
      },
      {
        text: { en: "Weights on top of jumps added nothing on average in one review, and 2.9 cm when a lift and a similar jump were paired in the same session in another.", is: "Lyftingar ofan á hopp bættu engu við að meðaltali í einu yfirliti, og 2,9 cm þegar lyfta og svipað hopp voru pöruð á sömu æfingu í öðru." },
        refs: ["saezdevillarreal2009", "ma2025"],
      },
      {
        text: { en: "Players short of force who trained mostly heavy all jumped higher (+14.2% in 9 weeks).", is: "Leikmenn sem vantaði kraft og æfðu mest þungt stukku allir hærra (+14,2% á 9 vikum)." },
        refs: ["jimenezreyes2017"],
      },
    ],
    methods: JUMP_METHODS,
    refs: JUMP_REFS,
    caveats: [
      { en: "The adult weekly doses come mostly from one 6-week trial in women's basketball (Sánchez-Sixto 2021). Reviews found bigger gains with longer blocks and more sessions (Sáez de Villarreal 2009, Thapa 2021).", is: "Vikuskammtar fullorðinna koma að mestu úr einni 6 vikna rannsókn í kvennakörfubolta (Sánchez-Sixto 2021). Yfirlit fundu meiri bætingu með lengri blokkum og fleiri æfingum (Sáez de Villarreal 2009, Thapa 2021)." },
      { en: "Most jump studies are small and of low quality, and the reviews disagree on whether weights add to jumps.", is: "Flestar stökkrannsóknir eru litlar og af litlum gæðum, og yfirlitin eru ósammála um hvort lyftingar bæti við hoppin." },
      { en: "Youth evidence is mostly from boys, and its certainty is low.", is: "Gögn um unglinga eru mest frá strákum og vissan er lítil." },
      { en: "No study tested choosing the start from the strength and jump tests: that choice is MicroPulse's rule.", is: "Engin rannsókn prófaði að velja upphafið út frá styrk- og stökkprófum: það val er regla MicroPulse." },
    ],
  },
};

/** Methods of one basis, in the library's own order (most direct first). */
export function methodsByBasis(lib: QualityLibrary, basis: MethodBasis): GoalMethod[] {
  return lib.methods.filter((m) => m.basis === basis);
}

/** "Mendiguchia 2020; Seitz 2014". Unknown keys are dropped (a test checks there are none). */
export function libraryRefShort(lib: QualityLibrary, keys: string[]): string {
  return keys.map((k) => lib.refs[k]?.short).filter((s): s is string => !!s).join("; ");
}

/** Every reference key a library uses: facts and method findings. */
export function libraryRefKeys(lib: QualityLibrary): string[] {
  return [...new Set([...lib.facts.flatMap((f) => f.refs), ...lib.methods.flatMap((m) => m.findings.map((f) => f.ref))])];
}

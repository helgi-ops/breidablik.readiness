/**
 * Goal plan, lota 7b: for the player, why each quality matters in a game and what improves it. Pure and
 * client-safe. Fixed text, not AI.
 *
 * Every line rests on a study the goal plans already cite (the same reference maps, so a short name can't drift
 * from its full citation): the "what improves it" lines are the plans' own findings in plainer words. Injury lines
 * say "associated with" / "may help, not proven", never prevents / predicts / causes. Where the research is thin
 * the quality says so (`limit`).
 */

import { SPEED_REFS } from "@/lib/micropulse/speedMethods";
import { ACCEL_REFS } from "./acceleration";
import { BRAKING_REFS } from "./braking";
import { JUMP_REFS } from "./jump";
import type { Bi, GoalQuality, GoalRef } from "./types";

export type WhyLine = { text: Bi; refs: string[] };

export type QualityWhy = {
  /** One plain line: what this quality does in a game. Shown without a click. */
  matters: WhyLine;
  /** What improves it, 3–4 lines, behind "What improves …?". */
  improves: WhyLine[];
  /** What the research does not show, when it matters for the player. */
  limit: WhyLine | null;
};

const ALL_REFS: Record<string, GoalRef> = { ...SPEED_REFS, ...ACCEL_REFS, ...BRAKING_REFS, ...JUMP_REFS };

export const QUALITY_WHY: Record<GoalQuality, QualityWhy> = {
  top_speed: {
    matters: {
      text: {
        en: "Top speed decides the long runs: getting in behind, chasing back, winning a race to the ball. Running near your own top speed regularly in training is associated with fewer hamstring injuries.",
        is: "Hámarkshraði ræður úrslitum í löngu hlaupunum: að komast inn fyrir, elta til baka, vinna kapphlaup um boltann. Að hlaupa reglulega nálægt eigin hámarkshraða á æfingum tengist færri aftanlærismeiðslum.",
      },
      refs: ["malone2017", "buchheit2023"],
    },
    improves: [
      {
        text: {
          en: "Sprinting truly flat out: short flying sprints (10–30 m) at over 98% effort, with long rest between them.",
          is: "Að spretta virkilega á fullu: stuttir fljúgandi sprettir (10–30 m) á yfir 98% átaki, með langri hvíld á milli.",
        },
        refs: ["haugen2019"],
      },
      {
        text: {
          en: "Extra sprints on top of team training: footballers who got them improved their top speed far more than those who only trained with the team.",
          is: "Aukasprettir ofan á liðsæfingar: fótboltamenn sem fengu þá bættu hámarkshraðann mun meira en þeir sem æfðu bara með liðinu.",
        },
        refs: ["nicholson2022"],
      },
      {
        text: {
          en: "Pushing harder into the ground: faster runners push harder, they don't move their legs faster. That is why the plan adds strength.",
          is: "Að ýta fastar í jörðina: hraðari hlauparar ýta fastar, fæturnir hreyfast ekki hraðar. Þess vegna bætir áætlunin við styrk.",
        },
        refs: ["weyand2000"],
      },
      {
        text: {
          en: "More than once a week: one session a week for 7 weeks made no one faster.",
          is: "Oftar en einu sinni í viku: ein æfing á viku í 7 vikur gerði engan hraðari.",
        },
        refs: ["haugen2015"],
      },
    ],
    limit: null,
  },
  acceleration: {
    matters: {
      text: {
        en: "Acceleration is your first steps: reaching the ball or the space before your opponent. Football sessions are full of hard starts and stops.",
        is: "Hröðun eru fyrstu skrefin: að ná boltanum eða svæðinu á undan mótherjanum. Fótboltaæfingar eru fullar af snörpum byrjunum og stoppum.",
      },
      refs: ["silva2022"],
    },
    improves: [
      {
        text: {
          en: "Short sprints from a standing start: in footballers, 5 m got 3.4% faster and 20 m 2.6% faster.",
          is: "Stuttir sprettir frá kyrrstöðu: hjá fótboltamönnum varð 5 m 3,4% hraðari og 20 m 2,6% hraðari.",
        },
        refs: ["mendiguchia2020"],
      },
      {
        text: {
          en: "Stronger legs: more strength gain went with more sprint gain, and two sessions a week did as well as more.",
          is: "Sterkari fætur: meiri styrktarbæting fór saman við meiri sprettbætingu, og tvær æfingar á viku dugðu eins vel og fleiri.",
        },
        refs: ["seitz2014"],
      },
      {
        text: {
          en: "No sled needed: sled sprints were no better than the same sprints without one.",
          is: "Sleði er óþarfur: sleðasprettir voru ekki betri en sömu sprettir án sleða.",
        },
        refs: ["alcaraz2018"],
      },
      {
        text: {
          en: "For young players, hops plus short sprints came out on top.",
          is: "Hjá ungum leikmönnum komu hopp ásamt stuttum sprettum best út.",
        },
        refs: ["wangk2026"],
      },
    ],
    limit: null,
  },
  braking: {
    matters: {
      text: {
        en: "Every stop, turn and press starts with braking, and it happens many times in every session. It is the hardest action on the muscles; training it may help protect against injury, but that is not proven.",
        is: "Hvert stopp, snúningur og pressa byrjar á bremsun, og hún gerist oft á hverri æfingu. Hún er erfiðasta hreyfingin fyrir vöðvana; þjálfun hennar gæti verndað gegn meiðslum, en það er ekki sannað.",
      },
      refs: ["silva2022", "mcburnie2022"],
    },
    improves: [
      {
        text: {
          en: "Technique: learning to lower your body, lean and plant your foot made cuts 9–12% faster in 6 weeks (young footballers).",
          is: "Tækni: að læra að lækka sig, halla og setja fótinn rétt niður gerði stefnubreytingar 9–12% hraðari á 6 vikum (unglingar í fótbolta).",
        },
        refs: ["dossantos2019"],
      },
      {
        text: {
          en: "Strong thighs on the way down: the clearest link with good braking. A link, not proof.",
          is: "Sterk læri á niðurleið: skýrustu tengslin við góða bremsun. Tengsl, ekki sönnun.",
        },
        refs: ["harper2022"],
      },
      {
        text: {
          en: "Jumps and hops improved change-of-direction tests; a mix of jump types worked best.",
          is: "Hopp bættu stefnubreytingarpróf; blanda af hopptegundum virkaði best.",
        },
        refs: ["asadi2016"],
      },
    ],
    limit: {
      text: {
        en: "What the research does not show yet: in adults, trials have not shown braking itself getting better, but none of them trained braking on purpose.",
        is: "Það sem rannsóknir sýna ekki enn: hjá fullorðnum hafa rannsóknir ekki sýnt að bremsunin sjálf batni, en engin þeirra æfði bremsun sérstaklega.",
      },
      refs: ["marvin2024"],
    },
  },
  jump: {
    matters: {
      text: {
        en: "Jump height shows how much force your legs make quickly: headers, rebounds, getting off the ground first. In elite footballers, stronger legs went with both higher jumps and faster sprints.",
        is: "Stökkhæð sýnir hve mikinn kraft fæturnir mynda hratt: skallaeinvígi, fráköst, að komast fyrstur upp. Hjá afreksfótboltamönnum fóru sterkari fætur saman við bæði hærra stökk og hraðari spretti.",
      },
      refs: ["wisloff2004"],
    },
    improves: [
      {
        text: {
          en: "Jumps and hops raised jump height in most trials with young footballers.",
          is: "Hopp hækkuðu stökkið í flestum rannsóknum á unglingum í fótbolta.",
        },
        refs: ["bedoya2015"],
      },
      {
        text: {
          en: "Jumps plus heavy squats beat jumps alone: +12.2% against +7.2% in 6 weeks.",
          is: "Hopp ásamt þungri hnébeygju gáfu meira en hopp ein: +12,2% á móti +7,2% á 6 vikum.",
        },
        refs: ["sanchezsixto2021"],
      },
      {
        text: {
          en: "Training what you lack: players short of force who lifted mostly heavy all jumped higher.",
          is: "Að æfa það sem vantar: leikmenn sem vantaði kraft og lyftu mest þungt stukku allir hærra.",
        },
        refs: ["jimenezreyes2017"],
      },
      {
        text: {
          en: "Build up slowly: more jumps or higher jumps, never both at once.",
          is: "Byggðu upp hægt: fleiri hopp eða hærri, aldrei hvoru tveggja í einu.",
        },
        refs: ["bedoya2015"],
      },
    ],
    limit: null,
  },
};

/** "Why top speed matters" / "Af hverju skiptir hámarkshraði máli?" and "What improves it?". */
const NOM_IS: Record<GoalQuality, string> = { top_speed: "hámarkshraði", acceleration: "hröðun", braking: "bremsun", jump: "stökkhæð" };
const ACC_IS: Record<GoalQuality, string> = { top_speed: "hámarkshraða", acceleration: "hröðun", braking: "bremsun", jump: "stökkhæð" };
const EN: Record<GoalQuality, string> = { top_speed: "top speed", acceleration: "acceleration", braking: "braking", jump: "jump height" };

export function whyTitles(q: GoalQuality): { matters: Bi; improves: Bi } {
  return {
    matters: { en: `Why ${EN[q]} matters`, is: `Af hverju ${NOM_IS[q]} skiptir máli` },
    improves: { en: `What improves ${EN[q]}?`, is: `Hvað bætir ${ACC_IS[q]}?` },
  };
}

export const WHY_FOOTER: Bi = {
  en: "From the studies behind MicroPulse's plans. Fixed text, not AI.",
  is: "Úr rannsóknunum sem áætlanir MicroPulse byggja á. Fastur texti, ekki gervigreind.",
};

/** "(Haugen 2019)" / "(Malone 2017; Buchheit 2023)". Unknown keys are dropped (a test checks there are none). */
export function refShort(keys: string[]): string {
  const names = keys.map((k) => ALL_REFS[k]?.short).filter((s): s is string => !!s);
  return names.length ? `(${names.join("; ")})` : "";
}

export function knownRef(key: string): boolean {
  return !!ALL_REFS[key];
}

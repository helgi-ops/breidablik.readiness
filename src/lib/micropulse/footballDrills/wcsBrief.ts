/**
 * WCS training brief — pure, rule-composed, cited.
 *
 * Instead of prescribing specific drills, this turns the worst-case target (physical) + its tactical
 * situation (Ju 2022) into a plain-language DESIGN BRIEF: the verdict, the hardest demands in words,
 * the game situation, and DESIGN CUES (pitch size / player count / tempo — the SSG levers phrased as
 * "how to build a drill that hits this") so the coach designs their own drill from imagination.
 *
 * Rules compose; nothing is invented — every number comes from the engine inputs. Descriptive; never
 * the readiness colour. No I/O.
 *
 * Cite: Ju et al. 2022 (contextualised peak periods); Gaudino/Casamichana/Owen 2017 (SSG pitch size →
 *       load: smaller area = more accel/decel + CoD, larger = more HSR; fewer players = higher
 *       individual involvement); Martín-García 2018 (worst-case / peak demands).
 */

import type { Bi } from "@/lib/micropulse/load/peakPeriod";
import type { WcsTarget } from "./wcsDrillMatch";
import type { WcsTacticalRead } from "./wcsTactical";

export interface WcsBrief {
  scopeLabel: Bi;          // "Aron (winger)" / "Wingers" / "Whole squad"
  headline: Bi;            // layer-0 verdict
  archetype: Bi | null;    // player movement archetype (player scope only)
  demands: Bi[];           // the worst-case numbers, in plain language (layer-1)
  situation: Bi | null;    // tactical situation of the hardest minutes
  designCues: Bi[];        // how to build a drill that reaches each demand (SSG levers as design guidance)
  confidence: Bi;          // data coverage
  citation: string;
}

const CITE = "Ju et al. 2022; Gaudino/Casamichana/Owen 2017 (SSG pitch size → load); Martín-García 2018 (peak demands)";

const r = (n: number | null) => (n == null ? null : Math.round(n));

/**
 * Compose the brief. `scopeLabel` and `archetype` are supplied by the caller (the endpoint knows the
 * player/position/team). Any quality that is null in the target is simply omitted — never fabricated.
 */
export function composeWcsBrief(input: {
  scopeLabel: Bi;
  archetype?: Bi | null;
  target: WcsTarget | null;
  tactical?: WcsTacticalRead | null;
  coverage?: { contributing: number; total: number } | null; // group runs
}): WcsBrief {
  const { scopeLabel, target, tactical, coverage } = input;
  const archetype = input.archetype ?? null;

  if (!target) {
    return {
      scopeLabel, headline: { en: "No worst-case data yet — record match peak windows (Catapult) to build this.", is: "Engin versta-falls gögn enn — skráðu hámarksglugga úr leik (Catapult) til að byggja þetta." },
      archetype, demands: [], situation: null, designCues: [], confidence: { en: "No peak-window coverage.", is: "Engin hámarksglugga-þekja." }, citation: CITE,
    };
  }

  const hsr = r(target.hsrPerMin), ad = r(target.accelDecelPerMin), cod = r(target.codPerMin), pl = r(target.playerLoadPerMin);
  const win = target.windowMin != null ? `~${r(target.windowMin)}-min` : "peak";

  // Layer-0 verdict — name the dominant demands + the situation if we have it.
  const parts: string[] = [];
  const partsIs: string[] = [];
  if (hsr != null) { parts.push("high-speed running"); partsIs.push("háhraða-hlaup"); }
  if (ad != null) { parts.push("accelerations/decelerations"); partsIs.push("hröðun/hemlun"); }
  if (cod != null) { parts.push("changes of direction"); partsIs.push("stefnubreytingar"); }
  const demandWord = parts.length ? parts.slice(0, 2).join(" + ") : "high-intensity work";
  const demandWordIs = partsIs.length ? partsIs.slice(0, 2).join(" + ") : "háákefðar-vinnu";
  const sitEn = tactical?.dominant ? ` in ${tactical.categories.length ? tactical.categories[0] : "his key"} situations` : "";
  const sitIs = tactical?.dominant ? ` í ${tactical.categories.length ? tactical.categories[0] : "lykil"}-stöðum` : "";
  const headline: Bi = {
    en: `Prepare for their worst-case ${win} minutes: ${demandWord}${sitEn}. Design a drill that reaches these numbers.`,
    is: `Undirbúðu versta-falls ${win} mínúturnar: ${demandWordIs}${sitIs}. Hannaðu drillu sem nær þessum tölum.`,
  };

  // Layer-1 demands (the numbers, plain).
  const demands: Bi[] = [];
  if (hsr != null) demands.push({ en: `~${hsr} m of high-speed running per minute at his hardest.`, is: `~${hsr} m háhraða-hlaup á mínútu þegar mest reynir á.` });
  if (ad != null) demands.push({ en: `~${ad} high-intensity accelerations + decelerations per minute.`, is: `~${ad} háákefðar hröðun + hemlun á mínútu.` });
  if (cod != null) demands.push({ en: `~${cod} changes of direction per minute.`, is: `~${cod} stefnubreytingar á mínútu.` });
  if (pl != null) demands.push({ en: `~${pl} player-load per minute (overall mechanical work).`, is: `~${pl} player-load á mínútu (heildar vélræn vinna).` });

  // Design cues — SSG levers phrased as how to BUILD a drill that hits each demand.
  const designCues: Bi[] = [];
  if (ad != null || cod != null) designCues.push({ en: "Reach the accel/decel + CoD with a SMALL area per player (tight pitch), more players, and cutting/turning constraints (small goals, direction changes).", is: "Náðu hröðun/hemlun + stefnubreytingum með LITLU svæði á leikmann (þröngur völlur), fleiri leikmönnum, og skurð/snúnings-skorðum (lítil mörk, stefnubreytingar)." });
  if (hsr != null) designCues.push({ en: "Reach the high-speed running with a LARGE area / longer channels and FEWER players, so there is open space to hit top speed repeatedly.", is: "Náðu háhraða-hlaupinu með STÓRU svæði / lengri rásum og FÆRRI leikmönnum, svo það sé opið rými til að ná topphraða aftur og aftur." });
  if (pl != null) designCues.push({ en: "Push player-load per minute with a HIGH tempo and TRANSITIONS (attack↔defend switches, quick restarts) — short, dense reps.", is: "Ýttu player-load á mínútu upp með HÁU tempói og UMSKIPTUM (sókn↔vörn, hraðar enduropnanir) — stuttar, þéttar lotur." });

  // Situation cue.
  let situation: Bi | null = null;
  if (tactical?.dominant && tactical.note) {
    situation = tactical.offBall
      ? { en: `${tactical.note.en} (design a drill around this situation, but read it as a hint — off-ball context needs tracking data.)`, is: `${tactical.note.is} (hannaðu drillu í kringum þessa stöðu, en lestu sem vísbendingu — án-bolta samhengi þarf rakningargögn.)` }
      : { en: tactical.note.en, is: tactical.note.is };
  }

  const confidence: Bi = coverage
    ? { en: `Worst-case averaged across ${coverage.contributing}/${coverage.total} players (injured excluded).`, is: `Versta fall meðaltal yfir ${coverage.contributing}/${coverage.total} leikmenn (meiddir undanskildir).` }
    : { en: `${[hsr, ad, cod, pl].filter((x) => x != null).length}/4 worst-case qualities have data.`, is: `${[hsr, ad, cod, pl].filter((x) => x != null).length}/4 versta-falls eiginleikar hafa gögn.` };

  return { scopeLabel, headline, archetype, demands, situation, designCues, confidence, citation: CITE };
}

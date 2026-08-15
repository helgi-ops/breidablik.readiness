/**
 * Development levers — rule-based "what to do to improve this weakness".
 *
 * Pure, IO-free. The manifesto rule holds: RULES decide (which qualities are weak,
 * which lever applies), the AI only phrases. Each lever is a plain-language coaching/
 * S&C action with a short rationale and, where clean, a citation. PERFORMANCE ONLY —
 * these are training/coaching levers, never medical or injury advice; the asymmetry
 * lever explicitly hands the medical read back to the RTP module.
 *
 * Levers are attached to a player's actual weaknesses (verdict==="weakness") by
 * `leversForProfile`, so a coach sees a remedy next to every flagged gap — overridable,
 * cited, never a black box.
 */

import type { QualityId, AthleteProfile } from "./athleteProfile";
import type { PlayerAnalysis, Category } from "./index";

export type Lever = { en: string; is: string; cite?: string };

/** One S&C lever per athlete quality — the training that generally raises it. */
export const ATHLETE_LEVERS: Record<QualityId, Lever> = {
  speed: {
    en: "Expose him to true top-speed running — flying sprints (20–40 m) at 95–100% and sprint-mechanics drills. Max speed only improves when it is regularly reached.",
    is: "Láttu hann ná raunverulegum hámarkshraða — fljúgandi spretti (20–40 m) á 95–100% og spretttækni-æfingar. Hámarkshraði batnar bara þegar hann er reglulega snertur.",
    cite: "Haugen 2019 (sprint exposure)",
  },
  acceleration: {
    en: "Short accelerations from a standstill (10–20 m), resisted sprints / sled pushes and plyometrics build first-step explosiveness.",
    is: "Stuttar hröðunar-æfingar frá kyrrstöðu (10–20 m), mótstöðu-sprettir / sleðaýtingar og stökkæfingar byggja fyrsta-skref sprengikraft.",
  },
  deceleration: {
    en: "Eccentric strength and deceleration technique — planned stops, decel-to-cut drills — improve braking and protect it under load.",
    is: "Sérhæfð hemlunar-tækni og eccentrískur styrkur — skipulögð stopp, hemlun-í-stefnubreytingu — bæta hemlun og vernda hana undir álagi.",
    cite: "McBurnie 2022",
  },
  reactive_power: {
    en: "Plyometrics using the stretch-shortening cycle — drop jumps, bounds, pogo hops — raise reactive strength (RSI).",
    is: "Stökkæfingar sem nýta teygju-styttingu vöðva — fallstökk, skopp, pogo-hopp — hækka viðbragðskraft (RSI).",
  },
  max_strength: {
    en: "A dedicated strength block — heavy compound lifting (≥85% 1RM, low reps) — raises maximal and relative force.",
    is: "Sérstakt styrktar-tímabil — þungar samsettar lyftingar (≥85% 1RM, fáar endurtekningar) — hækkar hámarks- og hlutfallslegan kraft.",
  },
  vbt_power: {
    en: "Power/ballistic work at the optimal load (velocity-based) — jump squats, trap-bar jumps, Olympic derivatives — lifts bar power output.",
    is: "Afl-/ballistískar æfingar á kjörálagi (hraðastýrt) — stökk-hnébeygjur, trap-bar stökk, ólympískar afleiður — hækka aflframleiðslu.",
  },
  change_of_direction: {
    en: "Change-of-direction technique plus reactive agility — cutting mechanics and small-sided reactive games — improve turning off both feet.",
    is: "Stefnubreytinga-tækni ásamt viðbragðs-lipurð — skurðtækni og lítil viðbragðs-leikform — bæta snúninga af báðum fótum.",
    cite: "McBurnie 2022",
  },
  work_capacity: {
    en: "Repeated-sprint and high-intensity interval conditioning raise the high-speed running he can sustain across a match.",
    is: "Endurteknir sprettir og háákafa-þrekþjálfun hækka háhraðahlaupið sem hann heldur út allan leikinn.",
    cite: "Buchheit 2013",
  },
  mechanical_power: {
    en: "Build tolerance for high-cost mechanical actions — plyometrics, eccentric/decel work and multidirectional drills raise the density of cuts, accelerations and decelerations he can produce and absorb.",
    is: "Byggðu þol fyrir hákostnaðar-vélrænar aðgerðir — stökkæfingar, eccentrísk/hemlunar-vinna og fjölstefnu-æfingar hækka þéttleika skurða, hröðunar og hemlunar sem hann getur framleitt og tekið á móti.",
    cite: "McBurnie 2022 · Buchheit 2014",
  },
  peak_demands: {
    en: "Expose him to game-simulation on his own worst-case demands — repeated high-intensity blocks at match peak-load density — so the most intense passages feel routine.",
    is: "Láttu hann mæta leik-eftirlíkingu á eigin versta-tilfellis kröfum — endurteknar háákafa-lotur á hámarks-álagsþéttleika leiks — svo ákafustu kaflarnir verði vanabundnir.",
    cite: "Delaney 2017",
  },
  robustness: {
    en: "Close the left–right gap with unilateral strength work — single-leg press/RDL, split squats. If the asymmetry persists, the RTP module holds the medical read.",
    is: "Minnkaðu vinstri–hægri muninn með einfættum styrk — einfætt pressa/RDL, klofnar hnébeygjur. Haldist ósamhverfan er læknis-lesturinn í RTP-modúlinu.",
  },
};

/** Coarser guidance for a weak footballer area (per-category). */
export const FOOTBALLER_LEVERS: Record<Category, Lever> = {
  attacking: {
    en: "Add end-product with finishing and final-third reps, and get him into higher-value positions — or lean on teammates to supply the goals.",
    is: "Bættu lokaafurð með klárunar- og lokaþriðjungs-æfingum og komdu honum í verðmætari stöður — eða treystu á samherja fyrir mörkin.",
  },
  possession: {
    en: "Grow his involvement in build-up — receiving between the lines, third-man combinations, more touches in central zones.",
    is: "Auktu þátttöku hans í uppbyggingu — móttaka milli lína, þriðja-manns samspil, fleiri snertingar á miðsvæðum.",
  },
  defending: {
    en: "Sharpen pressing triggers and defensive positioning; or pair him with a genuine ball-winner so the balance holds.",
    is: "Skerptu pressu-merki og varnarstöðu; eða paraðu hann með raunverulegum bolta-vinnara svo jafnvægið haldi.",
  },
};

export type DevelopmentItem = {
  axis: "athlete" | "footballer";
  key: string;         // quality id or footballer category
  label: string;       // human label for the weak area (engine-agnostic; UI localises quality labels)
  percentile: number | null;
  lever: Lever;
};

/** Attach a lever to each real weakness on either axis (most-severe first). */
export function leversForProfile(footballer: PlayerAnalysis | null, athlete: AthleteProfile | null): DevelopmentItem[] {
  const items: DevelopmentItem[] = [];

  if (athlete) {
    for (const q of athlete.weaknesses) {
      items.push({ axis: "athlete", key: q.id, label: q.id, percentile: q.positionPercentile, lever: ATHLETE_LEVERS[q.id] });
    }
  }
  if (footballer && !footballer.goalkeeper) {
    // Weak footballer CATEGORIES (bottom third by mean percentile), deduped to the area.
    const cats: Category[] = ["attacking", "possession", "defending"];
    for (const c of cats) {
      const p = footballer.byCategory[c];
      if (p != null && p <= 30) items.push({ axis: "footballer", key: c, label: c, percentile: p, lever: FOOTBALLER_LEVERS[c] });
    }
  }
  return items.sort((a, b) => (a.percentile ?? 100) - (b.percentile ?? 100));
}

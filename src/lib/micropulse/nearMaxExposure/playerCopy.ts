/**
 * Player-voiced copy for the near-top-speed reminder ("Top speed due") on the player's own Today.
 *
 * Pure and client-safe. Same read as the coach's pill (`NearMaxRead`), second person, plain words. Layered:
 * verdict (one sentence) → 2–3 plain facts → "behind the numbers". The advice never tells a player to go and
 * sprint flat out alone: the coach sees the same reminder and plans it; after a long gap the line is to build
 * back in steps. Wording about injuries stays "associated with". A reminder, never the readiness colour.
 */

import type { NearMaxRead } from "./index";

type Bi = { en: string; is: string };

export type NearMaxPlayerCard = {
  level: "due" | "long_gap";
  title: Bi;
  /** Layer 0: the one sentence. */
  verdict: Bi;
  /** Layer 1: plain facts, visible without a click. */
  facts: Bi[];
  /** How sure the top speed behind this is. */
  confidence: Bi;
  /** Layer 2: behind the toggle. */
  details: Bi[];
};

const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const IS_MONTHS = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];

const kmh = (v: number, lang: "en" | "is") => (lang === "is" ? v.toFixed(1).replace(".", ",") : v.toFixed(1));
/** Icelandic counts ending in 1 (but not 11) take the singular: "21 dagur", "31 mældum degi". */
const isSingular = (n: number) => n % 10 === 1 && n % 100 !== 11;

function dayMonth(iso: string): Bi | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { en: `${day} ${EN_MONTHS[month]}`, is: `${day}. ${IS_MONTHS[month]}` };
}

/** null when there is nothing to remind the player of (level "ok"). */
export function formatNearMaxForPlayer(read: NearMaxRead): NearMaxPlayerCard | null {
  if (read.level === "ok") return null;
  const n = read.daysSince;
  const longGap = read.level === "long_gap";

  const verdict: Bi = n == null
    ? {
      en: "No run near your top speed in your GPS data from the last 12 months.",
      is: "Enginn sprettur nálægt hámarkshraða þínum í GPS gögnum síðustu 12 mánaða.",
    }
    : {
      en: `${n} ${n === 1 ? "day" : "days"} since you last ran near your top speed.`,
      is: `${n} ${isSingular(n) ? "dagur" : "dagar"} síðan þú hljópst síðast nálægt hámarkshraða þínum.`,
    };

  const facts: Bi[] = [];
  const when = read.lastDate ? dayMonth(read.lastDate) : null;
  if (read.lastKmh != null && when) {
    facts.push({
      en: `Last time: ${kmh(read.lastKmh, "en")} km/h on ${when.en}.`,
      is: `Síðast: ${kmh(read.lastKmh, "is")} km/klst þann ${when.is}.`,
    });
  }
  facts.push({
    en: `A run at ${kmh(read.targetKmh, "en")} km/h or faster counts.`,
    is: `Sprettur á ${kmh(read.targetKmh, "is")} km/klst eða hraðar telur.`,
  });
  facts.push(longGap
    ? {
      en: "It has been a while, so build your speed back up over a few sessions. Don't go straight to a flat-out sprint. Your coach sees this reminder too.",
      is: "Það er langt síðan, svo byggðu hraðann upp í áföngum á nokkrum æfingum. Ekki fara beint í hámarkssprett. Þjálfarinn þinn sér sömu áminningu.",
    }
    : {
      en: "Your coach sees this reminder too and decides when a fast run fits the week.",
      is: "Þjálfarinn þinn sér sömu áminningu og ákveður hvenær hraður sprettur passar í vikuna.",
    });

  const fromTest = read.ref.source === "sprint_test";
  const d = read.ref.days;
  const confidence: Bi = fromTest
    ? { en: "How sure: high. Your top speed comes from a measured sprint test.", is: "Öryggi: hátt. Hámarkshraðinn þinn kemur úr mældu sprettprófi." }
    : read.confidence === "high"
      ? {
        en: `How sure: high. Your top speed rests on ${d} measured days.`,
        is: `Öryggi: hátt. Hámarkshraðinn þinn byggir á ${d} ${isSingular(d) ? "mældum degi" : "mældum dögum"}.`,
      }
      : {
        en: `How sure: medium. Your top speed rests on only ${d} measured days so far.`,
        is: `Öryggi: miðlungs. Hámarkshraðinn þinn byggir enn aðeins á ${d} ${isSingular(d) ? "mældum degi" : "mældum dögum"}.`,
      };

  const target = { en: kmh(read.targetKmh, "en"), is: kmh(read.targetKmh, "is") };
  const ref = { en: kmh(read.ref.kmh, "en"), is: kmh(read.ref.kmh, "is") };
  const details: Bi[] = [
    fromTest
      ? {
        en: `${target.en} km/h is 90% of ${ref.en} km/h, your measured sprint test.`,
        is: `${target.is} km/klst er 90% af ${ref.is} km/klst, mældu sprettprófi þínu.`,
      }
      : {
        en: `${target.en} km/h is 90% of ${ref.en} km/h, your third-fastest day on GPS in the last 12 months. The third-fastest day is used so one odd GPS reading can't set the bar.`,
        is: `${target.is} km/klst er 90% af ${ref.is} km/klst, þriðja hraðasta GPS degi þínum síðustu 12 mánuði. Þriðji hraðasti dagurinn er notaður svo ein skrýtin GPS mæling ráði ekki viðmiðinu.`,
      },
    {
      en: "Days indoors without GPS are not counted either way.",
      is: "Innidagar án GPS teljast hvorki með né á móti.",
    },
    {
      en: "Why it matters: running near top speed regularly is associated with fewer hamstring injuries, and a sudden jump after a long gap is associated with more (Malone 2017; Buchheit 2023; Edouard 2019). The studies give no day count: 10 and 21 days are MicroPulse's marks.",
      is: "Af hverju: reglulegir sprettir nálægt hámarkshraða tengjast færri aftanlærismeiðslum, og snögg aukning eftir langt hlé tengist fleiri (Malone 2017; Buchheit 2023; Edouard 2019). Rannsóknirnar gefa engan dagafjölda: 10 og 21 dagur eru mörk MicroPulse.",
    },
    {
      en: "This is a reminder. It does not change your readiness colour.",
      is: "Þetta er áminning. Hún breytir ekki litnum þínum.",
    },
  ];

  return {
    level: read.level,
    title: { en: "Top speed due", is: "Tími á hámarkshraða" },
    verdict,
    facts,
    confidence,
    details,
  };
}

/**
 * Plan intent — the keyword reader (Icelandic + English). Pure, no AI.
 *
 * Used when the AI read is not available (no key, not an ELITE team, the call failed), so the feature works without
 * AI. Same idea as `strengthProgramming/noteParser.ts`: word stems mapped to the fixed list in `vocabulary.ts`.
 *
 * The text is cut into clauses (at . ; ! ? , new lines and "og"/"and"/"en"/"but"). In each clause the goals are
 * looked for in order, most specific first (RSA and HIIT before aerobic base, power before top speed), and a matched span is blanked so a later, wider stem can't take it again
 * ("hraðaþol" is RSA, not also "þol"; "hraðastyrkur" is power, not also "styrkur"). The mode comes from the words
 * in the same clause ("halda" = keep, "minnka" = reduce, else build). A clause that asks for something ("vil bæta …")
 * but matches no goal is returned as not understood.
 */

import { sanitizeIntent, type IntentGoal, type IntentMode, type PlanIntent } from "./vocabulary";

const L = "(?<!\\p{L})"; // start of a word (works for Icelandic letters, unlike \b)

/** Most specific first: each goal's stems, as regex sources (lower-case). */
const GOAL_STEMS: Array<[IntentGoal, string[]]> = [
  ["rsa", ["hraðaþol\\p{L}*", "endurtek\\p{L}* sprett\\p{L}*", "repeated[- ]sprint\\p{L}*", "rsa", "speed endurance"]],
  ["hiit", ["high[- ]intensity endurance", "háákefð\\p{L}*", "hiit", "interval\\p{L}*", "intervöl\\p{L}*", "vo2\\p{L}*", "vo₂\\p{L}*", "loftháð\\p{L}* afl\\p{L}*", "aerobic power", "high[- ]intensity"]],
  ["aerobic_base", ["grunnþol\\p{L}*", "loftháð\\p{L}*", "úthald\\p{L}*", "aerobic\\p{L}*", "endurance", "conditioning", "fitness", "þol\\p{L}*", "þrek\\p{L}*"]],
  ["power", ["sprengikraft\\p{L}*", "hraðastyrk\\p{L}*", "kraft\\p{L}*", "power", "explosiv\\p{L}*", "plyo\\p{L}*", "stökk\\p{L}*", "jump\\p{L}*", "speed[- ]strength", "rfd"]],
  ["max_speed", ["hámarkshrað\\p{L}*", "spretthrað\\p{L}*", "top speed", "max(?:imal|imum)? speed", "max(?:imal|imum)? velocity", "sprint\\p{L}*", "sprett\\p{L}*", "hrað(?:i|a|ann|ans)(?!\\p{L})", "speed"]],
  ["accel_decel", ["hröðun\\p{L}*", "hemlun\\p{L}*", "hægja á", "stefnubreyt\\p{L}*", "accel\\p{L}*", "decel\\p{L}*", "braking", "change of direction", "cod(?!\\p{L})"]],
  ["max_strength", ["hámarksstyrk\\p{L}*", "styrk\\p{L}*", "þung\\p{L}* lyft\\p{L}*", "max(?:imal|imum)? strength", "strength", "heavy lift\\p{L}*", "1rm"]],
  ["injury_prevention", ["meiðsl\\p{L}*", "forv\\p{L}*", "fyrirbyggj\\p{L}*", "aftanlær\\p{L}*", "nára\\p{L}*", "nári", "hamstring\\p{L}*", "groin", "adductor\\p{L}*", "nordic", "copenhagen", "injur\\p{L}*", "prevent\\p{L}*", "pre-?hab"]],
  ["freshness", ["ferskleik\\p{L}*", "fersk\\p{L}*", "endurheimt\\p{L}*", "taper\\p{L}*", "fresh\\p{L}*", "recover\\p{L}*", "deload", "niðurtröpp\\p{L}*", "léttar\\p{L}* vik\\p{L}*", "létt\\p{L}* vik\\p{L}*"]],
];

const MODE_STEMS: Array<[IntentMode, string[]]> = [
  ["reduce", ["minnk\\p{L}*", "draga úr", "dregið úr", "létta", "lækk\\p{L}*", "reduce\\p{L}*", "cut\\p{L}*", "less(?!\\p{L})", "lower"]],
  ["maintain", ["halda(?!\\p{L})", "haldi(?!\\p{L})", "viðhald\\p{L}*", "maintain\\p{L}*", "keep\\p{L}*", "hold(?!\\p{L})", "retain\\p{L}*"]],
];

/** Words that say the coach wants something (so a clause with one of these but no goal is "not understood"). */
const WANT_STEMS = ["vil(?!\\p{L})", "viljum", "vilja", "bæta", "auka", "byggja", "efla", "þróa", "leggja áherslu", "want\\p{L}*", "improve", "build", "develop", "increase", "focus"];

const rx = (stems: string[]) => new RegExp(`${L}(?:${stems.join("|")})`, "giu");
const GOAL_RX: Array<[IntentGoal, RegExp]> = GOAL_STEMS.map(([g, s]) => [g, rx(s)]);
const MODE_RX: Array<[IntentMode, RegExp]> = MODE_STEMS.map(([m, s]) => [m, rx(s)]);
const WANT_RX = rx(WANT_STEMS);

/** Clauses of the original text (original case kept, so quotes match the coach's words). */
function clauses(text: string): string[] {
  return text
    .split(/[.;!?,\n]+|\s(?:og|and|en|but|ásamt)\s/iu)
    .map((c) => c.trim())
    .filter(Boolean);
}

export function readIntentByKeywords(text: string): PlanIntent {
  const items: Array<{ goal: IntentGoal; mode: IntentMode; quote: string }> = [];
  const unclear: string[] = [];
  const seen = new Set<IntentGoal>();
  for (const clause of clauses(text)) {
    let work = clause.toLocaleLowerCase("is");
    const found: IntentGoal[] = [];
    for (const [goal, re] of GOAL_RX) {
      re.lastIndex = 0;
      let hit = false;
      work = work.replace(re, (m) => { hit = true; return " ".repeat(m.length); });
      if (hit) found.push(goal);
    }
    const low = clause.toLocaleLowerCase("is");
    let mode: IntentMode = "build";
    for (const [m, re] of MODE_RX) { re.lastIndex = 0; if (re.test(low)) { mode = m; break; } }
    for (const goal of found) {
      if (seen.has(goal)) continue;
      seen.add(goal);
      // Freshness has one direction (more of it); "léttari vika" must not read as "less freshness".
      items.push({ goal, mode: goal === "freshness" ? "build" : mode, quote: clause });
    }
    WANT_RX.lastIndex = 0;
    if (!found.length && WANT_RX.test(low) && unclear.length < 4) unclear.push(clause);
  }
  // Same guard as the AI read: every quote must be in the text.
  return sanitizeIntent({ items, unclear }, text, "keywords");
}

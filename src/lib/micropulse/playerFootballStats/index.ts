/**
 * Position-aware player-facing football stats.
 *
 * A player opening his own app should see ~10-15 of his Wyscout stats — the ones
 * that describe HIS game, not the coach's 100-metric scouting table. Which stats
 * are meaningful depends on where he plays (a centre-back's aerial duels vs a
 * winger's dribbles), so the selection is POSITION-DEPENDENT: a shared attacking
 * core plus a position-tailored extra set (goalkeepers get their own set).
 *
 * This is DESCRIPTIVE football data only. Per the manifesto it NEVER touches the
 * readiness colour or the daily decision — it's a "follow your season" surface,
 * framed positively, jargon behind tooltips.
 *
 * Pure + config-driven so it's unit-testable: pass the player's core columns +
 * the Wyscout `metrics` jsonb + his position, get back the curated, formatted,
 * bilingual list ready to render.
 */

export type PositionFamily = "GK" | "CB" | "FB" | "MID" | "WING" | "FW" | "OUTFIELD";

/** How a stat's raw number is rendered. */
type Fmt = "int" | "dec1" | "dec2" | "pct" | "xg";

/** One curated stat: where its value comes from, how to label + format it, and
 *  (for jargon) a plain-language tooltip. `core` reads a typed column; `metric`
 *  reads a key from the Wyscout `metrics` jsonb (verbatim Wyscout column name). */
type StatDef = {
  id: string;
  en: string;
  is: string;
  core?: CoreKey;
  metric?: string;
  fmt: Fmt;
  /** Plain-language tooltip for sport-science jargon (xG, xA, PAdj, …). */
  tipEn?: string;
  tipIs?: string;
  /** false for "lower is better" stats (goals conceded, xG against). Default true. */
  higherIsBetter?: boolean;
};

export type CoreKey =
  | "minutes" | "goals" | "assists" | "xg" | "shots" | "shotsOnTarget" | "passAccuracyPct";

/** The season row as this module consumes it — typed core + the metrics bag. */
export type FootballStatInput = {
  core: Partial<Record<CoreKey, number | null | undefined>>;
  metrics: Record<string, number | string | null | undefined>;
};

/** A rendered stat ready for the card. `value` null ⇒ render "–" (not zero). */
export type PlayerFootballStat = {
  id: string;
  label: string;      // localized
  value: number | null;
  display: string;    // formatted for display ("62%", "1.4", "–")
  tip: string | null; // localized jargon tooltip, or null
  higherIsBetter: boolean;
};

// ── Position → family ───────────────────────────────────────────────────────
// DB positions are short codes (CM, CB, AM, LW, RB, GK, CF, LB, RAM, FWD, RW,
// MF, …). Map exact codes first, then fall back to keyword matching so an
// unfamiliar variant still lands in a sensible family rather than "unknown".
const CODE_TO_FAMILY: Record<string, PositionFamily> = {
  GK: "GK", G: "GK",
  CB: "CB", RCB: "CB", LCB: "CB", CD: "CB", SW: "CB",
  RB: "FB", LB: "FB", RWB: "FB", LWB: "FB", WB: "FB",
  DM: "MID", CDM: "MID", DMF: "MID", CM: "MID", RCM: "MID", LCM: "MID", CMF: "MID",
  RCMF: "MID", LCMF: "MID", MF: "MID", M: "MID", AM: "MID", CAM: "MID", AMF: "MID",
  LW: "WING", RW: "WING", LM: "WING", RM: "WING", RAM: "WING", LAM: "WING",
  RWF: "WING", LWF: "WING", RAMF: "WING", LAMF: "WING", W: "WING",
  CF: "FW", ST: "FW", FW: "FW", FWD: "FW", SS: "FW", S: "FW",
};

export function positionFamily(pos: string | null | undefined): PositionFamily {
  const raw = (pos ?? "").toUpperCase();
  if (!raw.trim()) return "OUTFIELD";
  // Wyscout sometimes lists several codes ("RW, RAMF") — take the first token.
  const code = raw.split(/[,/|\s]+/)[0].replace(/[^A-Z]/g, "");
  if (CODE_TO_FAMILY[code]) return CODE_TO_FAMILY[code];
  // Keyword fallback — order matters (check GK & CB before generic B/F/M).
  if (code.includes("GK") || code.includes("KEEP")) return "GK";
  if (code.includes("CB") || code.includes("CENTREB") || code.includes("CENTERB")) return "CB";
  if (code.includes("WB") || code.endsWith("B")) return "FB";
  if (code.includes("W")) return "WING";
  if (code.startsWith("ST") || code.includes("STRIK") || code.includes("FORW") || code.startsWith("CF")) return "FW";
  if (code.includes("M")) return "MID";
  return "OUTFIELD";
}

// ── Stat catalog ────────────────────────────────────────────────────────────
// Every id used by a family must exist here. Tooltips are only for genuine
// jargon; plain stats (goals, minutes) need none.
const CATALOG: Record<string, StatDef> = {
  matches:    { id: "matches",    en: "Matches",        is: "Leikir",              metric: "Matches played", fmt: "int" },
  minutes:    { id: "minutes",    en: "Minutes",        is: "Mínútur",             core: "minutes", fmt: "int" },
  goals:      { id: "goals",      en: "Goals",          is: "Mörk",                core: "goals", fmt: "int" },
  assists:    { id: "assists",    en: "Assists",        is: "Stoðsendingar",       core: "assists", fmt: "int" },
  xg:         { id: "xg",         en: "xG",             is: "xG (vænt mörk)",      core: "xg", fmt: "xg",
                tipEn: "Expected goals — the quality of the chances you got into. A tap-in ≈ 0.8, a long shot ≈ 0.03.",
                tipIs: "Vænt mörk — gæði færanna sem þú komst í. Dauðafæri ≈ 0,8, langskot ≈ 0,03." },
  passAcc:    { id: "passAcc",    en: "Pass accuracy",  is: "Sendinga-nákvæmni",   core: "passAccuracyPct", fmt: "pct" },

  xgP90:      { id: "xgP90",      en: "xG per 90",       is: "xG á 90 mín",        metric: "xG per 90", fmt: "dec2",
                tipEn: "Your expected goals per 90 minutes — chance quality at a steady rate, fair regardless of minutes.",
                tipIs: "Vænt mörk á 90 mínútur — gæði færa á jöfnum hraða, óháð spiluðum mínútum." },
  shotsP90:   { id: "shotsP90",   en: "Shots per 90",    is: "Skot á 90 mín",      metric: "Shots per 90", fmt: "dec2" },
  shotsOnPct: { id: "shotsOnPct", en: "Shots on target", is: "Skot á rammann",     metric: "Shots on target, %", fmt: "pct" },
  goalConv:   { id: "goalConv",   en: "Goal conversion", is: "Marka-nýting",       metric: "Goal conversion, %", fmt: "pct",
                tipEn: "The share of your shots that become goals.",
                tipIs: "Hlutfall skota þinna sem verða að marki." },
  touchesBox: { id: "touchesBox", en: "Touches in box",  is: "Snertingar í teig",  metric: "Touches in box per 90", fmt: "dec2",
                tipEn: "Touches inside the opponent's box per 90 — how often you get into dangerous areas.",
                tipIs: "Snertingar inni í teig andstæðinga á 90 mín — hversu oft þú kemst í hættuleg svæði." },
  aerialWon:  { id: "aerialWon",  en: "Aerial duels won", is: "Skallaeinvígi unnin", metric: "Aerial duels won, %", fmt: "pct" },

  xaP90:      { id: "xaP90",      en: "xA per 90",        is: "xA á 90 mín",        metric: "xA per 90", fmt: "dec2",
                tipEn: "Expected assists per 90 — the chance-creating value of your passes, whether or not a teammate finished.",
                tipIs: "Væntar stoðsendingar á 90 mín — færa-skapandi virði sendinga þinna, óháð því hvort samherji kláraði." },
  keyPassesP90: { id: "keyPassesP90", en: "Key passes",   is: "Lykilsendingar",     metric: "Key passes per 90", fmt: "dec2",
                tipEn: "Passes that create a shot for a teammate, per 90 minutes.",
                tipIs: "Sendingar sem skapa skot fyrir samherja, á 90 mínútur." },
  dribbleSucc: { id: "dribbleSucc", en: "Dribble success", is: "Rekstur — árangur", metric: "Successful dribbles, %", fmt: "pct" },
  dribblesP90: { id: "dribblesP90", en: "Dribbles per 90", is: "Rekstur á 90 mín",  metric: "Dribbles per 90", fmt: "dec2" },
  progRuns:   { id: "progRuns",   en: "Progressive runs", is: "Sóknarhlaup",        metric: "Progressive runs per 90", fmt: "dec2",
                tipEn: "Runs with the ball that move it meaningfully towards goal, per 90.",
                tipIs: "Hlaup með boltann sem færa hann marktækt fram á við, á 90 mín." },
  crossesP90: { id: "crossesP90", en: "Crosses per 90",   is: "Fyrirgjafir á 90 mín", metric: "Crosses per 90", fmt: "dec2" },
  crossAcc:   { id: "crossAcc",   en: "Cross accuracy",   is: "Fyrirgjafir — nákvæmni", metric: "Accurate crosses, %", fmt: "pct" },

  passesP90:  { id: "passesP90",  en: "Passes per 90",    is: "Sendingar á 90 mín", metric: "Passes per 90", fmt: "dec1" },
  progPassesP90: { id: "progPassesP90", en: "Progressive passes", is: "Sóknarsendingar", metric: "Progressive passes per 90", fmt: "dec2",
                tipEn: "Passes that move the ball meaningfully forward, per 90.",
                tipIs: "Sendingar sem færa boltann marktækt fram á við, á 90 mín." },
  duelsWon:   { id: "duelsWon",   en: "Duels won",        is: "Einvígi unnin",      metric: "Duels won, %", fmt: "pct" },
  interceptP90: { id: "interceptP90", en: "Interceptions", is: "Sendingar rofnar",  metric: "Interceptions per 90", fmt: "dec2",
                tipEn: "Opponent passes you cut out, per 90 minutes.",
                tipIs: "Sendingar andstæðinga sem þú rýfur, á 90 mínútur." },

  defDuelsWon: { id: "defDuelsWon", en: "Defensive duels won", is: "Varnareinvígi unnin", metric: "Defensive duels won, %", fmt: "pct" },
  padjInter:  { id: "padjInter",  en: "PAdj interceptions", is: "PAdj sendingar rofnar", metric: "PAdj Interceptions", fmt: "dec2",
                tipEn: "Interceptions adjusted for how much your team has the ball — fair to compare across playing styles.",
                tipIs: "Sendingar rofnar leiðréttar fyrir boltaeign liðsins — sanngjarnara milli mismunandi leikstíla." },
  longPassAcc: { id: "longPassAcc", en: "Long-pass accuracy", is: "Langsendingar — nákvæmni", metric: "Accurate long passes, %", fmt: "pct" },
  fwdPassAcc: { id: "fwdPassAcc", en: "Forward-pass accuracy", is: "Framsendingar — nákvæmni", metric: "Accurate forward passes, %", fmt: "pct" },

  // Goalkeeper set
  cleanSheets: { id: "cleanSheets", en: "Clean sheets",  is: "Hreinar skjaldir",   metric: "Clean sheets", fmt: "int" },
  saveRate:   { id: "saveRate",   en: "Save rate",        is: "Varið hlutfall",     metric: "Save rate, %", fmt: "pct" },
  conceded:   { id: "conceded",   en: "Goals conceded",   is: "Mörk fengin á sig",  metric: "Conceded goals", fmt: "int", higherIsBetter: false },
  prevented:  { id: "prevented",  en: "Goals prevented",  is: "Mörk varin umfram",  metric: "Prevented goals", fmt: "dec1",
                tipEn: "Goals you saved beyond what an average keeper would concede from the same shots. Positive = above average.",
                tipIs: "Mörk sem þú varðir umfram það sem meðalmarkvörður fengi á sig úr sömu skotum. Jákvætt = yfir meðallagi." },
  xgAgainst:  { id: "xgAgainst",  en: "xG against",       is: "xG á sig",           metric: "xG against", fmt: "dec1", higherIsBetter: false,
                tipEn: "Expected goals from the shots you faced — the difficulty of what came at you.",
                tipIs: "Vænt mörk úr skotunum sem þú stóðst frammi fyrir — erfiðleiki þess sem á þig kom." },
};

// Shared attacking core for every outfield player.
const CORE_OUTFIELD = ["matches", "minutes", "goals", "assists", "xg", "passAcc"];

// Position-tailored extra sets (≈6 each ⇒ ~12 total with the core).
const EXTRAS: Record<Exclude<PositionFamily, "GK">, string[]> = {
  FW:       ["shotsP90", "shotsOnPct", "goalConv", "xgP90", "touchesBox", "aerialWon"],
  WING:     ["xaP90", "keyPassesP90", "dribbleSucc", "progRuns", "crossesP90", "touchesBox"],
  MID:      ["passesP90", "progPassesP90", "keyPassesP90", "xaP90", "duelsWon", "interceptP90"],
  FB:       ["crossesP90", "crossAcc", "progRuns", "defDuelsWon", "interceptP90", "duelsWon"],
  CB:       ["defDuelsWon", "aerialWon", "interceptP90", "padjInter", "longPassAcc", "fwdPassAcc"],
  OUTFIELD: ["passesP90", "progPassesP90", "keyPassesP90", "duelsWon", "interceptP90", "touchesBox"],
};

// Goalkeepers get a bespoke set (attacking core would be noise for a keeper).
const GK_SET = ["matches", "minutes", "cleanSheets", "saveRate", "conceded", "prevented", "xgAgainst", "passAcc"];

/** The ordered stat ids a given position should see. */
export function statIdsForPosition(pos: string | null | undefined): string[] {
  const fam = positionFamily(pos);
  if (fam === "GK") return GK_SET;
  return [...CORE_OUTFIELD, ...EXTRAS[fam]];
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace("%", "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function format(value: number | null, fmt: Fmt): string {
  if (value == null) return "–";
  switch (fmt) {
    case "int": return Math.round(value).toLocaleString();
    case "dec1": return (Math.round(value * 10) / 10).toLocaleString();
    case "dec2": return (Math.round(value * 100) / 100).toLocaleString();
    case "xg": return (Math.round(value * 10) / 10).toLocaleString();
    case "pct": return `${Math.round(value)}%`;
  }
}

function readValue(def: StatDef, input: FootballStatInput): number | null {
  if (def.core) return toNum(input.core[def.core]);
  if (def.metric) return toNum(input.metrics[def.metric]);
  return null;
}

/**
 * The curated, position-aware, formatted, localized stat list for a player.
 * Stats with no value still appear (as "–") so the read is stable and honest
 * about what the source didn't report — never silently dropped to look fuller.
 */
export function pickPlayerFootballStats(
  input: FootballStatInput,
  position: string | null | undefined,
  lang: "EN" | "IS",
): PlayerFootballStat[] {
  const isIS = lang === "IS";
  return statIdsForPosition(position).map((id) => {
    const def = CATALOG[id];
    const value = readValue(def, input);
    return {
      id,
      label: isIS ? def.is : def.en,
      value,
      display: format(value, def.fmt),
      tip: isIS ? (def.tipIs ?? null) : (def.tipEn ?? null),
      higherIsBetter: def.higherIsBetter !== false,
    };
  });
}

/** A short, positive, plain headline for the top of the card (Layer 0). Names
 *  the player's output the way he'd describe his own season — no jargon. */
export function seasonHeadline(
  input: FootballStatInput,
  position: string | null | undefined,
  lang: "EN" | "IS",
): { primary: string; secondary: string | null } {
  const isIS = lang === "IS";
  const fam = positionFamily(position);
  const matches = toNum(input.metrics["Matches played"]);
  const minutes = toNum(input.core.minutes);
  const m = matches != null ? Math.round(matches) : null;
  const mn = minutes != null ? Math.round(minutes) : null;
  const primary = isIS
    ? `${m ?? "–"} leikir · ${mn != null ? mn.toLocaleString() : "–"} mínútur`
    : `${m ?? "–"} matches · ${mn != null ? mn.toLocaleString() : "–"} minutes`;

  let secondary: string | null = null;
  if (fam === "GK") {
    const cs = toNum(input.metrics["Clean sheets"]);
    const sr = toNum(input.metrics["Save rate, %"]);
    const parts: string[] = [];
    if (cs != null) parts.push(isIS ? `${Math.round(cs)} hreinar skjaldir` : `${Math.round(cs)} clean sheets`);
    if (sr != null) parts.push(isIS ? `${Math.round(sr)}% varið` : `${Math.round(sr)}% save rate`);
    secondary = parts.length ? parts.join(" · ") : null;
  } else {
    const g = toNum(input.core.goals);
    const a = toNum(input.core.assists);
    const parts: string[] = [];
    if (g != null) parts.push(isIS ? `${Math.round(g)} mörk` : `${Math.round(g)} goals`);
    if (a != null) parts.push(isIS ? `${Math.round(a)} stoðsendingar` : `${Math.round(a)} assists`);
    secondary = parts.length ? parts.join(" · ") : null;
  }
  return { primary, secondary };
}

/** Metric keys that are player PROFILE / market data, not on-pitch performance —
 *  excluded from the player-facing "all stats" details view. */
export const PROFILE_METRIC_KEYS = new Set<string>([
  "Age", "Birth country", "Passport country", "Foot", "Height", "Weight",
  "Market value", "Contract expires", "On loan", "Position", "Matches played",
  "Team within selected timeframe",
]);

/**
 * Position-aware player-facing BASKETBALL stats.
 *
 * The basketball sibling of playerFootballStats: same shapes (StatDef → curated,
 * formatted, bilingual list), same rules (descriptive only — NEVER touches the
 * readiness colour or the daily decision; missing value → "–" never 0; jargon
 * behind tooltips). Basketball is far less position-divergent than football
 * (everyone scores/rebounds), so the tailoring is emphasis: a shared core plus a
 * light per-family tilt across three families (GUARD / WING / BIG).
 *
 * Counting stats are per-game (how basketball is read); shooting stats are %.
 * Values live in the source-agnostic `metrics` jsonb (a box-score import), except
 * minutes which is the shared typed `core.minutes`.
 */

import type { FootballStatInput, PlayerFootballStat } from "../playerFootballStats";

// Reuse the football input/output shapes verbatim so the sport dispatcher can
// treat both catalogs uniformly.
export type SportStatInput = FootballStatInput;
export type PlayerBasketballStat = PlayerFootballStat;

export type BasketballFamily = "GUARD" | "WING" | "BIG";

type Fmt = "int" | "dec1" | "dec2" | "pct";

type StatDef = {
  id: string;
  en: string;
  is: string;
  /** Reads the shared typed core (only `minutes` is used for basketball). */
  core?: "minutes";
  /** Reads a key from the box-score `metrics` jsonb. */
  metric?: string;
  fmt: Fmt;
  tipEn?: string;
  tipIs?: string;
  higherIsBetter?: boolean;
};

// ── Position → family ───────────────────────────────────────────────────────
const CODE_TO_FAMILY: Record<string, BasketballFamily> = {
  PG: "GUARD", SG: "GUARD", G: "GUARD", CG: "GUARD", PGSG: "GUARD",
  SF: "WING", F: "WING", GF: "WING", SGSF: "WING", WING: "WING", W: "WING",
  PF: "BIG", C: "BIG", FC: "BIG", PFC: "BIG", CF: "BIG", BIG: "BIG",
};

export function basketballPositionFamily(pos: string | null | undefined): BasketballFamily {
  const raw = (pos ?? "").toUpperCase();
  if (!raw.trim()) return "WING"; // balanced default
  const code = raw.split(/[,/|\s-]+/)[0].replace(/[^A-Z]/g, "");
  if (CODE_TO_FAMILY[code]) return CODE_TO_FAMILY[code];
  // Keyword fallback — check the specific codes before the generic letters.
  if (code.includes("PF") || code === "C" || code.includes("CENTER") || code.includes("CENTRE")) return "BIG";
  if (code.includes("PG") || code.includes("SG") || code.includes("GUARD") || code.endsWith("G")) return "GUARD";
  if (code.includes("SF") || code.includes("FORWARD") || code.includes("F")) return "WING";
  return "WING";
}

// ── Stat catalog ────────────────────────────────────────────────────────────
const CATALOG: Record<string, StatDef> = {
  games:    { id: "games",    en: "Games",        is: "Leikir",              metric: "Games", fmt: "int" },
  minutes:  { id: "minutes",  en: "Minutes",      is: "Mínútur",             core: "minutes", fmt: "int" },
  points:   { id: "points",   en: "Points",       is: "Stig",                metric: "Points per game", fmt: "dec1" },
  rebounds: { id: "rebounds", en: "Rebounds",     is: "Fráköst",             metric: "Rebounds per game", fmt: "dec1" },
  assists:  { id: "assists",  en: "Assists",      is: "Stoðsendingar",       metric: "Assists per game", fmt: "dec1" },
  fgPct:    { id: "fgPct",    en: "Field goal %", is: "Vallarskot %",        metric: "Field goals %", fmt: "pct",
              tipEn: "Share of field-goal attempts (2s + 3s) that scored.",
              tipIs: "Hlutfall vallarskota (2ja + 3ja stiga) sem rötuðu í körfu." },

  threePct: { id: "threePct", en: "3-point %",    is: "3ja stiga %",         metric: "Three-point %", fmt: "pct" },
  ftPct:    { id: "ftPct",    en: "Free throw %", is: "Vítaskot %",          metric: "Free throws %", fmt: "pct" },
  steals:   { id: "steals",   en: "Steals",       is: "Stolnir boltar",      metric: "Steals per game", fmt: "dec1" },
  astTo:    { id: "astTo",    en: "Assist-to-turnover", is: "Stoðs./tapaðir", metric: "Assist to turnover", fmt: "dec2",
              tipEn: "Assists divided by turnovers — a floor-general's care with the ball. Above 2.0 is strong.",
              tipIs: "Stoðsendingar deilt með töpuðum boltum — hversu vel spilastjóri fer með boltann. Yfir 2,0 er sterkt." },
  ts:       { id: "ts",       en: "True shooting %", is: "Raunskotnýting %", metric: "True shooting %", fmt: "pct",
              tipEn: "Scoring efficiency that counts 2s, 3s and free throws together — the fairest single shooting number.",
              tipIs: "Skorunar-nýting sem telur 2ja, 3ja stiga og vítaskot saman — sanngjarnasta staka skottalan." },
  efficiency: { id: "efficiency", en: "Efficiency", is: "Nýtingarstig",      metric: "Efficiency", fmt: "dec1",
              tipEn: "A single box-score value combining scoring, rebounds, assists, steals and blocks, minus misses and turnovers.",
              tipIs: "Ein tala úr leikjatölum sem sameinar skorun, fráköst, stoðsendingar, stolna og varin skot, mínus klúður og tapaða bolta." },
  turnovers: { id: "turnovers", en: "Turnovers",  is: "Tapaðir boltar",      metric: "Turnovers per game", fmt: "dec1", higherIsBetter: false },
  offReb:   { id: "offReb",   en: "Off. rebounds", is: "Sóknarfráköst",      metric: "Offensive rebounds per game", fmt: "dec1" },
  defReb:   { id: "defReb",   en: "Def. rebounds", is: "Varnarfráköst",      metric: "Defensive rebounds per game", fmt: "dec1" },
  blocks:   { id: "blocks",   en: "Blocks",       is: "Varin skot",          metric: "Blocks per game", fmt: "dec1" },
};

// Shared core for every player.
const CORE = ["games", "minutes", "points", "rebounds", "assists", "fgPct"];

// Per-family tilt (≈6 each ⇒ ~12 total with the core, no duplicates of core).
const EXTRAS: Record<BasketballFamily, string[]> = {
  GUARD: ["threePct", "ftPct", "steals", "astTo", "ts", "efficiency"],
  WING:  ["threePct", "ftPct", "steals", "offReb", "ts", "efficiency"],
  BIG:   ["offReb", "defReb", "blocks", "turnovers", "ftPct", "efficiency"],
};

export function basketballStatIdsForPosition(pos: string | null | undefined): string[] {
  return [...CORE, ...EXTRAS[basketballPositionFamily(pos)]];
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
    case "pct": return `${Math.round(value)}%`;
  }
}

function readValue(def: StatDef, input: SportStatInput): number | null {
  if (def.core) return toNum(input.core[def.core]);
  if (def.metric) return toNum(input.metrics[def.metric]);
  return null;
}

export function pickBasketballStats(
  input: SportStatInput,
  position: string | null | undefined,
  lang: "EN" | "IS",
): PlayerBasketballStat[] {
  const isIS = lang === "IS";
  return basketballStatIdsForPosition(position).map((id) => {
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

/** A short, positive, plain headline for the top of the card (Layer 0). */
export function basketballSeasonHeadline(
  input: SportStatInput,
  position: string | null | undefined,
  lang: "EN" | "IS",
): { primary: string; secondary: string | null } {
  const isIS = lang === "IS";
  const games = toNum(input.metrics["Games"]);
  const minutes = toNum(input.core.minutes);
  const g = games != null ? Math.round(games) : null;
  const mn = minutes != null ? Math.round(minutes) : null;
  const primary = isIS
    ? `${g ?? "–"} leikir · ${mn != null ? mn.toLocaleString() : "–"} mínútur`
    : `${g ?? "–"} games · ${mn != null ? mn.toLocaleString() : "–"} minutes`;

  const pts = toNum(input.metrics["Points per game"]);
  const reb = toNum(input.metrics["Rebounds per game"]);
  const ast = toNum(input.metrics["Assists per game"]);
  const parts: string[] = [];
  const f1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString();
  if (pts != null) parts.push(isIS ? `${f1(pts)} stig` : `${f1(pts)} pts`);
  if (reb != null) parts.push(isIS ? `${f1(reb)} fráköst` : `${f1(reb)} reb`);
  if (ast != null) parts.push(isIS ? `${f1(ast)} stoðs.` : `${f1(ast)} ast`);
  return { primary, secondary: parts.length ? parts.join(" · ") : null };
}

/** Box-score profile / bio keys excluded from the on-court "all stats" view. */
export const BASKETBALL_PROFILE_METRIC_KEYS = new Set<string>([
  "Age", "Height", "Weight", "Birth country", "Nationality", "Position",
  "Games", "Games started", "Team", "Jersey", "Number",
]);

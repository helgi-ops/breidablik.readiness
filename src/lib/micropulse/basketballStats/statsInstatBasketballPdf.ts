/**
 * InStat (Hudl) basketball Game Report PDF — deterministic TEAM-level extractor.
 *
 * Scope by design: the PDF adapter owns the TEAM tables the per-player CSV export
 * does not carry — team box score, per-quarter splits, offensive efficiency, and
 * the Four Factors computed from them. Per-PLAYER numbers come from the CSV adapter
 * (statsInstatBasketballCsv); the PDF's per-player appendix serialises with
 * concatenated cells that only an AI read parses reliably, so we deliberately do
 * not parse it here — deterministic-where-deterministic, exactly like the football
 * StatsBomb split (page-4 team line parsed, per-player appendix left to the model).
 *
 * Text comes from `pdf-parse` (the repo's PDF text layer). Its serialisation for the
 * Teams-stats page is line-oriented and stable:
 *   counting rows      →  "POINTS 86 88"      (label + own + opp on one line)
 *   per-quarter rows   →  "1 period 26 23"
 *   shooting rows      →  "FIELD GOALS 33 - 66" \n "50%" \n "27 - 56" \n "48%"
 *
 * Purely descriptive — NEVER touches the readiness colour, load, or daily decision.
 */

import type { BasketballAdvancedMetrics, BasketballBoxScoreRow, BasketballTeamMatchRow } from "./types";
import { INSTAT_SOURCE, type InstatIngestContext } from "./statsInstatBasketball";

// ── value helpers ────────────────────────────────────────────────────────────

/** A cell → number | null. "-"/blank is unknown (null), never 0. Strips %. */
function n(tok: string | undefined | null): number | null {
  if (tok == null) return null;
  const t = tok.trim();
  if (t === "" || t === "-") return null;
  const v = Number(t.replace(/%/g, "").replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

/** "33 - 66" → {m:33,a:66}; anything else → nulls. */
function ma(tok: string): { m: number | null; a: number | null } {
  const m = tok.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  return m ? { m: Number(m[1]), a: Number(m[2]) } : { m: null, a: null };
}

/** Normalise a label: lower-case, drop the InStat "*" caveat + trailing dots. */
function normLabel(s: string): string {
  return s.toLowerCase().replace(/\*/g, "").replace(/\s+/g, " ").replace(/\.+$/, "").trim();
}

/** A counting line "label a b" → { label, own, opp }, else null. */
function countLine(line: string): { label: string; own: number | null; opp: number | null } | null {
  const m = line.match(/^(.*?)\s+(-?\d+|-)\s+(-?\d+|-)$/);
  if (!m) return null;
  return { label: normLabel(m[1]), own: n(m[2]), opp: n(m[3]) };
}

/** A shooting header "label M - A" → { label, own:{m,a} }, else null. */
function shotHeader(line: string): { label: string; own: { m: number | null; a: number | null } } | null {
  const m = line.match(/^(.*?)\s+(\d+)\s*-\s*(\d+)$/);
  if (!m) return null;
  return { label: normLabel(m[1]), own: { m: Number(m[2]), a: Number(m[3]) } };
}

// ── parsed shapes ────────────────────────────────────────────────────────────

export type InstatGameReportMeta = {
  date: string | null;        // ISO yyyy-mm-dd
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
};

type Quarter = { own: number | null; opp: number | null };
type QuarterMA = { own: { m: number | null; a: number | null }; opp: { m: number | null; a: number | null } };

type SideMA = { own: { m: number | null; a: number | null }; opp: { m: number | null; a: number | null } };

/** One team's raw parsed line (own = this team, opp = the other). */
export type InstatTeamParse = {
  points: Quarter; pointsByQ: Quarter[];
  fg: QuarterMA; fgByQ: QuarterMA[];
  tp: QuarterMA; tpByQ: QuarterMA[];
  reb: Quarter; rebByQ: Quarter[];
  tov: Quarter; tovByQ: Quarter[];
  stl: Quarter; stlByQ: Quarter[];
  oreb: Quarter; dreb: Quarter;
  assists: Quarter; blocks: Quarter; fouls: Quarter;
  ft: { own: { m: number | null; a: number | null }; opp: { m: number | null; a: number | null } };
  possessions: Quarter;
  pointsOffTo: Quarter; paintPts: Quarter; secondChancePts: Quarter; transitionPts: Quarter;
  // Tactical extras (jsonb) — how each side scores. Made/attempted per type.
  playtypes: Record<string, SideMA>;
  effShots: Record<string, SideMA>;
};

/** FG-playtype rows (bounded to the "FG Playtypes" section). */
const PLAYTYPE_LABELS: Record<string, string> = {
  "pick`n`rolls handler": "pnrHandler", "pick`n`rolls roller": "pnrRoller",
  "catch and shoots": "catchShoot", "catch and drives": "catchDrive",
  "screen offs": "screenOff", "post ups": "postUp", "transitions": "transition",
  "isolations": "iso", "hand offs": "handOff", "cuts": "cut", "putbacks": "putback",
  "uncontested fg": "uncontestedFg", "contested fg": "contestedFg",
};
/** Offensive-efficiency shooting rows (bounded to the efficiency section). */
const EFF_SHOT_LABELS: Record<string, string> = {
  "positional attacks": "positional", "transitions": "transitionShot",
  "baseline out of bounds": "blob", "sideline out of bounds": "slob",
};

/** Parse labelled shooting rows (own on the label line, opp on the next standalone
 *  M-A line) within [start,end). Tolerant of "-" (null). For jsonb extras. */
function parseTypedShots(lines: string[], start: number, end: number, labels: Record<string, string>): Record<string, SideMA> {
  const out: Record<string, SideMA> = {};
  const labelKeys = Object.keys(labels);
  // A shot row's value is a made-attempted cell, an empty "-", or blank. Anything
  // else (e.g. "positional attacks POINTS 65 56") is a different, longer-labelled
  // line that only shares the prefix — it must NOT match, or it clobbers the real
  // "positional attacks 44 - 77" row.
  const isShotRest = (rest: string): boolean => rest === "" || rest === "-" || /^\d+\s*-\s*\d+$/.test(rest);
  const matchLabel = (norm: string): string | null =>
    labelKeys.find((lab) => (norm === lab || norm.startsWith(lab + " ")) && isShotRest(norm.slice(lab.length).trim())) ?? null;
  for (let i = Math.max(0, start); i < Math.min(end, lines.length); i++) {
    const norm = normLabel(lines[i]);
    const lab = matchLabel(norm);
    if (!lab) continue;
    const own = ma(norm.slice(lab.length).trim());
    let opp: { m: number | null; a: number | null } = { m: null, a: null };
    for (let j = i + 1; j < Math.min(end, i + 5); j++) {
      const lj = lines[j].trim();
      if (/^\d+\s*-\s*\d+$/.test(lj)) { opp = ma(lj); break; }
      if (lj === "-") break;
      if (matchLabel(normLabel(lines[j]))) break;
    }
    out[labels[lab]] = { own, opp };
  }
  return out;
}

export type InstatGameReportParse = { meta: InstatGameReportMeta; team: InstatTeamParse };

// ── per-player "Field goals" table (p5 / p8) ──────────────────────────────────
//
// The p3–4 "Player stats" box-score appendix serialises with each cell on its own
// line (see header note) — not deterministically parseable. But the p5/p8
// "Field goals. <Team>" table is DIFFERENT: it is one clean line per player,
//
//   32Nogues 22:57 2 1 - 3 1 - 2 0 - 1 1 - 1 1 - 1 - 0 - 1 0 - 1 -
//   └jersey┘└name┘ └min┘ pts └FG─┘ └2pt┘ └3pt┘ └paint┘└<2m┘ <4m └<3L┘ 3<8m >8m
//
// carrying per-player identity AND the shot-zone / distance bands in one row.
// Each shot cell is either "N - N" (made-attempted) or a lone "-" (empty).

/** One made/attempted shot cell. */
export type MA = { m: number | null; a: number | null };

/** A player's row from the p5/p8 "Field goals" table: identity + zone shooting. */
export type InstatPlayerShooting = {
  jersey: number | null;
  name: string;
  minutes: number | null;     // decimal minutes (MM:SS → mm + ss/60, 0.1-rounded)
  points: number | null;
  fg: MA; twoPt: MA; threePt: MA;
  // Distance / court-zone bands (the "shot chart" data in text form).
  inPaint: MA; fgUnder2m: MA; fgUnder4m: MA; under3ptLine: MA; threeUnder8m: MA; threeOver8m: MA;
};

/** Per-team lists keyed by the team name printed in the "Field goals. <Team>" header. */
export type InstatPlayerShootingParse = { teamName: string; players: InstatPlayerShooting[] };

/** "22:57" → 22.95 (decimal minutes, 0.1-rounded); null when not MM:SS. */
function mmssToMinutes(s: string): number | null {
  const m = s.trim().match(/^(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  const mins = Number(m[1]) + Number(m[2]) / 60;
  return Math.round(mins * 10) / 10;
}

/**
 * Consume the cell stream after the minutes column into points + 9 shot cells.
 * A filled cell starts with a digit ("N" then "-" then "N"); an empty cell is a
 * lone "-". This disambiguates the two uses of "-" without column alignment.
 */
function parseShootingCells(rest: string): { points: number | null; cells: MA[] } | null {
  const tok = rest.trim().split(/\s+/).filter((x) => x.length > 0);
  if (!tok.length) return null;
  let i = 0;
  const points = tok[i] === "-" ? null : n(tok[i]);
  i += 1;
  const cells: MA[] = [];
  while (cells.length < 9 && i < tok.length) {
    if (/^\d+$/.test(tok[i]) && tok[i + 1] === "-" && /^\d+$/.test(tok[i + 2] ?? "")) {
      cells.push({ m: Number(tok[i]), a: Number(tok[i + 2]) });
      i += 3;
    } else if (tok[i] === "-") {
      cells.push({ m: null, a: null });
      i += 1;
    } else {
      // Unexpected token — stop rather than mis-align the remaining cells.
      break;
    }
  }
  // Pad any missing trailing cells as empty (a short row = trailing blanks).
  while (cells.length < 9) cells.push({ m: null, a: null });
  return { points, cells };
}

/** Header line of the FG table: has Minutes, Points, In paint, 3-pt distance bands. */
function isPlayerFgHeader(line: string): boolean {
  const l = line.toLowerCase();
  return l.includes("minutes") && l.includes("points") && l.includes("in paint") && l.includes("< 2m");
}

/**
 * Parse the p5/p8 "Field goals. <Team>" per-player tables. Returns one entry per
 * team (in report order: home team first). Descriptive only.
 */
export function parseInstatPlayerShooting(text: string): InstatPlayerShootingParse[] {
  const lines = text.split("\n").map((s) => s.replace(/ /g, " ")).map((s) => s.trimEnd());
  const out: InstatPlayerShootingParse[] = [];
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i].trim();
    const nameMatch = header.match(/^field goals\.\s+(.+)$/i);
    if (!nameMatch) continue;
    // Find the column header within the next few lines; skip if not this kind of table.
    let h = -1;
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      if (isPlayerFgHeader(lines[j])) { h = j; break; }
    }
    if (h < 0) continue;
    const players: InstatPlayerShooting[] = [];
    for (let k = h + 1; k < lines.length; k++) {
      const raw = lines[k].trim();
      if (!raw) continue;
      // Stop at the next section (spots-on-map, dynamics, or the next FG table).
      if (/^field goals/i.test(raw) || /spots on map|zone efficiency|match dynamics/i.test(raw)) break;
      const row = raw.match(/^(\d{1,2})(\D.*?)\s+(\d{1,3}:\d{2})\s+(.+)$/);
      if (!row) continue;
      const parsed = parseShootingCells(row[4]);
      if (!parsed) continue;
      const [fg, twoPt, threePt, inPaint, fgUnder2m, fgUnder4m, under3ptLine, threeUnder8m, threeOver8m] = parsed.cells;
      players.push({
        jersey: Number(row[1]),
        name: row[2].trim(),
        minutes: mmssToMinutes(row[3]),
        points: parsed.points,
        fg, twoPt, threePt, inPaint, fgUnder2m, fgUnder4m, under3ptLine, threeUnder8m, threeOver8m,
      });
    }
    if (players.length) out.push({ teamName: nameMatch[1].trim(), players });
  }
  return out;
}

// ── fingerprint ──────────────────────────────────────────────────────────────

/** True for an InStat basketball Game Report text layer. */
export function isInstatGameReportText(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("teams stats") &&
    t.includes("box score") &&
    (t.includes("offensive efficiency") || t.includes("fg playtypes")) &&
    /\d\s+period/.test(t) // per-quarter splits are the InStat tell
  );
}

// ── title ────────────────────────────────────────────────────────────────────

/** "10.05.2026. Valencia BC 86:88 Bitci Baskonia" → meta. */
export function parseInstatTitle(line: string): InstatGameReportMeta | null {
  const m = line.match(/^\s*(\d{2})\.(\d{2})\.(\d{4})\.\s+(.+?)\s+(\d+):(\d+)\s+(.+?)\s*$/);
  if (!m) return null;
  const [, dd, mm, yyyy, home, hs, as, away] = m;
  return {
    date: `${yyyy}-${mm}-${dd}`,
    home: home.trim(),
    away: away.trim(),
    homeScore: Number(hs),
    awayScore: Number(as),
  };
}

// ── team-stats parse ─────────────────────────────────────────────────────────

const FLAT_COUNT_LABELS = {
  "offensive rebounds": "oreb",
  "defensive rebounds": "dreb",
  assists: "assists",
  blocks: "blocks",
  fouls: "fouls",
  "possessions, number": "possessions",
  "points off turnovers": "pointsOffTo",
  "paint points": "paintPts",
  "second chance points": "secondChancePts",
  "transition points": "transitionPts",
} as const;

/**
 * Parse the Teams-stats page into one team's line (own vs opp columns). The
 * report's own team is the HOME side of the box-score columns (VAL first, BAS
 * second); the mapper decides which is our club from ctx.
 */
export function parseInstatTeamStatsText(text: string): InstatGameReportParse | null {
  const lines = text.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
  const titleLine = lines.find((l) => parseInstatTitle(l));
  const meta = titleLine ? parseInstatTitle(titleLine) : null;
  if (!meta) return null;

  const empty: Quarter = { own: null, opp: null };
  const emptyMA: QuarterMA = { own: { m: null, a: null }, opp: { m: null, a: null } };
  const t: InstatTeamParse = {
    points: { ...empty }, pointsByQ: [],
    fg: { ...emptyMA }, fgByQ: [],
    tp: { ...emptyMA }, tpByQ: [],
    reb: { ...empty }, rebByQ: [],
    tov: { ...empty }, tovByQ: [],
    stl: { ...empty }, stlByQ: [],
    oreb: { ...empty }, dreb: { ...empty },
    assists: { ...empty }, blocks: { ...empty }, fouls: { ...empty },
    ft: { own: { m: null, a: null }, opp: { m: null, a: null } },
    possessions: { ...empty },
    pointsOffTo: { ...empty }, paintPts: { ...empty }, secondChancePts: { ...empty }, transitionPts: { ...empty },
    playtypes: {}, effShots: {},
  };

  // Bound the core box-score walk (POINTS … "2 and one") so the FG-playtypes and
  // per-player leaderboards below never desync the shooting cursor.
  const boxStart = lines.findIndex((l) => /^box score$/i.test(l));
  const effStart = lines.findIndex((l) => /^offensive efficiency$/i.test(l));
  const end = effStart > 0 ? effStart : lines.length;

  type Section = "POINTS" | "FG" | "TP" | "REB" | "TOV" | "STL" | null;
  let section: Section = null;
  const readMAtriplet = (i: number): { opp: { m: number | null; a: number | null }; next: number } => {
    // after a shooting header at i: i+1 own%, i+2 opp "M - A", i+3 opp%
    const oppMA = ma(lines[i + 2] ?? "");
    return { opp: oppMA, next: i + 3 };
  };

  for (let i = Math.max(boxStart, 0) + 1; i < end; i++) {
    const line = lines[i];
    const period = line.match(/^([1-4]) period\b(.*)$/);

    // ── per-quarter rows ──
    if (period) {
      const q = Number(period[1]) - 1;
      if (section === "POINTS" || section === "REB" || section === "TOV" || section === "STL") {
        const c = countLine(line);
        const cell = { own: c?.own ?? null, opp: c?.opp ?? null };
        if (section === "POINTS") t.pointsByQ[q] = cell;
        else if (section === "REB") t.rebByQ[q] = cell;
        else if (section === "TOV") t.tovByQ[q] = cell;
        else t.stlByQ[q] = cell;
      } else if (section === "FG" || section === "TP") {
        const own = ma(period[2].trim());
        const { opp, next } = readMAtriplet(i);
        const cell = { own, opp };
        if (section === "FG") t.fgByQ[q] = cell;
        else t.tpByQ[q] = cell;
        i = next;
      }
      continue;
    }

    // ── counting section headers (with quarters) ──
    const c = countLine(line);
    if (c && (c.label === "points" || c.label === "rebounds" || c.label === "turnovers" || c.label === "steals")) {
      const cell = { own: c.own, opp: c.opp };
      if (c.label === "points") { t.points = cell; section = "POINTS"; }
      else if (c.label === "rebounds") { t.reb = cell; section = "REB"; }
      else if (c.label === "turnovers") { t.tov = cell; section = "TOV"; }
      else { t.stl = cell; section = "STL"; }
      continue;
    }

    // ── flat counting labels ──
    if (c && c.label in FLAT_COUNT_LABELS) {
      const key = FLAT_COUNT_LABELS[c.label as keyof typeof FLAT_COUNT_LABELS];
      (t as unknown as Record<string, Quarter>)[key] = { own: c.own, opp: c.opp };
      section = null;
      continue;
    }

    // ── shooting section headers ──
    const s = shotHeader(line);
    if (s && (s.label === "field goals" || s.label === "3-pt field goals" || s.label === "free throws")) {
      const { opp, next } = readMAtriplet(i);
      if (s.label === "field goals") { t.fg = { own: s.own, opp }; section = "FG"; }
      else if (s.label === "3-pt field goals") { t.tp = { own: s.own, opp }; section = "TP"; }
      else { t.ft = { own: s.own, opp }; section = null; }
      i = next;
      continue;
    }
  }

  // Offensive-efficiency flat counts live below the box score; grab by label.
  for (let i = end; i < lines.length; i++) {
    const c = countLine(lines[i]);
    if (!c) continue;
    if (c.label in FLAT_COUNT_LABELS) {
      const key = FLAT_COUNT_LABELS[c.label as keyof typeof FLAT_COUNT_LABELS];
      if (key === "possessions" || key === "pointsOffTo" || key === "paintPts" || key === "secondChancePts" || key === "transitionPts") {
        (t as unknown as Record<string, Quarter>)[key] = { own: c.own, opp: c.opp };
      }
    }
  }

  // Tactical shot rows — bounded so the "transitions" label can't cross sections.
  const idxOf = (re: RegExp) => lines.findIndex((l) => re.test(l));
  const effStart2 = idxOf(/^offensive efficiency$/i);
  const playStart = idxOf(/^fg playtypes$/i);
  if (effStart2 >= 0 && playStart > effStart2) t.effShots = parseTypedShots(lines, effStart2, playStart, EFF_SHOT_LABELS);
  if (playStart >= 0) {
    const playEnd = lines.findIndex((l, i) => i > playStart && /^field goals$/i.test(l));
    t.playtypes = parseTypedShots(lines, playStart, playEnd > playStart ? playEnd : playStart + 60, PLAYTYPE_LABELS);
  }

  return { meta, team: t };
}

// ── Four Factors + row mapping ───────────────────────────────────────────────

const pct = (x: number | null, y: number | null): number | null =>
  x != null && y != null && y !== 0 ? Math.round((x / y) * 1000) / 10 : null;
const ratio = (x: number | null, y: number | null): number | null =>
  x != null && y != null && y !== 0 ? Math.round((x / y) * 1000) / 1000 : null;

/** Dean Oliver Four Factors + efficiency for one side, from its own line and the
 *  opponent's rebound totals. All descriptive, all cited to source='instat'. */
export function fourFactors(
  own: { fgm: number | null; fga: number | null; tpm: number | null; ftm: number | null; tov: number | null; oreb: number | null; dreb: number | null; points: number | null; possessions: number | null },
  opp: { oreb: number | null; dreb: number | null },
): BasketballAdvancedMetrics {
  const efg = own.fgm != null && own.tpm != null && own.fga ? Math.round(((own.fgm + 0.5 * own.tpm) / own.fga) * 1000) / 10 : null;
  return {
    efgPct: efg,
    toPct: pct(own.tov, own.possessions),
    orebPct: pct(own.oreb, own.oreb != null && opp.dreb != null ? own.oreb + opp.dreb : null),
    drebPct: pct(own.dreb, own.dreb != null && opp.oreb != null ? own.dreb + opp.oreb : null),
    ftf: pct(own.ftm, own.fga),
    ppp: ratio(own.points, own.possessions),
  };
}

/** ISO date "10.05.2026" already normalised in meta; foldable team-name compare. */
function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

/**
 * Which side is our club. An explicit ctx.ownerIsHome wins; else fold-match the
 * owner name against each side (equal or either-way substring). Flip to AWAY only
 * on a confident away-only match; otherwise default HOME (predictable), and the
 * caller overrides in the preview when the names don't line up. Shared by the team
 * and per-player mappers so both agree on which side is ours.
 */
export function resolveOwnerIsHome(meta: InstatGameReportMeta, ctx: InstatIngestContext): boolean {
  if (typeof ctx.ownerIsHome === "boolean") return ctx.ownerIsHome;
  const fOwner = ctx.ownerTeamName ? fold(ctx.ownerTeamName) : "";
  const sideMatch = (name: string): boolean => {
    const f = fold(name);
    return !!fOwner && (f === fOwner || f.includes(fOwner) || fOwner.includes(f));
  };
  const matchesHome = sideMatch(meta.home);
  const matchesAway = sideMatch(meta.away);
  return matchesAway && !matchesHome ? false : true;
}

/**
 * Map a parsed Game Report into team rows: both sides, full game + per quarter.
 * `is_opponent` is set from ctx (which side is our club); default HOME = ours.
 */
export function instatTeamMatchRows(parse: InstatGameReportParse, ctx: InstatIngestContext): BasketballTeamMatchRow[] {
  const { meta, team: t } = parse;
  const rows: BasketballTeamMatchRow[] = [];

  // Which side is our club (shared with the per-player mapper).
  const ownerIsHome = resolveOwnerIsHome(meta, ctx);

  // side 'home' reads the .own column, 'away' reads the .opp column.
  const build = (side: "home" | "away") => {
    const k = side === "home" ? "own" : "opp";
    const other = side === "home" ? "opp" : "own";
    const g = (q: { own: number | null; opp: number | null }) => q[k];
    const gm = (q: { own: { m: number | null; a: number | null }; opp: { m: number | null; a: number | null } }) => q[k];

    const fgm = gm(t.fg).m, fga = gm(t.fg).a;
    const tpm = gm(t.tp).m, tpa = gm(t.tp).a;
    const ftm = t.ft[k].m, fta = t.ft[k].a;
    const points = g(t.points);
    const oreb = g(t.oreb), dreb = g(t.dreb), reb = g(t.reb);
    const tov = g(t.tov), possessions = g(t.possessions);

    // Tactical shot tables (this side's column) → advanced.extra, so the FG
    // Playtypes and offensive-efficiency shooting survive to the team store and
    // can be surfaced. Keys are "pt_<type>_m/a" (playtypes) and "eff_<type>_m/a".
    const sideShots = (rec: Record<string, SideMA>, prefix: string): Record<string, number | null> => {
      const out: Record<string, number | null> = {};
      for (const [key, v] of Object.entries(rec)) {
        out[`${prefix}_${key}_m`] = v[k].m;
        out[`${prefix}_${key}_a`] = v[k].a;
      }
      return out;
    };
    const extra = { ...sideShots(t.playtypes, "pt"), ...sideShots(t.effShots, "eff") };

    const advanced: BasketballAdvancedMetrics = {
      ...fourFactors(
        { fgm, fga, tpm, ftm, tov, oreb, dreb, points, possessions },
        { oreb: t.oreb[other], dreb: t.dreb[other] },
      ),
      pointsOffTo: g(t.pointsOffTo),
      secondChancePts: g(t.secondChancePts),
      pointsInPaint: g(t.paintPts),
      fastbreakPts: g(t.transitionPts),
      ...(Object.keys(extra).length ? { extra } : {}),
    };

    const isOpponent = side === "home" ? !ownerIsHome : ownerIsHome;
    const teamName = side === "home" ? meta.home : meta.away;
    const opponentName = side === "home" ? meta.away : meta.home;

    // Full-game row.
    rows.push({
      ownerTeamId: ctx.ownerTeamId,
      matchRef: ctx.matchRef,
      matchDate: ctx.matchDate ?? meta.date,
      opponent: opponentName,
      isOpponent,
      period: "game",
      points,
      possessions,
      fgm, fga, tpm, tpa, ftm, fta,
      oreb, dreb, reb,
      assists: g(t.assists), steals: g(t.stl), blocks: g(t.blocks),
      turnovers: tov, fouls: g(t.fouls),
      advanced,
      stats: { teamName },
      source: INSTAT_SOURCE,
      sourceRef: ctx.matchRef,
    });

    // Per-quarter rows (box counts only — quarter possessions aren't reported).
    for (let q = 0; q < 4; q++) {
      const fgQ = t.fgByQ[q]?.[k] ?? { m: null, a: null };
      const tpQ = t.tpByQ[q]?.[k] ?? { m: null, a: null };
      rows.push({
        ownerTeamId: ctx.ownerTeamId,
        matchRef: ctx.matchRef,
        matchDate: ctx.matchDate ?? meta.date,
        opponent: opponentName,
        isOpponent,
        period: (["q1", "q2", "q3", "q4"] as const)[q],
        points: t.pointsByQ[q]?.[k] ?? null,
        fgm: fgQ.m, fga: fgQ.a, tpm: tpQ.m, tpa: tpQ.a,
        reb: t.rebByQ[q]?.[k] ?? null,
        turnovers: t.tovByQ[q]?.[k] ?? null,
        steals: t.stlByQ[q]?.[k] ?? null,
        source: INSTAT_SOURCE,
        sourceRef: ctx.matchRef,
        stats: { teamName },
      });
    }
  };

  build("home");
  build("away");
  return rows;
}

/**
 * Buffer (uploaded Game Report PDF) → normalized team rows. Dynamic-imports
 * `pdf-parse` (the repo's PDF text layer, same as the football match-report path).
 * Returns [] if the text layer isn't an InStat Game Report.
 */
/**
 * Map the OWNER side's per-player "Field goals" table into per-player box-score
 * rows (source='instat'), with the shot-zone / distance bands preserved in
 * `advanced.extra`. Player identity is name-folded to a stable `sourcePlayerRef`
 * (`instat:<lower name>`, matching the CSV adapter) so the same downstream
 * name-mapping resolves both feeds; `playerId` stays null until resolved.
 *
 * Only the owner side is emitted — opponent per-player scouting is Phase B. The
 * owner team is chosen with the same resolver as the team rows, and matched to a
 * "Field goals. <Team>" block by name (report order = home first as a fallback).
 * Numbers are the FG-table's (points, FG, 2pt, 3pt + zones); fuller box lines
 * (assists, rebounds, …) come from the CSV adapter.
 */
export function instatPlayerShootingRows(
  shooting: InstatPlayerShootingParse[],
  meta: InstatGameReportMeta,
  ctx: InstatIngestContext,
): BasketballBoxScoreRow[] {
  if (!shooting.length) return [];
  const ownerIsHome = resolveOwnerIsHome(meta, ctx);
  const ownerName = ownerIsHome ? meta.home : meta.away;
  const opponentName = ownerIsHome ? meta.away : meta.home;
  // Match the owner's FG block by folded name; fall back to report order (home first).
  const byName = shooting.find((s) => fold(s.teamName) === fold(ownerName))
    ?? shooting.find((s) => fold(s.teamName).includes(fold(ownerName)) || fold(ownerName).includes(fold(s.teamName)))
    ?? shooting[ownerIsHome ? 0 : Math.min(1, shooting.length - 1)];
  if (!byName) return [];

  const num = (v: number | null): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return byName.players.map((p): BasketballBoxScoreRow => {
    const extra: Record<string, number | string | null> = {
      jersey: p.jersey,
      two_pt_m: p.twoPt.m, two_pt_a: p.twoPt.a,
      zone_paint_m: p.inPaint.m, zone_paint_a: p.inPaint.a,
      zone_fg_lt2m_m: p.fgUnder2m.m, zone_fg_lt2m_a: p.fgUnder2m.a,
      zone_fg_lt4m_m: p.fgUnder4m.m, zone_fg_lt4m_a: p.fgUnder4m.a,
      zone_under_3pt_line_m: p.under3ptLine.m, zone_under_3pt_line_a: p.under3ptLine.a,
      zone_3pt_lt8m_m: p.threeUnder8m.m, zone_3pt_lt8m_a: p.threeUnder8m.a,
      zone_3pt_gt8m_m: p.threeOver8m.m, zone_3pt_gt8m_a: p.threeOver8m.a,
    };
    return {
      teamId: ctx.ownerTeamId,
      playerId: null,
      gameId: ctx.matchRef,
      gameDate: ctx.matchDate ?? meta.date ?? "",
      opponent: opponentName,
      homeAway: ownerIsHome ? "home" : "away",
      minutes: num(p.minutes),
      points: num(p.points),
      fgm: num(p.fg.m), fga: num(p.fg.a),
      tpm: num(p.threePt.m), tpa: num(p.threePt.a),
      advanced: { extra },
      stats: { ...extra, minutes: p.minutes, points: p.points, fgm: p.fg.m, fga: p.fg.a, tpm: p.threePt.m, tpa: p.threePt.a },
      source: INSTAT_SOURCE,
      sourceRef: ctx.matchRef,
      sourcePlayerRef: `${INSTAT_SOURCE}:${p.name.toLowerCase().trim()}`,
      playerName: p.name,
    };
  });
}

// ── Shot map: 3 court regions (Paint / Mid-range / 3PT) ───────────────────────
//
// The InStat "zone efficiency" IMAGE has 11 spatial zones, but their positions
// live only in the image and the zone COUNT varies per team (empty zones are
// dropped — Valencia 11, Baskonia 9), so a text-order → court-position mapping is
// unreliable. Instead we build a clean, honest 3-region partition from the
// per-player FG table (which we parse with known labels): Paint = "in paint", 3PT
// = three-pointers, Mid-range = every other 2-pointer (FG - 3PT - paint). These
// three are mutually exclusive and sum EXACTLY to FG (validated), so a coach gets
// a faithful "where we shoot / how it falls" court without any inferred layout.

export type CourtRegion = { key: "paint" | "mid" | "three"; made: number; att: number; pct: number | null };

type Tally = { m: number; a: number };
function sumShooting(players: InstatPlayerShooting[]): { paint: Tally; three: Tally; fg: Tally } {
  const add = (acc: Tally, c: MA) => { acc.m += c.m ?? 0; acc.a += c.a ?? 0; };
  const paint: Tally = { m: 0, a: 0 }, three: Tally = { m: 0, a: 0 }, fg: Tally = { m: 0, a: 0 };
  for (const p of players) { add(paint, p.inPaint); add(three, p.threePt); add(fg, p.fg); }
  return { paint, three, fg };
}

/** Derive a team's 3-region shot map from its per-player FG rows. Null when no shots. */
export function courtRegionsFrom(players: InstatPlayerShooting[]): CourtRegion[] | null {
  if (!players.length) return null;
  const { paint, three, fg } = sumShooting(players);
  if (fg.a <= 0) return null;
  const midM = Math.max(0, fg.m - three.m - paint.m);
  const midA = Math.max(0, fg.a - three.a - paint.a);
  const pct = (m: number, a: number) => (a > 0 ? Math.round((m / a) * 1000) / 10 : null);
  return [
    { key: "paint", made: paint.m, att: paint.a, pct: pct(paint.m, paint.a) },
    { key: "mid", made: midM, att: midA, pct: pct(midM, midA) },
    { key: "three", made: three.m, att: three.a, pct: pct(three.m, three.a) },
  ];
}

/** Owner + opponent 3-region shot maps, matched to sides by ctx. */
export function instatCourtRegions(shooting: InstatPlayerShootingParse[], meta: InstatGameReportMeta, ctx: InstatIngestContext): { own: CourtRegion[] | null; opp: CourtRegion[] | null } {
  const opp = instatOpponentShooting(shooting, meta, ctx);
  const ownerIsHome = resolveOwnerIsHome(meta, ctx);
  const ownName = ownerIsHome ? meta.home : meta.away;
  const ownEntry = shooting.find((s) => fold(s.teamName) === fold(ownName))
    ?? shooting.find((s) => fold(s.teamName).includes(fold(ownName)) || fold(ownName).includes(fold(s.teamName)))
    ?? shooting[ownerIsHome ? 0 : Math.min(1, shooting.length - 1)];
  return {
    own: ownEntry ? courtRegionsFrom(ownEntry.players) : null,
    opp: opp ? courtRegionsFrom(opp.players) : null,
  };
}

// ── Lineups (p12-13) ──────────────────────────────────────────────────────────
//
// The per-lineup stat box (FG/TOV/REB for team AND opponent on-court) serialises
// too ambiguously to parse reliably — numbers run together with no delimiters. But
// the CORE is robust and self-checking: the 5-man unit (two comma-lines), the
// minutes+net line ("04:05+8"), and the team points (first number after it). And
// pointsFor − plusMinus == pointsAgainst is a built-in invariant, so we derive the
// opponent points exactly instead of parsing the fragile opponent block.

export type InstatLineup = {
  players: string[];          // e.g. ["24.Costello", "12.Sako", "10.Moore", ...]
  minutes: number | null;     // decimal minutes (MM:SS)
  plusMinus: number | null;
  pointsFor: number | null;
  pointsAgainst: number | null; // derived: pointsFor − plusMinus
};
export type InstatLineupParse = { teamName: string; lineups: InstatLineup[] };

const isPlayerListLine = (s: string): boolean => /^\s*\d{1,2}\.[^,]+(,\s*\d{1,2}\.[^,]+)*\s*$/.test(s);

/** Parse the "Lineups statistics. <Team>" sections into 5-man units with minutes,
 *  +/− and points for/against. One entry per team, in report order. */
export function parseInstatLineups(text: string): InstatLineupParse[] {
  const lines = text.split("\n");
  const out: InstatLineupParse[] = [];
  // Section boundaries: each "Lineups statistics. <Team>" starts a team's block.
  const heads: Array<{ i: number; team: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(/^lineups statistics\.\s+(.+)$/i);
    if (m) heads.push({ i, team: m[1].trim() });
  }
  for (let h = 0; h < heads.length; h++) {
    const start = heads[h].i;
    const end = h + 1 < heads.length ? heads[h + 1].i : lines.length;
    const lineups: InstatLineup[] = [];
    for (let i = start + 1; i < end; i++) {
      const mm = lines[i].trim().match(/^(\d{1,3}):(\d{2})([+-]\d+)?$/);
      if (!mm) continue;
      const minutes = Math.round((Number(mm[1]) + Number(mm[2]) / 60) * 10) / 10;
      const plusMinus = mm[3] ? Number(mm[3]) : null;
      // Unit = the consecutive player-list lines just above (skipping one blank).
      const players: string[] = [];
      let j = i - 1;
      while (j > start && lines[j].trim() === "") j--;
      while (j > start && isPlayerListLine(lines[j])) {
        players.unshift(...lines[j].trim().split(",").map((s) => s.trim()).filter(Boolean));
        j--;
      }
      if (players.length < 2) continue;
      // Team points = first integer on the stat line right after the minutes line.
      let pointsFor: number | null = null;
      for (let k = i + 1; k < Math.min(end, i + 3); k++) {
        const im = lines[k].trim().match(/^-?\s*(\d+)\b/);
        if (im) { pointsFor = Number(im[1]); break; }
        if (lines[k].trim() !== "" && lines[k].trim() !== "-") break;
      }
      const pointsAgainst = pointsFor != null && plusMinus != null ? pointsFor - plusMinus : null;
      lineups.push({ players, minutes, plusMinus, pointsFor, pointsAgainst });
    }
    if (lineups.length) out.push({ teamName: heads[h].team, lineups });
  }
  return out;
}

/** The OPPONENT side's per-player shooting (the side that is NOT our club) — for
 *  the single-game opponent read. Matched by team name; report-order fallback. */
export function instatOpponentShooting(shooting: InstatPlayerShootingParse[], meta: InstatGameReportMeta, ctx: InstatIngestContext): { teamName: string; players: InstatPlayerShooting[] } | null {
  if (!shooting.length) return null;
  const ownerIsHome = resolveOwnerIsHome(meta, ctx);
  const opponentName = ownerIsHome ? meta.away : meta.home;
  const match = shooting.find((s) => fold(s.teamName) === fold(opponentName))
    ?? shooting.find((s) => fold(s.teamName).includes(fold(opponentName)) || fold(opponentName).includes(fold(s.teamName)))
    ?? shooting[ownerIsHome ? Math.min(1, shooting.length - 1) : 0];
  return match ? { teamName: match.teamName, players: match.players } : null;
}

/** Owner side's lineups (report order = home first), matched by team name. */
export function instatOwnerLineups(parse: InstatLineupParse[], meta: InstatGameReportMeta, ctx: InstatIngestContext): InstatLineup[] {
  if (!parse.length) return [];
  const ownerIsHome = resolveOwnerIsHome(meta, ctx);
  const ownerName = ownerIsHome ? meta.home : meta.away;
  const match = parse.find((p) => fold(p.teamName) === fold(ownerName))
    ?? parse.find((p) => fold(p.teamName).includes(fold(ownerName)) || fold(ownerName).includes(fold(p.teamName)))
    ?? parse[ownerIsHome ? 0 : Math.min(1, parse.length - 1)];
  return match?.lineups ?? [];
}

export async function extractInstatGameReport(opts: {
  buffer: Buffer;
  ctx: InstatIngestContext;
}): Promise<{ meta: InstatGameReportMeta | null; teams: BasketballTeamMatchRow[]; players: BasketballBoxScoreRow[]; oppPlayers: { teamName: string; players: InstatPlayerShooting[] } | null; lineups: InstatLineup[]; courtRegions: CourtRegion[] | null; oppCourtRegions: CourtRegion[] | null; text: string }> {
  const pdfParse = (await import("pdf-parse")).default as (b: Buffer) => Promise<{ text?: string }>;
  const text = (await pdfParse(opts.buffer)).text ?? "";
  if (!isInstatGameReportText(text)) return { meta: null, teams: [], players: [], oppPlayers: null, lineups: [], courtRegions: null, oppCourtRegions: null, text };
  const parse = parseInstatTeamStatsText(text);
  if (!parse) return { meta: null, teams: [], players: [], oppPlayers: null, lineups: [], courtRegions: null, oppCourtRegions: null, text };
  const shootingParse = parseInstatPlayerShooting(text);
  const players = instatPlayerShootingRows(shootingParse, parse.meta, opts.ctx);
  const oppPlayers = instatOpponentShooting(shootingParse, parse.meta, opts.ctx);
  const lineups = instatOwnerLineups(parseInstatLineups(text), parse.meta, opts.ctx);
  const regions = instatCourtRegions(shootingParse, parse.meta, opts.ctx);
  return { meta: parse.meta, teams: instatTeamMatchRows(parse, opts.ctx), players, oppPlayers, lineups, courtRegions: regions.own, oppCourtRegions: regions.opp, text };
}

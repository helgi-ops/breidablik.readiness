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

import type { BasketballAdvancedMetrics, BasketballTeamMatchRow } from "./types";
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
};

export type InstatGameReportParse = { meta: InstatGameReportMeta; team: InstatTeamParse };

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
 * Map a parsed Game Report into team rows: both sides, full game + per quarter.
 * `is_opponent` is set from ctx (which side is our club); default HOME = ours.
 */
export function instatTeamMatchRows(parse: InstatGameReportParse, ctx: InstatIngestContext): BasketballTeamMatchRow[] {
  const { meta, team: t } = parse;
  const rows: BasketballTeamMatchRow[] = [];

  // Which side is our club. An explicit ctx.ownerIsHome wins; else fold-match the
  // team name against each side (equal or either-way substring). Only flip to AWAY
  // on a confident away-only match — otherwise default to HOME (predictable), and
  // the caller can override in the preview when the names don't line up.
  const fOwner = ctx.ownerTeamName ? fold(ctx.ownerTeamName) : "";
  const sideMatch = (name: string): boolean => {
    const f = fold(name);
    return !!fOwner && (f === fOwner || f.includes(fOwner) || fOwner.includes(f));
  };
  const matchesHome = sideMatch(meta.home);
  const matchesAway = sideMatch(meta.away);
  const ownerIsHome = ctx.ownerIsHome ?? (matchesAway && !matchesHome ? false : true);

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

    const advanced: BasketballAdvancedMetrics = {
      ...fourFactors(
        { fgm, fga, tpm, ftm, tov, oreb, dreb, points, possessions },
        { oreb: t.oreb[other], dreb: t.dreb[other] },
      ),
      pointsOffTo: g(t.pointsOffTo),
      secondChancePts: g(t.secondChancePts),
      pointsInPaint: g(t.paintPts),
      fastbreakPts: g(t.transitionPts),
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
export async function extractInstatGameReport(opts: {
  buffer: Buffer;
  ctx: InstatIngestContext;
}): Promise<{ meta: InstatGameReportMeta | null; teams: BasketballTeamMatchRow[]; text: string }> {
  const pdfParse = (await import("pdf-parse")).default as (b: Buffer) => Promise<{ text?: string }>;
  const text = (await pdfParse(opts.buffer)).text ?? "";
  if (!isInstatGameReportText(text)) return { meta: null, teams: [], text };
  const parse = parseInstatTeamStatsText(text);
  if (!parse) return { meta: null, teams: [], text };
  return { meta: parse.meta, teams: instatTeamMatchRows(parse, opts.ctx), text };
}

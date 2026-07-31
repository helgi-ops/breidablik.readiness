/**
 * Parsers for the KKÍ (baskethotel MBT) widget-service HTML — pure, no IO, so
 * they're unit-tested against captured fixtures. Input is the windows-1252-decoded
 * response (what the fetch client yields); these functions unwrap the
 * `MBT.API.update('view','<escaped html>')` envelope, then read the tables.
 *
 * Box-score column layout was reverse-engineered from the two-tier header and
 * verified by reconciliation (team rebounds SF+VF=HF; 2pt·2+3pt·3+FT = points).
 * Only confidently-identified stats map to typed fields; every leaf cell is also
 * kept in `stats` (raw) so nothing is lost and a later relabel is trivial.
 */

import type { BasketballBoxScoreRow, BasketballGame, BasketballSource } from "./types";

/** Un-escape the MBT.API.update JS payload → readable HTML. The `MBT.API.update`
 *  wrapper text is harmless to leave in (we only read <table>s); trying to
 *  extract the quoted argument fails because the payload is full of quotes. */
export function unwrapWidgetHtml(raw: string): string {
  return raw.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\//g, "/");
}

const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, "").replace(/\s+/g, " ").trim();
const cells = (tr: string) => [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => strip(m[1]));

/** "6/22" → [6, 22]; blanks → [null,null]. */
function madeAtt(v: string): [number | null, number | null] {
  const m = /(\d+)\s*\/\s*(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2])] : [null, null];
}
/** "36:42" → 36.7 decimal minutes; plain number → itself; blank → null. */
function toMinutes(v: string): number | null {
  const t = /(\d+):(\d{1,2})/.exec(v);
  if (t) return Math.round((Number(t[1]) + Number(t[2]) / 60) * 10) / 10;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && v.trim() !== "" ? n : null;
}
const num = (v: string): number | null => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v.replace(/[+ ]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// Leaf-column labels (0-based) for the raw `stats` jsonb — nothing is dropped.
const LEAF_LABELS = [
  "Nr", "Leikmaður", "Mín", "2ja", "2ja%", "3ja", "3ja%", "Skot", "Skot%", "Víti", "Víti%",
  "Sóknarfráköst", "Varnarfráköst", "Fráköst", "Stoðsendingar", "Villur", "Villur fengnar",
  "Tapaðir boltar", "Stolnir boltar", "Varin skot", "Varin á", "Framlag", "+/-", "Stig",
];

/**
 * Parse a game box score → one row per player (both teams), each tagged with its
 * team name. Date/opponent/homeAway are filled later by the caller (from the
 * schedule). Rows without a player id (team totals, spacers) are skipped.
 */
export function parseBoxScore(
  raw: string,
  gameId: string,
  teamId: string,
  source: BasketballSource = "baskethotel",
): Array<BasketballBoxScoreRow & { team: string | null }> {
  const html = unwrapWidgetHtml(raw);
  const out: Array<BasketballBoxScoreRow & { team: string | null }> = [];

  for (const tm of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    const table = tm[0];
    if (!table.includes("player_id=")) continue;
    // Team name = the nearest preceding "mbt-holder-headline" (strip the coach
    // suffix "(Þjálfari: …)"). Each team's box-score table is preceded by one.
    const before = html.slice(0, tm.index ?? 0);
    const heads = [...before.matchAll(/mbt-holder-headline[\s\S]*?mbt-text"[^>]*>([^<]+)</g)];
    const teamName = heads.length ? strip(heads[heads.length - 1][1]).replace(/\s*\(.*$/, "").trim() : null;

    for (const tr of [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0])) {
      const pid = /player_id="?(\d+)"?/.exec(tr);
      if (!pid) continue; // header / team-total / spacer
      const c = cells(tr);
      if (c.length < 24) continue; // DNP / malformed — skip rather than mis-index
      const nameRaw = c[1] || "";
      const name = nameRaw.replace(/^\*/, "").trim(); // '*' marks a starter
      const [fgm, fga] = madeAtt(c[7]);
      const [tpm, tpa] = madeAtt(c[5]);
      const [ftm, fta] = madeAtt(c[9]);

      const stats: Record<string, number | string | null> = {};
      LEAF_LABELS.forEach((lab, i) => { stats[lab] = c[i] === "" ? null : c[i]; });

      out.push({
        teamId,
        gameId,
        gameDate: "", // filled by caller from the schedule
        minutes: toMinutes(c[2]),
        points: num(c[23]),
        fgm, fga, tpm, tpa, ftm, fta,
        oreb: num(c[11]), dreb: num(c[12]), reb: num(c[13]),
        assists: num(c[14]),
        turnovers: num(c[17]),
        steals: num(c[18]),
        // Blocks: the "Vs" column ('Varin skot'); nbsp ⇒ null (renders "–"), never 0.
        blocks: num(c[19]),
        fouls: num(c[15]),
        plusMinus: num(c[22]),
        efficiency: num(c[21]),
        stats,
        source,
        sourceRef: gameId,
        sourcePlayerRef: pid[1],
        playerName: name,
        team: teamName,
      });
    }
  }
  return out;
}

/**
 * Parse the shot-chart filter scaffold → the quarter + per-team player-id values
 * needed to request the shot-chart image (the graph endpoint 500s without them).
 */
export function parseShotChartFilters(raw: string): { quarters: string[]; playerA: string[]; playerB: string[] } {
  const html = unwrapWidgetHtml(raw);
  const vals = (field: string) =>
    [...html.matchAll(new RegExp(`name="filter\\[${field}\\]\\[\\]"[^>]*value="([^"]+)"`, "g"))].map((m) => m[1]);
  return { quarters: vals("quarter"), playerA: vals("player_a"), playerB: vals("player_b") };
}

/**
 * Parse the season schedule/results widget → games (id, teams, scores).
 * `finished` = both scores present.
 */
export function parseSchedule(raw: string): BasketballGame[] {
  const html = unwrapWidgetHtml(raw);
  const games: BasketballGame[] = [];
  const seen = new Set<string>();
  // Each game is a <tr …schedule-line…> with the game_id on its anchor and cells:
  // [0] "dd-mm-yyyy HH:MM" · [1] home · [2] "H:A" score · [3] away · [4] venue.
  for (const tr of [...html.matchAll(/<tr[^>]*schedule-line[^>]*>[\s\S]*?<\/tr>/g)].map((m) => m[0])) {
    const gid = /game_id="?(\d{5,})/.exec(tr);
    if (!gid || seen.has(gid[1])) continue;
    const c = cells(tr);
    if (c.length < 4) continue;
    const dm = /(\d{2})-(\d{2})-(\d{4})/.exec(c[0]);
    const sc = /(\d{1,3})\s*:\s*(\d{1,3})/.exec(c[2]);
    seen.add(gid[1]);
    games.push({
      gameId: gid[1],
      date: dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : "",
      homeTeam: c[1] || "",
      awayTeam: c[3] || "",
      homeScore: sc ? Number(sc[1]) : null,
      awayScore: sc ? Number(sc[2]) : null,
      finished: !!sc,
    });
  }
  return games;
}

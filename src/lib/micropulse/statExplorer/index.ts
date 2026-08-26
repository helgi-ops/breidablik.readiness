/**
 * Stat Explorer — pure engine, no IO.
 *
 * "Over the last N games (optionally only home / away / wins / a given opponent), who is producing
 * the best numbers?" The coach picks a window + context + metric; this ranks the squad, and the
 * same aggregates drive a full all-metrics × all-players table.
 *
 * Reads per-match player rows from player_match_stats (the `metrics` bag). Two StatsBomb import
 * paths name the same metric differently (the Match Stats player-grain CSV uses short codes like
 * `T`/`I`/`KP`; the de-normalised Squad import uses full names like `Tackles`) — every catalog
 * entry lists BOTH so a player's tackles aggregate across matches regardless of which file fed them.
 * Every metric present in the data is covered: the well-known ones are curated (nice labels, right
 * group, sum vs %), and any long-tail key is auto-derived into an "Other" group so nothing is dropped.
 *
 * Minutes are frequently absent (only the Squad import carries them), so the honest default is a
 * PER-GAME average (metric ÷ games), which needs no minutes. Per-90 is offered but only meaningful
 * where minutes exist — the caller is told the minutes coverage so it can gate that mode.
 *
 * Descriptive football data only — never touches the readiness colour, load, or any decision.
 * Cite: StatsBomb IQ metric glossary.
 */

export type Bi = { en: string; is: string };
export type GroupKey = "attacking" | "defensive" | "buildup" | "setpiece" | "gk" | "other";
export type Agg = "sum" | "mean"; // counts/values sum; %s/ratios/durations are weighted means
export type Mode = "perGame" | "total" | "per90";

export type MetricSpec = {
  key: string;            // stable id used by the UI
  aliases: string[];      // every bag key that carries this metric (first present per row wins)
  label: Bi;
  group: GroupKey;
  agg: Agg;
  higherIsBetter: boolean;
  per90: boolean;         // can this be expressed per-90? (rates cannot)
  tip?: Bi;
};

export const GROUP_LABEL: Record<GroupKey, Bi> = {
  attacking: { en: "Attacking", is: "Sókn" },
  defensive: { en: "Defending", is: "Vörn" },
  buildup: { en: "Build-up & passing", is: "Uppbygging & sendingar" },
  setpiece: { en: "Set pieces", is: "Fastir boltar" },
  gk: { en: "Goalkeeping", is: "Markvarsla" },
  other: { en: "Other", is: "Annað" },
};
export const GROUP_ORDER: GroupKey[] = ["attacking", "defensive", "buildup", "setpiece", "gk", "other"];

/** The curated catalog — the coach-legible metrics, each with both naming forms. */
export const METRICS: MetricSpec[] = [
  // ── Attacking ──
  { key: "goals", aliases: ["Goals", "Goals & Penalty Goals"], label: { en: "Goals", is: "Mörk" }, group: "attacking", agg: "sum", higherIsBetter: true, per90: true },
  { key: "xg", aliases: ["xG"], label: { en: "xG", is: "xG" }, group: "attacking", agg: "sum", higherIsBetter: true, per90: true, tip: { en: "Expected goals — the quality of chances taken.", is: "Vænt mörk — gæði færanna." } },
  { key: "shots", aliases: ["Shots"], label: { en: "Shots", is: "Skot" }, group: "attacking", agg: "sum", higherIsBetter: true, per90: true },
  { key: "xg_per_shot", aliases: ["xG/Shot"], label: { en: "xG per shot", is: "xG á skot" }, group: "attacking", agg: "mean", higherIsBetter: true, per90: false },
  { key: "assists", aliases: ["Assists"], label: { en: "Assists", is: "Stoðsendingar" }, group: "attacking", agg: "sum", higherIsBetter: true, per90: true },
  { key: "op_assists", aliases: ["OP Assists", "Open Play Assists"], label: { en: "Open-play assists", is: "Stoðsendingar (opinn leikur)" }, group: "attacking", agg: "sum", higherIsBetter: true, per90: true },
  { key: "xg_assist", aliases: ["xG Assist", "xG Assisted"], label: { en: "xG assisted", is: "xG stoðsent" }, group: "attacking", agg: "sum", higherIsBetter: true, per90: true, tip: { en: "Chance creation — xG of the shots this player set up.", is: "Færasköpun — xG skotanna sem leikmaðurinn lagði upp." } },
  { key: "op_xg_assist", aliases: ["OP xG Asst", "Open Play xG Assisted"], label: { en: "Open-play xG assisted", is: "xG stoðsent (opinn leikur)" }, group: "attacking", agg: "sum", higherIsBetter: true, per90: true },
  { key: "key_passes", aliases: ["KP", "Key Passes"], label: { en: "Key passes", is: "Lykilsendingar" }, group: "attacking", agg: "sum", higherIsBetter: true, per90: true },
  { key: "op_key_passes", aliases: ["OP KP", "Open Play Key Passes"], label: { en: "Open-play key passes", is: "Lykilsendingar (opinn leikur)" }, group: "attacking", agg: "sum", higherIsBetter: true, per90: true },
  { key: "tib", aliases: ["TIB", "Touches in box", "Touches In Box"], label: { en: "Touches in box", is: "Snertingar í teig" }, group: "attacking", agg: "sum", higherIsBetter: true, per90: true },
  { key: "passes_into_box", aliases: ["PintoB", "OP PintoB", "Passes Into Box"], label: { en: "Passes into box", is: "Sendingar í teig" }, group: "attacking", agg: "sum", higherIsBetter: true, per90: true },
  { key: "passes_inside_box", aliases: ["PIB", "Passes Inside Box", "Successful Passes Inside Box"], label: { en: "Passes inside box", is: "Sendingar innan teigs" }, group: "attacking", agg: "sum", higherIsBetter: true, per90: true },
  { key: "crosses", aliases: ["Cross", "Crosses"], label: { en: "Crosses", is: "Fyrirgjafir" }, group: "attacking", agg: "sum", higherIsBetter: true, per90: true },
  { key: "cross_pct", aliases: ["Cross%"], label: { en: "Cross completion %", is: "Fyrirgjafa-nákvæmni %" }, group: "attacking", agg: "mean", higherIsBetter: true, per90: false },
  { key: "dribbles", aliases: ["Drib", "Dribbles", "Successful Dribbles"], label: { en: "Dribbles", is: "Rekja bolta" }, group: "attacking", agg: "sum", higherIsBetter: true, per90: true },
  { key: "shot_obv", aliases: ["Shot OBV"], label: { en: "Shot OBV", is: "Shot OBV" }, group: "attacking", agg: "sum", higherIsBetter: true, per90: true, tip: { en: "On-ball value added by this player's shots.", is: "Virði sem skot leikmannsins bæta við." } },

  // ── Defending ──
  { key: "tackles_int", aliases: ["T+I", "Tack&Int", "Tackles & Interceptions"], label: { en: "Tackles + interceptions", is: "Tæklingar + stungur" }, group: "defensive", agg: "sum", higherIsBetter: true, per90: true },
  { key: "tackles", aliases: ["T", "Tackles"], label: { en: "Tackles", is: "Tæklingar" }, group: "defensive", agg: "sum", higherIsBetter: true, per90: true },
  { key: "interceptions", aliases: ["I", "Interceptions"], label: { en: "Interceptions", is: "Sendingar rofnar" }, group: "defensive", agg: "sum", higherIsBetter: true, per90: true },
  { key: "tackle_dribbled_pct", aliases: ["T/DP%"], label: { en: "Tackle win % vs dribbles", is: "Tæklinga-vinningur % gegn rekstri" }, group: "defensive", agg: "mean", higherIsBetter: true, per90: false },
  { key: "pressures", aliases: ["Pressures"], label: { en: "Pressures", is: "Pressur" }, group: "defensive", agg: "sum", higherIsBetter: true, per90: true },
  { key: "counterpressures", aliases: ["Counterpressures Pressures", "Counterpressures"], label: { en: "Counterpressures", is: "Gagnpressur" }, group: "defensive", agg: "sum", higherIsBetter: true, per90: true },
  { key: "clearances", aliases: ["Clear", "Clearances"], label: { en: "Clearances", is: "Frákast" }, group: "defensive", agg: "sum", higherIsBetter: true, per90: true },
  { key: "blocked_shots", aliases: ["Blocked Shots"], label: { en: "Blocked shots", is: "Vörðuð skot" }, group: "defensive", agg: "sum", higherIsBetter: true, per90: true },
  { key: "aerial_wins", aliases: ["AerWin", "Aerial Wins"], label: { en: "Aerial wins", is: "Skallaeinvígi unnin" }, group: "defensive", agg: "sum", higherIsBetter: true, per90: true },
  { key: "aerial_pct", aliases: ["Aer%", "Aerial Win%"], label: { en: "Aerial win %", is: "Skallaeinvígi unnin %" }, group: "defensive", agg: "mean", higherIsBetter: true, per90: false },
  { key: "da_obv", aliases: ["DA OBV", "Defensive Action OBV"], label: { en: "Defensive-action OBV", is: "Varnaraðgerða-OBV" }, group: "defensive", agg: "sum", higherIsBetter: true, per90: true },
  { key: "dribbled_past", aliases: ["Dribbled Past"], label: { en: "Dribbled past", is: "Rekið framhjá" }, group: "defensive", agg: "sum", higherIsBetter: false, per90: true },
  { key: "dispossessed", aliases: ["Disp", "Dispossessed"], label: { en: "Dispossessed", is: "Missti bolta" }, group: "defensive", agg: "sum", higherIsBetter: false, per90: true },
  { key: "fouls", aliases: ["Fouls"], label: { en: "Fouls", is: "Brot" }, group: "defensive", agg: "sum", higherIsBetter: false, per90: true },

  // ── Build-up & passing ──
  { key: "obv", aliases: ["OBV"], label: { en: "OBV (total)", is: "OBV (heild)" }, group: "buildup", agg: "sum", higherIsBetter: true, per90: true, tip: { en: "On-ball value — total value this player's actions added.", is: "On-ball value — heildarvirði sem aðgerðir leikmannsins bættu við." } },
  { key: "pass_obv", aliases: ["Pass OBV"], label: { en: "Pass OBV", is: "Pass OBV" }, group: "buildup", agg: "sum", higherIsBetter: true, per90: true },
  { key: "dc_obv", aliases: ["D&C OBV", "Dribble & Carry OBV"], label: { en: "Dribble & carry OBV", is: "Rekstur & burður OBV" }, group: "buildup", agg: "sum", higherIsBetter: true, per90: true },
  { key: "deep_progressions", aliases: ["DP", "Deep Progressions"], label: { en: "Deep progressions", is: "Djúpar framfærslur" }, group: "buildup", agg: "sum", higherIsBetter: true, per90: true },
  { key: "op_passes", aliases: ["OP Pass", "Open Play Passes"], label: { en: "Open-play passes", is: "Sendingar (opinn leikur)" }, group: "buildup", agg: "sum", higherIsBetter: true, per90: true },
  { key: "nti_passes", aliases: ["Non Throw-in Passes"], label: { en: "Passes (excl. throw-ins)", is: "Sendingar (án innkasta)" }, group: "buildup", agg: "sum", higherIsBetter: true, per90: true },
  { key: "successful_passes", aliases: ["Successful Passes"], label: { en: "Successful passes", is: "Heppnaðar sendingar" }, group: "buildup", agg: "sum", higherIsBetter: true, per90: true },
  { key: "received_passes", aliases: ["Received Passes"], label: { en: "Passes received", is: "Sendingar mótteknar" }, group: "buildup", agg: "sum", higherIsBetter: true, per90: true },
  { key: "f3_passes", aliases: ["OP F3 Pass", "Non Throw-in Passes Into Final Third ", "Non Throw-in Passes Into Final Third"], label: { en: "Passes into final third", is: "Sendingar á lokaþriðjung" }, group: "buildup", agg: "sum", higherIsBetter: true, per90: true },
  { key: "def_third_passes", aliases: ["Non Throw-in Passes from Defensive Third"], label: { en: "Passes from defensive third", is: "Sendingar frá varnarþriðjungi" }, group: "buildup", agg: "sum", higherIsBetter: true, per90: true },
  { key: "long_balls", aliases: ["LB", "Long Balls"], label: { en: "Long balls", is: "Langar sendingar" }, group: "buildup", agg: "sum", higherIsBetter: true, per90: true },
  { key: "long_ball_pct", aliases: ["LB%", "Long Ball%"], label: { en: "Long-ball completion %", is: "Langsendinga-nákvæmni %" }, group: "buildup", agg: "mean", higherIsBetter: true, per90: false },
  { key: "pass_pct", aliases: ["Pass%", "Passing%"], label: { en: "Pass completion %", is: "Sendinganákvæmni %" }, group: "buildup", agg: "mean", higherIsBetter: true, per90: false },
  { key: "through_balls", aliases: ["TB", "Through Balls", "Non Throw-in Through Balls"], label: { en: "Through balls", is: "Gegnumbrots-sendingar" }, group: "buildup", agg: "sum", higherIsBetter: true, per90: true },
  { key: "xg_buildup", aliases: ["xG Buildup", "xGBuildup", "OP xG Buildup"], label: { en: "xG buildup", is: "xG uppbygging" }, group: "buildup", agg: "sum", higherIsBetter: true, per90: true },
  { key: "xgchain", aliases: ["xGChain", "OP xGChain"], label: { en: "xGChain", is: "xGChain" }, group: "buildup", agg: "sum", higherIsBetter: true, per90: true, tip: { en: "Involvement in possessions that ended in a shot.", is: "Aðkoma að sóknum sem enduðu í skoti." } },

  // ── Set pieces ──
  { key: "sp_xg_assist", aliases: ["SP xG Asst", "Set Piece xG Assisted"], label: { en: "Set-piece xG assisted", is: "Fastra bolta xG stoðsent" }, group: "setpiece", agg: "sum", higherIsBetter: true, per90: true },
  { key: "sp_key_passes", aliases: ["SP KP", "Set Piece Key Passes"], label: { en: "Set-piece key passes", is: "Fastra bolta lykilsendingar" }, group: "setpiece", agg: "sum", higherIsBetter: true, per90: true },
  { key: "sp_assists", aliases: ["SP Assists", "Set Piece Assists"], label: { en: "Set-piece assists", is: "Fastra bolta stoðsendingar" }, group: "setpiece", agg: "sum", higherIsBetter: true, per90: true },
  { key: "free_kicks", aliases: ["Free Kicks"], label: { en: "Free kicks taken", is: "Aukaspyrnur teknar" }, group: "setpiece", agg: "sum", higherIsBetter: true, per90: true },

  // ── Goalkeeping ──
  { key: "saves", aliases: ["Saves"], label: { en: "Saves", is: "Varðar" }, group: "gk", agg: "sum", higherIsBetter: true, per90: true },
  { key: "gsaa", aliases: ["Goals Saved Above Average"], label: { en: "Goals saved above average", is: "Mörk varin yfir meðaltali" }, group: "gk", agg: "sum", higherIsBetter: true, per90: false, tip: { en: "Shot-stopping vs an average keeper facing the same shots.", is: "Skotvörn m.v. meðal-markvörð sem ver sömu skot." } },
  { key: "save_pct", aliases: ["Non Penalty Save%", "Save%"], label: { en: "Save %", is: "Varin %" }, group: "gk", agg: "mean", higherIsBetter: true, per90: false },
  { key: "shot_stopping_pct", aliases: ["Shot Stopping%"], label: { en: "Shot-stopping %", is: "Skotvörn %" }, group: "gk", agg: "mean", higherIsBetter: true, per90: false },
  { key: "gk_obv", aliases: ["GK OBV"], label: { en: "Goalkeeper OBV", is: "Markvarðar-OBV" }, group: "gk", agg: "sum", higherIsBetter: true, per90: true },
  { key: "shots_faced", aliases: ["Shots Faced"], label: { en: "Shots faced", is: "Skot á markið" }, group: "gk", agg: "sum", higherIsBetter: false, per90: true },
  { key: "np_shots_faced", aliases: ["Non Penalty Shots Faced"], label: { en: "Non-penalty shots faced", is: "Vítalaus skot á markið" }, group: "gk", agg: "sum", higherIsBetter: false, per90: true },
  { key: "np_psxg_faced", aliases: ["Non Penalty PSxG Faced"], label: { en: "Post-shot xG faced", is: "Vænt mörk á markið (PSxG)" }, group: "gk", agg: "sum", higherIsBetter: false, per90: true },
  { key: "goal_kicks", aliases: ["Goal Kicks"], label: { en: "Goal kicks", is: "Markspyrnur" }, group: "gk", agg: "sum", higherIsBetter: true, per90: true },
];

export function metricByKey(key: string, specs: MetricSpec[] = METRICS): MetricSpec | undefined {
  return specs.find((m) => m.key === key);
}

// ── Auto-derive the long tail so "all statistics" really means all ────────────
const JUNK = new Set(["date", "match", "game sbd id", "minutes", "player sbd id", "current team sbd id", "player", "team", "name"].map((s) => s.toLowerCase()));
const SHORT_LABEL: Record<string, string> = {
  PW: "Pass into … (PW)",
  "Pressures Total Duration": "Pressure duration (total)",
  "Pressures Duration Per Pressure": "Pressure duration per action",
  "Pressures Pressured Action Fails": "Pressures forcing a failure",
  "Counterpressures Total Duration": "Counterpress duration (total)",
  "Counterpressures Duration Per Pressure": "Counterpress duration per action",
  "Counterpressures Pressured Action Fails": "Counterpress forcing a failure",
  "Successful Pass Length": "Successful pass length (m)",
  "Penalty Goals Conceded": "Penalty goals conceded",
  "Penalties Faced": "Penalties faced",
  "Long Goal Kicks": "Long goal kicks",
  "Short Goal Kicks": "Short goal kicks",
};
const isMeanKey = (k: string) => /%|ratio| per |duration|length|\/shot|average/i.test(k);
const isNegativeKey = (k: string) => /conceded|faced|fails|dispossess|dribbled past|fouls?(?!\s*won)/i.test(k);
const covered = (() => { const s = new Set<string>(); for (const m of METRICS) for (const a of m.aliases) s.add(a.trim().toLowerCase()); return s; })();

/** Curated catalog + an "Other" entry for every real key in the data not already covered. */
export function buildSpecs(presentKeys: string[]): MetricSpec[] {
  const extras: MetricSpec[] = [];
  const seen = new Set<string>();
  for (const raw of presentKeys) {
    const k = raw.trim();
    const low = k.toLowerCase();
    if (!k || JUNK.has(low) || covered.has(low) || seen.has(low)) continue;
    seen.add(low);
    const label = SHORT_LABEL[k] ?? k;
    const mean = isMeanKey(k);
    extras.push({ key: `x:${k}`, aliases: [k], label: { en: label, is: label }, group: "other", agg: mean ? "mean" : "sum", higherIsBetter: !isNegativeKey(k), per90: !mean });
  }
  extras.sort((a, b) => a.label.en.localeCompare(b.label.en));
  return [...METRICS, ...extras];
}

/** GK / DEF / MID / FWD from a StatsBomb-style position code. */
export type Line = "GK" | "DEF" | "MID" | "FWD";
export function positionLine(pos: string | null | undefined): Line | null {
  const p = String(pos ?? "").toUpperCase().trim();
  if (!p) return null;
  if (p === "GK") return "GK";
  if (["CB", "RB", "LB", "RWB", "LWB", "RCB", "LCB"].includes(p)) return "DEF";
  if (["CM", "AM", "DM", "CDM", "CAM", "RCM", "LCM", "RM", "LM"].includes(p)) return "MID";
  if (["CF", "ST", "LW", "RW", "SS", "LF", "RF"].includes(p)) return "FWD";
  return null;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace("%", "").trim());
  return Number.isFinite(n) ? n : null;
};

function metricValue(bag: Record<string, unknown>, spec: MetricSpec): number | null {
  for (const a of spec.aliases) if (a in bag) { const v = num(bag[a]); if (v != null) return v; }
  return null;
}

export type MatchRow = { playerId: string; matchDate: string; minutes: number | null; metrics: Record<string, unknown> | null };
export type PlayerRef = { playerId: string; name: string; position: string | null };

export type PlayerAgg = {
  playerId: string; name: string; position: string | null; line: Line | null;
  games: number; minutes: number; minutesGames: number;
  byMetric: Record<string, { sum: number; n: number; mean: number }>;
};

/**
 * Fold per-match rows into one aggregate per player over the given window of matches.
 * `window` = number of most-recent distinct match dates to include (null = all).
 * `specs` = the metric set to aggregate (default the curated catalog; pass buildSpecs() for all).
 */
export function aggregatePlayers(rows: MatchRow[], players: PlayerRef[], window: number | null, specs: MetricSpec[] = METRICS): { players: PlayerAgg[]; matchDates: string[] } {
  const allDates = [...new Set(rows.map((r) => r.matchDate))].sort((a, b) => (a < b ? 1 : -1)); // newest first
  const keep = window == null ? allDates : allDates.slice(0, window);
  const keepSet = new Set(keep);
  const nameOf = new Map(players.map((p) => [p.playerId, p]));

  const byPlayer = new Map<string, MatchRow[]>();
  for (const r of rows) {
    if (!r.playerId || !keepSet.has(r.matchDate)) continue;
    (byPlayer.get(r.playerId) ?? byPlayer.set(r.playerId, []).get(r.playerId)!).push(r);
  }

  const out: PlayerAgg[] = [];
  for (const [pid, prs] of byPlayer) {
    const ref = nameOf.get(pid);
    if (!ref) continue;
    const games = new Set(prs.map((r) => r.matchDate)).size;
    const minsPresent = prs.map((r) => r.minutes ?? num(r.metrics?.["Minutes"])).filter((m): m is number => m != null && m > 0);
    const minutes = minsPresent.reduce((a, b) => a + b, 0);
    const minutesGames = minsPresent.length;

    const byMetric: PlayerAgg["byMetric"] = {};
    for (const spec of specs) {
      let sum = 0, n = 0, wsum = 0, wmin = 0;
      for (const r of prs) {
        const v = metricValue(r.metrics ?? {}, spec);
        if (v == null) continue;
        sum += v; n += 1;
        const m = r.minutes ?? num(r.metrics?.["Minutes"]);
        if (m != null && m > 0) { wsum += v * m; wmin += m; }
      }
      const mean = n === 0 ? 0 : wmin > 0 ? wsum / wmin : sum / n;
      byMetric[spec.key] = { sum, n, mean };
    }
    out.push({ playerId: pid, name: ref.name, position: ref.position, line: positionLine(ref.position), games, minutes, minutesGames, byMetric });
  }
  return { players: out, matchDates: keep.sort() };
}

export type RankOpts = { mode: Mode; minGames: number; line?: Line | null };
export type RankRow = { playerId: string; name: string; position: string | null; games: number; minutes: number; value: number | null; total: number; perGame: number };
export type Leaderboard = { metric: MetricSpec; mode: Mode; rows: RankRow[]; minutesCoverage: number };

/** Value of one metric for one player aggregate under a mode. Null when per-90 lacks minutes. */
export function metricValueForMode(a: PlayerAgg, spec: MetricSpec, mode: Mode): { value: number | null; total: number; perGame: number } {
  const cell = a.byMetric[spec.key] ?? { sum: 0, n: 0, mean: 0 };
  const total = cell.sum;
  const perGame = a.games > 0 ? total / a.games : 0;
  let value: number | null;
  if (spec.agg === "mean") value = cell.n > 0 ? cell.mean : null;
  else if (mode === "total") value = total;
  else if (mode === "per90") value = a.minutes > 0 ? (total / a.minutes) * 90 : null;
  else value = perGame;
  return { value, total, perGame };
}

/** Rank the aggregates on one metric, honouring the mode, a games floor and an optional line. */
export function rankLeaderboard(aggs: PlayerAgg[], spec: MetricSpec, opts: RankOpts): Leaderboard {
  const mode: Mode = spec.agg === "mean" ? "perGame" : opts.mode; // %s ignore the sum/per-90 toggle
  let withMin = 0, considered = 0;

  const rows: RankRow[] = aggs
    .filter((a) => (opts.line ? a.line === opts.line : true))
    .filter((a) => a.games >= Math.max(1, opts.minGames))
    .filter((a) => (a.byMetric[spec.key]?.n ?? 0) > 0)
    .map((a) => {
      const { value, total, perGame } = metricValueForMode(a, spec, mode);
      considered += 1;
      if (a.minutes > 0) withMin += 1;
      return { playerId: a.playerId, name: a.name, position: a.position, games: a.games, minutes: a.minutes, value, total, perGame };
    });

  rows.sort((x, y) => {
    if (x.value == null && y.value == null) return 0;
    if (x.value == null) return 1;
    if (y.value == null) return -1;
    return spec.higherIsBetter ? y.value - x.value : x.value - y.value;
  });

  return { metric: spec, mode, rows, minutesCoverage: considered === 0 ? 0 : withMin / considered };
}

/**
 * Single-match "Team match stats" readable report — turns one row of sb_team_match_stats (the
 * StatsBomb team-aggregated numbers for one game) into a layered, plain-language read: a one-line
 * verdict (the glance), 2–3 supporting facts, then thematic sections (Attack · Build-up & passing ·
 * Pressing & defence · On-ball value). Every metric carries the match value, the opponent value
 * (for the paired for/against metrics), and the team's own season average for context. Jargon
 * (OBV, deep progressions, PPDA) travels with a tooltip. Pure/serialisable — no I/O, so the route
 * and (later) the PDF both build from it. Descriptive football context — never touches readiness.
 *
 * Cite: StatsBomb IQ metric glossary (team match stats); OBV = On-Ball Value (StatsBomb 2021).
 */

export type Bi = { en: string; is: string };
export type MetricGroup = "attack" | "buildup" | "pressing" | "onball";
export type MetricFormat = "int" | "dec1" | "dec2" | "pct";

/** One StatsBomb team-stat column, own vs opponent, plus the team's season average. */
export interface ReportMetric {
  key: string;
  label: Bi;
  tip?: Bi;
  own: number | null;
  opp: number | null;        // opponent / conceded value; null when the metric isn't paired
  seasonAvg: number | null;  // own team's season average (this match excluded)
  format: MetricFormat;
  higherIsBetter: boolean;   // drives the vs-season delta tone
}
export interface ReportSection { group: MetricGroup; title: Bi; metrics: ReportMetric[] }
export interface SbTeamMatchReport {
  matchDate: string;
  opponent: string | null;
  isHome: boolean | null;
  goals: number | null;
  goalsAgainst: number | null;
  headline: Bi;
  facts: Bi[];
  sections: ReportSection[];
  coverage: { present: number; total: number };  // metrics with a value / all metrics
}

/** A raw sb_team_match_stats row (only the fields the report reads). All numeric-or-null. */
export type SbTeamRow = {
  match_date: string; opponent?: string | null; is_home?: boolean | null;
  goals?: number | null; goals_against?: number | null;
  xg?: number | null; xg_against?: number | null;
  shots?: number | null; shots_against?: number | null;
  shots_on_target?: number | null; shots_on_target_against?: number | null;
  box_touches?: number | null; passes_into_box?: number | null;
  clear_shots?: number | null; clear_shots_against?: number | null;
  counter_shots?: number | null; counter_shots_against?: number | null;
  possession_pct?: number | null; possession_proxy_pct?: number | null;
  passes?: number | null; passing_pct?: number | null;
  passes_final_third?: number | null; progressive_passes?: number | null;
  deep_progressions?: number | null; through_balls?: number | null; line_breaks?: number | null;
  key_passes?: number | null; crosses?: number | null; cross_pct?: number | null;
  directness?: number | null; long_ball_pct?: number | null;
  long_ball_pressured?: number | null; long_ball_unpressured?: number | null;
  pressures?: number | null; counterpressures?: number | null; pressures_opp_half_pct?: number | null;
  aggression?: number | null; ppda?: number | null; def_action_regains?: number | null;
  tackles?: number | null; interceptions?: number | null;
  aerials_won?: number | null; aerials_total?: number | null;
  obv?: number | null; pass_obv?: number | null; shot_obv?: number | null;
  carry_obv?: number | null; def_action_obv?: number | null;
  [k: string]: unknown;
};

const N = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Mean of a column across the season rows (nulls skipped). Null when nothing to average. */
function seasonMean(rows: SbTeamRow[], key: string): number | null {
  const vals = rows.map((r) => N(r[key])).filter((v): v is number => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

type Spec = { key: string; label: Bi; tip?: Bi; oppKey?: string; format: MetricFormat; higherIsBetter?: boolean };

const SECTIONS: Array<{ group: MetricGroup; title: Bi; specs: Spec[] }> = [
  {
    group: "attack", title: { en: "Attack", is: "Sókn" },
    specs: [
      { key: "xg", oppKey: "xg_against", label: { en: "Expected goals (xG)", is: "Vænt mörk (xG)" }, tip: { en: "The quality of chances created — sum of each shot's scoring probability.", is: "Gæði færanna — summa af skoralíkindum hvers skots." }, format: "dec2" },
      { key: "shots", oppKey: "shots_against", label: { en: "Shots", is: "Skot" }, format: "int" },
      { key: "shots_on_target", oppKey: "shots_on_target_against", label: { en: "Shots on target", is: "Skot á mark" }, format: "int" },
      { key: "box_touches", label: { en: "Touches in box", is: "Snertingar í teig" }, format: "int" },
      { key: "passes_into_box", label: { en: "Passes into box", is: "Sendingar í teig" }, format: "int" },
      { key: "clear_shots", oppKey: "clear_shots_against", label: { en: "Clear shots", is: "Hrein skotfæri" }, tip: { en: "Shots with a clear sight of goal (no defender blocking the line).", is: "Skot með óhindraða sýn á markið (enginn varnarmaður í línunni)." }, format: "int" },
      { key: "counter_shots", oppKey: "counter_shots_against", label: { en: "Counter-attacking shots", is: "Skot úr skyndisókn" }, format: "int" },
    ],
  },
  {
    group: "buildup", title: { en: "Build-up & passing", is: "Uppbygging & sendingar" },
    specs: [
      { key: "possession_pct", label: { en: "Possession %", is: "Boltahlutfall %" }, format: "pct" },
      { key: "passes", label: { en: "Total passes", is: "Sendingar alls" }, format: "int" },
      { key: "passing_pct", label: { en: "Pass completion %", is: "Sendinganákvæmni %" }, format: "pct" },
      { key: "passes_final_third", label: { en: "Passes into final third", is: "Sendingar á lokaþriðjung" }, format: "int" },
      { key: "progressive_passes", label: { en: "Progressive passes", is: "Framsæknar sendingar" }, tip: { en: "Passes that move the ball meaningfully closer to goal.", is: "Sendingar sem færa boltann marktækt nær marki." }, format: "int" },
      { key: "deep_progressions", label: { en: "Deep progressions", is: "Djúp framrás" }, tip: { en: "Passes & carries into the final third / penalty area.", is: "Sendingar og burður inn á lokaþriðjung / vítateig." }, format: "int" },
      { key: "line_breaks", label: { en: "Line-breaking passes", is: "Línubrjótandi sendingar" }, format: "int" },
      { key: "through_balls", label: { en: "Through balls", is: "Gegnumbrotssendingar" }, format: "int" },
      { key: "key_passes", label: { en: "Key passes", is: "Lykilsendingar" }, tip: { en: "Passes that directly set up a shot.", is: "Sendingar sem búa beint til skot." }, format: "int" },
      { key: "crosses", label: { en: "Crosses", is: "Fyrirgjafir" }, format: "int" },
      { key: "cross_pct", label: { en: "Cross completion %", is: "Fyrirgjafanákvæmni %" }, format: "pct" },
      { key: "directness", label: { en: "Directness", is: "Beinskeytni" }, tip: { en: "How vertically direct the team's build-up is (higher = more direct).", is: "Hversu beint upp völlinn liðið byggir (hærra = beinna)." }, format: "dec2" },
    ],
  },
  {
    group: "pressing", title: { en: "Pressing & defence", is: "Pressa & vörn" },
    specs: [
      { key: "pressures", label: { en: "Pressures", is: "Pressur" }, format: "int" },
      { key: "counterpressures", label: { en: "Counterpressures", is: "Gagnpressur" }, tip: { en: "Pressures within 5s of losing the ball — winning it back fast.", is: "Pressur innan 5s frá boltatapi — að vinna hann strax til baka." }, format: "int" },
      { key: "pressures_opp_half_pct", label: { en: "Pressures in opp. half %", is: "Pressur á vallarhelmingi andstæðings %" }, format: "pct" },
      { key: "ppda", label: { en: "PPDA", is: "PPDA" }, tip: { en: "Opponent passes allowed per defensive action — lower = a more intense press.", is: "Sendingar andstæðings leyfðar per varnaraðgerð — lægra = ákafari pressa." }, format: "dec1", higherIsBetter: false },
      { key: "aggression", label: { en: "Aggressive actions", is: "Ágengar aðgerðir" }, tip: { en: "Tackles, fouls & pressures applied quickly and high up.", is: "Tæklingar, brot og pressur beitt hratt og framarlega." }, format: "int" },
      { key: "def_action_regains", label: { en: "Defensive-action regains", is: "Endurheimtur úr varnaraðgerð" }, format: "int" },
      { key: "tackles", label: { en: "Tackles", is: "Tæklingar" }, format: "int" },
      { key: "interceptions", label: { en: "Interceptions", is: "Sendingarrof" }, format: "int" },
    ],
  },
  {
    group: "onball", title: { en: "On-ball value (OBV)", is: "Virði á bolta (OBV)" },
    specs: [
      { key: "obv", label: { en: "Total OBV", is: "OBV alls" }, tip: { en: "On-Ball Value — total change in scoring probability from a team's on-ball actions.", is: "On-Ball Value — heildarbreyting á skoralíkindum úr aðgerðum liðsins með boltann." }, format: "dec2" },
      { key: "pass_obv", label: { en: "Passing OBV", is: "Sendinga-OBV" }, format: "dec2" },
      { key: "shot_obv", label: { en: "Shooting OBV", is: "Skot-OBV" }, format: "dec2" },
      { key: "carry_obv", label: { en: "Carry & dribble OBV", is: "Burðar-OBV" }, format: "dec2" },
      { key: "def_action_obv", label: { en: "Defensive-action OBV", is: "Varnar-OBV" }, format: "dec2" },
    ],
  },
];

export function buildSbTeamMatchReport(match: SbTeamRow, seasonRows: SbTeamRow[]): SbTeamMatchReport {
  // Season average excludes this exact match so "vs your usual" is a fair comparison.
  const others = seasonRows.filter((r) => r.match_date !== match.match_date);
  const possOwn = N(match.possession_pct) ?? N(match.possession_proxy_pct);

  let present = 0, total = 0;
  const sections: ReportSection[] = SECTIONS.map((s) => ({
    group: s.group, title: s.title,
    metrics: s.specs.map((sp) => {
      const own = sp.key === "possession_pct" ? possOwn : N(match[sp.key]);
      const opp = sp.oppKey ? N(match[sp.oppKey]) : null;
      const seasonAvg = sp.key === "possession_pct"
        ? (seasonMean(others, "possession_pct") ?? seasonMean(others, "possession_proxy_pct"))
        : seasonMean(others, sp.key);
      total += 1;
      if (own != null) present += 1;
      return { key: sp.key, label: sp.label, tip: sp.tip, own, opp, seasonAvg, format: sp.format, higherIsBetter: sp.higherIsBetter ?? true };
    }),
  }));

  const goals = N(match.goals), goalsAgainst = N(match.goals_against);
  const xg = N(match.xg), xga = N(match.xg_against);
  const shots = N(match.shots), shotsA = N(match.shots_against);

  // Glance verdict — lead on the xG battle (chance quality), the honest single sentence.
  let headline: Bi;
  if (xg != null && xga != null) {
    const d = xg - xga;
    const near = Math.abs(d) < 0.3;
    headline = near
      ? { en: `An even game by chance quality (xG ${xg.toFixed(2)}–${xga.toFixed(2)}).`, is: `Jafn leikur eftir gæðum færa (xG ${xg.toFixed(2)}–${xga.toFixed(2)}).` }
      : d > 0
        ? { en: `You created the better chances (xG ${xg.toFixed(2)}–${xga.toFixed(2)}).`, is: `Þið sköpuðuð betri færin (xG ${xg.toFixed(2)}–${xga.toFixed(2)}).` }
        : { en: `The opponent created the better chances (xG ${xg.toFixed(2)}–${xga.toFixed(2)}).`, is: `Andstæðingurinn skapaði betri færin (xG ${xg.toFixed(2)}–${xga.toFixed(2)}).` };
  } else {
    headline = { en: "Team match stats for this game.", is: "Liðs-tölfræði fyrir þennan leik." };
  }

  // 2–3 plain supporting facts — a scoreline read, the shot count, and one standout vs the norm.
  const facts: Bi[] = [];
  if (goals != null && goalsAgainst != null) {
    const gd = goals > goalsAgainst ? { en: "a win", is: "sigur" } : goals < goalsAgainst ? { en: "a loss", is: "tap" } : { en: "a draw", is: "jafntefli" };
    const finishing = xg != null && goals != null
      ? (goals - xg > 0.7 ? { en: " — clinical finishing above the xG", is: " — klínísk nýting yfir xG" }
         : xg - goals > 0.7 ? { en: " — wasteful in front of goal vs the xG", is: " — sóun í dauðafærum m.v. xG" } : { en: "", is: "" })
      : { en: "", is: "" };
    facts.push({ en: `Final score ${goals}–${goalsAgainst}, ${gd.en}${finishing.en}.`, is: `Lokastaða ${goals}–${goalsAgainst}, ${gd.is}${finishing.is}.` });
  }
  if (shots != null && shotsA != null) facts.push({ en: `${shots} shots to ${shotsA}.`, is: `${shots} skot gegn ${shotsA}.` });
  // Standout: the metric furthest above its season average (as a %) that has a baseline.
  const standout = pickStandout(sections, others);
  if (standout) facts.push(standout);

  return {
    matchDate: match.match_date,
    opponent: match.opponent ?? null,
    isHome: match.is_home ?? null,
    goals, goalsAgainst,
    headline, facts, sections,
    coverage: { present, total },
  };
}

/** The single most above-normal metric this match, phrased plainly. Null if no baseline exists. */
function pickStandout(sections: ReportSection[], others: SbTeamRow[]): Bi | null {
  if (others.length < 2) return null;
  let best: { m: ReportMetric; rel: number } | null = null;
  for (const s of sections) for (const m of s.metrics) {
    if (m.own == null || m.seasonAvg == null || m.seasonAvg <= 0 || m.format === "pct") continue;
    const rel = (m.own - m.seasonAvg) / m.seasonAvg;
    if (rel > 0.25 && (!best || rel > best.rel)) best = { m, rel };
  }
  if (!best) return null;
  const pct = Math.round(best.rel * 100);
  return {
    en: `${best.m.label.en} well above your season norm this game (${fmtVal(best.m.own, best.m.format)} vs ~${fmtVal(best.m.seasonAvg, best.m.format)} average, +${pct}%).`,
    is: `${best.m.label.is} langt yfir tímabils-venju í þessum leik (${fmtVal(best.m.own, best.m.format)} vs ~${fmtVal(best.m.seasonAvg, best.m.format)} meðaltal, +${pct}%).`,
  };
}

export function fmtVal(v: number | null, format: MetricFormat): string {
  if (v == null) return "—";
  if (format === "int") return String(Math.round(v));
  if (format === "pct") return `${Math.round(v)}%`;
  if (format === "dec1") return v.toFixed(1);
  return v.toFixed(2);
}

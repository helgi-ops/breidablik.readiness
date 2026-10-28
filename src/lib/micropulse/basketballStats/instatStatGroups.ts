/**
 * instatStatGroups — organise an InStat single-match player row (the full ~128-column box)
 * into readable groups for the "Show all stats" view. Pure, no IO.
 *
 * The InStat column names are already standard basketball terms, so metric labels keep the
 * English name (with a few IS overrides); only the group headers are fully bilingual. Every
 * stored column lands in exactly one group, so nothing the feed reports is hidden. The core
 * box (points/FG/rebounds/…) and identity columns are shown in the box table above, so they
 * are skipped here. Descriptive scouting — never a readiness or training signal.
 */

export type GroupKey = "shotQuality" | "playtypes" | "advanced" | "defense" | "other";

export const GROUP_TITLES: Record<GroupKey, { en: string; is: string }> = {
  shotQuality: { en: "Shot quality (contested / uncontested)", is: "Skotgæði (varin / óvarin)" },
  playtypes: { en: "Play types", is: "Sóknartegundir" },
  advanced: { en: "Advanced — efficiency & impact", is: "Ítarlegt — nýting & áhrif" },
  defense: { en: "Defense — how opponents shot vs this player", is: "Vörn — hvernig andstæðingar skutu á leikmanninn" },
  other: { en: "Other", is: "Annað" },
};

export const GROUP_ORDER: GroupKey[] = ["playtypes", "shotQuality", "advanced", "defense", "other"];

// Identity + the core box (shown in the box table above) — skipped in the all-stats view.
const SKIP = new Set<string>([
  "Player", "Jersey number", "Minutes",
  "Points", "Field goals made", "Field goals attempted", "Field goals, %",
  "2-pt field goals made", "2-pt field goals attempted", "2-pt field goals, %",
  "3-pt field goals made", "3-pt field goals attempted", "3-pt field goals, %",
  "Free throws made", "Free throws attempted", "Free throws, %",
  "Rebounds", "Offensive rebounds", "Defensive rebounds",
  "Assists", "Steals", "Turnovers", "Blocks", "Fouls", "Plus/Minus",
]);

const ADVANCED = new Set<string>([
  "Usage Percentage", "True shooting percentage", "Effective field goal percentage",
  "Points per player's possession", "Number of player's possessions",
  "Offensive rating", "Defensive rating", "Net rating",
  "Assists to turnovers", "Steals to turnovers", "Draw foul rate",
  "Points off assists", "Points off screen assists", "Screen Assist",
  "Team points with player", "Fouls drawn", "Deflections",
]);

const PLAYTYPE_RE = /pnp|pnr|pr handler|pr roller|pick-n-pop|isolation|post up|posts up|\bcuts?\b|hand off|screens? off|transition|drive|catch and shoot|catch and drive/i;

/** A few Icelandic metric-label overrides; everything else keeps the InStat English name. */
const IS_LABELS: Record<string, string> = {
  "Usage Percentage": "Notkunarhlutfall (usage)",
  "True shooting percentage": "Sönn skotnýting (TS)",
  "Effective field goal percentage": "Virk skotnýting (eFG)",
  "Points per player's possession": "Stig á sókn",
  "Offensive rating": "Sóknartala",
  "Defensive rating": "Varnartala",
  "Net rating": "Nettó tala",
  "Assists to turnovers": "Stoðs./tapaðir",
  "Points off assists": "Stig af stoðsendingum",
  "Screen Assist": "Skermunar-stoð",
  "Deflections": "Boltatruflanir",
  "Fouls drawn": "Villur teknar",
  "Team points with player": "Stig liðs með leikmanni",
};

export function groupOf(key: string): GroupKey {
  const low = key.toLowerCase();
  if (low.startsWith("opp")) return "defense";              // "Opp ..." / "Opponent ..." matchup defense
  if (low.includes("contested field goal")) return "shotQuality";
  if (ADVANCED.has(key)) return "advanced";
  if (PLAYTYPE_RE.test(key)) return "playtypes";
  return "other";
}

export function labelFor(key: string, lang: "EN" | "IS"): string {
  return lang === "IS" ? (IS_LABELS[key] ?? key) : key;
}

/** Normalise a raw InStat cell to a display string ("-"/""/null → "–"). */
export function statValue(v: unknown): string {
  if (v == null) return "–";
  const s = String(v).trim();
  return !s || s === "-" || s === "—" ? "–" : s;
}

/** Parse an InStat cell to a number, or null when it is blank / non-numeric ("-", "", "45.5%"). */
export function statNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/%/g, "").replace(/,/g, "");
  if (!s || s === "-" || s === "—") return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
}

export type SeasonPlayerStats = { name: string; games: number; stats: Record<string, number> };

/**
 * Aggregate per-game InStat player rows into ONE season line per player — the per-game average of
 * every numeric column (so the "all stats" view works for a whole season, not just one game).
 * Players are matched across games by an accent/case-folded name; a column is averaged only over the
 * games that reported it (blank/"-" cells don't drag the mean). Percentages are averaged unweighted —
 * a browse-level season view, not an exact possession-weighted rate. Descriptive scouting only.
 */
export function aggregateSeasonStats(rows: Array<{ name: string | null; stats: Record<string, unknown> | null }>): SeasonPlayerStats[] {
  const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  type Acc = { name: string; games: number; sums: Map<string, { sum: number; n: number }> };
  const byPlayer = new Map<string, Acc>();
  for (const r of rows) {
    const nm = String(r.name ?? "").trim();
    if (!nm || !r.stats) continue;
    const k = fold(nm);
    let acc = byPlayer.get(k);
    if (!acc) { acc = { name: nm, games: 0, sums: new Map() }; byPlayer.set(k, acc); }
    acc.games += 1;
    for (const [col, raw] of Object.entries(r.stats)) {
      const num = statNumber(raw);
      if (num == null) continue;
      const cur = acc.sums.get(col) ?? { sum: 0, n: 0 };
      cur.sum += num; cur.n += 1;
      acc.sums.set(col, cur);
    }
  }
  return [...byPlayer.values()]
    .map((acc) => {
      const stats: Record<string, number> = {};
      for (const [col, { sum, n }] of acc.sums) stats[col] = Math.round((sum / n) * 10) / 10;
      return { name: acc.name, games: acc.games, stats };
    })
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
}

export type GroupedStat = { group: GroupKey; title: { en: string; is: string }; rows: { key: string; value: string }[] };

/** Group a player's raw stats bag into display sections (non-empty groups only, ordered). */
export function groupStats(stats: Record<string, unknown> | null | undefined): GroupedStat[] {
  const buckets = new Map<GroupKey, { key: string; value: string }[]>();
  for (const [key, raw] of Object.entries(stats ?? {})) {
    if (SKIP.has(key)) continue;
    const value = statValue(raw);
    if (value === "–") continue;                            // hide empty cells (keeps the view honest)
    const g = groupOf(key);
    const arr = buckets.get(g) ?? [];
    arr.push({ key, value });
    buckets.set(g, arr);
  }
  return GROUP_ORDER.filter((g) => buckets.get(g)?.length)
    .map((g) => ({ group: g, title: GROUP_TITLES[g], rows: buckets.get(g)! }));
}

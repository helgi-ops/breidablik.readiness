/**
 * Wyscout Team → Stats (General, "Show opponents") Excel parser — pure, no IO.
 *
 * The coach exports wyscout.hudl.com → team page → Stats → DISPLAY General →
 * "Show opponents" ON → Export to Excel. That sheet has ONE row per team per
 * match (own + opponent = two rows per fixture) plus an AVERAGE block at the top
 * that must be skipped. This maps the already-read sheet matrix (SheetJS
 * `sheet_to_json(ws, { header: 1 })`) into `TeamMatchStatRow[]`.
 *
 * Defensive by design — Wyscout headers vary by locale/export version and some
 * pack two values in one cell ("14 / 4" = 14 shots, 4 on target). We:
 *   • find the header row ourselves (title/AVERAGE rows sit above it),
 *   • map columns by NORMALISED substring (never exact spelling),
 *   • coerce "primary / secondary" cells, strip "%", accept European commas,
 *   • keep the full row verbatim in `raw` so nothing is lost, and
 *   • report `unmappedHeaders` so the caller can log what it couldn't place.
 *
 * Descriptive football context only — it never touches the readiness colour.
 */

export type TeamMatchStatRow = {
  matchDate: string | null; // ISO yyyy-mm-dd
  isOpponent: boolean;
  opponentName: string | null;
  competition: string | null;
  scheme: string | null;
  goals: number | null;
  xg: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  passes: number | null;
  passesAccurate: number | null;
  possessionPct: number | null;
  losses: number | null;
  recoveries: number | null;
  duels: number | null;
  duelsWon: number | null;
  /** Full parsed row keyed by the exact header string (non-empty cells only). */
  raw: Record<string, unknown>;
};

export type TeamMatchStatsParse = {
  rows: TeamMatchStatRow[];
  fixtures: number;
  /** Original header cells (so the caller can print the real header row). */
  headerRow: string[];
  /** Headers we couldn't map to a modelled column (kept in `raw`, logged). */
  unmappedHeaders: string[];
  skipped: { reason: string; label: string | null }[];
};

export type TeamStatsParseOpts = {
  /** Our team's name as it appears in the Team column / match label. */
  teamName?: string;
};

// ── Normalisers ──────────────────────────────────────────────────────────────
/** Normalise a team name for comparison: Icelandic letters folded, accents
 *  stripped, non-alphanumerics removed. "Breiðablik" and "Breidablik" → "breidablik". */
export function normTeam(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/ð/g, "d").replace(/þ/g, "th").replace(/æ/g, "ae").replace(/ø/g, "o")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function normHeader(h: string): string {
  return String(h).trim().toLowerCase().replace(/[.,;:%()/\\-]/g, " ").replace(/\s+/g, " ").trim();
}

export function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s || s === "-" || s === "–" || s === "N/A") return null;
  s = s.replace(/\s/g, "").replace(/%$/, "");
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Split a "primary / secondary" cell (e.g. "14 / 4", "60/32") into two numbers. */
function splitPair(v: unknown): [number | null, number | null] {
  if (v == null) return [null, null];
  const s = String(v);
  if (s.includes("/")) {
    const parts = s.split("/");
    return [num(parts[0]), num(parts[1])];
  }
  return [num(v), null];
}

/**
 * Read a stat plus its secondary, tolerant of BOTH real Wyscout layouts:
 *   (a) one packed cell "14 / 4"  → [14, 4];
 *   (b) the value in `colIdx` with the secondary in the NEXT column, whose header
 *       is blank — a Wyscout sub-column (e.g. header "Shots / on target" carries
 *       shots in col N and the on-target count in col N+1 with an empty header).
 */
export function pairAt(cells: unknown[], headers: string[], colIdx: number): [number | null, number | null] {
  if (colIdx < 0) return [null, null];
  const cell = cells[colIdx];
  if (typeof cell === "string" && cell.includes("/")) return splitPair(cell);
  const primary = num(cell);
  const next = colIdx + 1;
  const secondary = next < headers.length && normHeader(String(headers[next] ?? "")) === "" ? num(cells[next]) : null;
  return [primary, secondary];
}

/**
 * Turn one data row into a `raw` record keyed by the EXACT header string, keeping
 * Wyscout's blank-header sub-columns (the on-target / accurate / won counts, the
 * Low/Medium/High breakdowns, the accuracy %) under `"<parent> [n]"`. Nothing is
 * lost, so future metrics need no migration. Shared by General + Passing/Attacking.
 */
export function rawRowRecord(headers: string[], cells: unknown[]): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  let parent = "";
  let off = 0;
  for (let c = 0; c < headers.length; c++) {
    const nh = normHeader(String(headers[c] ?? ""));
    if (nh) { parent = headers[c]; off = 0; } else { off += 1; }
    const v = cells[c];
    if (v == null || String(v).trim() === "") continue;
    const key = nh ? headers[c] : `${parent} [${off + 1}]`;
    raw[key] = v instanceof Date ? toDateStr(v) : v;
  }
  return raw;
}

/** Coerce a date cell (JS Date from cellDates, or a dd.mm.yyyy / ISO string) → ISO. */
export function toDateStr(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getUTCFullYear(), m = String(v.getUTCMonth() + 1).padStart(2, "0"), d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v ?? "");
  const dmy = s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

/** Pull the two team names from a Wyscout match label, tolerant of both forms:
 *  "Home 1:0 Away" (score in the middle) and "Home - Away 1:0" (score at the end). */
function labelTeams(label: string | null): { home: string; away: string } | null {
  if (!label) return null;
  let m = label.match(/^(.*?)\s+\d+\s*:\s*\d+\s+(.*?)$/);
  if (m) return { home: m[1].trim(), away: m[2].trim() };
  m = label.match(/^(.*?)\s+[-–]\s+(.*?)\s+\d+\s*:\s*\d+\s*$/);
  return m ? { home: m[1].trim(), away: m[2].trim() } : null;
}

// ── Header row + column mapping ───────────────────────────────────────────────
function findHeaderRow(matrix: unknown[][]): { idx: number; headers: string[] } | null {
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    const cells = (matrix[i] ?? []).map((c) => normHeader(String(c ?? "")));
    const hasTeam = cells.some((c) => c === "team" || (c.includes("team") && !c.includes("opponent")));
    const hasStat = cells.some((c) => c.includes("xg") || c === "goals" || c.includes("possession") || c.includes("match"));
    if (hasTeam && hasStat) return { idx: i, headers: (matrix[i] ?? []).map((c) => String(c ?? "")) };
  }
  return null;
}

type ColMap = Record<
  "match" | "date" | "competition" | "team" | "scheme" | "goals" | "xg" | "shots" | "passes" | "possession" | "losses" | "recoveries" | "duels",
  number
>;

function mapColumns(headers: string[]): { col: ColMap; unmapped: string[] } {
  const norm = headers.map(normHeader);
  const used = new Set<number>();
  const pick = (pred: (h: string) => boolean): number => {
    for (let i = 0; i < norm.length; i++) {
      if (used.has(i) || !norm[i]) continue;
      if (pred(norm[i])) { used.add(i); return i; }
    }
    return -1;
  };
  const col: ColMap = {
    match: pick((h) => h.includes("match")),
    date: pick((h) => h.includes("date")),
    competition: pick((h) => h.includes("competition") || h.includes("tournament")),
    team: pick((h) => h === "team" || (h.includes("team") && !h.includes("opponent"))),
    scheme: pick((h) => h.includes("scheme") || h.includes("formation")),
    goals: pick((h) => h === "goals" || (h.includes("goal") && !h.includes("conced") && !h.includes("against"))),
    xg: pick((h) => h === "xg" || (h.includes("xg") && !h.includes("against") && !h.includes("conced"))),
    shots: pick((h) => h.includes("shot")),
    passes: pick((h) => h.includes("pass")),
    possession: pick((h) => h.includes("possession") || h === "poss"),
    losses: pick((h) => h.includes("loss")),
    recoveries: pick((h) => h.includes("recover")),
    duels: pick((h) => h.includes("duel")),
  };
  const unmapped = headers.filter((_, i) => norm[i] && !used.has(i));
  return { col, unmapped };
}

/**
 * Infer our own team when the caller didn't name it. In a Team → Stats export
 * our side appears in EVERY fixture while each opponent appears once, so the most
 * common Team value IS our team. This lets any club's export import without a
 * hardcoded name (previously "Breidablik", which made every other club's file
 * parse to zero fixtures). Returns null when undecidable.
 */
export function inferOwnTeamName(matrix: unknown[][]): string | null {
  const head = findHeaderRow(matrix);
  if (!head) return null;
  const { col } = mapColumns(head.headers);
  if (col.team < 0) return null;
  const counts = new Map<string, { raw: string; n: number }>();
  for (let i = head.idx + 1; i < matrix.length; i++) {
    const raw = String((matrix[i] ?? [])[col.team] ?? "").trim();
    if (!raw) continue;
    const k = normTeam(raw);
    if (!k || k === "average" || k === "opponents" || k === "opponent" || k === "total") continue;
    const e = counts.get(k) ?? { raw, n: 0 };
    e.n += 1;
    counts.set(k, e);
  }
  let best: { raw: string; n: number } | null = null;
  for (const e of counts.values()) if (!best || e.n > best.n) best = e;
  return best ? best.raw : null;
}

// ── Parse ─────────────────────────────────────────────────────────────────────
export function parseWyscoutTeamStats(matrix: unknown[][], opts: TeamStatsParseOpts = {}): TeamMatchStatsParse {
  const teamName = opts.teamName ?? inferOwnTeamName(matrix) ?? "Breidablik";
  const ourKey = normTeam(teamName);
  const skipped: TeamMatchStatsParse["skipped"] = [];

  const head = findHeaderRow(matrix);
  if (!head) return { rows: [], fixtures: 0, headerRow: [], unmappedHeaders: [], skipped: [{ reason: "no header row found", label: null }] };
  const { col, unmapped } = mapColumns(head.headers);

  const at = (cells: unknown[], c: number): unknown => (c >= 0 ? cells[c] : undefined);
  const strOrNull = (v: unknown): string | null => {
    const s = String(v ?? "").trim();
    return s === "" ? null : s;
  };

  // Group data rows into fixtures. Wyscout blanks repeated Match/Date/Competition
  // cells, so carry the last non-empty value forward.
  type Grp = { label: string | null; date: string | null; comp: string | null; rows: Array<{ team: string; cells: unknown[] }> };
  const fixtures = new Map<string, Grp>();
  let curLabel: string | null = null, curDate: string | null = null, curComp: string | null = null;

  for (let i = head.idx + 1; i < matrix.length; i++) {
    const cells = matrix[i] ?? [];
    if (cells.every((c) => c == null || String(c).trim() === "")) continue;

    const rawLabel = strOrNull(at(cells, col.match));
    const rawDate = strOrNull(String(at(cells, col.date) ?? ""));
    const rawComp = strOrNull(at(cells, col.competition));
    if (rawLabel) curLabel = rawLabel;
    if (at(cells, col.date) != null && String(at(cells, col.date)).trim() !== "") curDate = toDateStr(at(cells, col.date)) ?? rawDate;
    if (rawComp) curComp = rawComp;

    const team = strOrNull(at(cells, col.team));
    if (!team) continue; // a label-only / subtitle row
    if (normTeam(team) === "average" || (curLabel && curLabel.toLowerCase().includes("average"))) {
      skipped.push({ reason: "average block", label: curLabel });
      continue;
    }
    const key = `${curLabel ?? ""}|${curDate ?? ""}`;
    const g = fixtures.get(key) ?? { label: curLabel, date: curDate, comp: curComp, rows: [] };
    g.rows.push({ team, cells });
    fixtures.set(key, g);
  }

  const rows: TeamMatchStatRow[] = [];
  let fixtureCount = 0;
  for (const g of fixtures.values()) {
    const date = toDateStr(g.date) ?? toDateStr(g.label ?? "");
    if (!date) { skipped.push({ reason: "no parseable date", label: g.label }); continue; }

    // Which teams are in this fixture, and which is ours?
    const oursRow = g.rows.find((r) => normTeam(r.team) === ourKey);
    const lt = labelTeams(g.label);
    const oppFromLabel = lt ? (normTeam(lt.home) === ourKey ? lt.away : normTeam(lt.away) === ourKey ? lt.home : null) : null;
    const oppRow = g.rows.find((r) => r !== oursRow);
    const opponentName = oppRow?.team ?? oppFromLabel ?? null;

    if (!oursRow && !oppFromLabel) {
      // Neither the Team column nor the label mentions our team — can't attribute.
      skipped.push({ reason: `our team "${teamName}" not found in fixture`, label: g.label });
      continue;
    }

    fixtureCount++;
    for (const r of g.rows) {
      const [shots, shotsOnTarget] = pairAt(r.cells, head.headers, col.shots);
      const [passes, passesAccurate] = pairAt(r.cells, head.headers, col.passes);
      const [duels, duelsWon] = pairAt(r.cells, head.headers, col.duels);
      const [losses] = pairAt(r.cells, head.headers, col.losses);
      const [recoveries] = pairAt(r.cells, head.headers, col.recoveries);

      // Keep EVERY cell in raw — including Wyscout sub-columns whose header is
      // blank (the on-target / accurate / won counts, and Losses/Recoveries
      // Low/Medium/High) — keyed under their parent header so nothing is lost.
      const raw = rawRowRecord(head.headers, r.cells);

      rows.push({
        matchDate: date,
        isOpponent: normTeam(r.team) !== ourKey,
        opponentName,
        competition: g.comp,
        scheme: strOrNull(at(r.cells, col.scheme)),
        goals: num(at(r.cells, col.goals)),
        xg: num(at(r.cells, col.xg)),
        shots, shotsOnTarget,
        passes, passesAccurate,
        possessionPct: num(at(r.cells, col.possession)),
        losses, recoveries,
        duels, duelsWon,
        raw,
      });
    }
  }

  return { rows, fixtures: fixtureCount, headerRow: head.headers, unmappedHeaders: unmapped, skipped };
}

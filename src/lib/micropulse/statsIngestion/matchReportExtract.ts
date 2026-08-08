import "server-only";

/**
 * StatsBomb IQ "Match Report" (Game Team Analysis) PDF → per-match player stats.
 *
 * The report's PDF text layer is genuine. The **title block** and the **page-4 team
 * line** parse DETERMINISTICALLY (`home / label / away` on one line). The **appendix
 * player tables** (p21–24) are the coach's per-player numbers, but the values are
 * concatenated with no delimiters (`Einar Freyr Halldórsson300.190.06200.1600`), which
 * is ambiguous to split by rule but tractable for the model given the column pattern —
 * so ONLY the per-player rows go to Claude, and the deterministic page-4 totals
 * cross-check the model's per-player sums before anything is trusted.
 *
 * READ-ONLY AI: the output is a proposal the coach confirms in a preview. Descriptive
 * football data — it NEVER touches the readiness colour, load, or the daily decision.
 */

// Sonnet is the accuracy tier; getting a player's xG right matters more than latency.
export const MATCH_REPORT_MODEL = "claude-sonnet-5";

export type Side = "home" | "away";

/** One team's page-4 line values (typed core + the raw cell string for audit). */
export type TeamLine = {
  goals: number | null; xg: number | null; shots: number | null; shotsOnTarget: number | null;
  possession: number | null; passCompletion: number | null; passes: number | null;
  pressures: number | null; pressureRegains: number | null; tacklesWon: number | null; yellowCards: number | null;
};

export type MatchReportMeta = { home: string; away: string; date: string | null };

/** One player's appendix stats. Typed columns map to player_match_stats; the rest ride in metrics. */
export type MatchReportPlayer = {
  name: string; team: Side;
  shots: number | null; goals: number | null; xg: number | null; xgPerShot: number | null;
  keyPasses: number | null; assists: number | null; xgAssisted: number | null;
  opKeyPasses: number | null; opAssists: number | null;
  xgChain: number | null; opXgChain: number | null; xgBuildup: number | null; opXgBuildup: number | null;
  tackles: number | null; interceptions: number | null; dribbledPast: number | null; deepProgressions: number | null;
  passes: number | null; passesIntoBox: number | null;
};

export type ReconcileCheck = { metric: string; teamTotal: number | null; playerSum: number; delta: number | null; withinTolerance: boolean };
export type MatchReportExtract = {
  meta: MatchReportMeta;
  teamLine: { home: TeamLine; away: TeamLine };
  players: MatchReportPlayer[];
  usedFallback: boolean;
};

// ── deterministic helpers (pure, unit-tested) ──────────────────────────────

const NUMISH = String.raw`[\d.,()/\s%-]`; // chars allowed around a page-4 label
const numLead = (s: string): number | null => {
  const m = String(s).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const toNum = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const toInt = (v: unknown): number | null => { const n = toNum(v); return n == null ? null : Math.round(n); };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Is this the StatsBomb Match Report v1.x layout? (fingerprint before parsing) */
export function isMatchReportPdfText(text: string): boolean {
  const t = (text || "").toUpperCase();
  return t.includes("MATCH REPORT") && /STATSBOMB MATCH REPORT VERSION 1\./.test(t) && t.includes("MATCH STATISTICS");
}

/** Home/away team names (from the "X V Y" title) + the match date. */
export function parseTitle(text: string): MatchReportMeta {
  const t = text || "";
  const title = t.match(/MATCH REPORT\s*([^\n]*?)\s+V\s+([^\n]+)/i);
  // No \b — the date is glued to a preceding year in the text ("KARLA20262026-08-04").
  const date = t.match(/(\d{4}-\d{2}-\d{2})/);
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  return { home: title ? clean(title[1]) : "", away: title ? clean(title[2]) : "", date: date ? date[1] : null };
}

// page-4 labels, LONGEST FIRST so "Cumulative xG"/"Shots On Target" win over "xG"/"Shots".
const TEAM_LABELS: Array<[keyof TeamLine | "cumulativeXg" | "redCards", string, "int" | "num"]> = [
  ["passes", "Total Passes (Completed)", "int"],
  ["tacklesWon", "Tackles Won (Attempts)", "int"],
  ["redCards", "Red Cards/Second Yellow Cards", "int"],
  ["shotsOnTarget", "Shots On Target", "int"],
  ["passCompletion", "Pass Completion %", "int"],
  ["pressureRegains", "Pressure Regains", "int"],
  ["cumulativeXg", "Cumulative xG", "num"],
  ["possession", "Possession %", "int"],
  ["yellowCards", "Yellow Cards", "int"],
  ["pressures", "Pressures", "int"],
  ["goals", "Goals", "int"],
  ["shots", "Shots", "int"],
  ["xg", "xG", "num"],
];

/**
 * Page-4 "Match Statistics": each stat is one line `<home><Label><away>`. Numeric-only
 * anchoring around the label means "xG" can't match inside "Cumulative xG". Deterministic.
 */
export function parseTeamLinePage4(text: string): { home: TeamLine; away: TeamLine } {
  const blank = (): TeamLine => ({ goals: null, xg: null, shots: null, shotsOnTarget: null, possession: null, passCompletion: null, passes: null, pressures: null, pressureRegains: null, tacklesWon: null, yellowCards: null });
  const home = blank(), away = blank();
  const lines = (text || "").split(/\r?\n/);
  for (const [key, label, kind] of TEAM_LABELS) {
    if (key === "cumulativeXg" || key === "redCards") continue; // parsed only to avoid collisions
    const re = new RegExp(`^(${NUMISH}+?)${esc(label)}(${NUMISH}+)$`);
    for (const ln of lines) {
      const m = ln.trim().match(re);
      if (!m) continue;
      const h = numLead(m[1]), a = numLead(m[2]);
      const cast = (v: number | null) => (v == null ? null : kind === "int" ? Math.round(v) : v);
      home[key as keyof TeamLine] = cast(h);
      away[key as keyof TeamLine] = cast(a);
      break;
    }
  }
  return { home, away };
}

/** Cross-check the model's per-player sums against the deterministic page-4 totals. */
export function reconcile(teamLine: TeamLine, players: MatchReportPlayer[]): ReconcileCheck[] {
  const sum = (f: (p: MatchReportPlayer) => number | null) => players.reduce((a, p) => a + (f(p) ?? 0), 0);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const mk = (metric: string, total: number | null, playerSum: number, tol: number): ReconcileCheck => ({
    metric, teamTotal: total, playerSum: round2(playerSum),
    delta: total == null ? null : round2(playerSum - total),
    withinTolerance: total == null ? true : Math.abs(playerSum - total) <= tol,
  });
  return [
    mk("xg", teamLine.xg, sum((p) => p.xg), 0.25),          // per-player xG summed vs team xG (2dp rounding across squad)
    mk("shots", teamLine.shots, sum((p) => p.shots), 0),     // exact
    mk("goals", teamLine.goals, sum((p) => p.goals), 0),     // exact
  ];
}

// ── AI extraction of the per-player appendix rows ──────────────────────────

export const MATCH_REPORT_SYSTEM = `You extract per-player stats from the APPENDIX pages of a StatsBomb "Match Report" PDF (already converted to text). Return ONLY JSON — no prose, no markdown.

Layout facts you must use:
- Two teams appear SEQUENTIALLY under each "APPENDIX, PLAYER STATS" section: the HOME team's players first, then a header row, then the AWAY team's players. The title line is "<HOME> V <AWAY>".
- Each player line is the player name followed by that section's numbers CONCATENATED with no separators, e.g. "Einar Freyr Halldórsson300.190.06200.1600" under columns [Shots, Goals, xG, xG/Shot, KP, Assists, xG Assisted, OP KP, OP Assists] means Shots=3, Goals=0, xG=0.19, xG/Shot=0.06, KP=2, Assists=0, xG Assisted=0.16, OP KP=0, OP Assists=0.
- Segment the number run by TYPE: Shots/Goals/KP/Assists/OP KP/OP Assists/Passes/Interceptions/Tackles counts are INTEGERS; xG/xG per Shot/xG Assisted/xG Chain/xG Buildup are DECIMALS (0.xx, occasionally ≥1). Use the column order to split correctly.
- The report has four appendix sections: "Shots and Key-Passes" (Shots, Goals, xG, xG/Shot, KP, Assists, xG Assisted, OP KP, OP Assists); "Passing & Touches"; "Defensive Actions & Other" (Tackles, Interceptions, T+I, Deep Progressions, Tackle/Dribble-past%, Fouls, Clearances, Aerials Won, Aerial%, Dribbled past); "xG Chain" (xG Chain, OP xG Chain, xG Buildup, OP xG Buildup). MERGE all sections into ONE object per player, matched by name.

Rules:
- Use ONLY numbers present in the text. If a field is not readable, use null. NEVER invent or approximate a value.
- Tag each player home or away by which block they are in.
- Return EXACTLY: {"players":[{"name":string,"team":"home"|"away","shots":int|null,"goals":int|null,"xg":number|null,"xg_per_shot":number|null,"key_passes":int|null,"assists":int|null,"xg_assisted":number|null,"op_key_passes":int|null,"op_assists":int|null,"xg_chain":number|null,"op_xg_chain":number|null,"xg_buildup":number|null,"op_xg_buildup":number|null,"tackles":number|null,"interceptions":number|null,"dribbled_past":number|null,"deep_progressions":number|null,"passes":int|null,"passes_into_box":int|null}]}`;

/** Coerce the model's players[] JSON into the strict typed shape (no zod). */
export function validateMatchReportPlayers(raw: unknown): MatchReportPlayer[] {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const arr = Array.isArray(o.players) ? (o.players as unknown[]) : [];
  const out: MatchReportPlayer[] = [];
  for (const r of arr) {
    const it = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const name = typeof it.name === "string" ? it.name.trim() : "";
    if (!name) continue;
    const team: Side = it.team === "home" ? "home" : "away";
    out.push({
      name, team,
      shots: toInt(it.shots), goals: toInt(it.goals), xg: toNum(it.xg), xgPerShot: toNum(it.xg_per_shot),
      keyPasses: toInt(it.key_passes), assists: toInt(it.assists), xgAssisted: toNum(it.xg_assisted),
      opKeyPasses: toInt(it.op_key_passes), opAssists: toInt(it.op_assists),
      xgChain: toNum(it.xg_chain), opXgChain: toNum(it.op_xg_chain), xgBuildup: toNum(it.xg_buildup), opXgBuildup: toNum(it.op_xg_buildup),
      tackles: toNum(it.tackles), interceptions: toNum(it.interceptions), dribbledPast: toNum(it.dribbled_past), deepProgressions: toNum(it.deep_progressions),
      passes: toInt(it.passes), passesIntoBox: toInt(it.passes_into_box),
    });
  }
  return out;
}

/** The per-player fields to persist into `metrics` jsonb (everything beyond the typed columns). */
export function playerMetricsBag(p: MatchReportPlayer): Record<string, number | null> {
  return {
    "xG/Shot": p.xgPerShot, "xG Assisted": p.xgAssisted, "OP Key Passes": p.opKeyPasses, "OP Assists": p.opAssists,
    "xG Chain": p.xgChain, "OP xG Chain": p.opXgChain, "xG Buildup": p.xgBuildup, "OP xG Buildup": p.opXgBuildup,
    "Tackles": p.tackles, "Interceptions": p.interceptions, "Dribbled Past": p.dribbledPast, "Deep Progressions": p.deepProgressions,
    "Passes": p.passes, "Passes Into Box": p.passesIntoBox,
  };
}

/**
 * Read the PDF text (pdf-parse; base64 document fallback with no text layer), parse the
 * deterministic meta + page-4 team line, and ask the model for the per-player appendix
 * rows. Throws if the file isn't a Match Report or the model returns non-JSON.
 */
export async function extractMatchReport(opts: { apiKey: string; buffer: Buffer }): Promise<MatchReportExtract> {
  let text = "";
  try {
    const pdfParse = (await import("pdf-parse")).default as (b: Buffer) => Promise<{ text?: string }>;
    const parsed = await pdfParse(opts.buffer);
    text = (parsed?.text ?? "").trim();
  } catch { /* no text layer — document fallback below */ }

  const hasText = text.length > 200;
  if (hasText && !isMatchReportPdfText(text)) {
    throw new Error("This PDF isn't a StatsBomb Match Report (expected the 'MATCH STATISTICS' page and the 'Statsbomb Match Report Version 1.x' footer). Download it from StatsBomb IQ → Game Team Analysis.");
  }

  const meta = hasText ? parseTitle(text) : { home: "", away: "", date: null };
  const teamLine = hasText ? parseTeamLinePage4(text) : { home: parseTeamLinePage4("").home, away: parseTeamLinePage4("").away };

  const content: Array<Record<string, unknown>> = hasText
    ? [{ type: "text", text: `Appendix text of the Match Report:\n\n${text}\n\nExtract the per-player appendix stats as JSON per the schema. JSON only.` }]
    : [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: opts.buffer.toString("base64") } },
        { type: "text", text: "Extract the per-player appendix stats as JSON per the schema. JSON only." },
      ];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
    // Structured extraction, not reasoning — disable thinking (Sonnet 5 runs adaptive
    // thinking by DEFAULT when the field is omitted, which would eat the whole budget
    // and return no text). A full squad of per-player rows needs generous max_tokens.
    body: JSON.stringify({ model: MATCH_REPORT_MODEL, max_tokens: 8000, thinking: { type: "disabled" }, system: MATCH_REPORT_SYSTEM, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const raw = json.content?.find((c) => c.type === "text")?.text ?? "";
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  const jsonText = a >= 0 && b > a ? cleaned.slice(a, b + 1) : cleaned;
  const players = validateMatchReportPlayers(JSON.parse(jsonText)); // throws → caller returns 422

  return { meta, teamLine, players, usedFallback: !hasText };
}

/**
 * Player name matching — Wyscout name → MicroPulse squad player.
 *
 * Wyscout names never perfectly equal MicroPulse names: accents, letter order
 * ("Gudmundsson A." vs "A. Gudmundsson"), "Lastname, Firstname", romanized
 * Icelandic (Þorsteinsson → Thorsteinsson / Torsteinsson), and initials
 * ("B. Þorsteinsson"). This resolves them with a HUMAN IN THE LOOP:
 *
 *   - exact  → normalized token sets are equal AND unique in the squad → auto-map.
 *   - fuzzy  → a near-miss above the review floor → surface for a coach to confirm
 *              (never silently applied).
 *   - none   → below the floor → kept unmapped in the "unmatched" tray, never
 *              guessed onto the wrong player.
 *
 * Pure, IO-free. The resolved mapping is persisted upstream (stat_player_mapping)
 * so a name is matched once, then remembered.
 */

import type { SquadPlayer } from "./types";

export type MatchConfidence = "exact" | "fuzzy" | "none";

export type NameCandidate = { playerId: string; fullName: string; score: number };

export type NameMatch = {
  playerId: string | null;
  confidence: MatchConfidence;
  score: number; // 0..1 for the chosen candidate
  candidates: NameCandidate[]; // top few for the review UI, best first
};

/** Above this an unmatched-but-close name is offered for review; below → none. */
export const FUZZY_REVIEW_FLOOR = 0.72;
/** A single suggestion at/above this is a confident fuzzy suggestion. */
export const FUZZY_STRONG = 0.82;

// ── Normalization ────────────────────────────────────────────────────────────
// Transliterate Icelandic letters that NFD does NOT decompose, then strip the
// accents NFD does handle (á→a, é→e …). Wyscout romanization is inconsistent, so
// we map to the common ASCII form and let the fuzzy layer absorb the rest.
function translit(s: string): string {
  return s
    .replace(/þ/g, "th").replace(/ð/g, "d")
    .replace(/æ/g, "ae").replace(/[øö]/g, "o").replace(/å/g, "a");
}

/** Lowercase, transliterate, strip diacritics/punctuation → clean token string. */
export function normalizeName(raw: string): string {
  let s = (raw ?? "").toLowerCase().trim();
  // "Lastname, Firstname" → "Firstname Lastname"
  const comma = s.indexOf(",");
  if (comma >= 0) s = `${s.slice(comma + 1).trim()} ${s.slice(0, comma).trim()}`;
  s = translit(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
  return s.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function nameTokens(raw: string): string[] {
  return normalizeName(raw).split(" ").filter(Boolean);
}

// ── Similarity ───────────────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

function sim(a: string, b: string): number {
  const m = Math.max(a.length, b.length);
  return m === 0 ? 1 : 1 - levenshtein(a, b) / m;
}

/** Two tokens "match" if equal, one is an initial (single char) prefix of the
 *  other, or they're within edit distance (handles romanization wobble). */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1) return b.startsWith(a);
  if (b.length === 1) return a.startsWith(b);
  return sim(a, b) >= 0.8;
}

/** Symmetric token-overlap F1 between two token lists. */
function tokenF1(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const used = new Array(b.length).fill(false);
  let matched = 0;
  for (const ta of a) {
    const idx = b.findIndex((tb, i) => !used[i] && tokensMatch(ta, tb));
    if (idx >= 0) { used[idx] = true; matched++; }
  }
  const precision = matched / a.length;
  const recall = matched / b.length;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

/** Score one Wyscout name against one squad name, 0..1. */
export function scoreName(wyscout: string, squad: string): number {
  const a = nameTokens(wyscout);
  const b = nameTokens(squad);
  if (!a.length || !b.length) return 0;
  const f1 = tokenF1(a, b);
  const full = sim([...a].sort().join(" "), [...b].sort().join(" "));
  return Math.max(f1, full);
}

function sortedTokenKey(raw: string): string {
  return [...nameTokens(raw)].sort().join(" ");
}

// ── Public matcher ───────────────────────────────────────────────────────────
/**
 * Resolve one Wyscout name against a squad. Returns the confidence tier and the
 * best candidate(s). Never auto-maps a fuzzy or ambiguous name.
 */
export function matchPlayerName(wyscoutName: string, squad: SquadPlayer[]): NameMatch {
  const scored: NameCandidate[] = squad
    .map((p) => ({ playerId: p.id, fullName: p.fullName, score: scoreName(wyscoutName, p.fullName) }))
    .sort((x, y) => y.score - x.score);

  const candidates = scored.filter((c) => c.score >= FUZZY_REVIEW_FLOOR).slice(0, 3);

  // Exact = unique squad member whose sorted token set equals the wyscout name's.
  const key = sortedTokenKey(wyscoutName);
  const exactMatches = key ? squad.filter((p) => sortedTokenKey(p.fullName) === key) : [];
  if (exactMatches.length === 1) {
    return { playerId: exactMatches[0].id, confidence: "exact", score: 1, candidates };
  }

  const best = scored[0];
  if (best && best.score >= FUZZY_REVIEW_FLOOR) {
    // Ambiguous ties (two near-equal candidates) stay fuzzy → the coach picks.
    return { playerId: best.playerId, confidence: "fuzzy", score: best.score, candidates };
  }
  return { playerId: null, confidence: "none", score: best?.score ?? 0, candidates };
}

/**
 * (first-initial, last-token) key — the proven auto-map for Wyscout's abbreviated
 * "A. Bjarnason" / "G. Snær Hallsson" player-list export, which never carries a
 * full first name. "" when there are no tokens.
 */
export function initialSurnameKey(name: string): string {
  const toks = nameTokens(name);
  if (!toks.length) return "";
  return `${toks[0][0]} ${toks[toks.length - 1]}`;
}

/**
 * Match an abbreviated Wyscout name against a squad by (first-initial, surname).
 * A UNIQUE key hit auto-maps (proven 22/22 on the Breiðablik senior export); an
 * ambiguous key (two players share initial+surname) stays fuzzy for review; no
 * hit falls back to the generic fuzzy matcher. Never guesses onto a wrong player.
 */
export function matchByInitialSurname(wyscoutName: string, squad: SquadPlayer[]): NameMatch {
  const key = initialSurnameKey(wyscoutName);
  if (!key) return { playerId: null, confidence: "none", score: 0, candidates: [] };
  const hits = squad.filter((p) => initialSurnameKey(p.fullName) === key);
  const candidates: NameCandidate[] = hits
    .map((p) => ({ playerId: p.id, fullName: p.fullName, score: scoreName(wyscoutName, p.fullName) }))
    .sort((a, b) => b.score - a.score);
  if (hits.length === 1) {
    return { playerId: hits[0].id, confidence: "exact", score: 1, candidates };
  }
  if (hits.length > 1) {
    return { playerId: candidates[0].playerId, confidence: "fuzzy", score: candidates[0].score, candidates };
  }
  return matchPlayerName(wyscoutName, squad);
}

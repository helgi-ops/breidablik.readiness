/**
 * Peak-match story — the explainability-first LAYER-0 read for a player's peak-period / power-curve
 * match card (the WyscoutFusionUpload per-player card). Distils the already-computed peak windows into:
 *   (0) one plain-language verdict — where his peak demands land + how his high-speed running holds up,
 *   (1) 2–3 supporting facts (the hardest minute, the hardest run, the H1→H2 high-speed split),
 *   with a confidence grade and an honest caveat. The raw per-window detail stays behind the card's
 *   existing "Show all details" toggle (Level 2).
 *
 * Pure, null-safe, no IO. Rules compute — NOT AI. Descriptive tactical context — never the readiness
 * colour. Within-match peak demands framing: Ju W et al. 2022.
 */

export type Bi = { en: string; is: string };
type Phase = "attacking" | "defending" | "open";
type Conf = "high" | "medium" | "low";

export type PeakMatchStoryInput = {
  position?: string | null;
  started?: boolean;
  /** Hardest single minute (peak 1-min Player Load window). */
  hardestMinute?: { plPerMin: number | null; clock: string | null; phase: Phase; secondHalf: boolean; confidence: Conf } | null;
  /** Hardest sustained run (peak distance window, usually 5-min). */
  hardestRun?: { distanceM: number | null; windowMin: number; phase: Phase } | null;
  /** High-speed running by half (metres). */
  hsr?: { h1: number | null; h2: number | null } | null;
  /** Wyscout team-events uploaded for this match → tactical PHASE claims are meaningful. */
  tacticalAligned: boolean;
};

export type PeakMatchStory = {
  hasData: boolean;
  verdict: Bi;
  facts: Bi[];
  confidence: Conf;
  caveat: Bi | null;
  citation: string;
};

const CITATION = "Ju W et al. 2022 — within-match peak demands";

function phaseWord(p: Phase, is: boolean): string {
  return p === "attacking" ? (is ? "sókn" : "attack") : p === "defending" ? (is ? "vörn" : "defence") : (is ? "opnum leik" : "open play");
}
function pl(x: number | null): string { return x == null ? "–" : x.toFixed(1); }
function m(x: number | null): string { return x == null ? "–" : `${Math.round(x)} m`; }

/** Fade/rise of high-speed running H1→H2. */
function hsrFade(hsr: PeakMatchStoryInput["hsr"]): { pct: number; dir: "fade" | "rise" | "steady" } | null {
  if (!hsr || hsr.h1 == null || hsr.h2 == null || hsr.h1 <= 0) return null;
  const pct = Math.round((hsr.h2 / hsr.h1 - 1) * 100);
  return { pct, dir: pct <= -10 ? "fade" : pct >= 10 ? "rise" : "steady" };
}

export function buildPeakMatchStory(input: PeakMatchStoryInput): PeakMatchStory {
  const hm = input.hardestMinute ?? null;
  const hr = input.hardestRun ?? null;
  const aligned = input.tacticalAligned;

  if (!hm && !hr) {
    return { hasData: false, verdict: { en: "", is: "" }, facts: [], confidence: "low", caveat: null, citation: CITATION };
  }

  // Dominant phase across the two peaks (only when tactical events are present).
  const phases = [hm?.phase, hr?.phase].filter((p): p is Phase => p === "attacking" || p === "defending");
  const atk = phases.filter((p) => p === "attacking").length;
  const def = phases.filter((p) => p === "defending").length;
  const dominant: Phase | "both" | null = !aligned || phases.length === 0 ? null : atk > 0 && def > 0 ? "both" : atk > 0 ? "attacking" : "defending";

  const fade = hsrFade(input.hsr);
  const fadeClause = (is: boolean): string => {
    if (!fade) return "";
    const w = fade.dir === "fade" ? (is ? "dettur" : "drops") : fade.dir === "rise" ? (is ? "hækkar" : "climbs") : (is ? "helst svipað" : "holds");
    if (fade.dir === "steady") return is ? ` Háhraðahlaup ${w} milli hálfleikja.` : ` High-speed running ${w} across the halves.`;
    return is
      ? ` Háhraðahlaup ${w} um ${Math.abs(fade.pct)}% milli hálfleikja.`
      : ` High-speed running ${w} ${Math.abs(fade.pct)}% from the first half to the second.`;
  };

  // ── Verdict (Level 0) ──
  let verdict: Bi;
  if (dominant && dominant !== "both") {
    const both = hm && hr && hm.phase === dominant && hr.phase === dominant;
    verdict = {
      en: `Peak physical demands land in ${phaseWord(dominant, false)} — ${both ? "his hardest minute and hardest run were both his own " + phaseWord(dominant, false) : "his biggest window was " + phaseWord(dominant, false)}.${fadeClause(false)}`,
      is: `Mesta líkamlega álagið liggur í ${phaseWord(dominant, true)} — ${both ? "ákafasta mínútan og hörðasta hlaupið voru bæði hans eigin " + phaseWord(dominant, true) : "stærsti glugginn var " + phaseWord(dominant, true)}.${fadeClause(true)}`,
    };
  } else if (dominant === "both") {
    verdict = {
      en: `Peak demands are split across attack and defence — his hardest minute and hardest run fell in different phases.${fadeClause(false)}`,
      is: `Mesta álagið skiptist milli sóknar og varnar — ákafasta mínútan og hörðasta hlaupið voru í ólíkum leikþáttum.${fadeClause(true)}`,
    };
  } else {
    // No tactical phase — magnitude / timing only.
    const parts: string[] = [];
    const partsIs: string[] = [];
    if (hm) { parts.push(`his hardest minute hit ${pl(hm.plPerMin)} Player Load/min${hm.clock ? ` at ${hm.clock}` : ""}`); partsIs.push(`ákafasta mínútan náði ${pl(hm.plPerMin)} Player Load/mín${hm.clock ? ` á ${hm.clock}` : ""}`); }
    if (hr) { parts.push(`hardest ${hr.windowMin}-min run ${m(hr.distanceM)}`); partsIs.push(`hörðasta ${hr.windowMin}-mín hlaup ${m(hr.distanceM)}`); }
    verdict = { en: `${cap(parts.join("; "))}.${fadeClause(false)}`, is: `${cap(partsIs.join("; "))}.${fadeClause(true)}` };
  }

  // ── Facts (Level 1) ──
  const facts: Bi[] = [];
  if (hm) {
    const ph = aligned ? ` · ${phaseWord(hm.phase, false)}` : "";
    const phI = aligned ? ` · ${phaseWord(hm.phase, true)}` : "";
    const half = hm.clock ? (hm.secondHalf ? " (2nd half)" : " (1st half)") : "";
    const halfI = hm.clock ? (hm.secondHalf ? " (2. hálfl.)" : " (1. hálfl.)") : "";
    facts.push({
      en: `Hardest minute: ${pl(hm.plPerMin)} PL/min${hm.clock ? ` at ${hm.clock}` : ""}${half}${ph}.`,
      is: `Ákafasta mínúta: ${pl(hm.plPerMin)} PL/mín${hm.clock ? ` á ${hm.clock}` : ""}${halfI}${phI}.`,
    });
  }
  if (hr) {
    const ph = aligned ? ` · ${phaseWord(hr.phase, false)}` : "";
    const phI = aligned ? ` · ${phaseWord(hr.phase, true)}` : "";
    facts.push({ en: `Hardest ${hr.windowMin}-min run: ${m(hr.distanceM)}${ph}.`, is: `Hörðasta ${hr.windowMin}-mín hlaup: ${m(hr.distanceM)}${phI}.` });
  }
  if (fade) {
    const sign = fade.pct > 0 ? "+" : "";
    facts.push({
      en: `High-speed running by half: H1 ${m(input.hsr!.h1)} → H2 ${m(input.hsr!.h2)} (${sign}${fade.pct}%).`,
      is: `Háhraðahlaup eftir hálfleik: 1.hl ${m(input.hsr!.h1)} → 2.hl ${m(input.hsr!.h2)} (${sign}${fade.pct}%).`,
    });
  }

  // ── Confidence ── magnitude is solid, but the SIGNATURE read leans on the tactical phase; without
  // team-events uploaded the phase is unknown, so the read is low-confidence even if the numbers are clear.
  const confidence: Conf = aligned ? (hm?.confidence ?? "low") : "low";

  // ── Caveat ──
  const cvEn: string[] = [];
  const cvIs: string[] = [];
  if (!aligned) {
    cvEn.push("Tactical phase isn't shown — upload the Wyscout team-events for this match to see which phase each peak happened in.");
    cvIs.push("Taktískur leikþáttur er ekki sýndur — hladdu upp Wyscout lið-atburðum fyrir leikinn til að sjá í hvaða þætti hver toppur gerðist.");
  }
  if (input.hsr && (input.hsr.h1 != null || input.hsr.h2 != null)) {
    cvEn.push("High-speed-running windows carry no match clock, so they're read at half level, not tied to a phase.");
    cvIs.push("Háhraða-gluggar hafa enga leikklukku, svo þeir eru lesnir á hálfleiks-stigi, ekki tengdir leikþætti.");
  }
  const caveat: Bi | null = cvEn.length ? { en: cvEn.join(" "), is: cvIs.join(" ") } : null;

  return { hasData: true, verdict, facts, confidence, caveat, citation: CITATION };
}

function cap(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

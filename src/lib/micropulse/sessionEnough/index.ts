/**
 * "Did we do enough?" — the post-training answer for a Vector Pro (IMA) football team.
 *
 * Compares ONE training session's IMA movement against each player's real MATCH demand, scaled to
 * what this MD-day should deliver. The question is "enough", so the verdict is about falling short;
 * running hotter than the day calls for is surfaced as a separate note, not as "not enough".
 *
 *   day target = player's match median × share(matchPct of the MD-day, per-variable exponent)
 *
 * Five variables (the coach's IMA set): accelerations, decelerations (braking), change of direction,
 * IMA Free Running fast distance (band 5–8) and IMA Stride fast strides (band 6–8).
 *
 * Pure, deterministic, IO-free. Rules decide; no AI. Descriptive — NEVER the readiness colour.
 * Day shares: Buchheit 2024 MD-day load model (via planSessionLoad's matchPct); within-week
 * concentration Martín-García 2018; braking/CoD tissue load Harper & McBurnie 2021; fast running /
 * strides exposure Malone 2018; training:match ratios PMC6747517.
 */

import { statusOf } from "@/lib/micropulse/loadPlan/plannedVsActual";
import type { PvaStatus } from "@/lib/micropulse/loadPlan/plannedVsActual";
import { KPI_TAPER_EXPONENT } from "@/lib/micropulse/periodization/plannedVolume";

export type Bi = { en: string; is: string };

export const ENOUGH_VARS = ["imaAccel", "imaDecel", "imaCod", "frDistance", "strideHi"] as const;
export type EnoughVar = (typeof ENOUGH_VARS)[number];
export type VarValues = Record<EnoughVar, number | null>;

export const ENOUGH_LABEL: Record<EnoughVar, Bi> = {
  imaAccel: { en: "Accelerations", is: "Hraðaaukningar" },
  imaDecel: { en: "Braking", is: "Hemlun" },
  imaCod: { en: "Changes of direction", is: "Stefnubreytingar" },
  frDistance: { en: "Fast running", is: "Hraðhlaup" },
  strideHi: { en: "Fast strides", is: "Hröð skref" },
};

/** The sensor term behind each plain label — shown in tooltips / details only. */
export const ENOUGH_TECH: Record<EnoughVar, string> = {
  imaAccel: "IMA accelerations (count)",
  imaDecel: "IMA decelerations (count)",
  imaCod: "IMA change of direction, left + right, all intensities (count)",
  frDistance: "IMA Free Running distance, bands 5–8 (m)",
  strideHi: "IMA Stride count, bands 6–8",
};

/** Unit noun for "~N more … per player". */
const UNIT: Record<EnoughVar, Bi> = {
  imaAccel: { en: "accelerations", is: "hraðaaukningar" },
  imaDecel: { en: "braking actions", is: "hemlanir" },
  imaCod: { en: "changes of direction", is: "stefnubreytingar" },
  frDistance: { en: "m of fast running", is: "m af hraðhlaupi" },
  strideHi: { en: "fast strides", is: "hröð skref" },
};

/**
 * How a variable's single-session share scales with the day's load (share = (matchPct/100)^e).
 * All five read the periodization hub's KPI_TAPER_EXPONENT (one source for plan and review). The IMA
 * running pair there is calibrated on Breiðablik's own per-MD-day medians (2026, ~1,600 sessions) —
 * fast strides (band 6–8 includes sub-maximal running) stay high even on light days (~60% of a match
 * on MD-1), so their share is flatter (e<1); fast-running distance tapers a little harder than volume
 * (e=1.2). A typical MD-4 then reads ~on target, a light MD-1 does not read "short".
 */
export const SESSION_SHARE_EXPONENT: Record<EnoughVar, number> = {
  imaAccel: KPI_TAPER_EXPONENT.imaAccel ?? 0.9,
  imaDecel: KPI_TAPER_EXPONENT.imaDecel ?? 1.0,
  imaCod: KPI_TAPER_EXPONENT.imaCod ?? 1.1,
  frDistance: KPI_TAPER_EXPONENT.imaFrDistance ?? 1.2,
  strideHi: KPI_TAPER_EXPONENT.imaStrideHi ?? 0.7,
};

export const ENOUGH_CITATIONS = [
  "Buchheit et al. 2024 — MD-day load as a share of the match",
  "Martín-García et al. 2018 — load across the microcycle",
  "Harper & McBurnie 2021 — braking / change-of-direction loading",
  "Malone et al. 2018 — fast-running exposure vs match demand",
  "Training:match ratios — PMC6747517",
];

/** The share of a match a session on this MD-day should deliver for one variable (0–1). */
export function dayShare(key: EnoughVar, matchPct: number): number {
  const f = Math.max(0, Math.min(1.2, matchPct / 100));
  return Math.pow(f, SESSION_SHARE_EXPONENT[key]);
}

/**
 * The planned day-type (from the coach's Week setup / Meso block). It decides WHICH movement types a
 * session is judged on; the MD-day decides HOW BIG the target is. Mechanical days are about braking /
 * accelerations / changes of direction (running isn't the job); Locomotive days are about fast running /
 * strides; Mixed and Activation judge all five. Top-up (MD+1): starters recover, low-minute players are
 * judged against a top-up target. Calendar day-type shares are NOT copied as magnitudes: they were set for
 * B2-3 high-intensity efforts and sit far from real IMA totals (e.g. Mechanical 130% vs ~50% in practice).
 */
export type EnoughDayType = "mechanical" | "locomotive" | "mixed" | "activation" | "topup";
export const DAY_TYPE_LABEL: Record<EnoughDayType, Bi> = {
  mechanical: { en: "Mechanical", is: "Mechanical" },
  locomotive: { en: "Locomotive", is: "Locomotive" },
  mixed: { en: "Mixed", is: "Mixed" },
  activation: { en: "Activation", is: "Virkjun" },
  topup: { en: "Top-up", is: "Uppbót" },
};
export const DAY_FOCUS: Record<EnoughDayType, readonly EnoughVar[]> = {
  mechanical: ["imaAccel", "imaDecel", "imaCod"],
  locomotive: ["frDistance", "strideHi"],
  mixed: ENOUGH_VARS, activation: ENOUGH_VARS, topup: ENOUGH_VARS,
};
/** A planned day-type from a Meso focus label / Week-setup stimulus / legacy intent token. Pure. */
export function dayTypeFromText(text: string | null | undefined): EnoughDayType | null {
  const f = String(text ?? "").toUpperCase();
  if (!f) return null;
  if (f.includes("ACTIVATION")) return "activation";
  if (f.includes("TOP-UP") || f.includes("TOPUP") || f.includes("TOP UP") || f.includes("RECOVERY")) return "topup";
  if (f.includes("MECHANICAL") || f.includes("FORCE")) return "mechanical";
  if (f.includes("LOCOMOTIVE") || f.includes("VELOCITY") || f.includes("NEURAL") || f.includes("SPEED")) return "locomotive";
  if (f.includes("MIXED") || f.includes("TECHNICAL") || f.includes("POLISH") || f.includes("CALM")) return "mixed";
  return null;
}

/** Top-up target for low-minute players on MD+1 (share of a match) — the calendar's top-up day. */
export const TOPUP_MATCH_PCT = 40;
/** Minutes in the last match at/above which a player is a starter recovering on a top-up day. */
export const STARTER_MINUTES = 60;

export type EnoughPlayerInput = {
  playerId: string;
  name: string;
  actual: VarValues;
  /** The player's match reference (median of near-full matches) — own, or the team's when thin. */
  matchRef: VarValues;
  refSource: "own" | "team";
  refMatches: number;
  /** Trained clearly less than the squad (left early / modified) — shown, not judged in the team verdict. */
  partial: boolean;
  /** Sum of this player's training since the last match, up to and including this session. */
  weekActual?: VarValues | null;
  /** Minutes in the most recent match (top-up days: >= STARTER_MINUTES = recovering, not judged). */
  lastMatchMinutes?: number | null;
};

export type EnoughInput = {
  sessionDate: string;
  mdLabel: string | null;
  /** planSessionLoad matchPct for the day; null when no MD context could be resolved. */
  matchPct: number | null;
  mdSource: "week_setup" | "fixtures" | null;
  isMatchDay: boolean;
  squadSize: number;
  players: EnoughPlayerInput[];
  /** matchPct of each training day since the last match, incl. this session (for "week so far"). */
  weekDayPcts?: number[] | null;
  /** The planned day-type and where it came from (null = unknown: all five judged, MD-only). */
  dayType?: EnoughDayType | null;
  dayTypeSource?: "week_setup" | "meso" | "md" | null;
};

export type VarCompare = {
  key: EnoughVar;
  actual: number | null;
  matchRef: number | null;
  dayTarget: number | null;
  pctOfMatch: number | null;
  pctOfTarget: number | null;
  status: PvaStatus;
  /** Part of today's day-type focus (judged). False = shown for context, not judged. */
  focus: boolean;
};

export type PlayerVerdict = "enough" | "partly" | "short" | "partial_session" | "recovery" | "no_data";
export type PlayerEnough = {
  playerId: string; name: string; verdict: PlayerVerdict;
  byVar: Record<EnoughVar, VarCompare>; shortOn: EnoughVar[];
  refSource: "own" | "team"; refMatches: number; partial: boolean;
  /** Top-up day: played >= STARTER_MINUTES in the last match, so recovering and not judged. */
  recovering: boolean; lastMatchMinutes: number | null;
};

export type TeamVerdict = "yes" | "mostly" | "no";
export type EnoughState = "ok" | "match_day" | "no_md" | "no_reference" | "no_session" | "not_available";

export type WeekVar = { key: EnoughVar; pctOfTarget: number | null; status: PvaStatus; timesMatch: number | null; targetTimesMatch: number };

export type SessionEnough = {
  state: EnoughState;
  sessionDate: string | null;
  mdLabel: string | null;
  matchPct: number | null;
  /** The planned day-type used to pick the judged movement types (null = all five, MD-only). */
  dayType: EnoughDayType | null;
  dayTypeSource: "week_setup" | "meso" | "md" | null;
  /** One plain line on what today's day-type is judged on (null when all five / unknown). */
  focusNote: Bi | null;
  verdict: TeamVerdict | null;
  headline: Bi;
  facts: Bi[];
  counterfactual: Bi | null;
  overNote: Bi | null;
  team: VarCompare[];
  players: PlayerEnough[];
  week: { sessions: number; vars: WeekVar[] } | null;
  confidence: { level: "high" | "moderate" | "low"; judged: number; squad: number; ownRef: number; mdSource: "week_setup" | "fixtures" | null; note: Bi };
  citations: string[];
};

const isShort = (s: PvaStatus) => s === "under" || s === "well_under";
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r0 = (n: number | null) => (n == null ? null : Math.round(n));
const listBi = (keys: EnoughVar[], lang: "en" | "is"): string => {
  const names = keys.map((k) => ENOUGH_LABEL[k][lang].toLowerCase());
  if (names.length <= 1) return names.join("");
  const and = lang === "en" ? "and" : "og";
  return `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`;
};

/** Verdict from a set of per-variable statuses — same rule for a player and for the team. */
function verdictOf(statuses: PvaStatus[]): "enough" | "partly" | "short" | null {
  const judged = statuses.filter((s) => s !== "na");
  if (judged.length < 2) return null;
  const short = judged.filter(isShort).length;
  const wellUnder = judged.filter((s) => s === "well_under").length;
  if (short === 0) return "enough";
  // "short" = most of the judged set (3 of 5; 2 of 3; both of 2) or two clearly under.
  if (short >= Math.max(2, Math.ceil(judged.length * 0.6)) || wellUnder >= 2) return "short";
  return "partly";
}

function compareVar(key: EnoughVar, actual: number | null, matchRef: number | null, matchPct: number | null, focus = true): VarCompare {
  const pctOfMatch = actual != null && matchRef != null && matchRef > 0 ? Math.round((actual / matchRef) * 100) : null;
  const dayTarget = matchRef != null && matchRef > 0 && matchPct != null ? matchRef * dayShare(key, matchPct) : null;
  const { pct, status } = statusOf(dayTarget, actual);
  return { key, actual: r0(actual), matchRef: r0(matchRef), dayTarget: r0(dayTarget), pctOfMatch, pctOfTarget: pct, status, focus };
}

const EMPTY_CONF = (squad: number): SessionEnough["confidence"] => ({
  level: "low", judged: 0, squad, ownRef: 0, mdSource: null,
  note: { en: "Nothing to judge yet.", is: "Ekkert að meta enn." },
});

/** A non-verdict result (match day, no session, not available…). */
export function emptyEnough(state: Exclude<EnoughState, "ok">, opts?: { sessionDate?: string | null; mdLabel?: string | null; squad?: number }): SessionEnough {
  const H: Record<Exclude<EnoughState, "ok" | "no_md">, Bi> = {
    match_day: { en: "Match day — nothing to judge a training against.", is: "Leikdagur — engin æfing til að meta." },
    no_reference: { en: "Not judged yet — too few matches with movement data to know what a match demands.", is: "Ekki metið enn — of fáir leikir með hreyfigögnum til að vita hvað leikur krefst." },
    no_session: { en: "No captured training session found on or before this date.", is: "Engin skráð æfing fannst á eða fyrir þennan dag." },
    not_available: { en: "Needs Vector Pro movement data (IMA) from a football team.", is: "Þarf Vector Pro hreyfigögn (IMA) frá fótboltaliði." },
  };
  return {
    state, sessionDate: opts?.sessionDate ?? null, mdLabel: opts?.mdLabel ?? null, matchPct: null,
    dayType: null, dayTypeSource: null, focusNote: null, verdict: null,
    headline: state === "no_md" ? { en: "Not judged — no match context for this day.", is: "Ekki metið — ekkert leikjasamhengi fyrir þennan dag." } : H[state],
    facts: [], counterfactual: null, overNote: null, team: [], players: [], week: null,
    confidence: EMPTY_CONF(opts?.squad ?? 0), citations: ENOUGH_CITATIONS,
  };
}

export function buildSessionEnough(input: EnoughInput): SessionEnough {
  const { mdLabel, sessionDate } = input;
  if (input.isMatchDay) return emptyEnough("match_day", { sessionDate, mdLabel: "MD", squad: input.squadSize });
  const dayType = input.dayType ?? null;
  const isTopup = dayType === "topup";
  // Top-up: low-minute players are judged against the top-up target, not the MD+1 recovery level.
  const matchPct = isTopup ? Math.max(input.matchPct ?? 0, TOPUP_MATCH_PCT) : input.matchPct;
  const focusSet = new Set<EnoughVar>(DAY_FOCUS[dayType ?? "mixed"]);
  const dtLabel = dayType ? DAY_TYPE_LABEL[dayType] : null;
  const md = [mdLabel ?? "", dtLabel ? dtLabel.en : ""].filter(Boolean).join(" ");
  const mdIs = [mdLabel ?? "", dtLabel ? dtLabel.is : ""].filter(Boolean).join(" ");

  // ── Per player ───────────────────────────────────────────────────────────
  const players: PlayerEnough[] = input.players.map((p) => {
    const recovering = isTopup && (p.lastMatchMinutes ?? 0) >= STARTER_MINUTES;
    const pct = recovering ? (input.matchPct ?? matchPct) : matchPct;
    const byVar = {} as Record<EnoughVar, VarCompare>;
    for (const k of ENOUGH_VARS) byVar[k] = compareVar(k, p.actual[k], p.matchRef[k], pct, focusSet.has(k));
    const statuses = ENOUGH_VARS.filter((k) => focusSet.has(k)).map((k) => byVar[k].status);
    const v = verdictOf(statuses);
    const shortOn = ENOUGH_VARS.filter((k) => focusSet.has(k) && isShort(byVar[k].status));
    const verdict: PlayerVerdict = p.partial ? "partial_session" : recovering ? "recovery" : v ?? "no_data";
    return { playerId: p.playerId, name: p.name.trim(), verdict, byVar, shortOn, refSource: p.refSource, refMatches: p.refMatches, partial: p.partial, recovering, lastMatchMinutes: p.lastMatchMinutes ?? null };
  });
  const judged = players.filter((p) => !p.partial && !p.recovering && p.verdict !== "no_data");
  const recoveringN = players.filter((p) => p.recovering).length;
  const focusNote: Bi | null = dayType === "mechanical"
    ? { en: "Mechanical day: judged on accelerations, braking and changes of direction. Running isn't the job today.", is: "Mechanical-dagur: metið á hröðun, hemlun og stefnubreytingum. Hlaup er ekki verkefni dagsins." }
    : dayType === "locomotive"
      ? { en: "Locomotive day: judged on fast running and fast strides. Braking and cutting aren't the job today.", is: "Locomotive-dagur: metið á hraðhlaupi og hröðum skrefum. Hemlun og stefnubreytingar eru ekki verkefni dagsins." }
      : isTopup && recoveringN === 0
        ? { en: `Top-up day: the players who trained are judged against a top-up target (~${TOPUP_MATCH_PCT}% of a match); starters (${STARTER_MINUTES}+ min last match) would be recovering.`, is: `Uppbótardagur: þeir sem æfðu eru metnir á móti uppbótarmarkmiði (~${TOPUP_MATCH_PCT}% af leik); byrjunarlið (${STARTER_MINUTES}+ mín í síðasta leik) væri í endurheimt.` }
      : isTopup
        ? { en: `Top-up day: ${recoveringN} starter${recoveringN === 1 ? "" : "s"} (${STARTER_MINUTES}+ min last match) recovering and not judged; the rest judged against a top-up target (~${TOPUP_MATCH_PCT}% of a match).`, is: `Uppbótardagur: ${recoveringN} byrjunarliðsmenn (${STARTER_MINUTES}+ mín í síðasta leik) í endurheimt og ekki metnir; hinir metnir á móti uppbótarmarkmiði (~${TOPUP_MATCH_PCT}% af leik).` }
        : null;
  const anyRef = input.players.some((p) => ENOUGH_VARS.some((k) => (p.matchRef[k] ?? 0) > 0));
  if (!anyRef) return emptyEnough("no_reference", { sessionDate, mdLabel, squad: input.squadSize });

  // ── Team: median across fully-participating players ─────────────────────────
  const pool = judged.length ? judged : players.filter((p) => !p.partial && !p.recovering);
  const team: VarCompare[] = ENOUGH_VARS.map((k) => {
    const pick = (sel: (c: VarCompare) => number | null) => median(pool.map((p) => sel(p.byVar[k])).filter((x): x is number => x != null));
    const pctT = pick((c) => c.pctOfTarget);
    const status: PvaStatus = pctT == null ? "na" : statusOf(100, pctT).status;
    return { key: k, actual: r0(pick((c) => c.actual)), matchRef: r0(pick((c) => c.matchRef)), dayTarget: r0(pick((c) => c.dayTarget)), pctOfMatch: r0(pick((c) => c.pctOfMatch)), pctOfTarget: r0(pctT), status, focus: focusSet.has(k) };
  });

  // ── Confidence ──────────────────────────────────────────────────────────────
  const squad = Math.max(input.squadSize, players.length);
  const ownRef = judged.filter((p) => p.refSource === "own").length;
  const cov = squad > 0 ? judged.length / squad : 0;
  const ownShare = judged.length ? ownRef / judged.length : 0;
  const level: SessionEnough["confidence"]["level"] = cov >= 0.6 && ownShare >= 0.6 && input.mdSource ? "high" : cov >= 0.35 && ownShare >= 0.3 ? "moderate" : "low";
  const mdSrc: Bi = input.mdSource === "week_setup" ? { en: "MD-day from your week setup", is: "MD-dagur úr vikuskipulagi" }
    : input.mdSource === "fixtures" ? { en: "MD-day from the fixture list", is: "MD-dagur úr leikjaplani" } : { en: "no MD-day", is: "enginn MD-dagur" };
  const dtSrc: Bi = !dtLabel ? { en: "no planned day-type (all five judged)", is: "engin skipulögð dagsgerð (allir fimm metnir)" }
    : input.dayTypeSource === "week_setup" ? { en: `${dtLabel.en} from your week setup`, is: `${dtLabel.is} úr vikuskipulagi` }
    : input.dayTypeSource === "meso" ? { en: `${dtLabel.en} from the Meso plan`, is: `${dtLabel.is} úr Meso-áætlun` }
    : { en: `${dtLabel.en} (MD+1 default)`, is: `${dtLabel.is} (sjálfgefið á MD+1)` };
  const confidence: SessionEnough["confidence"] = {
    level, judged: judged.length, squad, ownRef, mdSource: input.mdSource,
    note: {
      en: `${judged.length} of ${squad} players judged · ${ownRef} against their own matches, the rest against the team's · ${mdSrc.en} · ${dtSrc.en}.`,
      is: `${judged.length} af ${squad} leikmönnum metnir · ${ownRef} miðað við eigin leiki, hinir við leiki liðsins · ${mdSrc.is} · ${dtSrc.is}.`,
    },
  };

  const partialN = players.filter((p) => p.partial).length;

  // ── No MD context → describe "% of a match", no verdict ───────────────────────
  if (matchPct == null) {
    const pm = team.map((t) => t.pctOfMatch).filter((x): x is number => x != null);
    const lo = pm.length ? Math.min(...pm) : null, hi = pm.length ? Math.max(...pm) : null;
    return {
      ...emptyEnough("no_md", { sessionDate, mdLabel: null, squad }),
      team, players, confidence, dayType, dayTypeSource: input.dayTypeSource ?? null, focusNote,
      facts: lo != null ? [{
        en: `The session gave ${lo}–${hi}% of a match across the five movement types.`,
        is: `Æfingin gaf ${lo}–${hi}% af leik yfir hreyfiþættina fimm.`,
      }, {
        en: "Tag the day in Week setup (or add the fixture) and this becomes a yes / no answer.",
        is: "Merktu daginn í vikuskipulagi (eða bættu leiknum við) og þá verður þetta já / nei svar.",
      }] : [],
    };
  }

  // ── Team verdict ────────────────────────────────────────────────────────────
  const tv = verdictOf(team.filter((t) => t.focus).map((t) => t.status));
  if (!tv) return { ...emptyEnough("no_reference", { sessionDate, mdLabel, squad }), team, players, confidence, dayType, dayTypeSource: input.dayTypeSource ?? null, focusNote };
  const verdict: TeamVerdict = tv === "enough" ? "yes" : tv === "partly" ? "mostly" : "no";
  const shortVars = team.filter((t) => t.focus && isShort(t.status)).sort((a, b) => (a.pctOfTarget ?? 0) - (b.pctOfTarget ?? 0));
  const judgedVars = team.filter((t) => t.focus && t.status !== "na");

  const headline: Bi = verdict === "yes"
    ? { en: `Yes — the session gave what ${md || "this day"} should.`, is: `Já — æfingin skilaði því sem ${mdIs || "þessi dagur"} á að gefa.` }
    : verdict === "mostly"
      ? { en: `Mostly — short on ${listBi(shortVars.map((t) => t.key), "en")}.`, is: `Að mestu — vantaði upp á ${listBi(shortVars.map((t) => t.key), "is")}.` }
      : { en: `No — a light session for ${md || "this day"} (short on ${shortVars.length} of ${judgedVars.length} movement types).`, is: `Nei — létt æfing miðað við ${mdIs || "þennan dag"} (vantaði upp á ${shortVars.length} af ${judgedVars.length} hreyfiþáttum).` };

  // ── Facts (2–3 plain lines) ──────────────────────────────────────────────────
  const facts: Bi[] = [];
  const weakest = [...judgedVars].sort((a, b) => (a.pctOfTarget ?? 0) - (b.pctOfTarget ?? 0))[0];
  if (weakest) {
    const L = ENOUGH_LABEL[weakest.key];
    facts.push(verdict === "yes"
      ? { en: `Every judged movement type reached the day's target — lowest was ${L.en.toLowerCase()} at ${weakest.pctOfTarget}%.`, is: `Allir metnir hreyfiþættir náðu markmiði dagsins — lægst var ${L.is.toLowerCase()} í ${weakest.pctOfTarget}%.` }
      : { en: `${L.en} reached ${weakest.pctOfTarget}% of what ${md} should give (${weakest.pctOfMatch}% of a match; the day calls for ~${Math.round(dayShare(weakest.key, matchPct) * 100)}%).`, is: `${L.is} náði ${weakest.pctOfTarget}% af því sem ${mdIs} á að gefa (${weakest.pctOfMatch}% af leik; dagurinn kallar á ~${Math.round(dayShare(weakest.key, matchPct) * 100)}%).` });
  }
  const clearlyShort = judged.filter((p) => p.verdict === "short").sort((a, b) => b.shortOn.length - a.shortOn.length);
  const partly = judged.filter((p) => p.verdict === "partly");
  const partialTxt: Bi = partialN ? { en: ` ${partialN} with a shortened session are not judged.`, is: ` ${partialN} með styttri æfingu eru ekki metnir.` } : { en: "", is: "" };
  if (clearlyShort.length) {
    const names = clearlyShort.slice(0, 5).map((p) => p.name).join(", ") + (clearlyShort.length > 5 ? " …" : "");
    facts.push({
      en: `${clearlyShort.length} of ${judged.length} players were clearly short: ${names}.${partly.length ? ` ${partly.length} more missed one or two movement types.` : ""}${partialTxt.en}`,
      is: `${clearlyShort.length} af ${judged.length} leikmönnum voru greinilega undir: ${names}.${partly.length ? ` ${partly.length} til viðbótar misstu af einum eða tveimur hreyfiþáttum.` : ""}${partialTxt.is}`,
    });
  } else if (partly.length) {
    facts.push({
      en: `No player was clearly short; ${partly.length} of ${judged.length} missed one or two movement types.${partialTxt.en}`,
      is: `Enginn leikmaður var greinilega undir; ${partly.length} af ${judged.length} misstu af einum eða tveimur hreyfiþáttum.${partialTxt.is}`,
    });
  } else if (judged.length) {
    facts.push({
      en: `All ${judged.length} players with a full session reached it.${partialTxt.en}`,
      is: `Allir ${judged.length} leikmenn með fulla æfingu náðu því.${partialTxt.is}`,
    });
  }

  // ── Week so far ──────────────────────────────────────────────────────────────
  let week: SessionEnough["week"] = null;
  const dayPcts = (input.weekDayPcts ?? []).filter((x) => Number.isFinite(x) && x > 0);
  if (dayPcts.length >= 2) {
    const vars: WeekVar[] = ENOUGH_VARS.map((k) => {
      const targetTimes = dayPcts.reduce((s, p) => s + dayShare(k, p), 0);
      const perPlayer = judged.map((p) => {
        const src = input.players.find((x) => x.playerId === p.playerId);
        const wa = src?.weekActual?.[k] ?? null, ref = src?.matchRef[k] ?? null;
        return wa != null && ref != null && ref > 0 ? wa / ref : null;
      }).filter((x): x is number => x != null);
      const times = median(perPlayer);
      const { pct, status } = statusOf(targetTimes, times);
      return { key: k, pctOfTarget: pct, status, timesMatch: times == null ? null : Math.round(times * 10) / 10, targetTimesMatch: Math.round(targetTimes * 10) / 10 };
    });
    week = { sessions: dayPcts.length, vars };
    const wShort = vars.filter((v) => isShort(v.status));
    const wJudged = vars.filter((v) => v.status !== "na");
    if (wJudged.length) {
      facts.push(wShort.length === 0
        ? { en: `Week so far (${dayPcts.length} sessions since the match): on track on all ${wJudged.length} movement types.`, is: `Vikan hingað til (${dayPcts.length} æfingar frá leik): á áætlun í öllum ${wJudged.length} hreyfiþáttum.` }
        : { en: `Week so far (${dayPcts.length} sessions since the match): behind on ${listBi(wShort.map((v) => v.key), "en")}.`, is: `Vikan hingað til (${dayPcts.length} æfingar frá leik): á eftir í ${listBi(wShort.map((v) => v.key), "is")}.` });
    }
  }

  // ── Counterfactual on the weakest short variable ──────────────────────────────
  let counterfactual: Bi | null = null;
  const cf = shortVars[0];
  if (cf && cf.dayTarget != null && cf.actual != null) {
    const need = Math.max(1, Math.ceil(cf.dayTarget * 0.85 - cf.actual));
    const L = ENOUGH_LABEL[cf.key];
    counterfactual = {
      en: `~${need} more ${UNIT[cf.key].en} per player would have brought ${L.en.toLowerCase()} up to the day's target${verdict === "mostly" && shortVars.length === 1 ? " — and made this a yes" : ""}.`,
      is: `~${need} fleiri ${UNIT[cf.key].is} á leikmann hefðu komið ${L.is.toLowerCase()} upp í markmið dagsins${verdict === "mostly" && shortVars.length === 1 ? " — og gert þetta að já" : ""}.`,
    };
  }

  const over = team.filter((t) => t.status === "well_over");
  const overNote: Bi | null = over.length ? {
    en: `More ${listBi(over.map((t) => t.key), "en")} than ${md} usually calls for (${over.map((t) => `${t.pctOfTarget}%`).join(", ")} of the day's target) — fine if planned, worth a look close to a match.`,
    is: `Meira af ${listBi(over.map((t) => t.key), "is")} en ${mdIs} kallar venjulega á (${over.map((t) => `${t.pctOfTarget}%`).join(", ")} af markmiði dagsins) — í lagi ef það var ætlunin, vert að skoða nálægt leik.`,
  } : null;

  return {
    state: "ok", sessionDate, mdLabel, matchPct, dayType, dayTypeSource: input.dayTypeSource ?? null, focusNote, verdict, headline,
    facts: facts.slice(0, 3), counterfactual, overNote, team, players, week, confidence, citations: ENOUGH_CITATIONS,
  };
}

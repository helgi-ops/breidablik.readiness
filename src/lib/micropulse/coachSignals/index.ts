/**
 * Coach signals — pure derivation of the Today briefing chips from the existing
 * engine outputs (coach-pages-audit-background-vs-destination.md). Each function
 * turns one engine's response into a background SIGNAL: a level + plain "why" +
 * confidence, exception-gated so the chip renders only when level !== "steady".
 *
 * ADVISORY / descriptive — a signal sits BESIDE the readiness colour, never
 * becomes it. Rules decide; no AI. Bilingual EN/IS. IO-free / serialisable.
 */

export type Bi = { en: string; is: string };
export type SignalLevel = "steady" | "watch" | "elevated" | "task";
export type SignalEngine = "game_plan_fit" | "post_training" | "match_minutes";

export type CoachSignal = {
  engine: SignalEngine;
  level: SignalLevel;
  label: Bi;
  why: { en: string[]; is: string[] };
  confidence: "high" | "moderate" | "low" | null;
  counterfactual: Bi | null;
  href: string;
};

/** A signal is worth a chip only when it's not steady (conservative gating). */
export function isActionable(s: CoachSignal): boolean {
  return s.level !== "steady";
}

// ── game-plan-fit → matchday role-fit signal ─────────────────────────────────
type FitRow = { verdict: "poor" | "caution" | "unknown" | "strong"; scored?: boolean };
type GamePlanFitResp = {
  ok?: boolean;
  fixture?: { date?: string; opponent?: string | null } | null;
  opponentTag?: { label?: Bi } | null;
  rows?: FitRow[];
};

export function deriveGamePlanFitSignal(resp: GamePlanFitResp | null): CoachSignal {
  const href = "/coach/game-plan-fit";
  const label: Bi = { en: "Matchday fit", is: "Leikdags-hæfni" };
  const base: CoachSignal = { engine: "game_plan_fit", level: "steady", label, why: { en: [], is: [] }, confidence: null, counterfactual: null, href };
  const rows = resp?.rows ?? [];
  if (!resp?.ok || !resp.fixture || rows.length === 0) return base; // no upcoming match → silent

  const poor = rows.filter((r) => r.verdict === "poor").length;
  const caution = rows.filter((r) => r.verdict === "caution").length;
  const scored = rows.filter((r) => r.scored !== false && r.verdict !== "unknown").length;
  const level: SignalLevel = poor > 0 ? "elevated" : caution > 0 ? "watch" : "steady";
  const opp = resp.fixture.opponent || "the opponent";
  const oppIs = resp.fixture.opponent || "andstæðinginn";
  const conf = scored >= rows.length * 0.7 ? "high" : scored >= rows.length * 0.4 ? "moderate" : "low";

  return {
    ...base, level, confidence: level === "steady" ? null : conf,
    why: {
      en: level === "steady" ? [] : [
        `${poor} poor-fit, ${caution} caution vs ${opp}`,
        ...(resp.opponentTag?.label ? [`Opponent style: ${resp.opponentTag.label.en}`] : []),
      ],
      is: level === "steady" ? [] : [
        `${poor} illa mátaðir, ${caution} varúð gegn ${oppIs}`,
        ...(resp.opponentTag?.label ? [`Stíll andstæðings: ${resp.opponentTag.label.is}`] : []),
      ],
    },
    counterfactual: level === "steady" ? null : {
      en: "Advisory only — review the flagged players' role demands before selection; never the readiness colour.",
      is: "Aðeins til leiðbeiningar — skoðaðu hlutverkakröfur merktu leikmannanna fyrir val; aldrei readiness-liturinn.",
    },
  };
}

// ── post-training → actual-vs-planned signal ─────────────────────────────────
type PvaPlayer = { status?: string };
type PostTrainingResp = {
  ok?: boolean;
  sessionDate?: string | null;
  plannedVsActual?: { players?: PvaPlayer[] } | null;
};

export function derivePostTrainingSignal(resp: PostTrainingResp | null): CoachSignal {
  const href = "/coach/post-training";
  const label: Bi = { en: "Session vs plan", is: "Æfing vs áætlun" };
  const base: CoachSignal = { engine: "post_training", level: "steady", label, why: { en: [], is: [] }, confidence: null, counterfactual: null, href };
  const players = resp?.plannedVsActual?.players ?? [];
  if (!resp?.ok || !resp.sessionDate || players.length === 0) return base;

  const over = players.filter((p) => p.status === "well_over").length;
  const under = players.filter((p) => p.status === "well_under").length;
  const flagged = over + under;
  if (flagged === 0) return base; // session tracked the plan → silent

  // Elevated when a meaningful share of the squad deviated, else watch.
  const level: SignalLevel = flagged >= 3 || flagged >= players.length / 3 ? "elevated" : "watch";
  const d = resp.sessionDate;
  return {
    ...base, level, confidence: "moderate",
    why: {
      en: [`${over} well over / ${under} well under plan (${d})`],
      is: [`${over} langt yfir / ${under} langt undir áætlun (${d})`],
    },
    counterfactual: {
      en: "Descriptive — actual GPS vs the pre-session plan; adjust the next plan, not the readiness colour.",
      is: "Lýsandi — raun-GPS vs áætlun fyrir æfingu; stilltu næstu áætlun, ekki readiness-litinn.",
    },
  };
}

// ── match-minutes → "confirm MD+1 minutes" task ──────────────────────────────
export function deriveMatchMinutesSignal(input: {
  recentMatch: { date: string; opponent: string | null } | null;
  entered: number;
  roster: number;
}): CoachSignal {
  const href = "/coach/match-minutes";
  const label: Bi = { en: "Confirm minutes", is: "Skráðu mínútur" };
  const base: CoachSignal = { engine: "match_minutes", level: "steady", label, why: { en: [], is: [] }, confidence: null, counterfactual: null, href };
  const m = input.recentMatch;
  if (!m) return base; // no recent match → nothing to confirm

  // Conservative: only a clear task — a recent match with NOTHING entered yet.
  if (input.entered > 0) return base;
  const opp = m.opponent || "the last match";
  const oppIs = m.opponent || "síðasta leik";
  return {
    ...base, level: "task", confidence: "high",
    why: {
      en: [`No minutes entered for ${opp} (${m.date})`],
      is: [`Engar mínútur skráðar fyrir ${oppIs} (${m.date})`],
    },
    counterfactual: {
      en: "Match minutes gate which sessions count as a match benchmark — enter them to keep load reads honest.",
      is: "Leikmínútur ráða hvaða æfingar teljast sem leik-viðmið — skráðu þær til að halda álags-lestri réttum.",
    },
  };
}

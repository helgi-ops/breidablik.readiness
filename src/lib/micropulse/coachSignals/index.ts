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
export type SignalEngine = "game_plan_fit" | "post_training" | "match_minutes" | "form_vs_state";

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

// ── form-vs-state → "genuine form dip" signal ────────────────────────────────
/** Minimal serialisable slice of one player's FormRead (from computeFormVsState). */
export type FormVsStateReadLite = {
  name: string;
  verdict: "genuine_dip" | "explained_by_state" | "overperforming_compromised" | "steady" | "unknown";
  confidence: "high" | "moderate" | "low";
};

/**
 * A team-level chip only when a player's output dip SURVIVES the readiness/context
 * adjustment — i.e. a genuine form problem, not a state artifact. Conservative on
 * purpose (the over-flagging lesson): `explained_by_state`, over-performance, steady
 * and unknown never raise a chip, and a `low`-confidence read (mostly-imputed
 * readiness) is excluded. Names the dipping player(s) so the coach knows who.
 */
export function deriveFormVsStateSignal(reads: FormVsStateReadLite[]): CoachSignal {
  const href = "/coach/form-vs-state";
  const label: Bi = { en: "Form vs state", is: "Form vs ástand" };
  const base: CoachSignal = { engine: "form_vs_state", level: "steady", label, why: { en: [], is: [] }, confidence: null, counterfactual: null, href };

  const dips = reads.filter((r) => r.verdict === "genuine_dip" && r.confidence !== "low");
  if (dips.length === 0) return base; // no real form dip → silent

  const level: SignalLevel = dips.length >= 2 ? "elevated" : "watch";
  const names = dips.map((d) => d.name).slice(0, 3);
  const more = dips.length - names.length;
  const nameList = names.join(", ") + (more > 0 ? ` +${more}` : "");
  const conf = dips.some((d) => d.confidence === "high") ? "high" : "moderate";

  return {
    ...base, level, confidence: conf,
    why: {
      en: [`${dips.length} in a genuine form dip: ${nameList} (survives readiness/context)`],
      is: [`${dips.length} í raunverulegri form-dýfu: ${nameList} (lifir readiness/samhengi af)`],
    },
    counterfactual: {
      en: "These dips survive the context adjustment — a form conversation, not a load one. Advisory; never the readiness colour.",
      is: "Þessar dýfur lifa samhengis-leiðréttinguna af — form-samtal, ekki álags-samtal. Til leiðbeiningar; aldrei readiness-liturinn.",
    },
  };
}

/** Per-player slice — carries the numbers needed for the row chip's "why". */
export type FormVsStatePlayerLite = {
  playerId: string;
  name: string;
  verdict: FormVsStateReadLite["verdict"];
  confidence: "high" | "moderate" | "low";
  windowMean: number | null;
  baselinePer90: number | null;
};

export type PlayerSignal = { playerId: string; signal: CoachSignal };

/**
 * Per-player form-dip chips for the Today attention rows. Same gate as the
 * team-level chip (genuine_dip that survived the adjustment, not mostly-imputed)
 * but emitted ONE per dipping player, carrying his own %-vs-norm in the "why".
 * Level is `watch` — a single player's form is advisory context beside his
 * readiness colour, never an alert. Links to his own form-vs-state read.
 */
export function derivePlayerFormVsStateSignals(reads: FormVsStatePlayerLite[]): PlayerSignal[] {
  return reads
    .filter((r) => r.verdict === "genuine_dip" && r.confidence !== "low")
    .map((r) => {
      // OBV is a small SIGNED metric, so a %-of-norm can shoot past -100% when
      // the window output goes negative — nonsensical to a coach. Show the
      // number only for a sane dip (0…-100%); a bigger collapse or a missing
      // norm degrades to plain words (the exact figures live on the drill-down).
      const ratio = r.windowMean != null && r.baselinePer90 && r.baselinePer90 !== 0
        ? r.windowMean / r.baselinePer90 - 1 : null;
      let pctEn: string, pctIs: string;
      if (ratio != null && ratio > -1 && ratio <= 0) {
        const pct = Math.round(ratio * 100);
        pctEn = `${pct}% vs his norm`; pctIs = `${pct}% vs venju`;
      } else if (ratio != null) {
        pctEn = "well below his norm"; pctIs = "vel undir venju";
      } else {
        pctEn = "below his norm"; pctIs = "undir venju";
      }
      const conf: CoachSignal["confidence"] = r.confidence === "high" ? "high" : "moderate";
      const signal: CoachSignal = {
        engine: "form_vs_state",
        level: "watch",
        label: { en: "Form dip", is: "Form-dýfa" },
        why: {
          en: [`Output ${pctEn} — survives readiness/context`],
          is: [`Output ${pctIs} — lifir readiness/samhengi af`],
        },
        confidence: conf,
        counterfactual: {
          en: "A form conversation, not a load one — his output is short of his norm even after adjusting for state. Advisory; never the readiness colour.",
          is: "Form-samtal, ekki álags — output hans er undir venju jafnvel eftir leiðréttingu fyrir ástand. Til leiðbeiningar; aldrei readiness-liturinn.",
        },
        href: `/coach/form-vs-state?playerId=${r.playerId}`,
      };
      return { playerId: r.playerId, signal };
    });
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

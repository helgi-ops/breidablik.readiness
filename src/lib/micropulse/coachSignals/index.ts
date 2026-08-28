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
export type SignalEngine = "game_plan_fit" | "post_training" | "match_minutes" | "form_vs_state" | "robustness" | "hrv_recovery" | "hr_load";

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

// ── robustness watch → injury early-warning signal ───────────────────────────
/** Minimal serialisable slice of one player's RobustnessWatch read. */
export type RobustnessReadLite = {
  playerId: string;
  name: string;
  level: "steady" | "watch" | "elevated";
  verdict: Bi;
  counterfactual: Bi | null;
  confidence: "low" | "moderate" | "high";
};

const ROBUSTNESS_HREF = "/coach/readiness-signals";
const ROBUSTNESS_LABEL: Bi = { en: "Robustness", is: "Álagsþol" };

/**
 * Team-level robustness chip. DELIBERATELY stricter than the per-player one: the
 * engine's own base rate is ~6%/player-day at `watch`, so over a 25-man squad a
 * chip that fired on any single watch would show ~80% of days — noise. So the
 * team strip fires only on the genuinely exceptional: an `elevated` player, or a
 * CLUSTER (≥3 at watch). A lone watch surfaces only as that player's own
 * attention-row chip, never on the team strip.
 */
export function deriveRobustnessTeamSignal(reads: RobustnessReadLite[]): CoachSignal {
  const base: CoachSignal = { engine: "robustness", level: "steady", label: ROBUSTNESS_LABEL, why: { en: [], is: [] }, confidence: null, counterfactual: null, href: ROBUSTNESS_HREF };
  const elevated = reads.filter((r) => r.level === "elevated");
  const watch = reads.filter((r) => r.level === "watch");

  const level: SignalLevel = elevated.length > 0 || watch.length >= 3 ? "elevated"
    : watch.length === 2 ? "watch"
    : "steady";
  if (level === "steady") return base;

  const names = (elevated.length ? elevated : watch).map((r) => r.name).slice(0, 3);
  const totalFlagged = elevated.length + watch.length;
  const more = (elevated.length ? elevated.length : watch.length) - names.length;
  const nameList = names.join(", ") + (more > 0 ? ` +${more}` : "");
  const conf = reads.some((r) => (r.level !== "steady") && r.confidence === "high") ? "high" : "moderate";

  return {
    ...base, level, confidence: conf,
    why: {
      en: [elevated.length
        ? `${elevated.length} elevated robustness signal${elevated.length === 1 ? "" : "s"}: ${nameList}`
        : `${watch.length} players on a robustness watch: ${nameList}`],
      is: [elevated.length
        ? `${elevated.length} hækkað álagsþols-merki: ${nameList}`
        : `${watch.length} leikmenn með álagsþols-viðvörun: ${nameList}`],
    },
    counterfactual: {
      en: `Injury early-warning signals rising above their own norm (${totalFlagged} flagged). Advisory — cited signals beside the colour, never a risk score, never the readiness colour.`,
      is: `Snemmbúin meiðsla-merki yfir eigin venju (${totalFlagged} merkt). Til leiðbeiningar — tilvitnuð merki við hlið litarins, aldrei áhættuskor, aldrei readiness-liturinn.`,
    },
  };
}

/**
 * Per-player robustness chips for the attention rows — one per player whose read
 * is not steady. These only render on players already in the attention list, so
 * surfacing `watch` here (unlike the team strip) is fine: it enriches a
 * flagged row with "his robustness signals are also rising", it doesn't nag.
 */
export function derivePlayerRobustnessSignals(reads: RobustnessReadLite[]): PlayerSignal[] {
  return reads
    .filter((r) => r.level !== "steady")
    .map((r) => ({
      playerId: r.playerId,
      signal: {
        engine: "robustness" as const,
        level: r.level as SignalLevel,
        label: ROBUSTNESS_LABEL,
        why: { en: [r.verdict.en], is: [r.verdict.is] },
        confidence: r.confidence,
        counterfactual: r.counterfactual,
        href: ROBUSTNESS_HREF,
      },
    }));
}

// ── HRV recovery trend → morning-RMSSD recovery signal ───────────────────────
/** Minimal serialisable slice of one player's HRV recovery read. */
export type HrvReadLite = {
  playerId: string;
  name: string;
  level: "steady" | "watch" | "elevated";
  verdict: Bi;
  confidence: "low" | "medium" | "high";
};

const HRV_HREF = "/coach/heart-rate-intelligence";
const HRV_LABEL: Bi = { en: "Recovery (HRV)", is: "Endurheimt (HRV)" };
const mapHrvConf = (c: HrvReadLite["confidence"]): CoachSignal["confidence"] => (c === "medium" ? "moderate" : c);

/**
 * Team-level HRV recovery chip. Conservative like robustness: an `elevated`
 * player (7-day HRV below-band for consecutive days) or a ≥3 watch cluster. A
 * lone watch surfaces only as that player's attention-row chip. Sits BESIDE the
 * readiness colour — a companion to the parasympathetic picture, never the verdict.
 */
export function deriveHrvTeamSignal(reads: HrvReadLite[]): CoachSignal {
  const base: CoachSignal = { engine: "hrv_recovery", level: "steady", label: HRV_LABEL, why: { en: [], is: [] }, confidence: null, counterfactual: null, href: HRV_HREF };
  const elevated = reads.filter((r) => r.level === "elevated");
  const watch = reads.filter((r) => r.level === "watch");
  const level: SignalLevel = elevated.length > 0 || watch.length >= 3 ? "elevated" : watch.length === 2 ? "watch" : "steady";
  if (level === "steady") return base;

  const names = (elevated.length ? elevated : watch).map((r) => r.name).slice(0, 3);
  const more = (elevated.length ? elevated.length : watch.length) - names.length;
  const nameList = names.join(", ") + (more > 0 ? ` +${more}` : "");
  const conf = reads.some((r) => r.level !== "steady" && r.confidence === "high") ? "high" : "moderate";
  return {
    ...base, level, confidence: conf,
    why: {
      en: [elevated.length ? `${elevated.length} with a down recovery trend: ${nameList}` : `${watch.length} players with an HRV dip: ${nameList}`],
      is: [elevated.length ? `${elevated.length} með niðurþróun í endurheimt: ${nameList}` : `${watch.length} leikmenn með HRV-dýfu: ${nameList}`],
    },
    counterfactual: {
      en: "Morning-HRV recovery trend — pair with sleep/soreness, never a verdict on its own; never the readiness colour.",
      is: "Morgun-HRV endurheimtar-þróun — berðu saman við svefn/strengi, aldrei dómur ein og sér; aldrei readiness-liturinn.",
    },
  };
}

/** Per-player HRV chips for the attention rows — one per non-steady player. */
export function derivePlayerHrvSignals(reads: HrvReadLite[]): PlayerSignal[] {
  return reads
    .filter((r) => r.level !== "steady")
    .map((r) => ({
      playerId: r.playerId,
      signal: {
        engine: "hrv_recovery" as const,
        level: r.level as SignalLevel,
        label: HRV_LABEL,
        why: { en: [r.verdict.en], is: [r.verdict.is] },
        confidence: mapHrvConf(r.confidence),
        counterfactual: {
          en: "Read the 7-day HRV trend alongside sleep + soreness — a companion signal, never the readiness colour.",
          is: "Lestu 7-daga HRV-þróunina samhliða svefni + strengjum — fylgimerki, aldrei readiness-liturinn.",
        },
        href: HRV_HREF,
      },
    }));
}

// ── belt-HR cross-check → "hidden load" signal ───────────────────────────────
/** Minimal serialisable slice of one player's belt-HR vs sRPE read. */
export type HrLoadReadLite = {
  playerId: string;
  name: string;
  /** Latest belt session's alignment (heart vs logged effort). */
  alignment: "hidden_load" | "low_cardio_response" | "aligned" | "insufficient";
  confidence: "low" | "medium" | "high";
  /** The engine's plain per-player sentence for the latest session. */
  verdict: Bi;
};

const HRLOAD_HREF = "/coach/heart-rate-intelligence";
const HRLOAD_LABEL: Bi = { en: "Hidden load (HR)", is: "Falið álag (púls)" };
const mapHrLoadConf = (c: HrLoadReadLite["confidence"]): CoachSignal["confidence"] => (c === "medium" ? "moderate" : c);

/**
 * A belt read is a Today exception only when the heart worked HARDER than the
 * logged effort (`hidden_load`) AND the baseline is mature enough to trust
 * (confidence ≠ low). `low_cardio_response` is deliberately NOT surfaced — it is
 * usually benign (strength / skills work taxes the heart little), so flagging it
 * would be noise. The belt cross-check sits BESIDE the readiness colour; it is a
 * prompt to plan recovery, never the verdict.
 */
const isHiddenLoadException = (r: HrLoadReadLite) => r.alignment === "hidden_load" && r.confidence !== "low";

/**
 * Team-level belt-HR chip. Conservative like robustness/HRV: a ≥3 hidden-load
 * cluster is `elevated`, 1–2 is `watch`, otherwise silent. Descriptive — a
 * cross-check to investigate, never the readiness colour.
 */
export function deriveHrLoadTeamSignal(reads: HrLoadReadLite[]): CoachSignal {
  const base: CoachSignal = { engine: "hr_load", level: "steady", label: HRLOAD_LABEL, why: { en: [], is: [] }, confidence: null, counterfactual: null, href: HRLOAD_HREF };
  const hidden = reads.filter(isHiddenLoadException);
  const level: SignalLevel = hidden.length >= 3 ? "elevated" : hidden.length >= 1 ? "watch" : "steady";
  if (level === "steady") return base;

  const names = hidden.map((r) => r.name.split(" ")[0]).slice(0, 3);
  const more = hidden.length - names.length;
  const nameList = names.join(", ") + (more > 0 ? ` +${more}` : "");
  const conf = hidden.some((r) => r.confidence === "high") ? "high" : "moderate";
  return {
    ...base, level, confidence: conf,
    why: {
      en: [`${hidden.length} worked harder than they logged: ${nameList}`],
      is: [`${hidden.length} unnu meira en þeir skráðu: ${nameList}`],
    },
    counterfactual: {
      en: "Plan their recovery as if the session was harder than logged — a cross-check to investigate, never the readiness colour.",
      is: "Skipuleggðu endurheimt þeirra eins og lotan hafi verið erfiðari en skráð — kross-tékk til að skoða, aldrei readiness-liturinn.",
    },
  };
}

/** Per-player belt-HR chips for the attention rows — one per confident hidden-load read. */
export function derivePlayerHrLoadSignals(reads: HrLoadReadLite[]): PlayerSignal[] {
  return reads
    .filter(isHiddenLoadException)
    .map((r) => ({
      playerId: r.playerId,
      signal: {
        engine: "hr_load" as const,
        level: "watch" as SignalLevel,
        label: HRLOAD_LABEL,
        why: { en: [r.verdict.en], is: [r.verdict.is] },
        confidence: mapHrLoadConf(r.confidence),
        counterfactual: {
          en: "His heart worked harder than the effort he logged — plan recovery accordingly; a cross-check, never the readiness colour.",
          is: "Hjartað vann meira en áreynslan sem hann skráði — skipuleggðu endurheimt eftir því; kross-tékk, aldrei readiness-liturinn.",
        },
        href: HRLOAD_HREF,
      },
    }));
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

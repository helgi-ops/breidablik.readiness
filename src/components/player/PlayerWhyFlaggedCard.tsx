"use client";

/**
 * PlayerWhyFlaggedCard
 *
 * Inline explanation card on the player PWA Today tab — shown only when
 * today's verdict is YELLOW or RED. Answers the question players ask
 * the coach in person: "I checked in 4/5 and 5/5 — why am I yellow?".
 *
 * Pulls the same decision payload the dashboard uses (/api/player/decision)
 * and surfaces the engine's own explanationFactors + counterfactual in
 * plain second-person language. No new endpoint needed; reuses the
 * deterministic pipeline.
 *
 * Aligns with explainability-first principles 1 (provenance), 2 (plain
 * language), 3 (counterfactual visible), 8 (two audiences — same engine,
 * different voice).
 *
 * NOTE: GREEN / GRAY players see nothing here — silent on good days,
 * loud only when there's something to explain.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type DecisionState = "GREEN" | "YELLOW" | "RED" | "GRAY";

type ExplanationFactor = {
  key: string;
  label: string;
  value?: string | number | null;
  impactScore: number;
  direction: "positive" | "negative" | "neutral";
  summary: string;
};

type Counterfactual = {
  signal: string;
  currentValue: string;
  hypotheticalValue: string;
  hypotheticalState: DecisionState;
  impact: 1 | 2 | 3;
  descriptionEN: string;
  descriptionIS: string;
};

type DecisionPayload = {
  ok: boolean;
  decision: {
    fatigueType?: "global_fatigue" | "mechanical_fatigue" | "metabolic_fatigue" | "normal" | null;
    recommendation: {
      state: DecisionState;
      coachSummary: string;
      explanationFactors: ExplanationFactor[];
    };
    counterfactuals?: Counterfactual[];
  } | null;
  // Canonical verdict color from v_coach_readiness_today_v8 — what the
  // coach sees on the dashboard. Card uses this (not the engine state)
  // so the player and the coach are always looking at the same colour.
  canonicalColor?: "GREEN" | "YELLOW" | "RED" | null;
  canonicalTotalScore?: number | null;
};

// ── Plain-language helpers ────────────────────────────────────────────────

/**
 * Map fatigue-type tag to a short action hint that gives the player ONE
 * concrete thing to focus on today. Plain language, second-person, no
 * sport-science jargon. Used as the closing tail of the card.
 */
function actionHintFor(
  fatigueType: DecisionPayload["decision"] extends infer D ? D extends null ? null : D extends { fatigueType?: infer F } ? F : null : null,
  color: "GREEN" | "YELLOW" | "RED",
  lang: "IS" | "EN",
): string | null {
  const is = lang === "IS";
  if (color === "GREEN") {
    return is
      ? "Haltu áfram því sem þú ert að gera — venjur þínar virka."
      : "Keep doing what you're doing — your routines are working.";
  }
  if (color === "RED") {
    return is
      ? "Hvíldu þig vel í dag og einbeittu þér að svefni og næringu."
      : "Take it easy today — focus on sleep and nutrition.";
  }
  // YELLOW path — refine by fatigue type when available
  if (fatigueType === "mechanical_fatigue") {
    return is
      ? "Forðastu margar miklar hröðanir og snöggar stefnubreytingar í dag."
      : "Avoid lots of hard sprints and sharp changes of direction today.";
  }
  if (fatigueType === "metabolic_fatigue") {
    return is
      ? "Forðastu mikla háhraða-vinnu í dag — tækni og snerpa frekar."
      : "Avoid high-speed running today — keep it technical and short.";
  }
  if (fatigueType === "global_fatigue") {
    return is
      ? "Léttari æfing í dag og góður svefn í nótt skiptir mestu máli."
      : "Easier session today, and a good night's sleep tonight is the priority.";
  }
  return is
    ? "Fylgstu með hvernig þú finnur fyrir þér í upphitun og láttu þjálfara vita ef eitthvað er óeðlilegt."
    : "Pay attention to how you feel in the warm-up and flag anything unusual to the coach.";
}

/**
 * Acknowledge-then-explain framing — turns the friction "but I scored
 * 5/5 on check-in!" into a teaching moment. Lead with empathy, then the
 * actual driver from the engine. Now also handles GREEN — the daily
 * "here's why you're cleared today" moment that builds long-term
 * familiarity with what the system rewards.
 */
function leadSentence(color: "GREEN" | "YELLOW" | "RED", lang: "IS" | "EN"): string {
  const is = lang === "IS";
  if (color === "GREEN") {
    return is
      ? "Þú ert grænn í dag. Hér er hvers vegna:"
      : "You're green today. Here's why:";
  }
  if (color === "RED") {
    return is
      ? "Þú ert í rauðu í dag. Hér er ástæðan:"
      : "You're in red today. Here's why:";
  }
  return is
    ? "Þú ert í gulu í dag. Hér er það sem kerfið sá í þínum gögnum:"
    : "You're in yellow today. Here's what the system saw in your data:";
}

type AiAnswerResponse = {
  ok: boolean;
  answer?: string;
  answered_at?: string;
  error?: string;
};

export default function PlayerWhyFlaggedCard({ lang = "EN" }: { lang?: "IS" | "EN" }) {
  const [payload, setPayload] = React.useState<DecisionPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  // AI Q&A state — only triggered on user click. Coach side has the
  // same opt-in pattern (AttentionRowAskWhy) to keep Anthropic costs
  // and latency off the default render path.
  const [aiExpanded, setAiExpanded] = React.useState(false);
  const [aiAnswer, setAiAnswer] = React.useState<AiAnswerResponse | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);
  const [aiEliteRequired, setAiEliteRequired] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session) {
          if (!cancelled) { setError("Not signed in"); setLoading(false); }
          return;
        }
        const res = await fetch("/api/player/decision", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (cancelled) return;
        const json = (await res.json()) as DecisionPayload;
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        setPayload(json);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Lazily fetch the AI answer on first expand. Cached for the lifetime
  // of the card so re-toggling doesn't re-hit Anthropic.
  //
  // IMPORTANT: deps must NOT include aiLoading / aiAnswer / aiError /
  // aiEliteRequired. Including them re-fires the effect on every state
  // transition, which runs cleanup (cancelled = true) before the fetch
  // completes — leaving the spinner stuck forever. The gate at the top
  // handles the "fetch once per expand" guarantee.
  React.useEffect(() => {
    if (!aiExpanded) return;
    if (aiAnswer || aiLoading || aiError || aiEliteRequired) return;
    let cancelled = false;
    (async () => {
      setAiLoading(true);
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session) {
          if (!cancelled) setAiError(lang === "IS" ? "Ekki innskráð(ur)" : "Not signed in");
          return;
        }
        const res = await fetch("/api/player/why-flagged-ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: "{}",
        });
        if (cancelled) return;
        if (res.status === 402) { setAiEliteRequired(true); return; }
        const json = (await res.json()) as AiAnswerResponse;
        if (!res.ok) {
          setAiError(json.error ?? `HTTP ${res.status}`);
          return;
        }
        setAiAnswer(json);
      } catch (e) {
        if (!cancelled) setAiError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiExpanded]);

  // Loading or error — render nothing (silent fail; player has plenty of
  // other context on Today). Logging is via the browser console only.
  if (loading || error) return null;

  const decision = payload?.decision;

  // Visibility colour = canonical (what the dashboard shows the coach).
  // The engine's own recommendation.state can disagree on the same day
  // (the long-standing 3-engine divergence we fixed at the DB layer for
  // STORED state but the LIVE compute still emits the engine verdict).
  // Using canonical guarantees the card always matches the verdict the
  // coach told the player they are. See CLAUDE.md > "Canonical verdict source".
  const canonicalColor = payload?.canonicalColor ?? null;

  // Two ways the card silently bails:
  //  (1) No readiness check-in for today → no canonical colour → nothing
  //      to explain. Player should be prompted elsewhere to check in.
  //  (2) Color is GRAY / unknown — same reason.
  if (!canonicalColor || (canonicalColor !== "GREEN" && canonicalColor !== "YELLOW" && canonicalColor !== "RED")) {
    return null;
  }

  // Pull NEGATIVE factors (the ones that pushed the verdict away from
  // green) for YELLOW/RED. On GREEN, pull POSITIVE factors instead so
  // we can show "your sleep, energy and soreness are all in your usual
  // range" — daily explainability builds long-term trust.
  const wantPositive = canonicalColor === "GREEN";
  const factors = decision
    ? (decision.recommendation.explanationFactors ?? [])
        .filter((f) => wantPositive ? f.direction === "positive" : f.direction === "negative")
        .slice()
        .sort((a, b) => Math.abs(b.impactScore) - Math.abs(a.impactScore))
        .slice(0, 3)
    : [];

  // Counterfactual only relevant when flagged — on GREEN there's nothing
  // we'd want to "flip" away from green.
  const counterfactual = (canonicalColor !== "GREEN" && decision)
    ? (decision.counterfactuals ?? []).find((cf) => cf.impact >= 1) ?? null
    : null;

  // Tone classes per canonical colour.
  const tone =
    canonicalColor === "RED"
      ? { border: "border-rose-300",    bg: "bg-rose-50",    text: "text-rose-900",    header: "text-rose-800" }
    : canonicalColor === "YELLOW"
      ? { border: "border-amber-300",   bg: "bg-amber-50",   text: "text-amber-900",   header: "text-amber-800" }
      : { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-900", header: "text-emerald-800" };

  const action = actionHintFor(decision?.fatigueType ?? null, canonicalColor, lang);

  // Empty-state copy varies by colour. On GREEN with no positive
  // factors (rare — engine usually surfaces "sleep is good" etc.) we
  // still want a confidence-building line, not a "system found nothing"
  // one which would read as concerning.
  const noFactorsLine = (() => {
    const is = lang === "IS";
    if (canonicalColor === "GREEN") {
      return is
        ? "Wellness-skorin þín eru í eðlilegu þínu bili — kerfið flaggar engu sérstaklega í dag."
        : "Your wellness scores are within your usual range — the system isn't flagging anything specific today.";
    }
    return decision?.recommendation.coachSummary || (is
      ? "Kerfið fann ekkert sérstakt — talaðu við þjálfara ef þetta kemur þér á óvart."
      : "The system didn't surface a specific driver — talk to your coach if this surprises you.");
  })();

  return (
    <div className={`rounded-2xl border ${tone.border} ${tone.bg} p-4 shadow-sm`}>
      <div className={`text-[10px] uppercase tracking-[0.18em] font-semibold ${tone.header}`}>
        {lang === "IS" ? "Af hverju þessi litur?" : "Why this colour?"}
      </div>
      <p className={`mt-1.5 text-sm font-semibold ${tone.text}`}>
        {leadSentence(canonicalColor, lang)}
      </p>

      {factors.length > 0 ? (
        <ul className={`mt-2 space-y-1.5 text-sm leading-relaxed ${tone.text}`}>
          {factors.map((f, i) => (
            <li key={`${f.key}-${i}`} className="flex gap-2">
              <span className="mt-0.5 shrink-0 opacity-70">→</span>
              <span>
                <span className="font-semibold">{f.label}</span>
                {f.summary ? <> — {f.summary}</> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`mt-2 text-sm ${tone.text}`}>
          {noFactorsLine}
        </p>
      )}

      {counterfactual ? (
        <div className={`mt-3 rounded-lg border border-white/60 bg-white/70 p-2.5 text-xs ${tone.text}`}>
          <span className="opacity-70 font-semibold">
            {lang === "IS" ? "Hvað gæti breytt þessu? " : "What would change this? "}
          </span>
          {lang === "IS" ? counterfactual.descriptionIS : counterfactual.descriptionEN}
        </div>
      ) : null}

      {action ? (
        <div className={`mt-3 rounded-lg bg-white/60 p-2.5 text-xs font-medium ${tone.text}`}>
          <span className="font-semibold opacity-80">
            {lang === "IS" ? "Í dag: " : "Today: "}
          </span>
          {action}
        </div>
      ) : null}

      {/* AI deeper-dive — opt-in, ELITE-gated. Mirrors the coach side
          AttentionRowAskWhy. The card already gives a deterministic
          explanation above; this is for the player who wants the data
          read back to them in narrative form. */}
      <div className="mt-3 border-t border-white/60 pt-2.5">
        <button
          type="button"
          onClick={() => setAiExpanded((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          aria-expanded={aiExpanded}
        >
          <span aria-hidden>✨</span>
          {aiExpanded
            ? (lang === "IS" ? "Loka AI skýringu" : "Hide AI explanation")
            : (lang === "IS" ? "Fá AI skýringu" : "Get AI explanation")}
        </button>

        {aiExpanded ? (
          <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/70 p-3">
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-violet-700">
              <span>
                ✨ {lang === "IS" ? "AI skýring" : "AI explanation"}
                <span className="ml-1.5 font-normal opacity-70">
                  · {lang === "IS" ? "byggt á gögnunum þínum í dag" : "from your data today"}
                </span>
              </span>
              {aiAnswer?.answered_at ? (
                <span className="font-normal opacity-60">
                  {new Date(aiAnswer.answered_at).toLocaleTimeString(lang === "IS" ? "is-IS" : "en-GB", {
                    hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              ) : null}
            </div>

            {aiLoading ? (
              <div className="flex items-center gap-2 text-xs italic text-violet-600">
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-violet-400" />
                {lang === "IS" ? "Greini gögnin þín…" : "Reading your data…"}
              </div>
            ) : null}

            {aiEliteRequired ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <span className="font-semibold">🔒 ELITE — </span>
                {lang === "IS"
                  ? "AI skýringar eru hluti af ELITE pakka liðsins."
                  : "AI explanations are part of the team's ELITE tier."}
              </div>
            ) : null}

            {aiError ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                {lang === "IS" ? "Tókst ekki að ná í skýringu: " : "Couldn't get explanation: "}{aiError}
              </div>
            ) : null}

            {aiAnswer?.answer ? (
              <p className="text-sm leading-relaxed text-slate-800">{aiAnswer.answer}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className={`mt-3 text-[10px] leading-snug opacity-60 ${tone.text}`}>
        {lang === "IS"
          ? "Þetta byggir á öllum gögnunum þínum — wellness, æfingaálag og leikminni — ekki bara check-in í dag."
          : "This is built from all your data — wellness, training load and match minutes — not just today's check-in."}
      </p>
    </div>
  );
}

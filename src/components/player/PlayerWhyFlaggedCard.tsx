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
};

// ── Plain-language helpers ────────────────────────────────────────────────

/**
 * Map fatigue-type tag to a short action hint that gives the player ONE
 * concrete thing to focus on today. Plain language, second-person, no
 * sport-science jargon. Used as the closing tail of the card.
 */
function actionHintFor(
  fatigueType: DecisionPayload["decision"] extends infer D ? D extends null ? null : D extends { fatigueType?: infer F } ? F : null : null,
  state: DecisionState,
  lang: "IS" | "EN",
): string | null {
  const is = lang === "IS";
  if (state === "RED") {
    return is
      ? "Hvíldu þig vel í dag og einbeittu þér að svefni og næringu."
      : "Take it easy today — focus on sleep and nutrition.";
  }
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
  // YELLOW with no specific fatigue signature
  return is
    ? "Fylgstu með hvernig þú finnur fyrir þér í upphitun og láttu þjálfara vita ef eitthvað er óeðlilegt."
    : "Pay attention to how you feel in the warm-up and flag anything unusual to the coach.";
}

/**
 * Acknowledge-then-explain framing — turns the friction "but I scored
 * 5/5 on check-in!" into a teaching moment. Lead with empathy, then the
 * actual driver from the engine.
 */
function leadSentence(state: DecisionState, lang: "IS" | "EN"): string {
  const is = lang === "IS";
  if (state === "RED") {
    return is
      ? "Þú ert í rauðu í dag. Hér er ástæðan:"
      : "You're in red today. Here's why:";
  }
  return is
    ? "Þú ert í gulu í dag. Hér er það sem kerfið sá í þínum gögnum:"
    : "You're in yellow today. Here's what the system saw in your data:";
}

export default function PlayerWhyFlaggedCard({ lang = "EN" }: { lang?: "IS" | "EN" }) {
  const [payload, setPayload] = React.useState<DecisionPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

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

  // Loading or error — render nothing (silent fail; player has plenty of
  // other context on Today). Logging is via the browser console only.
  if (loading || error) return null;

  const decision = payload?.decision;
  if (!decision) return null;
  const state = decision.recommendation.state;

  // Silent on GREEN / GRAY — the card only exists to answer "why".
  if (state !== "YELLOW" && state !== "RED") return null;

  // Pull top 3 NEGATIVE factors (the ones that pushed the verdict away
  // from green). Sorted by impact desc by the engine; we re-sort and
  // filter to be sure.
  const factors = (decision.recommendation.explanationFactors ?? [])
    .filter((f) => f.direction === "negative")
    .slice()
    .sort((a, b) => Math.abs(b.impactScore) - Math.abs(a.impactScore))
    .slice(0, 3);

  // First useful counterfactual (engine pre-sorts by impact desc).
  const counterfactual = (decision.counterfactuals ?? []).find((cf) => cf.impact >= 1) ?? null;

  // Tone classes per state — matches the player-side colour language.
  const tone =
    state === "RED"
      ? { border: "border-rose-300", bg: "bg-rose-50", text: "text-rose-900", header: "text-rose-800" }
      : { border: "border-amber-300", bg: "bg-amber-50", text: "text-amber-900", header: "text-amber-800" };

  const action = actionHintFor(decision.fatigueType ?? null, state, lang);

  return (
    <div className={`rounded-2xl border ${tone.border} ${tone.bg} p-4 shadow-sm`}>
      <div className={`text-[10px] uppercase tracking-[0.18em] font-semibold ${tone.header}`}>
        {lang === "IS" ? "Af hverju þessi litur?" : "Why this colour?"}
      </div>
      <p className={`mt-1.5 text-sm font-semibold ${tone.text}`}>
        {leadSentence(state, lang)}
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
          {decision.recommendation.coachSummary || (lang === "IS"
            ? "Kerfið fann ekkert sérstakt — talaðu við þjálfara ef þetta kemur þér á óvart."
            : "The system didn't surface a specific driver — talk to your coach if this surprises you.")}
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

      <p className={`mt-3 text-[10px] leading-snug opacity-60 ${tone.text}`}>
        {lang === "IS"
          ? "Þetta byggir á öllum gögnunum þínum — wellness, æfingaálag og leikminni — ekki bara check-in í dag."
          : "This is built from all your data — wellness, training load and match minutes — not just today's check-in."}
      </p>
    </div>
  );
}

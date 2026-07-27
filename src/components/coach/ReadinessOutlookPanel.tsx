"use client";

/**
 * Readiness Outlook — the coach-facing surface for the forward-looking wellness forecast.
 *
 * Deliberately NOT built on VerdictBanner: that component labels itself "Verdict — rules
 * decide, not AI", which would be wrong here. The Outlook is an AI MODEL forecast, and
 * the manifesto requires it labelled as such and kept visibly distinct from today's
 * traffic-light colour. It still follows the layered read: forecast verdict → plain why
 * → counterfactual → confidence → behind-the-numbers, and reuses ShowDetails +
 * MethodologyLink(OUTLOOK_CAVEAT). Everything shown as a ±1-class band, never an exact
 * class. Withheld/thin → "not enough history yet", never a green.
 */

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";
import MethodologyLink from "@/components/common/MethodologyLink";
import { OUTLOOK_CAVEAT } from "@/lib/methodologyCaveats";
import { classLabel, type WellnessClass } from "@/lib/micropulse/readinessOutlook/target";
import { loadOutlookInputs, buildPlannedDaysFromWeekSetup, type OutlookHistory } from "@/lib/micropulse/readinessOutlook/loader";
import { computeTeamOutlook, type PlayerOutlook, type PlannedDay } from "@/lib/micropulse/readinessOutlook";

type Tone = "good" | "watch" | "concern" | "neutral";
const TONE: Record<Tone, { rail: string; wrap: string }> = {
  good: { rail: "#1c7a4a", wrap: "border-emerald-200 bg-emerald-50/50" },
  watch: { rail: "#de9328", wrap: "border-amber-200 bg-amber-50/50" },
  concern: { rail: "#a83e28", wrap: "border-rose-200 bg-rose-50/50" },
  neutral: { rail: "#94a3b8", wrap: "border-slate-200 bg-white" },
};

export default function ReadinessOutlookPanel({
  teamId,
  asOf,
  variant = "full",
  plannedDays: livePlan,
}: {
  teamId?: string | null;
  asOf?: string;
  variant?: "full" | "glance";
  /** Live plan from the Week Setup grid — the forecast recomputes as it changes,
   *  with no refetch. Omit to use the coach's SAVED Week-setup plan. */
  plannedDays?: PlannedDay[];
}) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [lang] = useLang();
  const IS = lang === "IS";
  const [loading, setLoading] = useState(true);
  const [hist, setHist] = useState<OutlookHistory | null>(null);
  const [savedPlan, setSavedPlan] = useState<PlannedDay[] | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const date = asOf ?? today;

  // History (independent of the plan) — fetched ONCE per team/date.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!teamId) { setLoading(false); return; }
      setLoading(true);
      try {
        const h = await loadOutlookInputs(supabase, teamId, date);
        if (alive) setHist(h);
      } catch { if (alive) setHist(null); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [teamId, date, supabase]);

  // Saved plan — only fetched when no live grid plan is supplied.
  const hasLivePlan = !!livePlan && livePlan.length > 0;
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!teamId || hasLivePlan || !hist) { setSavedPlan(null); return; }
      try {
        const p = await buildPlannedDaysFromWeekSetup(supabase, teamId, date, hist.matchDates);
        if (alive) setSavedPlan(p);
      } catch { if (alive) setSavedPlan(null); }
    })();
    return () => { alive = false; };
  }, [teamId, date, supabase, hasLivePlan, hist]);

  const effectivePlan = hasLivePlan ? livePlan! : savedPlan;
  // The forecast itself is PURE — recomputes instantly when the live plan changes,
  // no network round-trip. Model fit is cheap and runs here.
  const outlook = useMemo(
    () => (hist && effectivePlan ? computeTeamOutlook(hist.inputs, effectivePlan) : undefined),
    [hist, effectivePlan],
  );

  const pick = (b: { en: string; is: string }) => (IS ? b.is : b.en);
  const clsLabel = (c: WellnessClass) => pick(classLabel(c));
  const forecasts = (outlook?.players ?? []).filter((p) => p.days.length > 0);
  const flagged = forecasts.filter((p) => p.flagged).sort((a, b) => (a.worstDay?.classArgmax ?? 4) - (b.worstDay?.classArgmax ?? 4));
  const withheldAll = !!outlook && forecasts.length === 0;

  // ── Forecast verdict ───────────────────────────────────────────────────────
  const verdict = (() => {
    if (!outlook || withheldAll) {
      return {
        tone: "neutral" as Tone,
        sentence: IS ? "Ekki næg saga enn til að spá fyrir um vikuna framundan." : "Not enough history yet to forecast the week ahead.",
        action: IS ? "Spáin kviknar þegar félagið hefur safnað nokkurra mánaða check-in + álagsgögnum." : "The outlook turns on once the club has a few months of check-in + load data.",
      };
    }
    if (flagged.length === 0) {
      return {
        tone: "good" as Tone,
        sentence: IS ? `Horfur: liðið ætti að halda sér undir planaðri viku (spá fyrir ${forecasts.length}).` : `Outlook: the squad should hold up under the planned week (forecast for ${forecasts.length}).`,
        action: IS ? "Ekkert að aðhafast — plönuð dreifing lítur vel út." : "Nothing to act on — the planned distribution looks fine.",
      };
    }
    const names = flagged.slice(0, 3).map((p) => p.playerName.split(" ")[0]).join(", ") + (flagged.length > 3 ? ` +${flagged.length - 3}` : "");
    return {
      tone: (flagged.some((p) => (p.worstDay?.classArgmax ?? 4) <= 1) ? "concern" : "watch") as Tone,
      sentence: IS ? `Horfur: ${flagged.length} líklega niðri í vikunni — ${names}.` : `Outlook: ${flagged.length} likely to dip this week — ${names}.`,
      action: IS ? "Léttu þunga daginn á undan dýfunni, eða skoðaðu hvern leikmann að neðan." : "Ease the heavy day before the dip, or check each player below.",
    };
  })();

  const tone = TONE[verdict.tone];
  const modelPct = outlook?.modelWithin1 != null ? Math.round(outlook.modelWithin1 * 100) : null;
  const naivePct = outlook?.naiveWithin1 != null ? Math.round(outlook.naiveWithin1 * 100) : null;
  // The honest number is the LIFT over "assume steady" — within-±1 is trivially high.
  const lift = modelPct != null && naivePct != null ? modelPct - naivePct : null;
  const confNote = withheldAll || !outlook
    ? null
    : modelPct != null && naivePct != null
      ? IS
        ? `Spá fyrir ${forecasts.length} leikm. · ${modelPct}% innan ±1 vs ${naivePct}% ef gengið er út frá óbreyttu`
        : `Forecast for ${forecasts.length} player${forecasts.length === 1 ? "" : "s"} · ${modelPct}% within ±1 vs ${naivePct}% just assuming steady`
      : IS ? `Spá fyrir ${forecasts.length} leikm.` : `Forecast for ${forecasts.length} player${forecasts.length === 1 ? "" : "s"}`;

  if (!teamId) return null;
  if (!loading && !hist) return null; // no roster / no history for this team
  if (loading || !outlook) {
    return <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">{IS ? "Reikna horfur…" : "Computing outlook…"}</div>;
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border ${tone.wrap} p-4 shadow-sm`}>
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: tone.rail }} aria-hidden />
      <div className="pl-2">
        {/* Kicker — clearly a forward FORECAST from an AI model, not today's colour */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{IS ? "Horfur" : "Outlook"}</span>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-semibold uppercase text-violet-700"
            title={IS ? "Spá úr líkani (ekki dagsform dagsins). Reglur/þjálfari ákveða — spáin útskýrir." : "A model forecast (not today's readiness). Rules/coach decide — the forecast explains."}>
            {IS ? "Spá · gervigreind" : "Forecast · AI"}
          </span>
        </div>

        <p className="mt-1 text-[15px] font-semibold leading-snug text-slate-900">{verdict.sentence}</p>
        <p className="mt-1 text-[13px] leading-snug text-slate-600">
          {IS ? "Spá um viðbúnað út frá plönuðu álagi — ekki dagsform dagsins, aldrei yfir umferðarljósið." : "A readiness-to-train forecast from your planned load — not today's colour, never over the traffic light."}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-slate-600">
          <span className="font-medium">{IS ? "Hvað á að gera:" : "What to do:"}</span> {verdict.action}
        </div>

        {confNote && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[11px] text-slate-600">
            <span className="font-medium">{IS ? "Vissa" : "Confidence"}:</span> {confNote}
          </div>
        )}

        {/* Plain "how to read this" — for a coach, in everyday language + an example */}
        <ShowDetails label={{ EN: "How to read this — in plain words", IS: "Hvernig á að lesa þetta — á mannamáli" }}>
          <div className="grid gap-3 text-[12px] leading-relaxed text-slate-600 sm:grid-cols-2">
            <div>
              <div className="font-semibold text-slate-800">{IS ? "Hvað er þetta?" : "What is this?"}</div>
              <p>{IS
                ? "Fyrirvari. Það horfir á æfingarnar sem þú hefur PLANAÐ út vikuna og segir hverjir eru líklegir til að mæta flatir — og hvaða dag — nógu snemma til að breyta planinu. Umferðarljósið segir hvernig leikmanni líður NÚNA; þetta segir hvernig hann verður líklega eftir nokkra daga ef þú keyrir vikuna eins og hún er plönuð."
                : "A heads-up. It looks at the sessions you've PLANNED for the rest of the week and flags who is likely to come in flat — and on which day — early enough to change the plan. The traffic light tells you how a player feels RIGHT NOW; this tells you how he's likely to be in a few days if you run the week as planned."}</p>
            </div>
            <div>
              <div className="font-semibold text-slate-800">{IS ? "Hvernig les ég það?" : "How do I read it?"}</div>
              <p>{IS
                ? "Grænt = plánaða vikan lítur vel út, enginn spáður niðri. Gult/rautt = einn eða fleiri líklega flatir tiltekinn dag (t.d. „MD-2: örlítið niðri“). Opnaðu flaggaðan leikmann til að sjá af hverju + lagfæringu („léttu þunga daginn á undan ~15%“)."
                : "Green = the planned week looks fine, nobody projected to dip. Amber/red = one or more players likely flat on a specific day (e.g. “MD-2: slightly down”). Open a flagged player to see why + a fix (“ease the heavy day before it ~15%”)."}</p>
            </div>
            <div>
              <div className="font-semibold text-slate-800">{IS ? "Dæmi" : "An example"}</div>
              <p>{IS
                ? "Þú hefur planað erfiðan miðvikudag. Leikmaður er þegar með hátt 4-vikna álag og mætti þreyttur. Outlook segir hann líklega flatan á fimmtudag. Þú léttir miðvikudaginn 15% ÁÐUR en það gerist — og dýfan kemur kannski ekki."
                : "You've planned a hard Wednesday. A player's 4-week load is already high and he came in tired. The Outlook says he's likely flat on Thursday. You lighten Wednesday 15% BEFORE it happens — and the dip may not come."}</p>
            </div>
            <div>
              <div className="font-semibold text-slate-800">{IS ? "Flokkarnir + „spá fyrir N“" : "The labels + “forecast for N”"}</div>
              <p>{IS
                ? "Allt er miðað við HANS EIGIN venju, ekki algilt: Undir sinni venju → Örlítið undir → Sitt venjulega → Yfir venju. Þannig sést dýfa fyrir HANN þótt talan sé há í algildu. Við sýnum lítið bil (t.d. „örlítið undir–undir venju“), aldrei eina nákvæma tölu. „Spá fyrir N“ = aðeins leikmenn með næga eigin sögu fá spá; hinir eru skildir eftir frekar en giskað."
                : "Everything is against HIS OWN norm, not absolute: Below his usual → A touch below → His usual → Above his usual. So a dip shows up for HIM even if the raw number is high. We show a small range (e.g. “a touch below–below his usual”), never one exact score. “Forecast for N” = only players with enough of their own history get one; the rest are left out rather than guessed."}</p>
            </div>
            <div className="sm:col-span-2">
              <div className="font-semibold text-slate-800">{IS ? "Heiðarlegi hlutinn" : "The honest part"}</div>
              <p>{IS
                ? "Þetta er leiðsögn út frá álagi einu saman. Svefn, skóli/vinna og lífið hreyfa líka við líðan — svo lestu sem ábendingu, ekki dóm. Og það verður skarpara eftir því sem félagið safnar meiri sögu."
                : "It's a guide from load alone. Sleep, school/work and life also move wellness — so read it as a nudge, not a verdict. And it gets sharper as the club builds more history."}</p>
            </div>
          </div>
        </ShowDetails>

        {/* Per-player detail (full variant only) */}
        {variant === "full" && flagged.length > 0 && (
          <div className="mt-3 space-y-2">
            {flagged.map((p) => <PlayerRow key={p.playerId} p={p} IS={IS} clsLabel={clsLabel} />)}
          </div>
        )}

        {/* Behind the numbers */}
        {outlook && !withheldAll && (
          <ShowDetails label={{ EN: "Behind the numbers", IS: "Á bak við tölurnar" }}>
            <div className="space-y-2 text-[11px] leading-relaxed text-slate-600">
              <p>{IS
                ? "Hver dagur er sýndur sem ±1-flokks bil, ekki nákvæmur flokkur. Líkanið er raðaðhvarfgreining (ordinal regression) á plönuðu álagi þínu borið við eigin viðmiðun hvers leikmanns — stuðlarnir eru „af hverju“."
                : "Each day is shown as a ±1-class band, never an exact class. The model is ordinal regression on your planned load vs each player's own norm — the coefficients are the 'why'."}</p>
              <p>{lift == null
                ? (IS ? "Ekki næg gögn fyrir nákvæmnismat enn." : "Not enough data for an accuracy read yet.")
                : lift >= 5
                  ? (IS
                      ? `Gengur á sögulegum vikum: ${modelPct}% innan ±1, sem er +${lift} stig yfir því að giska á óbreytt — raunveruleg (þó hófleg) forspá.`
                      : `Walk-forward on past weeks: ${modelPct}% within ±1, which is +${lift} pts over just guessing "steady" — real, if modest, skill.`)
                  : (IS
                      ? `${modelPct}% innan ±1 — en aðeins +${lift} stig yfir því að giska á óbreytt. Það þýðir að þetta endurspeglar aðallega að hópurinn hefur verið stöðugur, ekki sterka forspá. Lestu sem stöðugleika-tékk, ekki kristalskúlu.`
                      : `${modelPct}% within ±1 — but only +${lift} pts over guessing "steady". So this mostly reflects that the squad has been stable, not a strong prediction. Read it as a stability check, not a crystal ball.`)}
              </p>
              <p>{IS ? "Veikt þar til félagið hefur safnað nokkurra mánaða gögnum." : "Weak until the club has a few months of its own data."}</p>
              <p className="text-slate-400">{outlook.citation}</p>
            </div>
            <MethodologyLink caveat={OUTLOOK_CAVEAT} />
          </ShowDetails>
        )}
      </div>
    </div>
  );
}

function PlayerRow({ p, IS, clsLabel }: { p: PlayerOutlook; IS: boolean; clsLabel: (c: WellnessClass) => string }) {
  const wd = p.worstDay!;
  const conf = p.confidence;
  const confWord = conf.level === "high" ? (IS ? "mikil vissa" : "high confidence") : conf.level === "moderate" ? (IS ? "miðlungs vissa" : "moderate confidence") : (IS ? "lítil vissa" : "low confidence");
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-900">{p.playerName}</span>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          {wd.mdLabel ? `${wd.mdLabel}: ` : ""}{clsLabel(wd.bandLow)}{wd.bandLow !== wd.bandHigh ? `–${clsLabel(wd.bandHigh)}` : ""} <span className="font-normal opacity-70">(±1)</span>
        </span>
      </div>
      {p.why && <p className="mt-1 text-[12px] leading-snug text-slate-700">{IS ? p.why.is : p.why.en}</p>}
      {p.counterfactual && (
        <p className="mt-1 text-[11px] italic leading-snug text-slate-500">↑ {IS ? p.counterfactual.is : p.counterfactual.en}</p>
      )}
      <p className="mt-1 text-[10px] text-slate-400">{confWord} · {IS ? conf.note.is : conf.note.en}</p>
    </div>
  );
}

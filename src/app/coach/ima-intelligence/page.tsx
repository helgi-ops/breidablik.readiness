"use client";

/**
 * Coach view — IMA Intelligence (Day Profile).
 *
 * Where Decel Intelligence answers "is this player chronically at risk?"
 * and Load Intelligence answers "did the team train hard enough?", this
 * page fills a missing gap: "what did today's session actually deliver,
 * biomechanically?"
 *
 * Built on Catapult IMA Free Running 8-band stride distribution. The 8
 * bands are BOUT-DURATION bands (seconds of one continuous run; edges are
 * set in OpenField — legacy 0–8–12–15–18–21–24–27 s, from 10 Nov 2026
 * 0–2.5–5–8–12–18–24–30 s), NOT speed or cadence bands. Runs ≥18 s
 * (ima_fr_ge18) = long continuous runs, never sprinting / high-speed running
 * (docs/ima-free-running-bands.md). Powered by the deterministic loader in
 * lib/micropulse/imaDayProfile/. The page is a session-review surface —
 * coach opens it after training to see whether the planned running mix
 * (short bursts vs long runs) matched the captured one.
 *
 * Sport-science citations:
 *   - McBurnie 2022: stride / running-mechanics profiles add context GPS
 *     distance alone doesn't show (stride length in sustained running).
 *   - Bishop 2020: L/R asymmetry > 15% on high-intensity CoD = 3× injury
 *     risk multiplier.
 *   - Buchheit 2014: stride norms are individual — per-player baselines
 *     required for meaningful interpretation.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang, type Lang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import VerdictBanner, { type VerdictDriver } from "@/components/coach/VerdictBanner";
import LiteTierBanner from "@/components/coach/LiteTierBanner";
import CoachWeeklyLoadCard from "@/components/dashboard/CoachWeeklyLoadCard";
import KinexonMetricsPanel from "@/components/coach/KinexonMetricsPanel";
import CoachTutorialButton from "@/components/coach/tutorials/CoachTutorialButton";
import ShowDetails from "@/components/common/ShowDetails";
import TitanMovementIntelligence from "@/components/coach/TitanMovementIntelligence";
import type { ImaSessionProfile, ImaPlayerDay, SessionType } from "@/lib/micropulse/imaDayProfile";
import { strideVerdictBadge } from "@/lib/micropulse/strideLength/verdictBadge";
import { CV_BY_KIND, FLAG_SD, type StrideResult } from "@/lib/micropulse/strideLength";
import { freeRunningBandLabel } from "@/lib/integrations/catapult/freeRunningBands";
import type { TeamLongRuns } from "@/lib/micropulse/longRuns/loader";
import { longRunBandsTotal, type LongRunBand } from "@/lib/micropulse/longRuns";

const I18N = {
  pageTitle: { EN: "IMA Intelligence", IS: "IMA Intelligence" },
  citation: { EN: "McBurnie 2022 · Bishop 2020 · Buchheit 2014", IS: "McBurnie 2022 · Bishop 2020 · Buchheit 2014" },
  subtitle: {
    EN: "Biomechanical view of a training day: short bursts vs long continuous runs, long-run strides vs each player's usual, and left/right balance on hard changes of direction.",
    IS: "Lífaflfræðileg sýn á æfingadag: stutt hlaup á móti löngum samfelldum hlaupum, skref í löngum hlaupum miðað við venju hvers leikmanns, og vinstri/hægri jafnvægi í hörðum stefnubreytingum.",
  },
  dateLabel: { EN: "Date", IS: "Dagsetning" },
  loading: { EN: "Loading…", IS: "Hleð…" },
  notSignedIn: { EN: "Not signed in", IS: "Ekki innskráður" },
  errorFetch: { EN: "Failed to load IMA data", IS: "Villa við að sækja IMA gögn" },
  noData: {
    EN: "No IMA data captured for this date. Either the squad wasn't on the pitch with pods, or older activities were ingested before Catapult Free Running was enabled.",
    IS: "Engin IMA gögn fyrir þennan dag. Annað hvort var hópurinn ekki á vellinum með pod-ana, eða eldri activities voru ingestaðar áður en Catapult Free Running var virkjað.",
  },
  sessionShape: { EN: "Session shape", IS: "Mynstur æfingar" },
  totalStrides: { EN: "Total strides", IS: "Heildar stride" },
  sprintStrides: { EN: "Long-run strides (18 s+)", IS: "Skref í löngum hlaupum (18 sek+)" },
  codBalance: { EN: "L/R CoD balance (high)", IS: "L/H CoD jafnvægi (há)" },
  codFlagged: { EN: "High-CoD asym. flagged", IS: "Há-CoD ósamh. flögg" },
  playersCaptured: { EN: "Players captured", IS: "Leikmenn með gögn" },
  codProfile: { EN: "Change-of-Direction profile (team)", IS: "Stefnubreyting-mynstur (lið)" },
  tierLow: { EN: "Low", IS: "Lág" },
  tierMedium: { EN: "Medium", IS: "Mið" },
  tierHigh: { EN: "High (injury-relevant)", IS: "Há (meiðsla-tengd)" },
  bandDistribution: { EN: "Run-length mix (team)", IS: "Hlaupalengd — dreifing (lið)" },
  lowBand: { EN: "Short bursts (<12 s)", IS: "Stutt hlaup (<12 sek)" },
  midBand: { EN: "Medium runs (12–24 s)", IS: "Miðlungs hlaup (12–24 sek)" },
  highBand: { EN: "Longest runs (≥24 s)", IS: "Lengstu hlaup (≥24 sek)" },
  perPlayer: { EN: "Per-player breakdown", IS: "Sundurliðun per leikmann" },
  colPlayer: { EN: "Player", IS: "Leikmaður" },
  colTotal: { EN: "Total", IS: "Heild" },
  colLow: { EN: "Short <12 s", IS: "Stutt <12 s" },
  colMid: { EN: "Medium 12–24 s", IS: "Miðl. 12–24 s" },
  colHigh: { EN: "Longest ≥24 s", IS: "Lengst ≥24 s" },
  colSprint: { EN: "Long runs (18 s+)", IS: "Löng hlaup (18 s+)" },
  colSprintVsBaseline: { EN: "vs baseline", IS: "vs grunnlína" },
  colCod: { EN: "CoD L/R (high)", IS: "CoD L/H (há)" },
  colCodAsym: { EN: "CoD asym. (high)", IS: "CoD ósamh. (há)" },
  expand: { EN: "Expand CoD breakdown", IS: "Sjá CoD sundurliðun" },
  collapse: { EN: "Collapse", IS: "Loka" },
  codBreakdownLabel: { EN: "Change-of-Direction breakdown", IS: "Stefnubreyting sundurliðun" },
  backToDashboard: { EN: "← Back to dashboard", IS: "← Til baka á dashboard" },
  openInDecel: { EN: "Decel Intelligence →", IS: "Decel Intelligence →" },
  howToRead: { EN: "How to read this", IS: "Hvernig á að lesa þetta" },
  legend1: {
    EN: "IMA Free Running puts each continuous run into one of 8 bands by HOW LONG it lasted — not by speed. The band edges are set in OpenField and changed on 9 Nov 2026 (now 0–2.5–5–8–12–18–24–30 s), so MicroPulse reads each session with the edges it was recorded with and groups runs by length: short bursts (under 12 s), medium runs (12–24 s) and longest runs (24 s or more). Long continuous runs = 18 s or more: tempo, conditioning or long recovery runs. This is NOT sprinting — sprint and high-speed running come from GPS speed, not from run length.",
    IS: "IMA Free Running setur hvert samfellt hlaup í eitt af 8 böndum eftir því HVE LENGI það stóð — ekki eftir hraða. Mörk bandanna eru stillt í OpenField og var breytt 9. nóv 2026 (nú 0–2,5–5–8–12–18–24–30 sek), svo MicroPulse les hverja æfingu með þeim mörkum sem giltu þá og flokkar hlaup eftir lengd: stutt hlaup (undir 12 sek), miðlungs hlaup (12–24 sek) og lengstu hlaup (24 sek eða lengur). Löng samfelld hlaup = 18 sek eða lengri: tempó-, úthalds- eða löng endurheimtarhlaup. Þetta eru EKKI sprettir — sprettir og hraðhlaup koma úr GPS-hraða, ekki úr hlaupalengd.",
  },
  legend2: {
    EN: "vs baseline compares today's strides in long continuous runs (18 s+) to the player's 14-day training-only average (matches excluded). 100% = typical day. < 70% = light. > 150% = much more sustained running than usual, monitor recovery.",
    IS: "vs grunnlína ber skref dagsins í löngum samfelldum hlaupum (18 sek+) saman við 14-daga æfinga-grunnlínu (leikir undanskildir). 100% = típískur dagur. < 70% = léttur. > 150% = mun meira samfellt hlaup en venjulega, fylgjast með endurheimt.",
  },
  legend3: {
    EN: "CoD asymmetry > 15% on high-intensity Change-of-Direction events is a commonly-flagged imbalance associated with injury risk — a risk factor, not a validated predictor (the Bishop evidence is mainly single-leg-jump asymmetry). Flagged when total CoD ≥ 10 efforts.",
    IS: "CoD ósamhverfa > 15% á háa intensity Change-of-Direction event-um er algengt flöggað ójafnvægi sem er tengt meiðsla-áhættu — áhættuþáttur, ekki staðfest spá (gögn Bishop eru aðallega um stökk-ósamhverfu á einum fæti). Merkt þegar heildar CoD ≥ 10 efforts.",
  },
  legend4: {
    EN: "An asterisk (*) on vs baseline means the comparison is based on only 1 training day in the 14-day window — common right now because most pre-Catapult-fix training days have no IMA data. The baseline strengthens automatically as more post-fix days accumulate.",
    IS: "Stjarna (*) á vs grunnlína þýðir að samanburðurinn byggir á aðeins 1 æfingadegi í 14-daga gluggi — algengt núna því flest pre-Catapult-fix æfingadagar hafa engin IMA gögn. Grunnlínan styrkist sjálfkrafa þegar fleiri post-fix dagar safnast saman.",
  },
} as const;

function t(key: keyof typeof I18N, lang: Lang): string {
  return lang === "IS" ? I18N[key].IS : I18N[key].EN;
}

const SESSION_COLOURS: Record<SessionType, { bg: string; border: string; text: string; chip: string }> = {
  high_cadence: { bg: "bg-rose-50",  /* legacy key = long-run day */    border: "border-rose-300",    text: "text-rose-900",    chip: "bg-rose-600 text-white" },
  tactical:     { bg: "bg-blue-50",    border: "border-blue-300",    text: "text-blue-900",    chip: "bg-blue-600 text-white" },
  mixed:        { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900", chip: "bg-emerald-600 text-white" },
  recovery:     { bg: "bg-slate-50",   border: "border-slate-300",   text: "text-slate-900",   chip: "bg-slate-600 text-white" },
  no_data:      { bg: "bg-slate-50",   border: "border-slate-200",   text: "text-slate-500",   chip: "bg-slate-400 text-white" },
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Verdict (rules, not AI) ────────────────────────────────────────────────
// Plain-language headline computed deterministically from the per-player day
// already loaded in `profile`. The buried insight on this page is an acute
// movement spike vs a player's own training norm — surface it at the top.
// Spike threshold matches the existing rose row colouring (>= 150% of the
// 14-day training-only baseline of long-run strides — IMA FR efforts
// ≥18 s (ima_fr_ge18); the field is still called `sprint_vs_baseline_pct` but it is NOT sprint).
type ImaVerdict = {
  tone: "good" | "watch" | "concern" | "neutral";
  sentence: { EN: string; IS: string };
  subtitle: { EN: string; IS: string };
  confidence: { level: "high" | "moderate" | "low"; note: { EN: string; IS: string } };
  drivers: VerdictDriver[];
};

const SUBTITLE_IMA = {
  EN: "Measured by the pod (works indoors). This compares today's long continuous running — runs of 18 s or more — to each player's own usual training day. It is not a sprint measure.",
  IS: "Mælt af pod (virkar innandyra). Þetta ber löng samfelld hlaup dagsins — hlaup 18 sek eða lengri — saman við venjulegan æfingadag hvers leikmanns. Þetta er ekki sprett-mæling.",
} as const;

function computeImaVerdict(profile: ImaSessionProfile): ImaVerdict {
  const withData = profile.per_player.filter((p) => p.total_strides > 0);
  const withBaseline = withData.filter((p) => p.sprint_vs_baseline_pct != null);

  // Genuinely no usable data → honest neutral / low confidence.
  if (withData.length === 0 || profile.session_type === "no_data") {
    return {
      tone: "neutral",
      sentence: {
        EN: "Not enough movement data captured today to judge load.",
        IS: "Ekki næg hreyfigögn í dag til að meta álag.",
      },
      subtitle: SUBTITLE_IMA,
      confidence: {
        level: "low",
        note: { EN: "no players captured with pods", IS: "engir leikmenn með pod" },
      },
      drivers: [],
    };
  }

  const spikes = withBaseline.filter((p) => (p.sprint_vs_baseline_pct ?? 0) >= 150);

  // Confidence from coverage (players captured) + baseline maturity.
  const thinBaseline = withBaseline.every((p) => p.sprint_baseline_days <= 1);
  const coverage = withBaseline.length;
  const level: "high" | "moderate" | "low" =
    coverage === 0 || thinBaseline ? "low" : coverage >= 6 ? "high" : "moderate";
  const confNote = {
    EN:
      coverage === 0
        ? "no personal baselines yet"
        : thinBaseline
          ? `${coverage} compared, baselines still building`
          : `${coverage} players compared to their own norm`,
    IS:
      coverage === 0
        ? "engar persónulegar grunnlínur enn"
        : thinBaseline
          ? `${coverage} bornir saman, grunnlínur enn að byggjast`
          : `${coverage} leikmenn bornir saman við eigin venju`,
  };

  // Driver tooltips carry the jargon + paper citation (Gabbett 2016 load-change
  // framing; Buchheit 2014 individual baselines). No sprint citations: this is
  // sustained-running volume, not sprint exposure.
  const drivers: VerdictDriver[] = spikes
    .slice()
    .sort((a, b) => (b.sprint_vs_baseline_pct ?? 0) - (a.sprint_vs_baseline_pct ?? 0))
    .map((p) => ({
      label: p.full_name,
      detail: {
        EN: `${Math.round(p.sprint_vs_baseline_pct ?? 0)}% of usual`,
        IS: `${Math.round(p.sprint_vs_baseline_pct ?? 0)}% af venju`,
      },
      tone: "concern" as const,
      tip: {
        EN: `Strides in long continuous runs (18 s or more, by IMA Free Running run length) at ${Math.round(
          p.sprint_vs_baseline_pct ?? 0,
        )}% of his 14-day training-only baseline — a sharp jump in sustained running, not sprinting. Phase extra tempo/conditioning running in rather than spiking it (load-change framing Gabbett 2016; per-player norms Buchheit 2014).`,
        IS: `Skref í löngum samfelldum hlaupum (18 sek+, eftir lengd hlaups í IMA Free Running) ${Math.round(
          p.sprint_vs_baseline_pct ?? 0,
        )}% af 14-daga æfinga-grunnlínu — snarpt stökk í samfelldu hlaupi, ekki sprettum. Innleiddu auka tempó-/úthaldshlaup smám saman frekar en í einu stökki (álagsbreyting Gabbett 2016; persónulegar norm Buchheit 2014).`,
      },
    }));

  if (spikes.length === 0) {
    return {
      tone: "good",
      sentence: {
        EN: "Every player's long continuous running today was within their own normal range.",
        IS: "Löng samfelld hlaup allra leikmanna í dag voru innan þeirra eigin venju.",
      },
      subtitle: SUBTITLE_IMA,
      confidence: { level, note: confNote },
      drivers: [],
    };
  }

  const names = spikes.map((p) => p.full_name).join(", ");
  return {
    tone: "concern",
    sentence: {
      EN: `${spikes.length} player${spikes.length === 1 ? "" : "s"} did far more long continuous running than usual today — ${names}; everyone else was within range.`,
      IS: `${spikes.length} leikm${spikes.length === 1 ? "aður" : "enn"} hlupu mun meira í löngum samfelldum hlaupum en venjulega í dag — ${names}; aðrir voru innan marka.`,
    },
    subtitle: SUBTITLE_IMA,
    confidence: { level, note: confNote },
    drivers,
  };
}

export default function ImaIntelligencePage() {
  const [lang] = useLang();
  const [date, setDate] = React.useState(todayIso());
  const [profile, setProfile] = React.useState<ImaSessionProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Resolve the coach's team once, so the weekly IMA card (which needs a teamId)
  // can mount alongside the day profile. Also read the team's GPS provider: a Titan
  // indoor-IMU team has no Catapult strides/CoD, so the whole page swaps to the Titan variant.
  const [teamId, setTeamId] = React.useState<string | null>(null);
  const [isTitan, setIsTitan] = React.useState(false);
  const [isKinexon, setIsKinexon] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: authRes } = await sb.auth.getUser();
        const uid = authRes?.user?.id;
        if (!uid) return;
        const { data: prof } = await sb.from("profiles").select("team_id").eq("id", uid).maybeSingle();
        const tid = (prof as { team_id?: string } | null)?.team_id ?? null;
        if (!alive) return;
        setTeamId(tid);
        if (tid) {
          const { data: team } = await sb.from("teams").select("gps_provider").eq("id", tid).maybeSingle();
          const provider = String((team as { gps_provider?: string } | null)?.gps_provider ?? "");
          if (alive) { setIsTitan(provider === "titan"); setIsKinexon(provider === "kinexon"); }
        }
      } catch { /* best-effort — the day profile still renders without it */ }
    })();
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    let alive = true;
    // Titan (own variant) and Kinexon (no IMA Free Running / directional CoD) skip
    // the Catapult day-profile fetch entirely.
    if (isTitan || isKinexon) { setLoading(false); setError(null); return; }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) {
          if (alive) { setError(t("notSignedIn", lang)); setLoading(false); }
          return;
        }
        const res = await fetch(`/api/coach/team/ima-day-profile?date=${date}&lang=${lang}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (alive) { setError(t("errorFetch", lang)); setLoading(false); }
          return;
        }
        const json = await res.json();
        if (!alive) return;
        setProfile(json.profile ?? null);
        setLoading(false);
      } catch {
        if (alive) { setError(t("errorFetch", lang)); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [date, lang, isTitan, isKinexon]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {!isTitan && (
        <LiteTierBanner
          feature="IMA Intelligence"
          reasonIs="IMA Intelligence þarf ekta IMA-gögn úr Catapult (hröðun/hemlun, stefnubreytingar, stökk, Free Running bönd) — þessi gögn eru ekki tiltæk á núverandi Catapult-pakkanum ykkar."
          reasonEn="IMA Intelligence needs genuine IMA data from Catapult (accel/decel, change-of-direction, jumps, Free Running bands) — those aren't included in your current Catapult plan."
        />
      )}
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/coach" className="text-sm text-slate-500 hover:text-slate-700">
            {t("backToDashboard", lang)}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{isKinexon ? (lang === "IS" ? "Hreyfigreining" : "Movement Intelligence") : t("pageTitle", lang)}</h1>
          <PagePurpose
            en="see change-of-direction and movement load per player"
            is="sjá stefnubreytinga- og hreyfiálag per leikmann"
            tutorial="ima-intelligence"
          />
          <p className="text-xs text-slate-500">{isTitan ? "Titan indoor IMU · Power et al. 2022" : t("citation", lang)}</p>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            {isKinexon
              ? (lang === "IS"
                  ? "Innidyra hreyfiálag frá Kinexon staðsetningu: stefnubreytingar, stefnusnúningar, átök og hröðun/hægðun per leikmaður, lesið á persónulegri viðmiðun. (Ekki IMA Free Running.)"
                  : "Indoor movement load from Kinexon positioning: changes of direction, orientation, exertions and accel/decel per player, read on personal norm. (Not IMA Free Running.)")
              : isTitan
              ? (lang === "IS"
                  ? "Hreyfigreining fyrir Titan innidyra-IMU: IMU Álagsvísitala, stökk, impacts og tími-í-ákefð (Kyrr/Lágt/Miðlungs/Hátt) per leikmaður, lesið á persónulegri viðmiðun."
                  : "Movement intelligence for the Titan indoor IMU: IMU Load Index, jumps, impacts and time-in-intensity (settled/low/mid/high) per player, read on personal norm.")
              : t("subtitle", lang)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs uppercase tracking-wide text-slate-500">{t("dateLabel", lang)}</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={todayIso()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Weekly IMA driver load — the week's inertial-movement load (total +
          accel/decel/CoD) vs the typical week: the "driver" companion to the
          day profile below. Renders independently of today's session.
          Catapult-only (accel/decel/CoD) — hidden for a Titan indoor-IMU team. */}
      {teamId && !isTitan && (
        <div className="mb-6">
          <div className="mb-2 flex justify-end">
            <CoachTutorialButton slug="weekly-ima" label={{ en: "How to read", is: "Hvernig á að lesa" }} />
          </div>
          <CoachWeeklyLoadCard
            teamId={teamId}
            lang={lang}
            date={date}
            // Kinexon: let the API auto-select the Kinexon load set (real variable
            // names) instead of forcing the Catapult IMA driver set.
            group={isKinexon ? undefined : "ima"}
            isKinexon={isKinexon}
            title={isKinexon ? (lang === "IS" ? "Vikulegt hreyfiálag" : "Weekly movement load") : (lang === "IS" ? "Vikulegt IMA-álag" : "Weekly IMA Load")}
            subtitle={isKinexon
              ? (lang === "IS" ? "Uppsafnað innidyra-álag vikunnar (Kinexon-breytur) vs dæmigert" : "Cumulative indoor load this week (Kinexon variables) vs typical")
              : (lang === "IS" ? "Uppsafnað IMA (driver) álag vikunnar vs dæmigert" : "Cumulative IMA (driver) load this week vs typical")}
          />
        </div>
      )}

      {/* Titan indoor-IMU variant — replaces the Catapult stride/CoD read entirely. */}
      {isTitan && <TitanMovementIntelligence teamId={teamId} date={date} lang={lang} />}

      {/* Kinexon reports accel/decel/CoD as totals (shown in the Weekly IMA Load
          above), but not the per-stride IMA Free Running bands or directional/
          intensity-tier CoD this page's session-shape, long-run-stride and L/R
          asymmetry reads need — so those Catapult-specific sections are replaced
          with an honest pointer to where Kinexon's movement data lives. */}
      {/* Kinexon indoor movement — its own change-of-direction & effort variables
          (CoD, Changes of Orientation, Exertions, accel/decel), not the Catapult
          IMA Free Running / directional-CoD this page is built on. Indoor — never
          labelled IMA/IMU. */}
      {isKinexon && teamId && (
        <div className="mb-6">
          <KinexonMetricsPanel
            teamId={teamId}
            date={date}
            lang={lang === "IS" ? "IS" : "EN"}
            groupKeys={["cod", "accel_decel", "accel_load"]}
            titleEN="Indoor movement & change of direction"
            titleIS="Innidyra hreyfing & stefnubreytingar"
            descEN="Kinexon's own change-of-direction and effort signals — squad average today vs the 7- and 28-day baselines (ACWR on accumulation metrics). Indoor positioning, not IMA Free Running."
            descIS="Kinexon sín eigin stefnubreytinga- og átaksmerki — meðaltal sveitar í dag á móti 7- og 28-daga grunnlínum (ACWR á uppsöfnun). Innidyra staðsetning, ekki IMA Free Running."
          />
          <p className="mt-2 text-[11px] text-slate-400">
            {lang === "IS"
              ? "Hlaupalengdar-bönd, skref í löngum hlaupum og L/R CoD ósamhverfa eru ekki í Kinexon-útflutningi. Fullt Kinexon hreyfiálag er á "
              : "Run-length bands, long-run strides and L/R CoD asymmetry aren't in a Kinexon export. Full Kinexon movement load is on the "}
            <a href="/coach/load-intelligence?tab=gps" className="underline">Full Kinexon metrics</a>
            {lang === "IS" ? " og " : " and "}
            <a href="/coach/decel-intelligence" className="underline">Deceleration Intelligence</a>
            {lang === "IS" ? " yfirborðunum." : " surfaces."}
          </p>
        </div>
      )}

      {!isTitan && !isKinexon && loading && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
          {t("loading", lang)}
        </div>
      )}

      {!isTitan && !isKinexon && error && !loading && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</div>
      )}

      {!isTitan && !isKinexon && !loading && !error && profile && (
        <>
          {(() => {
            const v = computeImaVerdict(profile);
            return (
              <div className="mb-6">
                <VerdictBanner
                  lang={lang}
                  tone={v.tone}
                  sentence={v.sentence}
                  subtitle={v.subtitle}
                  confidence={v.confidence}
                  drivers={v.drivers}
                  kicker={{ EN: "Movement intelligence", IS: "Hreyfigreining" }}
                />
              </div>
            );
          })()}
          <SessionProfileCard profile={profile} lang={lang} />
          <LongRunsCard date={date} lang={lang} />
          <ImaStrideVerdictCard date={date} lang={lang} />
          <PerPlayerTable profile={profile} lang={lang} />
          <LegendCard lang={lang} />
        </>
      )}
    </div>
  );
}

// ── Long runs (bouts ≥18 s) — the Free Running bands read as time bands ───
// IMA Free Running bands are BOUT-DURATION bands (edges per row: ima_fr_band_bounds), NOT speed — so the card shows,
// per band, the four variables OpenField reports side by side: runs (Event Count), time (Total Duration),
// distance (Total Distance, GPS only) and strides (Stride Count). Runs and time come from the inertial sensor and
// read indoors too. Since 10 Nov 2026 the card leads with PACE: how many long runs were at match pace (11 km/h+)
// against his match, because in training most long runs are jogs. The old ACWR spike badge is gone: on all long
// runs it flagged jog days, at match pace it follows match minutes (replay in longRuns/signalLoad.ts).
// One card replaces the old "Long-run distance" + "Long runs" pair.

const fmtInt = (n: number | null, is: boolean) => (n == null ? "—" : Math.round(n).toLocaleString(is ? "is-IS" : "en-GB"));
const fmtMinSec = (s: number | null) => (s == null ? "—" : `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`);
const fmtS = (s: number | null) => (s == null ? "—" : `${Math.round(s)} s`);
const fmtStride = (m: number | null, is: boolean) => (m == null ? "—" : m.toFixed(2).replace(".", is ? "," : "."));

/** Runs · time · avg run · distance · strides · m/stride per long-run band (≥18 s, labelled from each band's own edges), plus the "all long runs" line. */
function LongRunBandTable({ bands, lang, compact = false }: { bands: LongRunBand[]; lang: Lang; compact?: boolean }) {
  const is = lang === "IS";
  const tot = longRunBandsTotal(bands);
  const cell = compact ? "px-2 py-1" : "px-2 py-1.5";
  const head = [
    { k: "band", en: "Run length", is: "Lengd hlaups", left: true },
    { k: "bouts", en: "Runs", is: "Hlaup", tip: { en: "Event Count: how many runs in this band", is: "Event Count: fjöldi hlaupa í bandinu" } },
    { k: "seconds", en: "Time", is: "Tími", tip: { en: "Total Duration, min:s", is: "Total Duration, mín:sek" } },
    { k: "mean", en: "Avg run", is: "Meðalhlaup", tip: { en: "Time ÷ runs. Should fall inside the band.", is: "Tími ÷ hlaup. Á að lenda innan bandsins." } },
    { k: "dist", en: "Distance", is: "Vegalengd", tip: { en: "Total Distance (m). Needs GPS: — indoors.", is: "Total Distance (m). Þarf GPS: — innanhúss." } },
    { k: "strides", en: "Strides", is: "Skref", tip: { en: "Stride Count", is: "Stride Count" } },
    { k: "mps", en: "m/stride", is: "m/skref", tip: { en: "Distance ÷ strides. Needs GPS.", is: "Vegalengd ÷ skref. Þarf GPS." } },
  ];
  const outside = (b: LongRunBand) => b.meanBoutS != null && (b.meanBoutS < b.boundsS[0] - 1 || (b.boundsS[1] < 100 && b.meanBoutS > b.boundsS[1] + 1));
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${compact ? "text-[12px]" : "text-sm"}`}>
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
            {head.map((h) => (
              <th key={h.k} className={`${cell} font-medium ${h.left ? "text-left" : "text-right"}`} title={h.tip ? (is ? h.tip.is : h.tip.en) : undefined}>{is ? h.is : h.en}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bands.map((b) => (
            <tr key={b.band} className="border-b border-slate-100">
              <td className={`${cell} text-slate-700`} title={`IMA Free Running band ${b.band}`}>{freeRunningBandLabel(1, is ? "is" : "en", b.boundsS)}</td>
              <td className={`${cell} text-right tabular-nums`}>{fmtInt(b.bouts, is)}</td>
              <td className={`${cell} text-right tabular-nums text-slate-600`}>{fmtMinSec(b.seconds)}</td>
              <td className={`${cell} text-right tabular-nums ${outside(b) ? "text-amber-700" : "text-slate-600"}`}>{fmtS(b.meanBoutS)}</td>
              <td className={`${cell} text-right tabular-nums text-slate-600`}>{fmtInt(b.distanceM, is)}</td>
              <td className={`${cell} text-right tabular-nums text-slate-600`}>{fmtInt(b.strides, is)}</td>
              <td className={`${cell} text-right tabular-nums text-slate-600`}>{fmtStride(b.metresPerStride, is)}</td>
            </tr>
          ))}
          <tr className="font-semibold text-slate-900">
            <td className={cell}>{is ? "Öll löng hlaup (18 sek+)" : "All long runs (18 s+)"}</td>
            <td className={`${cell} text-right tabular-nums`}>{fmtInt(tot.bouts, is)}</td>
            <td className={`${cell} text-right tabular-nums`}>{fmtMinSec(tot.seconds)}</td>
            <td className={`${cell} text-right tabular-nums`}>{fmtS(tot.meanBoutS)}</td>
            <td className={`${cell} text-right tabular-nums`}>{fmtInt(tot.distanceM, is)}</td>
            <td className={`${cell} text-right tabular-nums`}>{fmtInt(tot.strides, is)}</td>
            <td className={`${cell} text-right tabular-nums`}>{fmtStride(tot.metresPerStride, is)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function LongRunsCard({ date, lang }: { date: string; lang: Lang }) {
  const [data, setData] = React.useState<TeamLongRuns | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null);
  const is = lang === "IS";

  React.useEffect(() => {
    let alive = true;
    setLoaded(false);
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/coach/team/long-runs?date=${date}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) { const json = (await res.json()) as TeamLongRuns; if (alive) setData(json); }
      } catch { /* soft */ } finally { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [date]);

  const heading = is ? "Löng hlaup" : "Long runs";
  const sub = is
    ? "Samfelld hlaup í 18 sek eða lengur, flokkuð eftir því hve lengi hvert hlaup stóð (ekki hraða). Fjöldi og tími mælast líka innanhúss; vegalengd þarf GPS."
    : "Continuous runs of 18 s or more, grouped by how long each run lasted (not speed). Runs and time read indoors too; distance needs GPS.";
  const t = data?.team;
  const withBouts = (data?.players ?? []).filter((p) => p.today.bouts != null);
  const hasBouts = withBouts.length > 0;
  const mins = (s: number | null) => (s == null ? "—" : `${Math.round(s / 60)} ${is ? "mín" : "min"}`);
  const pctTxt = (p: number | null) => (p == null ? "—" : `${p}%`);
  // Plain first line, per player (medians): today's long runs and how many at match pace, against his match.
  const pp = t?.perPlayer;
  const paceTxt = !pp || pp.mpBouts == null
    ? (is ? "hraði óþekktur (ekkert GPS)" : "pace unknown (no GPS)")
    : (is ? `${pp.mpBouts} á leikhraða` : `${pp.mpBouts} at match pace`);
  const matchTxt = !pp || pp.refBouts == null ? null
    : pp.refMpBouts == null ? (is ? `Leikur: ${pp.refBouts}.` : `Match: ${pp.refBouts}.`)
      : (is ? `Leikur: ${pp.refBouts}, ${pp.refMpBouts} á leikhraða.` : `Match: ${pp.refBouts}, ${pp.refMpBouts} at match pace.`);
  const lead = !t || !hasBouts || !pp ? null : data!.isMatchDay
    ? (is ? `Leikdagur: ${pp.bouts} löng hlaup á leikmann, ${paceTxt}.` : `Match day: ${pp.bouts} long runs per player, ${paceTxt}.`)
    : (is ? `Æfing: ${pp.bouts} löng hlaup á leikmann, ${paceTxt}.` : `Training: ${pp.bouts} long runs per player, ${paceTxt}.`) + (matchTxt ? ` ${matchTxt}` : "");
  const facts = !t || !hasBouts ? [] : [
    is
      ? "Leikhraði = 11 km/klst eða hraðar, hægasti tíundi hluti langra hlaupa liðsins í leikjum. Á æfingu eru flest löng hlaup skokk (upphitunarhringir, skokk til baka milli æfinga), svo fjöldinn einn segir lítið um hlaupaálag."
      : "Match pace = 11 km/h or faster, the slowest tenth of the team's own match long runs. In training most long runs are jogs (warm-up laps, jogging back between drills), so the count alone says little about running load.",
    t.pctBouts == null ? null : (is ? `Allur fjöldi langra hlaupa: ${t.pctBouts}% af eigin leik (miðgildi)` : `All long runs: ${t.pctBouts}% of his own match (median)`),
    is ? `Tími í löngum hlaupum: ${mins(t.seconds)} alls, ${pctTxt(t.pctSeconds)} af leik` : `Time in long runs: ${mins(t.seconds)} in total, ${pctTxt(t.pctSeconds)} of a match`,
    is ? `Meðallengd hlaups: ${t.meanBoutS == null ? "—" : Math.round(t.meanBoutS)} sek` : `Average run: ${t.meanBoutS == null ? "—" : Math.round(t.meanBoutS)} s`,
    t.strideVsMatchPct == null
      ? (is ? (t.gpsToday ? "Skreflengd: of fáar GPS-æfingar enn" : "Skreflengd: engin GPS-mæling í dag") : (t.gpsToday ? "Stride length: too few GPS sessions yet" : "Stride length: no GPS reading today"))
      : (is ? `Skreflengd á æfingum síðustu 8 vikur: ${t.strideVsMatchPct}% af leik (miðgildi)` : `Stride length in training, last 8 weeks: ${t.strideVsMatchPct}% of a match (median)`),
  ].filter((f): f is string => f != null);
  const gpsPlayers = withBouts.filter((p) => p.today.distanceM != null).length;
  const distNote = !t ? "" : !t.gpsToday
    ? (is ? "Engin GPS-mæling í dag (innanhúss): fjöldi, tími og skref sjást, vegalengd og m/skref ekki." : "No GPS reading today (indoors): runs, time and strides show, distance and m/stride don't.")
    : gpsPlayers < withBouts.length
      ? (is ? `Vegalengd og m/skref ná yfir ${gpsPlayers} af ${withBouts.length} leikmönnum (hinir án GPS).` : `Distance and m/stride cover ${gpsPlayers} of ${withBouts.length} players (the rest had no GPS).`)
      : "";
  const noReading = data?.noReading ?? [];
  const fmtD = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(d)}.${Number(m)}.`; };
  const noReadingBox = noReading.length === 0 ? null : (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
      <b>
        {noReading.map((p) => p.name).join(", ")}
        {is ? ": löng hlaup mælast ekki." : ": long runs can't be read."}
      </b>{" "}
      {noReading.every((p) => p.reason === "catapult_default")
        ? (is
          ? "Catapult flokkar hlaupin þeirra í sjálfgefnu 3 böndin (0–2,5 · 2,5–5 · 5+ sek), svo hlaup yfir 18 sek sjást ekki. Það er engin mæling, ekki 0 hlaup. Lagast þegar böndin eru leiðrétt í OpenField og æfingarnar endurunnar."
          : "Catapult sorts their runs into the default 3 bands (0–2.5 · 2.5–5 · 5+ s), so runs of 18 s or more don't show. That is no reading, not 0 runs. Fixed once the bands are corrected in OpenField and the sessions reprocessed.")
        : (is
          ? "Bandamörkin í þeim æfingum passa ekki við neina þekkta stillingu, svo lengd hlaupa verður ekki lesin. Athugaðu Free Running-stillingar þeirra í OpenField."
          : "The band edges in those sessions fit no known setting, so run lengths can't be read. Check their Free Running settings in OpenField.")}
      <div className="mt-1 text-[11px] text-amber-800/80">
        {noReading.map((p) => `${p.name}: ${p.sessions} ${is ? "æfingar" : "sessions"}, ${fmtD(p.from)}–${fmtD(p.to)}`).join(" · ")}
        {is ? " (síðustu 28 dagar)" : " (last 28 days)"}
      </div>
    </div>
  );
  const noData = is
    ? "Engin bouts-gögn fyrir þennan dag. Fjöldi og tími hlaupa koma með Free Running duration- og event-breytunum í Catapult-samstillingunni; án þeirra sést hér ekkert."
    : "No bout data for this day. Run counts and time come with the Free Running duration and event parameters in the Catapult sync; without them nothing shows here.";

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="text-xs uppercase tracking-wide text-slate-500">{heading}</div>
        <CoachTutorialButton slug="ima-free-running" label={{ en: "How to read", is: "Hvernig á að lesa" }} />
      </div>
      <div className="mb-3 text-[11px] text-slate-500">{sub}</div>

      {!loaded ? (
        <div className="py-4 text-center text-sm text-slate-500">…</div>
      ) : !hasBouts ? (
        <>
          <div className="py-3 text-sm text-slate-500">{noData}</div>
          {noReadingBox}
        </>
      ) : (
        <>
          <div className="text-[15px] font-semibold text-slate-900">{lead}</div>
          <ul className="mt-2 space-y-0.5 text-[13px] text-slate-700">
            {facts.map((f, i) => <li key={i}>· {f}</li>)}
          </ul>
          {noReadingBox}
          {data?.bandsAreTimeBands === false && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              {is
                ? "Böndin hjá þessu liði virðast ekki vera tímabönd (meðallengd hlaupa lendir utan marka). Merkingarnar „18 sek eða lengur“ eiga þá ekki við; athugaðu stillingar Free Running-banda í OpenField."
                : "This team's bands don't look like time bands (mean run length falls outside the bounds). The \"18 s or more\" labels then don't apply; check the Free Running band settings in OpenField."}
            </div>
          )}

          <div className="mt-4">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">{is ? "Liðið, eftir lengd hlaupa" : "The squad, by run length"}</div>
            {t && <LongRunBandTable bands={t.bands} lang={lang} />}
            {distNote && <div className="mt-1 text-[11px] text-slate-500">{distNote}</div>}
          </div>

          <ShowDetails
            label={{ EN: "Show players", IS: "Sýna leikmenn" }}
            hint={{ EN: `${withBouts.length} players`, IS: `${withBouts.length} leikmenn` }}
            className="mt-3 border-0 bg-transparent p-0"
          >
            <div className="mb-2 text-[11px] text-slate-500">
              {is
                ? "Smelltu á leikmann til að sjá böndin hans. Viðmið = miðgildi eigin næstum-heilla leikja (≥80 mín; liðsins ef þeir eru færri en 3). Skref/leik = skreflengd í löngum hlaupum á GPS-æfingum síðustu 8 vikna sem hlutfall af eigin leik; þarf 50+ skref. Á leikhraða = löng hlaup á 11 km/klst eða hraðar (þarf GPS), og % af sama fjölda í hans leik. Lýsandi, aldrei readiness-liturinn. Heimild: Catapult (nóv. 2026): Free Running-bönd eru lengd hvers hlaups í sekúndum, ekki hraði."
                : "Click a player to see his bands. Reference = median of the player's own near-full matches (≥80 min; the team's when fewer than 3). Stride vs match = stride length in long runs on GPS training days of the last 8 weeks as a share of his own match; needs 50+ strides. At match pace = long runs at 11 km/h or faster (needs GPS), and % of the same count in his match. Descriptive, never the readiness colour. Source: Catapult (Nov 2026): Free Running bands are the length of each run in seconds, not speed."}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-1.5 text-left font-medium">{is ? "Leikmaður" : "Player"}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{is ? "Löng hlaup" : "Long runs"}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{is ? "% af leik" : "% of match"}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{is ? "Tími" : "Time"}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{is ? "Meðalhlaup" : "Avg run"}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{is ? "Vegalengd" : "Distance"}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{is ? "Skref" : "Strides"}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{is ? "m/skref" : "m/stride"}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{is ? "Skref/leik" : "Stride vs match"}</th>
                    <th className="px-2 py-1.5 text-right font-medium" title={is ? "Löng hlaup á 11 km/klst eða hraðar (þarf GPS)" : "Long runs at 11 km/h or faster (needs GPS)"}>{is ? "Á leikhraða" : "At match pace"}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{is ? "% af leik" : "% of match"}</th>
                  </tr>
                </thead>
                <tbody>
                  {withBouts.map((p) => {
                    const isOpen = open === p.playerId;
                    return (
                      <React.Fragment key={p.playerId}>
                        <tr
                          className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                          onClick={() => setOpen(isOpen ? null : p.playerId)}
                          aria-expanded={isOpen}
                        >
                          <td className="px-2 py-1.5 font-medium text-slate-800"><span className="mr-1 text-slate-400">{isOpen ? "▾" : "▸"}</span>{p.name}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{p.today.bouts}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600" title={p.ref.source ? `${p.ref.source === "own" ? (is ? "eigin leikir" : "own matches") : (is ? "liðsviðmið" : "team reference")} · n=${p.ref.nMatches}` : undefined}>{pctTxt(p.pctBouts)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmtMinSec(p.today.seconds)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmtS(p.today.meanBoutS)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmtInt(p.today.distanceM, is)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmtInt(p.today.strides, is)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmtStride(p.today.metresPerStride, is)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600" title={p.strideTrainM != null && p.strideMatchM != null ? `${p.strideTrainM.toFixed(2)} m ${is ? "á æfingum" : "in training"} · ${p.strideMatchM.toFixed(2)} m ${is ? "í leik" : "in matches"} · ${p.strideTrainDays} ${is ? "æfingar" : "sessions"}` : undefined}>{pctTxt(p.strideVsMatchPct)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums" title={p.today.matchPace == null ? (is ? "Hraði óþekktur (ekkert GPS)" : "Pace unknown (no GPS)") : undefined}>{p.today.matchPace == null ? "—" : p.today.matchPace.bouts}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600" title={p.ref.mpBouts != null ? `${is ? "Leikur" : "Match"}: ${p.ref.mpBouts}` : undefined}>{pctTxt(p.pctMpBouts)}</td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b border-slate-100 bg-slate-50/60">
                            <td colSpan={11} className="px-3 py-2">
                              <LongRunBandTable bands={p.bands} lang={lang} compact />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ShowDetails>
        </>
      )}
    </div>
  );
}

// ── Stride-length verdict (per player) ────────────────────────────────────
// "Is he still pushing, or just turning his legs over?" The session-classified
// stride-length engine, per player for the selected day. Same verdict the
// player recap / game report / decel-intelligence show — one shared loader.
// Only a match or big session earns a verdict; light days are unmeasurable and
// omitted (the engine refuses to guess, and says so rather than showing green).

type TeamStride = StrideResult & { playerId: string; fullName: string | null; minutesKnown: boolean };

function ImaStrideVerdictCard({ date, lang }: { date: string; lang: Lang }) {
  const [rows, setRows] = React.useState<TeamStride[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [open, setOpen] = React.useState<Set<string>>(() => new Set());
  const isIS = lang === "IS";

  React.useEffect(() => {
    let alive = true;
    setLoaded(false);
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/coach/stride-length?date=${date}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (alive) setRows((json.players ?? []) as TeamStride[]);
        }
      } catch { /* soft */ } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [date]);

  const heading = lang === "IS" ? "Skreflengd — er hann enn að ýta?" : "Stride length — is he still pushing?";
  const sub = lang === "IS"
    ? "Metrar á skref í löngum samfelldum hlaupum (18 sek+), borið saman við hans eigin leiki/stórar æfingar"
    : "Metres per stride in his long continuous runs (18 s or more), vs his own matches/big sessions";

  // Drop the one risky combination: a "match" verdict inferred from distance
  // alone (no coach-entered minutes) — a hard training day would be mis-compared
  // to his match norm and mis-flagged. Big-session verdicts are like-with-like
  // and need a ~21% drop to fire, so the fallback is safe there.
  const measured = rows.filter(
    (r) => r.verdict !== "unmeasurable" && !(r.kind === "match" && !r.minutesKnown),
  );
  const shortened = measured.filter((r) => r.verdict === "shortened");
  // Indoor / no-GPS session: he ran (strides present) but there's no distance,
  // so stride length — which is GPS-derived — can't be measured. Explain it
  // rather than vanishing (matters for indoor-heavy teams like HK).
  const indoorOnly = rows.some((r) => r.unmeasurableReason === "no_distance");

  // Hide only when there's genuinely nothing to say — not on an indoor day,
  // where we owe the coach the "outdoor-only" explanation.
  if (loaded && measured.length === 0 && !indoorOnly) return null;

  const kindWord = (k: StrideResult["kind"], plural = true) =>
    isIS
      ? k === "match" ? (plural ? "leikir" : "leik") : (plural ? "stórar æfingar" : "stórri æfingu")
      : k === "match" ? (plural ? "matches" : "match") : (plural ? "big sessions" : "big session");

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="text-xs uppercase tracking-wide text-slate-500">{heading}</div>
        <CoachTutorialButton slug="stride-length" label={{ en: "How to read", is: "Hvernig á að lesa" }} />
      </div>
      <div className="mb-2 text-[11px] text-slate-500">{sub}</div>
      {/* Why the metric exists (plain language, no click) — the explainability
          foundation: what "what" this "why" is answering. */}
      <div className="mb-3 max-w-3xl text-[12px] leading-relaxed text-slate-600">
        {isIS
          ? "Undir þreytu styttist skreflengd þótt leikmaðurinn haldi áfram að hlaupa — hann ýtir minna í hverju skrefi. Heildarvegalengd ein sér sýnir það ekki; metrar á skref í lengri hlaupum hans gera það."
          : "Under fatigue stride length tends to shorten even while a player keeps running — he pushes less with each stride. Total distance alone doesn't show it; metres per stride in his longer runs does."}
      </div>

      {indoorOnly && measured.length === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          <span aria-hidden>🏟️</span>
          <span>
            {isIS
              ? "Innanhúss-æfing — skreflengd mælist ekki. Hún byggir á GPS-hlaupavegalengd (Catapult IMA Free Running) sem virkar aðeins utandyra; innandyra koma skref og skreftíðni en engin vegalengd. Skreflengdar-dómar birtast á útiæfingum og leikjum."
              : "Indoor session — stride length isn't measurable. It's built on GPS running distance (Catapult IMA Free Running), which only works outdoors; indoors you get strides and cadence but no distance. Stride-length verdicts appear on outdoor sessions and matches."}
          </span>
        </div>
      )}

      {shortened.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
          <span>⚠</span>
          <span><b>
            {isIS
              ? `${shortened.length} ${shortened.length === 1 ? "leikmaður" : "leikmenn"} með styttri skref en venjulega í löngum hlaupum — ýtir minna í hverju skrefi.`
              : `${shortened.length} player${shortened.length === 1 ? "" : "s"} striding shorter than usual in long runs — pushing less with each stride.`}
          </b></span>
        </div>
      )}

      {!loaded ? (
        <div className="py-4 text-center text-sm text-slate-500">…</div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {measured.map((r) => {
            const b = strideVerdictBadge(r, isIS ? "IS" : "EN");
            const isOpen = open.has(r.playerId);
            // Flag boundaries in absolute stride length (2.5 SD × the kind's CV).
            const thrPct = FLAG_SD * CV_BY_KIND[r.kind];
            const lowBound = r.normM != null ? Math.round(r.normM * (1 - thrPct / 100) * 100) / 100 : null;
            const highBound = r.normM != null ? Math.round(r.normM * (1 + thrPct / 100) * 100) / 100 : null;
            return (
              <div key={r.playerId} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                {/* Layer 0 — verdict */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: b.dot }} />
                  <span className="text-sm font-semibold text-slate-800">{r.fullName ?? "—"}</span>
                  <span className="text-sm font-semibold text-slate-900">· {b.label}</span>
                  {r.strideLengthM != null && r.normM != null && (
                    <span className="text-[12px] tabular-nums text-slate-500">
                      {r.strideLengthM} m {isIS ? "á móti" : "vs"} {r.normM} m
                    </span>
                  )}
                  {r.provisional && (
                    <span
                      className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-600"
                      title={isIS
                        ? "Öryggi vex með fjölda hans eigin leikja/æfinga. Undir 8 er normið enn að hluta úr hópnum."
                        : "Confidence grows with his own matches/sessions. Under 8, the norm is still part squad."}
                    >
                      {isIS ? `lítið öryggi · ${r.historyN}` : `low conf · ${r.historyN}`}
                    </span>
                  )}
                </div>
                {/* Layer 1 — plain why (+ counterfactual for a flagged/shortened read) */}
                <div className="mt-0.5 pl-4 text-[12px] leading-snug text-slate-600">{isIS ? r.reasonIs : r.reason}</div>
                {r.verdict === "shortened" && lowBound != null && (
                  <div className="mt-0.5 pl-4 text-[12px] font-medium leading-snug text-slate-700">
                    {isIS
                      ? `Til að teljast eðlilegt hefði skreflengd hans þurft að vera ≥ ${lowBound} m.`
                      : `It would read normal again at a stride length of ≥ ${lowBound} m.`}
                  </div>
                )}

                {/* Layer 2 — behind "Details": threshold, confidence, citation */}
                <button
                  type="button"
                  onClick={() => setOpen((prev) => {
                    const next = new Set(prev);
                    if (next.has(r.playerId)) next.delete(r.playerId); else next.add(r.playerId);
                    return next;
                  })}
                  className="mt-1 pl-4 text-[11px] font-semibold text-slate-400 hover:text-slate-600"
                >
                  {isOpen ? (isIS ? "Fela smáatriði ▲" : "Hide details ▲") : (isIS ? "Nánar ▼" : "Details ▼")}
                </button>
                {isOpen && (
                  <div className="mt-1 space-y-1 border-t border-slate-200/70 pl-4 pt-1.5 text-[11px] leading-snug text-slate-500">
                    <div>
                      {isIS ? "Aðferð: " : "Method: "}
                      {isIS
                        ? "vegalengd ÷ skref í löngum samfelldum hlaupum (hlaup 18 sek+ í IMA Free Running; flokkað eftir lengd hlaups, ekki hraða)."
                        : "distance ÷ strides in long continuous runs (IMA Free Running runs of 18 s+; grouped by run length, not speed)."}
                    </div>
                    {r.normM != null && lowBound != null && highBound != null && (
                      <div>
                        {isIS
                          ? `Flaggað við 2,5 staðalfrávik (±${Math.round(thrPct * 10) / 10}% frá norminu ${r.normM} m fyrir ${kindWord(r.kind)}): stutt < ${lowBound} m, langt > ${highBound} m.`
                          : `Flagged at 2.5 SD (±${Math.round(thrPct * 10) / 10}% from the ${r.normM} m norm for his ${kindWord(r.kind)}): short < ${lowBound} m, long > ${highBound} m.`}
                      </div>
                    )}
                    <div>
                      {isIS ? "Áreiðanleiki: " : "Confidence: "}
                      {r.historyN === 0
                        ? (isIS ? "engir eigin leikir enn — þetta er norm hópsins, ekki hans." : "no matches of his own yet — this is the squad norm, not his.")
                        : r.provisional
                          ? (isIS ? `byggt á ${r.historyN} af hans eigin ${kindWord(r.kind)}; normið er enn að hluta úr hópnum þar til hann nær 8.` : `based on ${r.historyN} of his own ${kindWord(r.kind)}; the norm is still part-squad until he reaches 8.`)
                          : (isIS ? `byggt á ${r.historyN} af hans eigin ${kindWord(r.kind)} — fullþroskað norm.` : `based on ${r.historyN} of his own ${kindWord(r.kind)} — a mature norm.`)}
                    </div>
                    <div>
                      {isIS
                        ? "Heimild: Catapult IMA Free Running (GPS-vegalengd) — mælist aðeins utandyra; innanhúss birtist enginn dómur."
                        : "Source: Catapult IMA Free Running (GPS distance) — measured outdoors only; no verdict indoors."}
                    </div>
                    <div className="text-slate-400">McBurnie 2022; Girard, Micallef &amp; Millet 2011; Morin o.fl. 2011.</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Session Profile Card ──────────────────────────────────────────────────

function SessionProfileCard({ profile, lang }: { profile: ImaSessionProfile; lang: Lang }) {
  const colours = SESSION_COLOURS[profile.session_type];
  const isEmpty = profile.session_type === "no_data";

  return (
    <div className={`mb-6 rounded-xl border-2 ${colours.border} ${colours.bg} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">{t("sessionShape", lang)}</div>
          <div className={`mt-1 text-xl font-bold ${colours.text}`}>{profile.session_headline}</div>
          <div className="mt-1 text-xs text-slate-500">
            {profile.player_count} {t("playersCaptured", lang).toLowerCase()}
          </div>
        </div>
        <span className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-bold ${colours.chip}`}>
          {profile.session_type.replace("_", " ").toUpperCase()}
        </span>
      </div>

      {isEmpty ? (
        <p className="mt-4 text-sm text-slate-600">{t("noData", lang)}</p>
      ) : (
        <>
          {/* KPI strip */}
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label={t("totalStrides", lang)} value={profile.team_total_strides.toLocaleString()} />
            <Kpi label={t("sprintStrides", lang)} value={`${profile.team_sprint_strides.toLocaleString()} (${profile.pct_sprint.toFixed(0)}%)`} />
            <Kpi
              label={t("codBalance", lang)}
              value={profile.team_cod_asymmetry_pct != null
                ? `${profile.team_cod_high_left} L / ${profile.team_cod_high_right} R (${profile.team_cod_asymmetry_pct.toFixed(0)}% asym)`
                : `${profile.team_cod_high_left} L / ${profile.team_cod_high_right} R`}
            />
            <Kpi
              label={t("codFlagged", lang)}
              value={`${profile.players_high_cod_flagged} / ${profile.player_count}`}
            />
          </div>

          {/* CoD Profile — L/R per intensity tier (Bishop 2020) */}
          <CodProfile profile={profile} lang={lang} />

          {/* Band distribution stripe */}
          <div className="mt-5">
            <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">{t("bandDistribution", lang)}</div>
            <div className="flex h-6 w-full overflow-hidden rounded-md border border-slate-300 bg-white">
              {profile.pct_low > 0 && (
                <div className="bg-blue-400 flex items-center justify-center text-[10px] font-semibold text-white" style={{ width: `${profile.pct_low}%` }} title={t("lowBand", lang)}>
                  {profile.pct_low >= 8 ? `${profile.pct_low.toFixed(0)}%` : ""}
                </div>
              )}
              {profile.pct_mid > 0 && (
                <div className="bg-amber-400 flex items-center justify-center text-[10px] font-semibold text-white" style={{ width: `${profile.pct_mid}%` }} title={t("midBand", lang)}>
                  {profile.pct_mid >= 8 ? `${profile.pct_mid.toFixed(0)}%` : ""}
                </div>
              )}
              {profile.pct_high > 0 && (
                <div className="bg-rose-500 flex items-center justify-center text-[10px] font-semibold text-white" style={{ width: `${profile.pct_high}%` }} title={t("highBand", lang)}>
                  {profile.pct_high >= 8 ? `${profile.pct_high.toFixed(0)}%` : ""}
                </div>
              )}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-slate-500">
              <span className="text-blue-600">■ {t("lowBand", lang)}</span>
              <span className="text-amber-600">■ {t("midBand", lang)}</span>
              <span className="text-rose-600">■ {t("highBand", lang)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// CoD Profile — three rows (low/medium/high) of L/R bars with asymmetry %.
// Bishop 2020: high-tier asymmetry > 15% is the strongest single predictor of
// non-contact lower-limb injury. Low/medium asymmetry is more positional
// habit and less actionable, so we colour only the high tier aggressively.
function CodProfile({ profile, lang }: { profile: ImaSessionProfile; lang: Lang }) {
  const tiers: Array<{
    label: string; left: number; right: number; asym: number | null; emphasize: boolean;
  }> = [
    { label: t("tierLow", lang),    left: profile.team_cod_low_left,    right: profile.team_cod_low_right,    asym: profile.team_cod_asymmetry_low_pct,    emphasize: false },
    { label: t("tierMedium", lang), left: profile.team_cod_medium_left, right: profile.team_cod_medium_right, asym: profile.team_cod_asymmetry_medium_pct, emphasize: false },
    { label: t("tierHigh", lang),   left: profile.team_cod_high_left,   right: profile.team_cod_high_right,   asym: profile.team_cod_asymmetry_pct,        emphasize: true  },
  ];

  // Find the max L+R total across tiers for relative bar scaling
  const maxTotal = Math.max(
    profile.team_cod_low_left + profile.team_cod_low_right,
    profile.team_cod_medium_left + profile.team_cod_medium_right,
    profile.team_cod_high_left + profile.team_cod_high_right,
    1,
  );

  return (
    <div className="mt-5">
      <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">{t("codProfile", lang)}</div>
      <div className="space-y-2 rounded-md bg-white/70 px-3 py-3">
        {tiers.map(tier => {
          const total = tier.left + tier.right;
          const widthPct = (total / maxTotal) * 100;
          const leftPct = total > 0 ? (tier.left / total) * 100 : 50;
          const asymColor =
            tier.asym == null ? "text-slate-400" :
            tier.emphasize && tier.asym > 15 ? "text-rose-700 font-bold" :
            tier.emphasize && tier.asym > 10 ? "text-amber-700 font-semibold" :
            "text-slate-600";
          return (
            <div key={tier.label} className="flex items-center gap-3">
              <div className="w-32 shrink-0 text-xs text-slate-700">{tier.label}</div>
              <div className="flex-1">
                <div className="relative h-4 rounded-full bg-slate-200" style={{ width: `${widthPct}%`, minWidth: total > 0 ? "20px" : "0" }}>
                  {total > 0 && (
                    <>
                      <div
                        className="absolute inset-y-0 left-0 rounded-l-full bg-blue-500"
                        style={{ width: `${leftPct}%` }}
                        title={`L: ${tier.left}`}
                      />
                      <div
                        className="absolute inset-y-0 right-0 rounded-r-full bg-purple-500"
                        style={{ width: `${100 - leftPct}%` }}
                        title={`R: ${tier.right}`}
                      />
                    </>
                  )}
                </div>
              </div>
              <div className="w-44 shrink-0 text-right text-xs tabular-nums text-slate-600">
                {tier.left} L / {tier.right} R
                {tier.asym != null && (
                  <span className={`ml-2 ${asymColor}`}>· {tier.asym.toFixed(0)}% asym</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/70 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}

// ── Per-Player Table ──────────────────────────────────────────────────────

type SortKey = "name" | "total" | "sprint" | "vs_baseline" | "cod_asym";

function PerPlayerTable({ profile, lang }: { profile: ImaSessionProfile; lang: Lang }) {
  const [sortKey, setSortKey] = React.useState<SortKey>("sprint");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const toggleExpand = (playerId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const players = React.useMemo(() => {
    const arr = [...profile.per_player];
    arr.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "name": diff = a.full_name.localeCompare(b.full_name); break;
        case "total": diff = a.total_strides - b.total_strides; break;
        case "sprint": diff = a.sprint_strides - b.sprint_strides; break;
        case "vs_baseline":
          diff = (a.sprint_vs_baseline_pct ?? -1) - (b.sprint_vs_baseline_pct ?? -1);
          break;
        case "cod_asym":
          diff = (a.cod_asymmetry_pct ?? -1) - (b.cod_asymmetry_pct ?? -1);
          break;
      }
      return sortDir === "asc" ? diff : -diff;
    });
    return arr;
  }, [profile.per_player, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  return (
    <ShowDetails label={I18N.perPlayer} className="mb-6 mt-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="w-8 px-2 py-2"></th>
              <Th onClick={() => onSort("name")} active={sortKey === "name"} dir={sortDir}>{t("colPlayer", lang)}</Th>
              <Th onClick={() => onSort("total")} active={sortKey === "total"} dir={sortDir} align="right">{t("colTotal", lang)}</Th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">{t("colLow", lang)}</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">{t("colMid", lang)}</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">{t("colHigh", lang)}</th>
              <Th onClick={() => onSort("sprint")} active={sortKey === "sprint"} dir={sortDir} align="right">{t("colSprint", lang)}</Th>
              <Th onClick={() => onSort("vs_baseline")} active={sortKey === "vs_baseline"} dir={sortDir} align="right">{t("colSprintVsBaseline", lang)}</Th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">{t("colCod", lang)}</th>
              <Th onClick={() => onSort("cod_asym")} active={sortKey === "cod_asym"} dir={sortDir} align="right">{t("colCodAsym", lang)}</Th>
            </tr>
          </thead>
          <tbody>
            {players.map(p => (
              <PlayerRow
                key={p.player_id}
                player={p}
                isExpanded={expanded.has(p.player_id)}
                onToggle={() => toggleExpand(p.player_id)}
                lang={lang}
              />
            ))}
          </tbody>
        </table>
      </div>
    </ShowDetails>
  );
}

function Th({ children, onClick, active, dir, align }: {
  children: React.ReactNode; onClick: () => void; active: boolean; dir: "asc" | "desc"; align?: "left" | "right";
}) {
  return (
    <th
      onClick={onClick}
      className={`cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}{active ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );
}

function PlayerRow({
  player, isExpanded, onToggle, lang,
}: {
  player: ImaPlayerDay; isExpanded: boolean; onToggle: () => void; lang: Lang;
}) {
  const hasData = player.total_strides > 0;
  const baselinePct = player.sprint_vs_baseline_pct;
  const baselineColor =
    baselinePct == null ? "text-slate-400" :
    baselinePct >= 150 ? "text-rose-600 font-semibold" :
    baselinePct >= 130 ? "text-amber-600 font-semibold" :
    baselinePct < 70 ? "text-blue-600" :
    "text-slate-700";

  const codAsym = player.cod_asymmetry_pct;
  const codColor =
    codAsym == null ? "text-slate-400" :
    codAsym > 15 ? "text-rose-600 font-bold" :
    codAsym > 10 ? "text-amber-600 font-semibold" :
    "text-emerald-700";

  // Low-confidence baseline (only 1 training day in the 14-day window).
  // Common during the Catapult Free Running rollout — pre-fix training
  // days had IMA = 0 so most weeks only have 1-2 qualifying days right now.
  const lowConfidenceBaseline = player.sprint_baseline_days === 1;

  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50">
        <td className="px-2 py-2 text-center">
          <button
            onClick={onToggle}
            disabled={!hasData}
            aria-label={isExpanded ? t("collapse", lang) : t("expand", lang)}
            title={isExpanded ? t("collapse", lang) : t("expand", lang)}
            className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs text-slate-500 transition-transform ${
              hasData ? "hover:bg-slate-200 hover:text-slate-900" : "opacity-30 cursor-not-allowed"
            } ${isExpanded ? "rotate-90" : ""}`}
          >
            ▸
          </button>
        </td>
        <td className="px-3 py-2">
          <Link href={`/coach/decel-intelligence?player=${player.player_id}`} className="font-medium text-slate-900 hover:text-blue-600">
            {player.full_name}
          </Link>
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{hasData ? player.total_strides.toLocaleString() : "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{hasData ? player.low_strides.toLocaleString() : "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{hasData ? player.mid_strides.toLocaleString() : "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{hasData ? player.high_strides.toLocaleString() : "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">{hasData ? player.sprint_strides.toLocaleString() : "—"}</td>
        <td
          className={`px-3 py-2 text-right tabular-nums ${baselineColor} ${lowConfidenceBaseline ? "italic" : ""}`}
          title={lowConfidenceBaseline ? "Low confidence — based on only 1 training day (others pre-Catapult fix)" : undefined}
        >
          {baselinePct == null
            ? "—"
            : lowConfidenceBaseline
              ? `${baselinePct.toFixed(0)}%*`
              : `${baselinePct.toFixed(0)}%`}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-500">
          {hasData ? `${player.cod_left_high} / ${player.cod_right_high}` : "—"}
        </td>
        <td className={`px-3 py-2 text-right tabular-nums ${codColor}`}>
          {codAsym == null ? "—" : `${codAsym.toFixed(0)}%`}
        </td>
      </tr>
      {isExpanded && hasData && (
        <tr className="border-b border-slate-200 bg-slate-50/50">
          <td colSpan={10} className="px-4 py-3">
            <PlayerCodBreakdown player={player} lang={lang} />
          </td>
        </tr>
      )}
    </>
  );
}

// Per-player 3-tier CoD breakdown. Mirrors the team-level CoD profile but
// scoped to this player's day. Bishop 2020: only flag high-tier asymmetry
// aggressively (low/medium are often positional habit and less actionable).
function PlayerCodBreakdown({ player, lang }: { player: ImaPlayerDay; lang: Lang }) {
  const tiers: Array<{
    label: string; left: number; right: number; asym: number | null; emphasize: boolean;
  }> = [
    { label: t("tierLow", lang),    left: player.cod_left_low,    right: player.cod_right_low,    asym: player.cod_asymmetry_low_pct,    emphasize: false },
    { label: t("tierMedium", lang), left: player.cod_left_medium, right: player.cod_right_medium, asym: player.cod_asymmetry_medium_pct, emphasize: false },
    { label: t("tierHigh", lang),   left: player.cod_left_high,   right: player.cod_right_high,   asym: player.cod_asymmetry_pct,        emphasize: true  },
  ];

  const maxTotal = Math.max(
    player.cod_left_low + player.cod_right_low,
    player.cod_left_medium + player.cod_right_medium,
    player.cod_left_high + player.cod_right_high,
    1,
  );

  return (
    <div className="ml-8">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {t("codBreakdownLabel", lang)}
      </div>
      <div className="space-y-1.5">
        {tiers.map(tier => {
          const total = tier.left + tier.right;
          const widthPct = (total / maxTotal) * 100;
          const leftPct = total > 0 ? (tier.left / total) * 100 : 50;
          const asymColor =
            tier.asym == null ? "text-slate-400" :
            tier.emphasize && tier.asym > 15 ? "text-rose-700 font-bold" :
            tier.emphasize && tier.asym > 10 ? "text-amber-700 font-semibold" :
            "text-slate-600";
          return (
            <div key={tier.label} className="flex items-center gap-3 text-xs">
              <div className="w-32 shrink-0 text-slate-700">{tier.label}</div>
              <div className="flex-1">
                <div
                  className="relative h-3 rounded-full bg-slate-200"
                  style={{ width: total > 0 ? `${widthPct}%` : "0%", minWidth: total > 0 ? "20px" : "0" }}
                >
                  {total > 0 && (
                    <>
                      <div
                        className="absolute inset-y-0 left-0 rounded-l-full bg-blue-500"
                        style={{ width: `${leftPct}%` }}
                        title={`L: ${tier.left}`}
                      />
                      <div
                        className="absolute inset-y-0 right-0 rounded-r-full bg-purple-500"
                        style={{ width: `${100 - leftPct}%` }}
                        title={`R: ${tier.right}`}
                      />
                    </>
                  )}
                </div>
              </div>
              <div className="w-40 shrink-0 text-right tabular-nums text-slate-600">
                {tier.left} L / {tier.right} R
                {tier.asym != null && (
                  <span className={`ml-2 ${asymColor}`}>· {tier.asym.toFixed(0)}%</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────

function LegendCard({ lang }: { lang: Lang }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">{t("howToRead", lang)}</h2>
      <ul className="space-y-2 text-sm text-slate-700">
        <li>• {t("legend1", lang)}</li>
        <li>• {t("legend2", lang)}</li>
        <li>• {t("legend3", lang)}</li>
        <li>• {t("legend4", lang)}</li>
      </ul>
    </div>
  );
}

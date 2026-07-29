"use client";

/**
 * Coach view — IMA Intelligence (Day Profile).
 *
 * Where Decel Intelligence answers "is this player chronically at risk?"
 * and Load Intelligence answers "did the team train hard enough?", this
 * page fills a missing gap: "what did today's session actually deliver,
 * biomechanically?"
 *
 * Built on Catapult IMA Free Running 8-band stride distribution. Powered
 * by the deterministic loader in lib/micropulse/imaDayProfile/. The page
 * is a session-review surface — coach opens it after training to see
 * whether the planned cadence profile matched the captured profile.
 *
 * Sport-science citations:
 *   - McBurnie 2022: IMA stride distribution forecasts hamstring/quad
 *     injuries better than GPS velocity bands alone.
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
import CoachTutorialButton from "@/components/coach/tutorials/CoachTutorialButton";
import type { ImaSessionProfile, ImaPlayerDay, SessionType } from "@/lib/micropulse/imaDayProfile";
import { strideVerdictBadge } from "@/lib/micropulse/strideLength/verdictBadge";
import { CV_BY_KIND, FLAG_SD, type StrideResult } from "@/lib/micropulse/strideLength";

const I18N = {
  pageTitle: { EN: "IMA Intelligence", IS: "IMA Intelligence" },
  citation: { EN: "McBurnie 2022 · Bishop 2020 · Buchheit 2014", IS: "McBurnie 2022 · Bishop 2020 · Buchheit 2014" },
  subtitle: {
    EN: "Biomechanical view of a training day. 8-band stride distribution, sprint-strides vs personal baseline, and L/R asymmetry on high-intensity CoD.",
    IS: "Lífaflfræðileg sýn á æfingadag. 8-banda stride dreifing, sprint-skref miðað við persónulega grunnlínu, og L/H ósamhverfa á háa intensity CoD.",
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
  sprintStrides: { EN: "Sprint-strides (b5-8)", IS: "Sprett-strides (b5-8)" },
  codBalance: { EN: "L/R CoD balance (high)", IS: "L/H CoD jafnvægi (há)" },
  codFlagged: { EN: "High-CoD asym. flagged", IS: "Há-CoD ósamh. flögg" },
  playersCaptured: { EN: "Players captured", IS: "Leikmenn með gögn" },
  codProfile: { EN: "Change-of-Direction profile (team)", IS: "Stefnubreyting-mynstur (lið)" },
  tierLow: { EN: "Low", IS: "Lág" },
  tierMedium: { EN: "Medium", IS: "Mið" },
  tierHigh: { EN: "High (injury-relevant)", IS: "Há (meiðsla-tengd)" },
  bandDistribution: { EN: "Band distribution (team)", IS: "Band-dreifing (lið)" },
  lowBand: { EN: "Low (b1-3)", IS: "Lág (b1-3)" },
  midBand: { EN: "Mid (b4-6)", IS: "Mið (b4-6)" },
  highBand: { EN: "High (b7-8)", IS: "Há (b7-8)" },
  perPlayer: { EN: "Per-player breakdown", IS: "Sundurliðun per leikmann" },
  colPlayer: { EN: "Player", IS: "Leikmaður" },
  colTotal: { EN: "Total", IS: "Heild" },
  colLow: { EN: "b1-3", IS: "b1-3" },
  colMid: { EN: "b4-6", IS: "b4-6" },
  colHigh: { EN: "b7-8", IS: "b7-8" },
  colSprint: { EN: "Sprint (b5-8)", IS: "Sprint (b5-8)" },
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
    EN: "IMA Free Running buckets each stride into 8 bands by IMU-derived velocity (0-8/8-12/.../27+ km/h). MicroPulse groups them as Low (1-3, walking → medium running), Mid (4-6, fast running → HSR), High (7-8, sprint and max sprint). Bands 5-8 together are the Sprint Exposure unit.",
    IS: "IMA Free Running setur hvert skref í 8 bönd eftir IMU-mældu hraða (0-8/8-12/.../27+ km/klst). MicroPulse flokkar þau sem Lág (1-3, gangur → meðalhlaup), Mið (4-6, hröð hlaup → HSR), Há (7-8, sprint og max sprint). Bönd 5-8 saman eru Sprint Exposure einingin.",
  },
  legend2: {
    EN: "vs baseline compares today's bands 5-8 sum to the player's 14-day training-only average (matches excluded). 100% = typical day. < 70% = light. > 150% = heavy day, monitor recovery.",
    IS: "vs grunnlína ber bönd 5-8 dagsins saman við 14-daga æfinga-grunnlínu (leikir undanskildir). 100% = típískur dagur. < 70% = léttur. > 150% = þungur dagur, fylgjast með endurheimt.",
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
  high_cadence: { bg: "bg-rose-50",    border: "border-rose-300",    text: "text-rose-900",    chip: "bg-rose-600 text-white" },
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
// 14-day training-only baseline of high-cadence "sprint" strides).
type ImaVerdict = {
  tone: "good" | "watch" | "concern" | "neutral";
  sentence: { EN: string; IS: string };
  subtitle: { EN: string; IS: string };
  confidence: { level: "high" | "moderate" | "low"; note: { EN: string; IS: string } };
  drivers: VerdictDriver[];
};

const SUBTITLE_IMA = {
  EN: "IMA = inertial movement — accel/decel and change-of-direction efforts measured by the pod, works indoors. This compares today's high-effort running to each player's own usual day.",
  IS: "IMA = hröðunar-hreyfing — hröðun/hemlun og stefnubreytingar mældar af pod, virkar innandyra. Þetta ber hástreitu-hlaup dagsins saman við venjulegan dag hvers leikmanns.",
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

  // Driver tooltips carry the jargon + paper citation (Hulin 2014 / Gabbett 2017
  // ACWR; Buchheit 2014 individual baselines).
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
        EN: `High-cadence (sprint, bands 5-8) running ${Math.round(
          p.sprint_vs_baseline_pct ?? 0,
        )}% of his 14-day training-only baseline — an acute:chronic spike. Spread sprint exposure across the week (Hulin 2014; Gabbett 2017; per-player norms Buchheit 2014).`,
        IS: `Háákefðar (sprint, bönd 5-8) hlaup ${Math.round(
          p.sprint_vs_baseline_pct ?? 0,
        )}% af 14-daga æfinga-grunnlínu — bráð:langvinn spike. Dreifðu sprett-álagi yfir vikuna (Hulin 2014; Gabbett 2017; persónulegar norm Buchheit 2014).`,
      },
    }));

  if (spikes.length === 0) {
    return {
      tone: "good",
      sentence: {
        EN: "Every player's high-effort running today was within their own normal range.",
        IS: "Hástreitu-hlaup allra leikmanna í dag var innan þeirra eigin venju.",
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
      EN: `${spikes.length} player${spikes.length === 1 ? "" : "s"} ran well above their own usual today — ${names}; everyone else was within range.`,
      IS: `${spikes.length} leikm${spikes.length === 1 ? "aður" : "enn"} hlupu langt yfir sína venju í dag — ${names}; aðrir voru innan marka.`,
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
  // can mount alongside the day profile.
  const [teamId, setTeamId] = React.useState<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: authRes } = await sb.auth.getUser();
        const uid = authRes?.user?.id;
        if (!uid) return;
        const { data: prof } = await sb.from("profiles").select("team_id").eq("id", uid).maybeSingle();
        if (alive) setTeamId((prof as { team_id?: string } | null)?.team_id ?? null);
      } catch { /* best-effort — the day profile still renders without it */ }
    })();
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    let alive = true;
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
  }, [date, lang]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <LiteTierBanner
        feature="IMA Intelligence"
        reasonIs="IMA Intelligence þarf ekta IMA-gögn úr Catapult (hröðun/hemlun, stefnubreytingar, stökk, Free Running bönd) — þessi gögn eru ekki tiltæk á núverandi Catapult-pakkanum ykkar."
        reasonEn="IMA Intelligence needs genuine IMA data from Catapult (accel/decel, change-of-direction, jumps, Free Running bands) — those aren't included in your current Catapult plan."
      />
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/coach" className="text-sm text-slate-500 hover:text-slate-700">
            {t("backToDashboard", lang)}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{t("pageTitle", lang)}</h1>
          <PagePurpose
            en="see change-of-direction and movement load per player"
            is="sjá stefnubreytinga- og hreyfiálag per leikmann"
            tutorial="ima-intelligence"
          />
          <p className="text-xs text-slate-500">{t("citation", lang)}</p>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">{t("subtitle", lang)}</p>
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
          day profile below. Renders independently of today's session. */}
      {teamId && (
        <div className="mb-6">
          <div className="mb-2 flex justify-end">
            <CoachTutorialButton slug="weekly-ima" label={{ en: "How to read", is: "Hvernig á að lesa" }} />
          </div>
          <CoachWeeklyLoadCard
            teamId={teamId}
            lang={lang}
            date={date}
            group="ima"
            title={lang === "IS" ? "Vikulegt IMA-álag" : "Weekly IMA Load"}
            subtitle={lang === "IS" ? "Uppsafnað IMA (driver) álag vikunnar vs dæmigert" : "Cumulative IMA (driver) load this week vs typical"}
          />
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
          {t("loading", lang)}
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</div>
      )}

      {!loading && !error && profile && (
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
          <ImaRunDistanceCard date={date} lang={lang} />
          <ImaStrideVerdictCard date={date} lang={lang} />
          <PerPlayerTable profile={profile} lang={lang} />
          <LegendCard lang={lang} />
        </>
      )}
    </div>
  );
}

// ── IMA Free Running distance (per band 5-8 + total) ──────────────────────

type RunDistRow = {
  player_id: string;
  full_name: string;
  band5: number;
  band6: number;
  band7: number;
  band8: number;
  total: number;
  acwr: number | null;
  status: "insufficient" | "low" | "optimal" | "high" | "spike";
  confident: boolean;
  z: number | null;
  dominant_band: 5 | 6 | 7 | 8 | null;
};

const ACWR_STYLE: Record<RunDistRow["status"], { bg: string; text: string; label: (lang: Lang) => string }> = {
  spike:        { bg: "#f1d3c8", text: "#8c3221", label: (l) => (l === "IS" ? "Spike" : "Spike") },
  high:         { bg: "#f3e0b4", text: "#9a6410", label: (l) => (l === "IS" ? "Hátt" : "High") },
  optimal:      { bg: "#d3e8da", text: "#16653d", label: (l) => (l === "IS" ? "Í lagi" : "OK") },
  low:          { bg: "#E0F2FE", text: "#0369A1", label: (l) => (l === "IS" ? "Lágt" : "Low") },
  insufficient: { bg: "#efece2", text: "#8b8676", label: (l) => (l === "IS" ? "Byggist" : "Building") },
};

function ImaRunDistanceCard({ date, lang }: { date: string; lang: Lang }) {
  const [rows, setRows] = React.useState<RunDistRow[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setLoaded(false);
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/coach/team/ima-run-distance?date=${date}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (alive) setRows((json.players ?? []) as RunDistRow[]);
        }
      } catch {
        /* soft */
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [date]);

  const heading = lang === "IS" ? "IMA Free Running vegalengd" : "IMA Free Running distance";
  const sub = lang === "IS"
    ? "Háákefðar hlaupavegalengd (m) eftir cadence-bandi 5-8 + samtals"
    : "High-intensity running distance (m) by cadence band 5-8 + total";
  const noData = lang === "IS" ? "Engin gögn fyrir þennan dag" : "No data for this day";

  const m = (n: number) => Math.round(n).toLocaleString();
  // Shade band columns 5→8 (increasing cadence) for quick visual scan.
  const bandBg = ["bg-sky-50", "bg-indigo-50", "bg-violet-50", "bg-fuchsia-50"];

  const spikes = rows.filter((r) => r.status === "spike");
  const spikeMsg = lang === "IS"
    ? `${spikes.length} ${spikes.length === 1 ? "leikmaður" : "leikmenn"} með háákefðar hlaupa-spike (ACWR ≥ 1.5). Dreifðu sprett-álaginu yfir vikuna.`
    : `${spikes.length} player${spikes.length === 1 ? "" : "s"} in a high-intensity running spike (ACWR ≥ 1.5). Spread the sprint load across the week.`;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="text-xs uppercase tracking-wide text-slate-500">{heading}</div>
        <CoachTutorialButton slug="ima-free-running" label={{ en: "How to read", is: "Hvernig á að lesa" }} />
      </div>
      <div className="mb-3 text-[11px] text-slate-500">
        {sub} · {lang === "IS" ? "ACWR = bráð (7d) ÷ langvinn (28d)" : "ACWR = acute (7d) ÷ chronic (28d)"}
      </div>

      {/* Spike summary (the verdict the coach reads first) */}
      {loaded && spikes.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
          <span>⚠</span><span><b>{spikeMsg}</b></span>
        </div>
      )}

      {!loaded ? (
        <div className="py-4 text-center text-sm text-slate-500">…</div>
      ) : rows.length === 0 ? (
        <div className="py-4 text-center text-sm text-slate-500">{noData}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-2 py-1.5 text-left font-medium">{lang === "IS" ? "Leikmaður" : "Player"}</th>
                <th className="px-2 py-1.5 text-right font-medium">Band 5</th>
                <th className="px-2 py-1.5 text-right font-medium">Band 6</th>
                <th className="px-2 py-1.5 text-right font-medium">Band 7</th>
                <th className="px-2 py-1.5 text-right font-medium">Band 8</th>
                <th className="px-2 py-1.5 text-right font-semibold text-slate-700">{lang === "IS" ? "Samtals" : "Total"}</th>
                <th className="px-2 py-1.5 text-center font-medium" title="Acute:chronic workload ratio">ACWR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = ACWR_STYLE[r.status];
                return (
                  <tr key={r.player_id} className={`border-b border-slate-100 ${r.status === "spike" ? "bg-rose-50/40" : ""}`}>
                    <td className="px-2 py-1.5 font-medium text-slate-800">{r.full_name}</td>
                    {[r.band5, r.band6, r.band7, r.band8].map((v, i) => (
                      <td key={i} className={`px-2 py-1.5 text-right tabular-nums text-slate-600 ${bandBg[i]}`}>
                        {v > 0 ? m(v) : "·"}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-slate-900">{m(r.total)}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                        style={{ backgroundColor: st.bg, color: st.text }}
                        title={r.confident
                          ? `${st.label(lang)} · ACWR ${r.acwr ?? "—"}`
                          : (lang === "IS" ? "Of fá gögn enn fyrir áreiðanlegt hlutfall" : "Not enough history yet for a reliable ratio")}
                      >
                        {r.status === "insufficient" || r.acwr == null ? st.label(lang) : r.acwr.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
    ? "Háhraða vegalengd ÷ háhraðaskref (bönd 5-8), borið saman við hans eigin leiki/stórar æfingar · flaggað við 2,5 staðalfrávik"
    : "High-cadence distance ÷ high-cadence strides (bands 5-8), vs his own matches/big sessions · flagged at 2.5 SD";

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
          ? "Undir þreytu heldur leikmaður skreftíðni en skreflengd styttist — hann ýtir minna þótt fæturnir snúist jafn hratt. Hvorki GPS-vegalengd né skreftíðni ein sér sér þetta; hlutfallið gerir það."
          : "Under fatigue a player keeps his stride frequency but stride length shortens — he pushes less though the legs turn over as fast. Neither GPS distance nor cadence alone sees it; the ratio does."}
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
              ? `${shortened.length} ${shortened.length === 1 ? "leikmaður" : "leikmenn"} með styttri skref en venjulega — hann ýtir minna þótt fæturnir snúist jafn hratt.`
              : `${shortened.length} player${shortened.length === 1 ? "" : "s"} striding shorter than usual — pushing less though the legs turn over as fast.`}
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
                        ? "háhraða vegalengd ÷ háhraðaskref (IMA hlaupabönd 5–8)."
                        : "high-cadence distance ÷ high-cadence strides (IMA free-running bands 5–8)."}
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
                    <div className="text-slate-400">Girard, Micallef &amp; Millet 2011; Morin o.fl. 2011.</div>
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
    <div className="mb-6 rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">{t("perPlayer", lang)}</h2>
      </div>
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
    </div>
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

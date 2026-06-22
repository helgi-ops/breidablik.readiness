"use client";
export const dynamic = "force-dynamic";

/**
 * /coach/assessment-profile
 *
 * Physical Assessment Battery — Phase 2 coach view.
 *
 * One row per player. Each row expands to the player's latest assessment
 * profile: every measured metric, the change since their previous assessment
 * (≈6 months earlier), and where they rank within their own age band in the
 * squad. Reads physical_assessments + physical_assessment_metrics directly —
 * RLS scopes the rows to the coach's team.
 */

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import VerdictBanner, {
  type VerdictTone,
  type VerdictDriver,
  type ConfidenceLevel,
} from "@/components/coach/VerdictBanner";
import {
  buildSquadAssessmentProfiles,
  type PlayerAssessmentProfile,
  type MetricReading,
} from "@/lib/micropulse/physicalAssessment/interpret";
import {
  buildAssessmentRecommendation,
  type AssessmentRecommendation,
  type FocusArea,
} from "@/lib/micropulse/physicalAssessment/recommend";

// ─── Squad-level verdict (rules, not AI) ─────────────────────────────────────
// Derived entirely from the per-player profiles the page already computes.
// Strongest/weakest area = the metric most often ranking top-quartile /
// bottom-quartile of the player's own age band. "Flagged focus area" = a
// player the recommendation engine gives at least one focus area.

type SquadVerdict = {
  tone: VerdictTone;
  sentence: { EN: string; IS: string };
  subtitle: { EN: string; IS: string };
  confidence: { level: ConfidenceLevel; note: { EN: string; IS: string } };
  drivers: VerdictDriver[];
};

/** Tally which metric names lead the squad's strengths and weak links. */
function topByCount(pairs: Map<string, number>): { name: string; count: number } | null {
  let best: { name: string; count: number } | null = null;
  for (const [name, count] of pairs) {
    if (best == null || count > best.count) best = { name, count };
  }
  return best;
}

function firstNames(profiles: PlayerAssessmentProfile[]): string {
  return profiles.map((p) => p.name.split(/\s+/)[0]).join(", ");
}

function buildSquadVerdict(profiles: PlayerAssessmentProfile[]): SquadVerdict {
  const total = profiles.length;

  // Count age-band strengths / weak links across the squad, by metric name.
  const strengthCounts = new Map<string, number>();
  const weakCounts = new Map<string, number>();
  let anyRanked = false;
  for (const p of profiles) {
    if (p.summary.strengths.length > 0 || p.summary.weakLinks.length > 0) anyRanked = true;
    for (const name of p.summary.strengths) strengthCounts.set(name, (strengthCounts.get(name) ?? 0) + 1);
    for (const name of p.summary.weakLinks) weakCounts.set(name, (weakCounts.get(name) ?? 0) + 1);
  }

  // Players with at least one flagged focus area, most-flagged first.
  const flagged = profiles
    .map((p) => ({ p, n: buildAssessmentRecommendation(p).focusAreas.length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  const flaggedCount = flagged.length;

  const strongest = topByCount(strengthCounts);
  const weakest = topByCount(weakCounts);

  // Tone: lots of weak links → watch; clean sheet with rankings → good; thin → neutral.
  let tone: VerdictTone;
  if (!anyRanked) tone = "neutral";
  else if (total > 0 && flaggedCount / total >= 0.5) tone = "watch";
  else if (flaggedCount > 0) tone = "watch";
  else tone = "good";

  // Confidence from how many players could actually be ranked against an age band.
  const level: ConfidenceLevel = !anyRanked ? "low" : total >= 6 ? "high" : "moderate";
  const confNote = {
    EN: `${total} player${total === 1 ? "" : "s"} assessed`,
    IS: `${total} leikm${total === 1 ? "aður" : "enn"} mældir`,
  };

  // Drivers — players carrying the most focus areas (named exceptions).
  const drivers: VerdictDriver[] = flagged.slice(0, 4).map(({ p, n }) => ({
    label: p.name.split(/\s+/)[0],
    detail: {
      EN: `${n} focus area${n === 1 ? "" : "s"}`,
      IS: `${n} áhersl${n === 1 ? "a" : "ur"}`,
    },
    tone: "watch",
    tip: {
      EN: `${n} training focus area${n === 1 ? "" : "s"} flagged from weak links (bottom quartile of the age band) or metrics that regressed since the last test. Cohort percentile within ±1.5 yr age band (Robertson 2017, athlete-monitoring framework).`,
      IS: `${n} þjálfunaráhersl${n === 1 ? "a" : "ur"} flöggu${n === 1 ? "ð" : "ðar"} út frá veikum hlekkjum (neðsti fjórðungur aldursflokks) eða þáttum sem versnuðu frá síðustu mælingu. Hundraðsröðun innan ±1,5 árs aldursflokks (Robertson 2017).`,
    },
  }));

  // Sentence + subtitle.
  let sentence: { EN: string; IS: string };
  if (!anyRanked) {
    sentence = {
      EN: total === 0
        ? "Not enough data yet to read the squad's physical profile."
        : "Not enough players in each age band yet to rank strengths and weak areas — read each player's change-since-last-test below.",
      IS: total === 0
        ? "Ekki næg gögn enn til að lesa líkamsprófíl hópsins."
        : "Ekki nógu margir í hverjum aldursflokki enn til að raða styrkleikum og veikum sviðum — skoðið breytingu hvers leikmanns frá síðustu mælingu að neðan.",
    };
  } else {
    const strongName = strongest?.name ?? "—";
    const weakName = weakest?.name ?? "—";
    const names = firstNames(flagged.slice(0, 4).map((x) => x.p));
    const moreEN = flaggedCount > 4 ? ` +${flaggedCount - 4} more` : "";
    const moreIS = flaggedCount > 4 ? ` +${flaggedCount - 4} til viðbótar` : "";
    if (flaggedCount === 0) {
      sentence = {
        EN: `Squad is strongest in ${strongName} and weakest in ${weakName}; no player has a flagged focus area.`,
        IS: `Hópurinn er sterkastur í ${strongName} og veikastur í ${weakName}; enginn leikmaður með flaggaða áherslu.`,
      };
    } else {
      sentence = {
        EN: `Squad is strongest in ${strongName} and weakest in ${weakName}; ${flaggedCount} player${flaggedCount === 1 ? " has" : "s have"} a flagged focus area — ${names}${moreEN}.`,
        IS: `Hópurinn er sterkastur í ${strongName} og veikastur í ${weakName}; ${flaggedCount} leikm${flaggedCount === 1 ? "aður er" : "enn eru"} með flaggaða áherslu — ${names}${moreIS}.`,
      };
    }
  }

  const subtitle = {
    EN: "Each metric is compared against the player's own age band (within 1.5 years), so younger and older players are judged fairly. A focus area is flagged where a player sits in the bottom of the band or has slipped since the last test.",
    IS: "Hver mæling er borin saman við aldursflokk leikmannsins (innan 1,5 árs), svo yngri og eldri leikmenn eru metnir sanngjarnt. Áhersla er flögguð þegar leikmaður situr neðst í flokknum eða hefur versnað frá síðustu mælingu.",
  };

  return { tone, sentence, subtitle, confidence: { level, note: confNote }, drivers };
}

const CATEGORY_LABEL: Record<string, { EN: string; IS: string }> = {
  speed: { EN: "Speed", IS: "Hraði" },
  jump: { EN: "Jump & power", IS: "Stökk & kraftur" },
  anthropometric: { EN: "Body measurements", IS: "Líkamsmælingar" },
  other: { EN: "Other", IS: "Annað" },
};

export default function CoachAssessmentProfilePage() {
  const [lang] = useLang();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [profiles, setProfiles] = React.useState<PlayerAssessmentProfile[]>([]);

  const verdict = React.useMemo(() => buildSquadVerdict(profiles), [profiles]);

  React.useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseClient();

      const { data: assessments, error: aErr } = await sb
        .from("physical_assessments")
        .select("id, player_id, assessment_date, age_years_at_assessment");
      if (aErr) throw aErr;
      const aRows = assessments ?? [];

      if (aRows.length === 0) {
        setProfiles([]);
        setLoading(false);
        return;
      }

      const assessmentIds = aRows.map((a) => a.id as string);
      const playerIds = Array.from(new Set(aRows.map((a) => a.player_id as string)));

      const [{ data: metrics, error: mErr }, { data: players, error: pErr }] = await Promise.all([
        sb.from("physical_assessment_metrics")
          .select("assessment_id, metric_code, metric_category, value, unit")
          .in("assessment_id", assessmentIds),
        sb.from("players").select("id, full_name").in("id", playerIds),
      ]);
      if (mErr) throw mErr;
      if (pErr) throw pErr;

      const built = buildSquadAssessmentProfiles(
        aRows as never,
        (metrics ?? []) as never,
        (players ?? []) as never,
      );
      setProfiles(built);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Villa við að sækja mælingar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-4">
      {/* Plain-language squad verdict — explainability-first headline (rules, not AI).
          Gated identically to the per-player list (loaded + non-empty). */}
      {!loading && !error && profiles.length > 0 && (
        <VerdictBanner
          lang={lang}
          kicker={lang === "IS" ? "Mælingaprófíll" : "Assessment Profile"}
          tone={verdict.tone}
          sentence={verdict.sentence}
          subtitle={verdict.subtitle}
          confidence={verdict.confidence}
          drivers={verdict.drivers}
        />
      )}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {lang === "IS" ? "Mælingaprófíll" : "Assessment Profile"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {lang === "IS"
            ? "Hálfsárs styrktar- og líkamsmælingar afrekshóps. Breyting frá síðustu mælingu og röðun innan aldursflokks."
            : "Half-yearly strength & physical assessments. Change since last test and ranking within the player's age band."}
        </p>
      </div>

      {loading && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {lang === "IS" ? "Hleð…" : "Loading…"}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && profiles.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
          <p>
            {lang === "IS"
              ? "Engar mælingar komnar inn enn."
              : "No assessments uploaded yet."}
          </p>
          <Link href="/coach/assessment-upload" className="mt-2 inline-block text-emerald-700 hover:underline">
            {lang === "IS" ? "→ Hlaða upp mælingum" : "→ Upload assessments"}
          </Link>
        </div>
      )}

      {!loading && !error && profiles.length > 0 && (
        <div className="space-y-2">
          {profiles.map((p) => <ProfileRow key={p.playerId} profile={p} lang={lang} />)}
        </div>
      )}

      <div className="text-sm">
        <Link href="/coach" className="text-emerald-700 hover:underline">
          {lang === "IS" ? "← Til baka á dashboard" : "← Back to dashboard"}
        </Link>
      </div>
    </div>
  );
}

// ─── Player row ──────────────────────────────────────────────────────────────

function ProfileRow({ profile, lang }: { profile: PlayerAssessmentProfile; lang: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const { summary } = profile;

  const categories = Array.from(new Set(profile.metrics.map((m) => m.category)));
  const rec = React.useMemo(() => buildAssessmentRecommendation(profile), [profile]);
  const highFocus = rec.focusAreas.filter((f) => f.priority === "high").length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{profile.name}</div>
          <div className="text-xs text-slate-500">
            {profile.latestDate ?? "—"}
            {profile.ageAtLatest != null && ` · ${profile.ageAtLatest.toFixed(1)} ${lang === "IS" ? "ára" : "yrs"}`}
            {profile.previousDate
              ? ` · ${lang === "IS" ? "sl. mæling" : "prev"} ${profile.previousDate}`
              : ` · ${lang === "IS" ? "fyrsta mæling" : "first assessment"}`}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {summary.improving > 0 && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
              ↑ {summary.improving}
            </span>
          )}
          {summary.regressing > 0 && (
            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-800">
              ↓ {summary.regressing}
            </span>
          )}
          {summary.weakLinks.length > 0 && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
              {summary.weakLinks.length} {lang === "IS" ? "veik" : "weak"}
            </span>
          )}
          {rec.focusAreas.length > 0 && (
            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">
              {rec.focusAreas.length} {lang === "IS" ? "áhersla" : "focus"}
              {highFocus > 0 ? ` · ${highFocus}↑` : ""}
            </span>
          )}
          <span className="text-slate-400">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-3 space-y-3">
          {profile.metrics.length === 0 && (
            <p className="text-xs text-slate-500">
              {lang === "IS" ? "Engin mæligildi." : "No metric values."}
            </p>
          )}

          <RecommendationBlock rec={rec} lang={lang} />

          {categories.map((cat) => {
            const rows = profile.metrics.filter((m) => m.category === cat);
            if (rows.length === 0) return null;
            const label = CATEGORY_LABEL[cat] ?? CATEGORY_LABEL.other;
            return (
              <div key={cat}>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {lang === "IS" ? label.IS : label.EN}
                </div>
                <div className="space-y-1">
                  {rows.map((m) => <MetricRowView key={m.code} m={m} lang={lang} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Recommendation block ────────────────────────────────────────────────────

function RecommendationBlock({
  rec, lang,
}: { rec: AssessmentRecommendation; lang: string }) {
  if (rec.focusAreas.length === 0 && rec.notes.length === 0) return null;
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
        {lang === "IS" ? "Ráðlögð áhersla — næsta tímabil" : "Recommended focus — next macrocycle"}
      </div>
      {rec.focusAreas.length > 0 && (
        <div className="space-y-2">
          {rec.focusAreas.map((f) => <FocusAreaCard key={f.code} f={f} lang={lang} />)}
        </div>
      )}
      {rec.notes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {rec.notes.map((n, i) => (
            <li key={i} className="text-[11px] leading-snug text-slate-500">
              · {lang === "IS" ? n.IS : n.EN}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10px] leading-snug text-slate-400">
        {lang === "IS"
          ? "Ráðleggingar byggja á mælingunni — veikir hlekkir (neðsti fjórðungur aldursflokks) og þættir sem hafa versnað. Þetta er stuðningur við ákvörðun þjálfara, ekki fyrirmæli."
          : "Recommendations derive from the assessment — weak links (bottom quartile of the age band) and metrics that regressed. Decision-support for the coach, not a prescription."}
      </p>
    </div>
  );
}

function FocusAreaCard({ f, lang }: { f: FocusArea; lang: string }) {
  const dot = f.priority === "high" ? "bg-rose-500" : "bg-amber-400";
  const tag = f.priority === "high"
    ? (lang === "IS" ? "Forgangur" : "Priority")
    : (lang === "IS" ? "Fylgjast með" : "Watch");
  return (
    <div className="rounded-md border border-slate-200 bg-white p-2.5">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className="text-xs font-semibold text-slate-900">
          {lang === "IS" ? f.titleIS : f.titleEN}
        </span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">{tag}</span>
      </div>
      <div className="mt-1 text-[10px] text-slate-500">
        {lang === "IS" ? "Kveikt af: " : "Triggered by: "}
        {f.triggerMetrics.join(", ")}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-slate-600">
        {lang === "IS" ? f.rationaleIS : f.rationaleEN}
      </p>
      <p className="mt-1.5 rounded bg-slate-50 px-2 py-1.5 text-[11px] leading-snug text-slate-700">
        <span className="font-medium">{lang === "IS" ? "Áhersla: " : "Emphasis: "}</span>
        {lang === "IS" ? f.emphasisIS : f.emphasisEN}
      </p>
    </div>
  );
}

// ─── Single metric row ───────────────────────────────────────────────────────

function MetricRowView({ m, lang }: { m: MetricReading; lang: string }) {
  return (
    <div className="grid grid-cols-12 items-center gap-2 rounded border border-slate-100 bg-slate-50/50 px-2 py-1.5">
      {/* Name */}
      <div className="col-span-4 min-w-0">
        <div className="truncate text-xs font-medium text-slate-800">
          {lang === "IS" ? m.nameIS : m.nameEN}
        </div>
      </div>

      {/* Value */}
      <div className="col-span-3 text-right">
        <span className="text-sm font-bold tabular-nums text-slate-900">
          {formatValue(m.value)}
        </span>
        <span className="ml-1 text-[10px] text-slate-500">{m.unit}</span>
      </div>

      {/* Change vs previous */}
      <div className="col-span-2 text-right">
        <ChangeBadge m={m} lang={lang} />
      </div>

      {/* Cohort percentile */}
      <div className="col-span-3">
        <PercentileBar percentile={m.percentile} cohortSize={m.cohortSize} lang={lang} />
      </div>
    </div>
  );
}

function ChangeBadge({ m, lang }: { m: MetricReading; lang: string }) {
  if (m.direction === "new" || m.deltaPct == null) {
    return <span className="text-[10px] text-slate-400">{lang === "IS" ? "ný" : "new"}</span>;
  }
  const style =
    m.direction === "improving" ? "text-emerald-700"
      : m.direction === "regressing" ? "text-rose-700"
        : "text-slate-500";
  const arrow =
    m.direction === "improving" ? "▲"
      : m.direction === "regressing" ? "▼"
        : "→";
  const sign = m.deltaPct > 0 ? "+" : "";
  return (
    <span className={`text-[11px] font-medium tabular-nums ${style}`}>
      {arrow} {sign}{m.deltaPct.toFixed(1)}%
    </span>
  );
}

function PercentileBar({
  percentile, cohortSize, lang,
}: { percentile: number | null; cohortSize: number; lang: string }) {
  if (percentile == null) {
    return (
      <span className="text-[10px] text-slate-400">
        {lang === "IS" ? "of fáir í flokki" : "cohort too small"}
      </span>
    );
  }
  const fill =
    percentile < 25 ? "bg-rose-500"
      : percentile >= 75 ? "bg-emerald-500"
        : "bg-amber-400";
  const title = lang === "IS"
    ? `Röðun innan aldursflokks (${cohortSize} leikmenn)`
    : `Rank within age band (${cohortSize} players)`;
  return (
    <div className="flex items-center gap-1.5" title={title}>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div className={`absolute inset-y-0 left-0 ${fill}`} style={{ width: `${percentile}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-[10px] font-medium tabular-nums text-slate-500">
        P{percentile}
      </span>
    </div>
  );
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(1);
  return v.toFixed(2).replace(/\.?0+$/, "");
}

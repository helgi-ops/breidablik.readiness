"use client";

/**
 * Coach injury log + correlation view.
 *
 * Three things in one page:
 *   1. Team-level summary card: "MicroPulse predicted X of Y injuries (Z%)"
 *   2. Injury list with retrospective signal indicators per row
 *   3. "Log new injury" form (collapsible)
 *
 * The retrospective signal computation runs server-side on insert via
 * compute_injury_retrospective_signals(). Each injury_event row stores its
 * retro_signals JSONB so list rendering is fast.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang, type Lang } from "@/lib/lang";

type InjuryType =
  | "hamstring" | "calf" | "groin" | "quad" | "hip"
  | "knee_acl" | "knee_mcl" | "knee_meniscus" | "knee_other"
  | "ankle_sprain" | "ankle_other"
  | "foot" | "achilles" | "lower_back" | "upper_body"
  | "concussion" | "illness" | "other";

type Mechanism =
  | "non_contact_match" | "non_contact_training"
  | "contact_match" | "contact_training"
  | "overuse" | "recurrence" | "unknown";

type Severity = "minimal" | "mild" | "moderate" | "severe";
type BodySide = "left" | "right" | "bilateral" | "na";

type InjuryEvent = {
  id: string;
  player_id: string;
  team_id: string;
  injury_date: string;
  injury_type: InjuryType;
  body_side: BodySide;
  mechanism: Mechanism;
  severity: Severity | null;
  days_lost: number | null;
  return_date: string | null;
  is_active: boolean;
  notes: string | null;
  retro_signals: any | null;
  recorded_at: string;
};

type Player = { id: string; full_name: string | null };

type Summary = {
  total_injuries: number;
  predicted_injuries: number;
  strong_pattern_match: number;
  avg_pattern_match_score: number | null;
  hamstring_count: number;
  calf_count: number;
  groin_count: number;
  knee_count: number;
  ankle_count: number;
  earliest_injury: string | null;
  latest_injury: string | null;
};

const INJURY_TYPE_LABEL_BILINGUAL: Record<InjuryType, { EN: string; IS: string }> = {
  hamstring:     { EN: "Hamstring",      IS: "Aftan-læri" },
  calf:          { EN: "Calf",           IS: "Kálfi" },
  groin:         { EN: "Groin",          IS: "Nár" },
  quad:          { EN: "Quad",           IS: "Fram-læri" },
  hip:           { EN: "Hip",            IS: "Mjöðm" },
  knee_acl:      { EN: "Knee — ACL",     IS: "Hné — ACL" },
  knee_mcl:      { EN: "Knee — MCL",     IS: "Hné — MCL" },
  knee_meniscus: { EN: "Knee — meniscus",IS: "Hné — meniscus" },
  knee_other:    { EN: "Knee — other",   IS: "Hné — annað" },
  ankle_sprain:  { EN: "Ankle sprain",   IS: "Ökkla-tognun" },
  ankle_other:  { EN: "Ankle — other",   IS: "Ökkla — annað" },
  foot:          { EN: "Foot",           IS: "Fótur" },
  achilles:      { EN: "Achilles",       IS: "Achilles" },
  lower_back:    { EN: "Lower back",     IS: "Mjóbak" },
  upper_body:    { EN: "Upper body",     IS: "Efri hluti" },
  concussion:    { EN: "Concussion",     IS: "Heilahristingur" },
  illness:       { EN: "Illness",        IS: "Veikindi" },
  other:         { EN: "Other",          IS: "Annað" },
};
const injuryTypeLabel = (k: InjuryType, lang: Lang): string =>
  lang === "IS" ? INJURY_TYPE_LABEL_BILINGUAL[k].IS : INJURY_TYPE_LABEL_BILINGUAL[k].EN;

const SEVERITY_LABEL_BILINGUAL: Record<Severity, { EN: string; IS: string }> = {
  minimal:  { EN: "Minimal (1-3 d)",     IS: "Minimal (1-3 d)" },
  mild:     { EN: "Mild (4-7 d)",        IS: "Mild (4-7 d)" },
  moderate: { EN: "Moderate (8-28 d)",   IS: "Moderate (8-28 d)" },
  severe:   { EN: "Severe (>28 d)",      IS: "Severe (>28 d)" },
};
const severityLabel = (k: Severity, lang: Lang): string =>
  lang === "IS" ? SEVERITY_LABEL_BILINGUAL[k].IS : SEVERITY_LABEL_BILINGUAL[k].EN;

const MECHANISM_LABEL_BILINGUAL: Record<Mechanism, { EN: string; IS: string }> = {
  non_contact_match:    { EN: "Non-contact — match",    IS: "Án snertingar — leikur" },
  non_contact_training: { EN: "Non-contact — training", IS: "Án snertingar — æfing" },
  contact_match:        { EN: "Contact — match",        IS: "Snerting — leikur" },
  contact_training:     { EN: "Contact — training",     IS: "Snerting — æfing" },
  overuse:              { EN: "Overuse",                IS: "Yfirálag" },
  recurrence:           { EN: "Re-injury",              IS: "Endurmeiðsl" },
  unknown:              { EN: "Unknown",                IS: "Óþekkt" },
};
const mechanismLabel = (k: Mechanism, lang: Lang): string =>
  lang === "IS" ? MECHANISM_LABEL_BILINGUAL[k].IS : MECHANISM_LABEL_BILINGUAL[k].EN;

// ── Page-level UI strings ───────────────────────────────────────────────
const INJ_I18N = {
  pageTitle: { EN: "Injury Pattern Analysis", IS: "Meiðsla-munstursgreining" },
  proofOfRoi: { EN: "proof-of-ROI", IS: "proof-of-ROI" },
  pageSubtitle: {
    EN: "Read-only view of every recorded injury, plus the MicroPulse warning signals that preceded it. To log a new injury, use the RTP tab on the Dashboard.",
    IS: "Lestrar-aðeins yfirlit yfir öll skráð meiðsli og þau MicroPulse warning signals sem komu á undan. Til að skrá nýtt meiðsli, notaðu RTP tab á Dashboard.",
  },
  goToRtpTab: { EN: "Open RTP tab →", IS: "Opna RTP tab →" },
  notSignedIn: { EN: "Not signed in", IS: "Ekki innskráður" },
  noTeam: { EN: "Not connected to a team", IS: "Ekki tengdur við lið" },
  errorGeneric: { EN: "Error", IS: "Villa" },
  loggedInjuries: { EN: "Logged injuries (latest 200)", IS: "Skráð meiðsli (síðustu 200)" },
  loadingShort: { EN: "Loading…", IS: "Hleð…" },
  noInjuriesYet: {
    EN: "No injuries logged yet. Log the first one to see retrospective signal correlation.",
    IS: "Engin meiðsli skráð enn. Skráðu fyrsta meiðslið til að sjá retrospective signal correlation.",
  },
  backToDashboard: { EN: "← Back to dashboard", IS: "← Til baka á dashboard" },
  // Summary panel
  summaryHeader: { EN: "MicroPulse Pattern Match — last 365 days", IS: "MicroPulse Pattern Match — last 365 days" },
  ofInjuries: { EN: "of {n} injuries", IS: "af {n} meiðslum" },
  precededByWarning: {
    EN: "preceded by warning signs (yellow/red flag, decoupling alert, or ACWR spike)",
    IS: "á undan kom warning sign (yellow/red flag, decoupling alert, eða ACWR spike)",
  },
  strongPattern: { EN: "Strong pattern match (≥0.5)", IS: "Strong pattern match (≥0.5)" },
  avgPatternScore: { EN: "Avg pattern score", IS: "Avg pattern score" },
  hamstring: { EN: "Hamstring", IS: "Aftan-læri" },
  knee: { EN: "Knee", IS: "Hné" },
  ankle: { EN: "Ankle", IS: "Ökkli" },
  groin: { EN: "Groin", IS: "Nár" },
  // Injury row
  precededTag: { EN: "✓ Preceded by warning", IS: "✓ Preceded by warning" },
  noPriorSignal: { EN: "No prior signal", IS: "Engin signal á undan" },
  matchSuffix: { EN: "match", IS: "match" },
  yellowDays: { EN: "Yellow days", IS: "Yellow days" },
  redDays: { EN: "Red days", IS: "Red days" },
  decouplingAlerts: { EN: "Decoupling alerts", IS: "Decoupling alerts" },
  ofFourteen: { EN: "(of 14)", IS: "(af 14)" },
  oneSdHint: { EN: "(>1 SD)", IS: "(>1 SD)" },
  sevenOver28d: { EN: "(7d / 28d)", IS: "(7d / 28d)" },
  firstWarningPrefix: { EN: "First warning sign", IS: "Fyrsta aðvörunarmerki" },
  daysBeforeInjury: {
    EN: "days before injury",
    IS: "dögum fyrir meiðsli",
  },
  noSpecificSignals: {
    EN: "MicroPulse detected the pattern with that lead time.",
    IS: "MicroPulse fangaði munstrið með þeim fyrirvara.",
  },
  // Per-day warning timeline labels
  timelineHeading: { EN: "Day-by-day warning timeline", IS: "Dag-fyrir-dag aðvörunartímalína" },
  timelineSubhead: {
    EN: "Every non-green day in the 14-day lead-up to the injury, oldest first.",
    IS: "Allir non-green dagar á 14-daga aðdraganda meiðslanna, elsti efst.",
  },
  daysBeforeShort: { EN: "d before", IS: "d fyrir" },
  decouplingChip: { EN: "decoupling", IS: "decoupling" },
  extremeLoadChip: { EN: "extreme load", IS: "extreme load" },
  noTimeline: {
    EN: "No prior non-green days recorded in the 14-day window.",
    IS: "Engir non-green dagar á 14-daga glugganum.",
  },
  dominantSignals: { EN: "Dominant signals seen:", IS: "Dominant signals sem komu fram:" },
  notesLabel: { EN: "Notes:", IS: "Athugasemdir:" },
  retroComputed: { EN: "Retro signals computed:", IS: "Retro signals reiknað:" },
  windowLabel: { EN: "Window:", IS: "Glugga:" },
  daysShort: { EN: "days", IS: "dagar" },
  // Form
  formTitle: { EN: "Log injury", IS: "Skrá meiðsli" },
  player: { EN: "Player", IS: "Leikmaður" },
  selectDash: { EN: "— select —", IS: "— veldu —" },
  injuryDate: { EN: "Injury date", IS: "Dagur meiðsla" },
  injuryTypeField: { EN: "Injury type", IS: "Týpa meiðsla" },
  bodySide: { EN: "Body side", IS: "Hlið líkama" },
  sideNa: { EN: "N/A", IS: "Á ekki við" },
  sideLeft: { EN: "Left", IS: "Vinstri" },
  sideRight: { EN: "Right", IS: "Hægri" },
  sideBilateral: { EN: "Bilateral", IS: "Báðar" },
  mechanism: { EN: "Mechanism", IS: "Mekanismi" },
  severity: { EN: "Severity", IS: "Alvarleiki" },
  notSet: { EN: "— not set —", IS: "— ekki ákvarðað —" },
  daysLost: { EN: "Days lost (if known)", IS: "Fjöldi daga týnt (ef þekkt)" },
  notes: { EN: "Notes", IS: "Athugasemdir" },
  saving: { EN: "Saving…", IS: "Vista…" },
  saveButton: { EN: "Save injury + compute correlation", IS: "Vista meiðsli + reikna correlation" },
  formFooter: {
    EN: "When saved, the system automatically runs a retrospective analysis of the last 14 days of MicroPulse signals (wellness flags, decoupling alerts, ACWR spikes) and stores the results in retro_signals JSONB shown in the list.",
    IS: "Þegar meiðsli er vistað keyrir kerfið automatískt afturskyggna analýsu af síðustu 14 daga MicroPulse signals (wellness flags, decoupling alerts, ACWR spikes) og pakka niðurstöðum í retro_signals JSONB sem sýnt er í lista.",
  },
  selectPlayerErr: { EN: "Select a player", IS: "Veldu leikmann" },
  saveErr: { EN: "Failed to save injury", IS: "Villa við vistun" },
} as const;
function it(key: keyof typeof INJ_I18N, lang: Lang): string {
  return lang === "IS" ? INJ_I18N[key].IS : INJ_I18N[key].EN;
}

/**
 * Per-day "why was this RED/YELLOW" reason chips.
 *
 * Each entry in warning_timeline carries the raw signals that drove
 * the day's flag (sub-scores, personal-z, delta_z, pi tags, decoupling,
 * extreme load). This function turns those into a short ordered list
 * of human-readable reason chips so the coach immediately sees the
 * cause without parsing numbers.
 *
 * Reasons are listed in priority order — most clinically relevant
 * first. Hard threshold reasons (sub-score ≤ 2, z ≤ -2, Δz ≤ -1.5)
 * always beat soft tags (volatility, sustained_low).
 */
function buildDayReasons(
  day: {
    sub_scores?: { sleep?: number | null; energy?: number | null; stress?: number | null; soreness?: number | null } | null;
    z_score?: number | null;
    delta_z?: number | null;
    pi_tags?: string[] | unknown;
    had_decoupling_alert?: boolean;
    extreme_load_day?: boolean;
    total_score?: number | null;
  },
  lang: Lang,
): Array<{ label: string; tone: "red" | "amber" | "slate" }> {
  const reasons: Array<{ label: string; tone: "red" | "amber" | "slate" }> = [];

  // 1. Sub-scores ≤ 2 (the most directly clinical signal)
  const subs = day.sub_scores ?? {};
  const subEntries: Array<{ key: keyof typeof subs; valueEN: string; valueIS: string }> = [
    { key: "sleep", valueEN: "sleep", valueIS: "svefn" },
    { key: "soreness", valueEN: "soreness", valueIS: "strengir" },
    { key: "energy", valueEN: "energy", valueIS: "orka" },
    { key: "stress", valueEN: "stress/mood", valueIS: "streita" },
  ];
  for (const s of subEntries) {
    const v = subs[s.key];
    if (typeof v === "number" && v <= 2) {
      const labelName = lang === "IS" ? s.valueIS : s.valueEN;
      reasons.push({ label: `${labelName} ${v}/5`, tone: v <= 1 ? "red" : "amber" });
    }
  }

  // 2. Personal-z ≤ -2 (Robertson 2017 — significant deviation from norm)
  if (typeof day.z_score === "number" && day.z_score <= -2) {
    reasons.push({
      label: `z ${day.z_score.toFixed(2)} (${lang === "IS" ? "Robertson" : "Robertson"})`,
      tone: "red",
    });
  } else if (typeof day.z_score === "number" && day.z_score <= -1) {
    reasons.push({
      label: `z ${day.z_score.toFixed(2)}`,
      tone: "amber",
    });
  }

  // 3. Acute Δz drop ≤ -1.5 (overnight crash)
  if (typeof day.delta_z === "number" && day.delta_z <= -1.5) {
    reasons.push({
      label: lang === "IS" ? `acute drop Δz ${day.delta_z.toFixed(2)}` : `acute drop Δz ${day.delta_z.toFixed(2)}`,
      tone: "red",
    });
  }

  // 4. Decoupling alert
  if (day.had_decoupling_alert) {
    reasons.push({
      label: lang === "IS" ? "decoupling (Akubat 2014)" : "decoupling (Akubat 2014)",
      tone: "amber",
    });
  }

  // 5. Extreme load
  if (day.extreme_load_day) {
    reasons.push({
      label: lang === "IS" ? "extreme load dagur" : "extreme load day",
      tone: "amber",
    });
  }

  // 6. Engine pi tags (volatility, sustained_low) — soft context
  const tags = Array.isArray(day.pi_tags) ? (day.pi_tags as string[]) : [];
  const uniqueTags = Array.from(new Set(tags));
  for (const tag of uniqueTags) {
    if (tag === "pi_volatility") {
      reasons.push({ label: lang === "IS" ? "óstöðugleiki" : "volatility", tone: "slate" });
    } else if (tag === "pi_sustained_low") {
      reasons.push({ label: lang === "IS" ? "viðvarandi lágt" : "sustained low", tone: "slate" });
    } else if (tag === "pi_acute_drop" && !reasons.some((r) => r.label.startsWith("acute drop"))) {
      // pi_acute_drop without a numeric Δz match — surface as soft tag
      reasons.push({ label: lang === "IS" ? "acute drop" : "acute drop", tone: "amber" });
    }
  }

  // 7. Fallback — low total_score with no other reason
  if (reasons.length === 0 && typeof day.total_score === "number" && day.total_score <= 17) {
    reasons.push({
      label: `total ${day.total_score}/25`,
      tone: day.total_score <= 12 ? "red" : "amber",
    });
  }

  return reasons;
}

/**
 * Build a precise, sport-science-cited "first warning sign" sentence
 * from the retro_signals JSONB. Lists the specific warning components
 * that fired in the 14-day window leading up to the injury, with
 * thresholds and references where applicable.
 *
 * Example outputs:
 *   "First warning sign 8 days before injury — 1 RED day; ACWR 1.48
 *    above Gabbett 2017 sweet-spot upper bound (1.30); dominant
 *    wellness signal: muscle_soreness."
 *   "First warning sign 12 days before injury — 3 YELLOW days; 2
 *    internal:external decoupling alerts (Akubat 2014)."
 *
 * Falls back to the generic phrase when no specific signal triggered
 * (rare — would mean firstWarning came from data we no longer index).
 */
function buildWarningSignSentence(
  lead: number,
  retro: Record<string, unknown> | null | undefined,
  lang: Lang,
): string {
  const wellness = (retro?.wellness ?? {}) as Record<string, unknown>;
  const decoupling = (retro?.decoupling ?? {}) as Record<string, unknown>;
  const load = (retro?.load ?? {}) as Record<string, unknown>;

  const yellowDays = (wellness.yellow_days as number | undefined) ?? 0;
  const redDays = (wellness.red_days as number | undefined) ?? 0;
  const decAlerts = (decoupling.alert_days as number | undefined) ?? 0;
  const acwr = load.acwr as number | null | undefined;
  const dominantSignals = (wellness.dominant_signals_seen as string[] | undefined) ?? [];

  const components: string[] = [];

  if (redDays > 0) {
    components.push(
      lang === "IS"
        ? `${redDays} RED ${redDays === 1 ? "dagur" : "dagar"}`
        : `${redDays} RED ${redDays === 1 ? "day" : "days"}`,
    );
  }
  if (yellowDays > 0) {
    components.push(
      lang === "IS"
        ? `${yellowDays} YELLOW ${yellowDays === 1 ? "dagur" : "dagar"}`
        : `${yellowDays} YELLOW ${yellowDays === 1 ? "day" : "days"}`,
    );
  }
  if (typeof acwr === "number" && acwr >= 1.3) {
    components.push(
      lang === "IS"
        ? `ACWR ${acwr.toFixed(2)} — yfir efri mörkum Gabbett 2017 sweet-spot (1.30)`
        : `ACWR ${acwr.toFixed(2)} — above Gabbett 2017 sweet-spot upper bound (1.30)`,
    );
  } else if (typeof acwr === "number" && acwr > 0 && acwr < 0.8) {
    components.push(
      lang === "IS"
        ? `ACWR ${acwr.toFixed(2)} — undir Gabbett 2017 sweet-spot (0.80), undirálag`
        : `ACWR ${acwr.toFixed(2)} — below Gabbett 2017 sweet-spot (0.80), undertraining`,
    );
  }
  if (decAlerts > 0) {
    components.push(
      lang === "IS"
        ? `${decAlerts} internal:external decoupling merki (Akubat 2014)`
        : `${decAlerts} internal:external decoupling ${decAlerts === 1 ? "alert" : "alerts"} (Akubat 2014)`,
    );
  }
  if (dominantSignals.length > 0) {
    const cleaned = dominantSignals.map((s) => s.replace("wellness.", "")).join(", ");
    components.push(
      lang === "IS"
        ? `ríkjandi wellness merki: ${cleaned}`
        : `dominant wellness ${dominantSignals.length === 1 ? "signal" : "signals"}: ${cleaned}`,
    );
  }

  const prefix = it("firstWarningPrefix", lang);
  const tail = it("daysBeforeInjury", lang);

  if (components.length === 0) {
    // Fallback — pattern detected but no indexed component (unusual)
    return `${prefix} ${lead} ${tail}. ${it("noSpecificSignals", lang)}`;
  }

  return `${prefix} ${lead} ${tail} — ${components.join("; ")}.`;
}

export default function CoachInjuriesPage() {
  const [lang] = useLang();
  const [loading, setLoading]   = React.useState(true);
  const [error, setError]       = React.useState<string | null>(null);
  const [teamId, setTeamId]     = React.useState<string | null>(null);
  const [teamLabel, setTeamLabel] = React.useState<string>("");
  const [players, setPlayers]   = React.useState<Player[]>([]);
  const [injuries, setInjuries] = React.useState<InjuryEvent[]>([]);
  const [summary, setSummary]   = React.useState<Summary | null>(null);

  React.useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      const sb = getSupabaseClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setError(it("notSignedIn", lang)); return; }
      const { data: profile } = await sb.from("profiles").select("team_id").eq("id", user.id).maybeSingle();
      const tid = profile?.team_id as string | undefined;
      if (!tid) { setError(it("noTeam", lang)); return; }
      setTeamId(tid);

      const { data: team } = await sb.from("teams").select("name, club_short_name").eq("id", tid).maybeSingle();
      setTeamLabel((team?.club_short_name || team?.name) ?? "");

      const { data: roster } = await sb.from("players")
        .select("id, full_name").eq("team_id", tid).order("full_name");
      setPlayers((roster ?? []) as Player[]);

      const { data: injData, error: injErr } = await sb.from("injury_events")
        .select("*")
        .eq("team_id", tid)
        .order("injury_date", { ascending: false })
        .limit(200);
      if (injErr) throw injErr;
      setInjuries((injData ?? []) as InjuryEvent[]);

      const { data: sumData } = await sb.from("team_injury_correlation_summary")
        .select("*").eq("team_id", tid).maybeSingle();
      setSummary(sumData as Summary | null);
    } catch (e: any) {
      setError(e?.message ?? it("errorGeneric", lang));
    } finally {
      setLoading(false);
    }
  }

  const playerName = (id: string) => players.find(p => p.id === id)?.full_name?.trim() || "—";

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      {/* Header — read-only analytics view. Logging happens on RTP tab. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">{it("pageTitle", lang)}</h1>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
              {it("proofOfRoi", lang)}
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {it("pageSubtitle", lang)}
            {teamLabel && <> · {teamLabel}</>}
          </p>
        </div>
        <Link
          href="/coach?tab=rtp"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          {it("goToRtpTab", lang)}
        </Link>
      </div>

      {/* Summary */}
      {summary && summary.total_injuries > 0 && (
        <SummaryPanel summary={summary} lang={lang} />
      )}

      {/* List */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          {it("loggedInjuries", lang)}
        </h2>
        {loading && (
          <div className="py-8 text-center text-sm text-muted-foreground">{it("loadingShort", lang)}</div>
        )}
        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
        {!loading && !error && injuries.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {it("noInjuriesYet", lang)}
          </div>
        )}
        {!loading && injuries.length > 0 && (
          <div className="space-y-2">
            {injuries.map((inj) => (
              <InjuryRow key={inj.id} injury={inj} playerName={playerName(inj.player_id)} lang={lang} />
            ))}
          </div>
        )}
      </div>

      <div className="text-sm">
        <Link href="/coach" className="text-emerald-700 hover:underline">{it("backToDashboard", lang)}</Link>
      </div>
    </div>
  );
}

// ─── Summary panel ───────────────────────────────────────────────────────

function SummaryPanel({ summary, lang }: { summary: Summary; lang: Lang }) {
  const total = summary.total_injuries;
  const predicted = summary.predicted_injuries;
  const pct = total > 0 ? Math.round((predicted / total) * 100) : 0;

  return (
    <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            {it("summaryHeader", lang)}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="text-4xl font-bold text-emerald-700">{predicted}</div>
            <div className="text-xl text-emerald-700">{it("ofInjuries", lang).replace("{n}", String(total))}</div>
            <div className="text-2xl font-bold text-emerald-700">({pct}%)</div>
          </div>
          <div className="mt-1 text-xs text-emerald-600">
            {it("precededByWarning", lang)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <Stat label={it("strongPattern", lang)} value={summary.strong_pattern_match} />
          <Stat label={it("avgPatternScore", lang)} value={summary.avg_pattern_match_score?.toFixed(2) ?? "—"} />
          <Stat label={it("hamstring", lang)} value={summary.hamstring_count} />
          <Stat label={it("knee", lang)} value={summary.knee_count} />
          <Stat label={it("ankle", lang)} value={summary.ankle_count} />
          <Stat label={it("groin", lang)} value={summary.groin_count} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded bg-white px-2 py-1">
      <span className="text-emerald-700">{label}</span>
      <span className="font-semibold text-emerald-900">{value}</span>
    </div>
  );
}

// ─── Injury row ───────────────────────────────────────────────────────────

function InjuryRow({ injury, playerName, lang }: { injury: InjuryEvent; playerName: string; lang: Lang }) {
  const [expanded, setExpanded] = React.useState(false);
  const retro = injury.retro_signals;
  const score = retro?.pattern_match_score as number | undefined;
  const preceded = retro?.preceded_by_warning as boolean | undefined;
  const yellowDays = retro?.wellness?.yellow_days as number | undefined;
  const redDays = retro?.wellness?.red_days as number | undefined;
  const decAlerts = retro?.decoupling?.alert_days as number | undefined;
  const acwr = retro?.load?.acwr as number | undefined;
  const firstWarning = retro?.first_warning_days_before_injury as number | undefined;

  let scoreColor = "bg-slate-100 text-slate-700";
  if (score != null) {
    if (score >= 0.7) scoreColor = "bg-emerald-100 text-emerald-700";
    else if (score >= 0.4) scoreColor = "bg-amber-100 text-amber-700";
    else if (score >= 0.2) scoreColor = "bg-orange-100 text-orange-700";
    else scoreColor = "bg-slate-100 text-slate-600";
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left transition hover:bg-slate-50"
      >
        <div className="flex flex-1 items-center gap-3">
          <div className="text-xs font-mono text-slate-500">{injury.injury_date}</div>
          <div>
            <div className="text-sm font-semibold text-slate-900">{playerName}</div>
            <div className="text-xs text-muted-foreground">
              {injuryTypeLabel(injury.injury_type, lang)}
              {injury.body_side !== "na" && <> · {injury.body_side}</>}
              {" · "}{mechanismLabel(injury.mechanism, lang)}
              {injury.severity && <> · {severityLabel(injury.severity, lang)}</>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {preceded && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
              {it("precededTag", lang)}
            </span>
          )}
          {!preceded && retro && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
              {it("noPriorSignal", lang)}
            </span>
          )}
          {score != null && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${scoreColor}`}>
              {(score * 100).toFixed(0)}% {it("matchSuffix", lang)}
            </span>
          )}
          <span className="text-slate-400">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>

      {expanded && retro && (
        <div className="border-t border-slate-100 bg-slate-50 p-4">
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Mini label={it("yellowDays", lang)} value={yellowDays ?? "—"} hint={it("ofFourteen", lang)} />
            <Mini label={it("redDays", lang)} value={redDays ?? "—"} hint={it("ofFourteen", lang)} />
            <Mini label={it("decouplingAlerts", lang)} value={decAlerts ?? "—"} hint={it("oneSdHint", lang)} />
            <Mini label="ACWR" value={acwr?.toFixed(2) ?? "—"} hint={it("sevenOver28d", lang)} />
          </div>

          {firstWarning != null && firstWarning < 14 && (
            <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
              {buildWarningSignSentence(firstWarning, retro as Record<string, unknown> | null | undefined, lang)}
            </div>
          )}

          {/* Day-by-day warning timeline — every non-green day in
              the 14-day window, with the reason chips that explain
              WHY the day was RED/YELLOW (sub-score below threshold,
              personal-z drop, acute Δz, decoupling, etc.). Coach
              reads this top-to-bottom as the lead-up unfolded. */}
          {(() => {
            const timeline = (retro as Record<string, unknown> | null)?.warning_timeline as Array<{
              date: string;
              days_before: number;
              flag: "YELLOW" | "RED";
              total_score: number | null;
              z_score: number | null;
              yesterday_z?: number | null;
              yesterday_total?: number | null;
              delta_z?: number | null;
              dominant_signal: string | null;
              pi_tags?: string[] | unknown;
              sub_scores?: { sleep?: number | null; energy?: number | null; stress?: number | null; soreness?: number | null } | null;
              had_decoupling_alert: boolean;
              extreme_load_day: boolean;
            }> | undefined;
            if (!timeline || timeline.length === 0) return null;
            return (
              <div className="mt-3 rounded border border-slate-200 bg-white p-2.5">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                    {it("timelineHeading", lang)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {timeline.length} {it("daysShort", lang)}
                  </div>
                </div>
                <div className="text-[10px] italic text-slate-500 mb-2">
                  {it("timelineSubhead", lang)}
                </div>
                <ol className="space-y-2">
                  {timeline.map((d, idx) => {
                    const flagCls = d.flag === "RED"
                      ? "border-red-300 bg-red-50 text-red-700"
                      : "border-amber-300 bg-amber-50 text-amber-700";
                    const reasons = buildDayReasons(d, lang);
                    return (
                      <li key={`tl-${idx}-${d.date}`} className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5">
                        {/* Header row: date + days-before + flag chip + score */}
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-[10px] text-slate-500">{d.date}</span>
                          <span className="text-[10px] text-slate-400 tabular-nums">
                            ({d.days_before}{it("daysBeforeShort", lang)})
                          </span>
                          <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold ${flagCls}`}>
                            {d.flag}
                          </span>
                          {d.total_score != null && (
                            <span className="text-[10px] tabular-nums text-slate-500">
                              {d.total_score}/25
                            </span>
                          )}
                          {d.z_score != null && (
                            <span className="text-[10px] tabular-nums text-slate-400">
                              · z={d.z_score.toFixed(2)}
                            </span>
                          )}
                          {d.delta_z != null && d.delta_z <= -1.5 && (
                            <span className="text-[10px] tabular-nums text-red-600 font-semibold">
                              · Δz {d.delta_z.toFixed(2)}
                            </span>
                          )}
                        </div>
                        {/* Reason chips — the "why" layer */}
                        {reasons.length > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {reasons.map((r, ri) => {
                              const cls = r.tone === "red"
                                ? "border-red-300 bg-red-50 text-red-700"
                                : r.tone === "amber"
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : "border-slate-300 bg-white text-slate-600";
                              return (
                                <span
                                  key={`tl-${idx}-r-${ri}`}
                                  className={`inline-flex items-center rounded border px-1.5 py-0 text-[10px] font-medium ${cls}`}
                                >
                                  {r.label}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })()}

          {/* Standalone dominant-signal line — only when the warning
              sentence above isn't rendered (so the signals don't get
              shown twice in the same expanded row). */}
          {(firstWarning == null || firstWarning >= 14) &&
            retro?.wellness?.dominant_signals_seen &&
            retro.wellness.dominant_signals_seen.length > 0 && (
            <div className="mt-3 text-xs">
              <strong className="text-slate-700">{it("dominantSignals", lang)}</strong>{" "}
              <span className="text-slate-600">
                {retro.wellness.dominant_signals_seen.map((s: string) => s.replace("wellness.", "")).join(", ")}
              </span>
            </div>
          )}

          {injury.notes && (
            <div className="mt-3 text-xs">
              <strong className="text-slate-700">{it("notesLabel", lang)}</strong>{" "}
              <span className="italic text-slate-600">{injury.notes}</span>
            </div>
          )}

          <div className="mt-3 text-[10px] text-slate-400">
            {it("retroComputed", lang)}{" "}
            {retro.computed_at
              ? new Date(retro.computed_at).toLocaleString(lang === "IS" ? "is-IS" : "en-GB")
              : "—"}
            {" · "}
            {it("windowLabel", lang)} {retro.scan_window_days} {it("daysShort", lang)}
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, hint }: { label: string; value: any; hint?: string }) {
  return (
    <div className="rounded bg-white px-3 py-2">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-800">{value}</div>
      {hint && <div className="text-[10px] text-slate-400">{hint}</div>}
    </div>
  );
}

// ─── Injury logging is no longer done here. ──────────────────────────────
// This page is a read-only analytics view of injury_events. New injuries
// are logged via the RTP tab (DevCoachDashboardClient → RtpTab.tsx) which
// writes to player_injuries; a Postgres trigger
// (player_injuries_sync_to_events) mirrors them here automatically so the
// pattern-match retrospective analysis runs on every new injury.

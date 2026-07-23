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
import AssignRehabModal from "@/components/coach/AssignRehabModal";
import CoachAssignProtocolButton from "@/components/recovery/CoachAssignProtocolButton";
import CoachTutorialButton from "@/components/coach/tutorials/CoachTutorialButton";

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
  // McBurnie Decel Intelligence retrospective
  decelHeading: { EN: "McBurnie Decel Intelligence — as of injury date", IS: "McBurnie Decel Intelligence — sem af meiðsla-degi" },
  decelOverall: { EN: "Overall", IS: "Heild" },
  decelOverload: { EN: "Overload", IS: "Overload" },
  decelUnderload: { EN: "Underload", IS: "Underload" },
  decelAccelCoupling: { EN: "Decel : Accel", IS: "Decel : Accel" },
  decelSprintCoupling: { EN: "Decel : Sprint", IS: "Decel : Sprint" },
  decelConcentration: { EN: "Concentration", IS: "Concentration" },
  // Tier 1+2 retro signals
  priorInjuriesHeading: { EN: "Prior injuries (last 180 days)", IS: "Fyrri meiðsli (síðustu 180 daga)" },
  priorInjuriesNone: { EN: "No prior injuries in last 180 days.", IS: "Engin fyrri meiðsli síðustu 180 daga." },
  priorSameSite: { EN: "Same-site recurrence", IS: "Sama svæði — endurkoma" },
  priorCount: { EN: "prior injuries", IS: "fyrri meiðsli" },
  valdHeading: { EN: "VALD ForceDecks snapshot", IS: "VALD ForceDecks staða" },
  valdAsOf: { EN: "as of", IS: "sem af" },
  valdNeuromuscular: { EN: "Neuromuscular", IS: "Taugavöðva" },
  valdHamstring: { EN: "Hamstring", IS: "Aftan-læri" },
  valdGroin: { EN: "Groin", IS: "Nár" },
  nordbordHeading: { EN: "VALD Nordbord — eccentric hamstring asymmetry", IS: "VALD Nordbord — eccentric hamstring ósamhverfa" },
  nordbordAsymmetry: { EN: "asymmetry", IS: "ósamhverfa" },
  nordbordOpar: { EN: "Opar 2015 threshold: ≥10% asymmetry → elevated hamstring-injury risk", IS: "Opar 2015 viðmið: ≥10% ósamhverfa → aukin hamstring-meiðsla áhætta" },
  gpsSpikesHeading: { EN: "GPS spike days (Buchheit 2010)", IS: "GPS spike dagar (Buchheit 2010)" },
  gpsSpikeNone: { EN: "No HSR or sprint-count spikes in window.", IS: "Engar HSR eða sprint spikes í glugganum." },
  gpsSpikeHsr: { EN: "HSR", IS: "HSR" },
  gpsSpikeSprint: { EN: "sprints", IS: "spretti" },
  matchHeading: { EN: "Match congestion (Lago-Penas 2010)", IS: "Leikja-þéttleiki (Lago-Penas 2010)" },
  matchInWindow: { EN: "matches in 14d", IS: "leikir á 14d" },
  matchTotalMin: { EN: "total minutes", IS: "samtals mínútur" },
  matchShortestGap: { EN: "shortest gap", IS: "stysta bil" },
  streakHeading: { EN: "Chronic pattern at injury", IS: "Viðvarandi mynstur við meiðsli" },
  daysOff: { EN: "non-green days", IS: "non-green dagar" },
  daysSinceGreen: { EN: "days since last GREEN", IS: "dagar síðan síðasti GREEN" },
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
        <div className="flex items-center gap-2">
          <CoachTutorialButton slug="injury-pattern-analysis" />
          <Link
            href="/coach?tab=rtp"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {it("goToRtpTab", lang)}
          </Link>
        </div>
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
              <InjuryRow key={inj.id} injury={inj} playerName={playerName(inj.player_id)} lang={lang} teamId={teamId} />
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

function InjuryRow({ injury, playerName, lang, teamId }: { injury: InjuryEvent; playerName: string; lang: Lang; teamId: string | null }) {
  const [expanded, setExpanded] = React.useState(false);
  const [rehabModalOpen, setRehabModalOpen] = React.useState(false);
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
          {/* Send rehab — primary action when reviewing an injury.
              Pre-fills player + injury_event_id so the modal lands
              ready to assign with rehab/prehab category preset. */}
          {teamId && (
            <div className="mb-3 flex items-center justify-end gap-2">
              {/* Send a recovery PROTOCOL (e.g. the ramping hamstring) — lands on
                  the player's /player/recovery-protocols. Separate from the rehab
                  TEMPLATE assign below (which lands as a Today session). */}
              <CoachAssignProtocolButton playerId={injury.player_id} />
              <button
                type="button"
                onClick={() => setRehabModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                {lang === "IS" ? "+ Úthluta rehab áætlun" : "+ Assign rehab program"}
              </button>
            </div>
          )}

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

          {/* ── Tier 1+2 retrospective signals ─────────────────────
              Six panels that complete the clinical picture beyond
              wellness/ACWR/McBurnie: prior injuries, VALD snapshot,
              Nordbord asymmetry, GPS spikes, match congestion,
              chronic-pattern streak context. Each panel hides itself
              when its data isn't available. */}

          {/* Prior injuries (Hägglund 2013) */}
          {(() => {
            const pi = (retro as Record<string, unknown> | null)?.prior_injuries as {
              count_180d?: number;
              same_site_recurrence?: boolean;
              history?: Array<{ date: string; days_before: number; body_part?: string; injury_type?: string; severity?: string; days_lost?: number | null }>;
            } | undefined;
            if (!pi) return null;
            const count = pi.count_180d ?? 0;
            return (
              <div className="mt-3 rounded border border-slate-200 bg-white p-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                    {it("priorInjuriesHeading", lang)}
                  </div>
                  {count > 0 && (
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${pi.same_site_recurrence ? "border-red-300 bg-red-50 text-red-700" : "border-amber-300 bg-amber-50 text-amber-700"}`}>
                      {count} {it("priorCount", lang)}
                    </span>
                  )}
                </div>
                {count === 0 ? (
                  <div className="text-[11px] text-slate-500">{it("priorInjuriesNone", lang)}</div>
                ) : (
                  <>
                    {pi.same_site_recurrence && (
                      <div className="mb-2 inline-flex items-center rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        {it("priorSameSite", lang)}
                      </div>
                    )}
                    <ol className="space-y-1 text-xs">
                      {(pi.history ?? []).map((h, hi) => (
                        <li key={`prior-${hi}`} className="flex items-start gap-2 text-slate-700">
                          <span className="font-mono text-[10px] text-slate-500">{h.date}</span>
                          <span className="text-[10px] text-slate-400 tabular-nums">({h.days_before}d)</span>
                          <span className="font-medium">{h.body_part ?? h.injury_type ?? "—"}</span>
                          {h.severity && <span className="text-slate-500">· {h.severity}</span>}
                          {h.days_lost != null && <span className="text-slate-500">· {h.days_lost}d lost</span>}
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
            );
          })()}

          {/* VALD ForceDecks snapshot */}
          {(() => {
            // explanation in vald_daily_player_snapshot is a JSONB object
            // ({ cmj, nordbord, forceframe } each with a message field),
            // not a plain string. Type accordingly so we don't try to
            // render the object directly into JSX.
            type ValdExplanationPart = { message?: string; latest?: number | null; baseline?: number | null; delta_percent?: number | null; asymmetry_percent?: number | null };
            const v = (retro as Record<string, unknown> | null)?.vald_snapshot as {
              snapshot_date?: string;
              days_before_injury?: number;
              overall_vald_status?: string;
              neuromuscular_flag?: string;
              hamstring_flag?: string;
              groin_flag?: string;
              cmj_score?: number | null;
              explanation?: { cmj?: ValdExplanationPart; nordbord?: ValdExplanationPart; forceframe?: ValdExplanationPart } | null;
            } | undefined;
            if (!v || !v.snapshot_date) return null;
            // Extract the meaningful message lines from the structured
            // explanation. Skips empty/no-data messages so we don't
            // display three "no data available" lines in a row.
            const explanationLines: string[] = [];
            if (v.explanation && typeof v.explanation === "object") {
              for (const part of [v.explanation.cmj, v.explanation.nordbord, v.explanation.forceframe]) {
                if (part?.message && !/^no /i.test(part.message)) {
                  explanationLines.push(part.message);
                }
              }
            }
            const flagCls = (f?: string) => f === "red"
              ? "border-red-300 bg-red-50 text-red-700"
              : f === "yellow"
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : f === "green"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-slate-300 bg-white text-slate-500";
            const dims = [
              { key: "neuro", labelKey: "valdNeuromuscular" as const, flag: v.neuromuscular_flag },
              { key: "ham", labelKey: "valdHamstring" as const, flag: v.hamstring_flag },
              { key: "groin", labelKey: "valdGroin" as const, flag: v.groin_flag },
            ];
            return (
              <div className="mt-3 rounded border border-slate-200 bg-white p-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                    {it("valdHeading", lang)}
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${flagCls(v.overall_vald_status)}`}>
                    {v.overall_vald_status ?? "—"}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 mb-2">
                  {it("valdAsOf", lang)} <span className="font-mono">{v.snapshot_date}</span>
                  {v.days_before_injury != null && <span className="text-slate-400"> ({v.days_before_injury}d before)</span>}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {dims.map((d) => (
                    <div key={d.key} className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5">
                      <div className="text-[9px] uppercase tracking-wide text-slate-500">{it(d.labelKey, lang)}</div>
                      <span className={`mt-1 inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold uppercase ${flagCls(d.flag)}`}>
                        {d.flag ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
                {explanationLines.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-[11px] italic text-slate-600">
                    {explanationLines.map((line, li) => (
                      <li key={`vald-exp-${li}`}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })()}

          {/* VALD Nordbord — eccentric hamstring asymmetry (Opar 2015) */}
          {(() => {
            const n = (retro as Record<string, unknown> | null)?.nordbord as {
              test_date?: string;
              days_before?: number;
              left_peak_force_n?: number;
              right_peak_force_n?: number;
              asymmetry_percent?: number;
              asymmetry_side?: string;
            } | undefined;
            if (!n || n.asymmetry_percent == null) return null;
            const asymCls = n.asymmetry_percent >= 15
              ? "border-red-300 bg-red-50 text-red-700"
              : n.asymmetry_percent >= 10
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "border-emerald-300 bg-emerald-50 text-emerald-700";
            return (
              <div className="mt-3 rounded border border-slate-200 bg-white p-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                    {it("nordbordHeading", lang)}
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums ${asymCls}`}>
                    {n.asymmetry_percent.toFixed(1)}% {n.asymmetry_side ?? ""}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 mb-1">
                  {n.test_date && <><span className="font-mono">{n.test_date}</span></>}
                  {n.days_before != null && <span className="text-slate-400"> ({n.days_before}d before)</span>}
                  {n.left_peak_force_n != null && n.right_peak_force_n != null && (
                    <span className="ml-2 text-slate-500 tabular-nums">
                      L {Math.round(n.left_peak_force_n)}N · R {Math.round(n.right_peak_force_n)}N
                    </span>
                  )}
                </div>
                <div className="text-[10px] italic text-slate-500">{it("nordbordOpar", lang)}</div>
              </div>
            );
          })()}

          {/* GPS spike days (Buchheit 2010, Malone 2017) */}
          {(() => {
            const g = (retro as Record<string, unknown> | null)?.gps_spikes as {
              count?: number;
              days?: Array<{ date: string; days_before: number; hsr_distance?: number; hsr_ratio_vs_28d?: number; sprint_count?: number; sprint_ratio_vs_28d?: number }>;
            } | undefined;
            if (!g || (g.count ?? 0) === 0) return null;
            return (
              <div className="mt-3 rounded border border-slate-200 bg-white p-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                    {it("gpsSpikesHeading", lang)}
                  </div>
                  <span className="inline-flex items-center rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase text-orange-700">
                    {g.count} {it("daysShort", lang)}
                  </span>
                </div>
                <ol className="space-y-1 text-xs">
                  {(g.days ?? []).map((d, di) => (
                    <li key={`spike-${di}`} className="flex items-start gap-2 text-slate-700">
                      <span className="font-mono text-[10px] text-slate-500">{d.date}</span>
                      <span className="text-[10px] text-slate-400 tabular-nums">({d.days_before}d)</span>
                      {d.hsr_distance != null && d.hsr_ratio_vs_28d != null && d.hsr_ratio_vs_28d >= 1.5 && (
                        <span className="inline-flex items-center rounded border border-orange-300 bg-orange-50 px-1.5 py-0 text-[10px] font-semibold text-orange-700">
                          {it("gpsSpikeHsr", lang)} {Math.round(d.hsr_distance)}m · {d.hsr_ratio_vs_28d.toFixed(1)}×
                        </span>
                      )}
                      {d.sprint_count != null && d.sprint_ratio_vs_28d != null && d.sprint_ratio_vs_28d >= 1.5 && (
                        <span className="inline-flex items-center rounded border border-orange-300 bg-orange-50 px-1.5 py-0 text-[10px] font-semibold text-orange-700">
                          {d.sprint_count} {it("gpsSpikeSprint", lang)} · {d.sprint_ratio_vs_28d.toFixed(1)}×
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            );
          })()}

          {/* Match congestion (Lago-Penas 2010) */}
          {(() => {
            const m = (retro as Record<string, unknown> | null)?.match_congestion as {
              matches_in_14d?: number;
              total_minutes?: number;
              shortest_gap_days?: number | null;
              match_dates?: string[];
            } | undefined;
            if (!m || (m.matches_in_14d ?? 0) === 0) return null;
            const congestionCls = (m.matches_in_14d ?? 0) >= 3
              ? "border-red-300 bg-red-50 text-red-700"
              : (m.matches_in_14d ?? 0) >= 2
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "border-slate-300 bg-white text-slate-700";
            return (
              <div className="mt-3 rounded border border-slate-200 bg-white p-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                    {it("matchHeading", lang)}
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tabular-nums ${congestionCls}`}>
                    {m.matches_in_14d} {it("matchInWindow", lang)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  <div className="rounded bg-slate-50 px-2 py-1">
                    <div className="text-[9px] uppercase text-slate-500">{it("matchTotalMin", lang)}</div>
                    <div className="font-bold text-slate-800 tabular-nums">{m.total_minutes ?? 0}</div>
                  </div>
                  <div className="rounded bg-slate-50 px-2 py-1">
                    <div className="text-[9px] uppercase text-slate-500">{it("matchShortestGap", lang)}</div>
                    <div className="font-bold text-slate-800 tabular-nums">{m.shortest_gap_days != null ? `${m.shortest_gap_days}d` : "—"}</div>
                  </div>
                  <div className="rounded bg-slate-50 px-2 py-1">
                    <div className="text-[9px] uppercase text-slate-500">dates</div>
                    <div className="font-mono text-[10px] text-slate-700">{(m.match_dates ?? []).join(", ") || "—"}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Streak context at injury */}
          {(() => {
            const s = (retro as Record<string, unknown> | null)?.streak_context_at_injury as {
              days_off_in_window?: number;
              last_green_date?: string | null;
              days_since_green?: number | null;
            } | undefined;
            if (!s || ((s.days_off_in_window ?? 0) === 0 && s.days_since_green == null)) return null;
            return (
              <div className="mt-3 rounded border border-slate-200 bg-white p-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-700 mb-1.5">
                  {it("streakHeading", lang)}
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div className="rounded bg-slate-50 px-2 py-1">
                    <div className="text-[9px] uppercase text-slate-500">{it("daysOff", lang)}</div>
                    <div className="font-bold text-slate-800 tabular-nums">{s.days_off_in_window ?? 0} <span className="text-[9px] text-slate-400">/ 14</span></div>
                  </div>
                  {s.days_since_green != null && (
                    <div className="rounded bg-slate-50 px-2 py-1">
                      <div className="text-[9px] uppercase text-slate-500">{it("daysSinceGreen", lang)}</div>
                      <div className="font-bold text-slate-800 tabular-nums">{s.days_since_green}d</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* McBurnie Decel Intelligence — as of injury date.
              Snapshot of the 4-dimension framework (overload,
              underload, accel-coupling, sprint-coupling, concen-
              tration) computed using only data that existed at the
              time of injury. Hidden when no GPS data is available
              for the player. */}
          {(() => {
            const di = (retro as Record<string, unknown> | null)?.decel_intelligence as {
              overall_flag?: "green" | "yellow" | "red" | "unknown";
              explanation?: string;
              as_of_date?: string;
              overload?: { flag?: string; cumulative_28d_count?: number; baseline_daily_mean?: number };
              underload?: { flag?: string; cumulative_7d_count?: number; match_day_demand?: number };
              accel_coupling?: { flag?: string; recent_ratio?: number; healthy_range?: string };
              sprint_coupling?: { flag?: string; recent_ratio?: number; healthy_range?: string };
              concentration?: { flag?: string; peak_day_pct_of_28d?: number; distinct_high_intensity_days?: number };
            } | undefined;
            // Hide entirely when there's no decel data at all (all unknown)
            if (!di) return null;
            const allUnknown = ["overload", "underload", "accel_coupling", "sprint_coupling", "concentration"]
              .every((k) => (di as any)[k]?.flag === "unknown" || (di as any)[k]?.flag == null);
            if (allUnknown) return null;

            const flagCls = (f?: string) => f === "red"
              ? "border-red-300 bg-red-50 text-red-700"
              : f === "yellow"
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : f === "green"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-slate-300 bg-white text-slate-500";

            const dims: Array<{ key: string; labelKey: keyof typeof INJ_I18N; flag?: string; sub?: string }> = [
              { key: "overload", labelKey: "decelOverload", flag: di.overload?.flag,
                sub: di.overload?.cumulative_28d_count != null
                  ? `${di.overload.cumulative_28d_count} / ${di.overload?.baseline_daily_mean ?? "?"}/d`
                  : undefined },
              { key: "underload", labelKey: "decelUnderload", flag: di.underload?.flag,
                sub: di.underload?.cumulative_7d_count != null
                  ? `${di.underload.cumulative_7d_count} / ${di.underload?.match_day_demand ?? "?"}`
                  : undefined },
              { key: "accel_coupling", labelKey: "decelAccelCoupling", flag: di.accel_coupling?.flag,
                sub: di.accel_coupling?.recent_ratio != null
                  ? `${di.accel_coupling.recent_ratio.toFixed(2)} (${di.accel_coupling?.healthy_range ?? ""})`
                  : undefined },
              { key: "sprint_coupling", labelKey: "decelSprintCoupling", flag: di.sprint_coupling?.flag,
                sub: di.sprint_coupling?.recent_ratio != null
                  ? `${di.sprint_coupling.recent_ratio.toFixed(2)} (${di.sprint_coupling?.healthy_range ?? ""})`
                  : undefined },
              { key: "concentration", labelKey: "decelConcentration", flag: di.concentration?.flag,
                sub: di.concentration?.peak_day_pct_of_28d != null
                  ? `peak ${di.concentration.peak_day_pct_of_28d}%`
                  : undefined },
            ];
            return (
              <div className="mt-3 rounded border border-slate-200 bg-white p-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                    {it("decelHeading", lang)}
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${flagCls(di.overall_flag)}`}>
                    {di.overall_flag ?? "—"}
                  </span>
                </div>
                {di.explanation && (
                  <div className="text-[11px] italic text-slate-600 mb-2">{di.explanation}</div>
                )}
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                  {dims.map((d) => (
                    <div key={d.key} className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5">
                      <div className="text-[9px] uppercase tracking-wide text-slate-500">
                        {it(d.labelKey, lang)}
                      </div>
                      <span className={`mt-1 inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold uppercase ${flagCls(d.flag)}`}>
                        {d.flag ?? "—"}
                      </span>
                      {d.sub && (
                        <div className="text-[10px] text-slate-500 tabular-nums mt-1">{d.sub}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

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

      {/* Rehab assignment modal — mounted at row root so it overlays
          the whole page when open. Pre-fills player, injury context,
          and category filter (rehab/prehab) so coach assignment is
          a 3-click flow from the injury row. */}
      {teamId && (
        <AssignRehabModal
          open={rehabModalOpen}
          onClose={() => setRehabModalOpen(false)}
          lang={lang}
          teamId={teamId}
          presetPlayerId={injury.player_id}
          presetPlayerName={playerName}
          injuryEventId={injury.id}
          categoryFilter={["rehab", "prehab", "recovery"]}
        />
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

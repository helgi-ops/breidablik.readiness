"use client";

/**
 * Coach view — Indoor Load Intelligence (höll-mode).
 *
 * FMP-driven indoor load monitoring for sessions in indoor halls.
 * Auto-detects indoor sessions: low velocity_band6_distance + meaningful FMP duration.
 *
 * Surfaces per player:
 *   - Latest indoor session vs personal 28-day baseline
 *   - Indoor McBurnie proxy: decel events / minute of FMP Dynamic High
 *   - Recent 7-day cumulative indoor load
 *
 * Reference: McBurnie 2022 indoor adaptation. FMP framework (Catapult OpenField).
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang, type Lang } from "@/lib/lang";
import LiteTierBanner from "@/components/coach/LiteTierBanner";

type Flag = "green" | "yellow" | "red";
type ScoreBand = "light" | "below_average" | "typical" | "heavy" | "spike";

type FmpBands = {
  very_low_s: number;
  low_s: number;
  running_medium_s: number;
  running_high_s: number;
  dynamic_low_s: number;
  dynamic_medium_s: number;
  dynamic_high_s: number;
  total_s: number;
};

type HistoryPoint = {
  date: string;
  score: number | null;
  player_load: number | null;
  dyn_high_pct: number | null;
  is_indoor: boolean;
  duration_min: number | null;
};

type IndoorStatus = {
  computed_at: string;
  indoor_sessions_28d: number;
  indoor_sessions_7d: number;
  total_sessions_28d: number;
  history_14d?: HistoryPoint[];
  baseline_indoor: {
    avg_player_load: number;
    avg_dyn_high_pct: number;
    avg_duration_min: number;
    avg_ima_total: number;
    avg_decel_b23: number;
    avg_hmld_m: number;
  };
  recent_7d: {
    sessions: number;
    sum_player_load: number;
    sum_dyn_high_s: number;
    sum_decel_b23: number;
  };
  latest_session: {
    date: string;
    player_load: number | null;
    dyn_high_pct: number | null;
    duration_min: number;
    ima_total: number | null;
    decel_b23: number | null;
    hmld_m: number | null;
    avg_hr: number | null;
    fmp_bands?: FmpBands;
  } | null;
  composite_score: number | null;
  composite_score_band: ScoreBand | null;
  acwr: {
    value: number;
    flag: Flag;
    interpretation: string;
  } | null;
  indoor_mcburnie: {
    decel_per_dyn_high_min: number;
    healthy_range: string;
    flag: Flag;
    interpretation?: string;
  } | null;
};

const SCORE_BAND_COLORS: Record<ScoreBand, string> = {
  light: "bg-slate-100 text-slate-600",
  below_average: "bg-sky-100 text-sky-700",
  typical: "bg-emerald-100 text-emerald-700",
  heavy: "bg-amber-100 text-amber-800",
  spike: "bg-rose-100 text-rose-800",
};

const SCORE_BAND_LABELS_BILINGUAL: Record<ScoreBand, { EN: string; IS: string }> = {
  light: { EN: "Light", IS: "Léttur" },
  below_average: { EN: "Below avg", IS: "Undir meðaltali" },
  typical: { EN: "Typical", IS: "Týpískur" },
  heavy: { EN: "Heavy", IS: "Þungur" },
  spike: { EN: "Spike", IS: "Spike" },
};
const scoreBandLabel = (b: ScoreBand, lang: Lang) =>
  lang === "IS" ? SCORE_BAND_LABELS_BILINGUAL[b].IS : SCORE_BAND_LABELS_BILINGUAL[b].EN;

// Action recommendation types — what should the coach DO with this player today?
type Action =
  | "FULL"
  | "MODIFIED"
  | "RECOVERY"
  | "NO_DATA"
  | "INJURED"
  | "REHAB"
  | "RTP"
  | "ILL"
  | "RECOVERING_ILL";

/** True if this injury record is actually an illness (not musculoskeletal). */
function isIllnessRecord(bodyPart: string | null | undefined): boolean {
  if (!bodyPart) return false;
  const bp = bodyPart.toLowerCase();
  return bp.includes("illness") || bp.includes("sjúk") || bp.includes("veik") || bp.includes("flu") || bp.includes("cold");
}

type LocalizedAction = { color: string; icon: string; label: string; sentence: string; recommendation: string };
const ACTION_LABELS_BILINGUAL: Record<Action, {
  color: string;
  icon: string;
  label: { EN: string; IS: string };
  sentence: { EN: string; IS: string };
  recommendation: { EN: string; IS: string };
}> = {
  FULL: {
    color: "bg-emerald-500 text-white", icon: "✅",
    label: { EN: "Ready", IS: "Tilbúinn" },
    sentence: { EN: "Ready for full program", IS: "Tilbúinn í fullt prógram" },
    recommendation: { EN: "No restrictions — full training, sprint work OK", IS: "Engin takmörk — fullt æfing, sprint work OK" },
  },
  MODIFIED: {
    color: "bg-amber-500 text-white", icon: "⚠️",
    label: { EN: "Lighter session", IS: "Léttari æfing" },
    sentence: { EN: "Needs a lighter session today", IS: "Þarf léttari æfingu í dag" },
    recommendation: { EN: "Reduce volume 30-40% and skip max-intensity sprints", IS: "Lækka volume 30-40% og sleppa max-intensity sprints" },
  },
  RECOVERY: {
    color: "bg-rose-500 text-white", icon: "🛑",
    label: { EN: "Rest", IS: "Hvíld" },
    sentence: { EN: "Rest or mobility only", IS: "Hvíld eða mobility eingöngu" },
    recommendation: { EN: "No high-intensity work — focus on mobility, recovery, light technical work", IS: "Engin high-intensity vinna — focus á hreyfanleika, recovery, light technical work" },
  },
  NO_DATA: {
    color: "bg-slate-300 text-slate-700", icon: "❓",
    label: { EN: "No data", IS: "Engin gögn" },
    sentence: { EN: "Not enough data to assess", IS: "Ekki nóg gögn til að meta" },
    recommendation: { EN: "Rely on coach's eye today", IS: "Treysta á eyemark þjálfara í dag" },
  },
  INJURED: {
    color: "bg-violet-600 text-white", icon: "🚫",
    label: { EN: "Out — injury", IS: "Frá æfingu — meiðsl" },
    sentence: { EN: "Acute injury — no training", IS: "Acute meiðsli — engin æfing" },
    recommendation: { EN: "Medical/physio protocol. No team training until physio clears.", IS: "Medical/physio prótókoll. Engin team-æfing fyrr en sjúkraþjálfari clear-ar." },
  },
  REHAB: {
    color: "bg-violet-600 text-white", icon: "🏥",
    label: { EN: "Rehab", IS: "Endurhæfing" },
    sentence: { EN: "In rehabilitation with physio", IS: "Í endurhæfingu hjá sjúkraþjálfara" },
    recommendation: { EN: "Physio-prescribed exercises only. No team work or running.", IS: "Aðeins physio-prescribed exercises. Engin team-vinna eða running." },
  },
  RTP: {
    color: "bg-violet-500 text-white", icon: "🩹",
    label: { EN: "Return-to-play", IS: "Return-to-play" },
    sentence: { EN: "Returning — modified team work", IS: "Í endurkomu — modified team work" },
    recommendation: { EN: "Lighter sessions with the team. Skip max-intensity sprints and full contact until stage 5.", IS: "Léttari æfingar með liðinu. Sleppa max-intensity sprints og full contact þar til stage 5." },
  },
  ILL: {
    color: "bg-teal-600 text-white", icon: "🤒",
    label: { EN: "Sick", IS: "Veikur" },
    sentence: { EN: "Sick — no training", IS: "Veikur — engin æfing" },
    recommendation: { EN: "No training. Rest, hydrate, monitor symptoms. Keep distance from teammates due to contagion risk.", IS: "Engin æfing. Hvíld, drekka mikið, monitor symptoms. Fjarlægð frá öðrum leikmönnum vegna smithættu." },
  },
  RECOVERING_ILL: {
    color: "bg-teal-500 text-white", icon: "🫧",
    label: { EN: "Recovering", IS: "Að jafna sig" },
    sentence: { EN: "Recovering — lighter session", IS: "Á batavegi — léttari æfing" },
    recommendation: { EN: "Light technical/aerobic work today. Skip max-intensity sprints. Hydrate well. Re-assess after session.", IS: "Light technical/aerobic work í dag. Sleppa max-intensity sprints. Drekka mikið. Skoða aftur eftir session." },
  },
};

function actionLabels(action: Action, lang: Lang): LocalizedAction {
  const a = ACTION_LABELS_BILINGUAL[action];
  return {
    color: a.color,
    icon: a.icon,
    label: lang === "IS" ? a.label.IS : a.label.EN,
    sentence: lang === "IS" ? a.sentence.IS : a.sentence.EN,
    recommendation: lang === "IS" ? a.recommendation.IS : a.recommendation.EN,
  };
}

/** Build natural Icelandic reason text for why a player is in MODIFIED or RECOVERY band. */
function buildLoadReason(args: {
  composite_band: ScoreBand | null | undefined;
  acwr_value: number | null | undefined;
  acwr_flag: Flag | null | undefined;
  mcburnie_flag: Flag | null | undefined;
}, lang: Lang): string {
  const en = lang === "EN";
  const parts: string[] = [];
  if (args.composite_band === "spike") parts.push(en ? "trained much harder than usual yesterday" : "æfði miklu meira en venjulega í gær");
  else if (args.composite_band === "heavy") parts.push(en ? "heavy session yesterday" : "þung session í gær");
  else if (args.composite_band === "light") parts.push(en ? "almost no training recently" : "nær engin æfing nýlega");
  if (args.acwr_flag === "red" && args.acwr_value != null) {
    if (args.acwr_value > 1.5) parts.push(`${en ? "acute 7-day spike" : "acute spike á 7 dögum"} (ACWR ${args.acwr_value.toFixed(2)})`);
    else if (args.acwr_value < 0.5) parts.push(`${en ? "undertraining" : "undirvinnsla"} (ACWR ${args.acwr_value.toFixed(2)})`);
  } else if (args.acwr_flag === "yellow" && args.acwr_value != null) {
    parts.push(`ACWR ${args.acwr_value.toFixed(2)} (${en ? "outside sweet spot" : "utan sweet spot"})`);
  }
  if (args.mcburnie_flag === "red") parts.push(en ? "decel overload (lots of braking, not enough sprint)" : "decel overload (mikið brake-work án nóg sprint)");
  else if (args.mcburnie_flag === "yellow") parts.push(en ? "decel:intensity imbalance" : "decel:intensity skekkja");
  return parts.join(" + ") || "—";
}

/**
 * Synthesize player's load signals + injury status into a single coaching action.
 *
 * Priority order (injury overrides load):
 *   - status='injured' → INJURED
 *   - status='rehabilitation' → REHAB
 *   - status='rtp_training' → RTP
 *   - Any RED flag (composite=spike, acwr=red, mcburnie=red) → RECOVERY
 *   - Two+ YELLOW flags → MODIFIED
 *   - One YELLOW flag → MODIFIED (cautious)
 *   - All GREEN → FULL
 *   - No data → NO_DATA
 */
function recommendAction(status: IndoorStatus | null, injury: InjuryInfo | null): Action {
  // Illness override — body_part='Illness' marker takes precedence over injury verdicts
  if (injury?.status && injury.status !== "cleared" && isIllnessRecord(injury.body_part)) {
    return injury.status === "injured" ? "ILL" : "RECOVERING_ILL";
  }
  // Injury override — takes precedence over load signals
  if (injury?.status === "injured") return "INJURED";
  if (injury?.status === "rehabilitation") return "REHAB";
  if (injury?.status === "rtp_training") return "RTP";

  if (!status || status.indoor_sessions_28d === 0) return "NO_DATA";

  const compositeFlag: "green" | "yellow" | "red" | null =
    status.composite_score_band === "spike" ? "red"
      : status.composite_score_band === "heavy" ? "yellow"
      : status.composite_score_band === "typical" || status.composite_score_band === "below_average" ? "green"
      : status.composite_score_band === "light" ? "yellow"
      : null;
  const acwrFlag = status.acwr?.flag ?? null;
  const mcburnieFlag = status.indoor_mcburnie?.flag ?? null;

  const flags = [compositeFlag, acwrFlag, mcburnieFlag].filter((f) => f != null);
  if (flags.length === 0) return "NO_DATA";

  if (flags.includes("red")) return "RECOVERY";
  const yellowCount = flags.filter((f) => f === "yellow").length;
  if (yellowCount > 0) return "MODIFIED";
  return "FULL";
}

// Color per FMP intensity band (low → high intensity)
const FMP_BAND_COLORS: Array<{ key: keyof FmpBands; label: string; color: string }> = [
  { key: "very_low_s", label: "Very Low", color: "bg-slate-300" },
  { key: "low_s", label: "Low", color: "bg-sky-300" },
  { key: "running_medium_s", label: "Running Med", color: "bg-emerald-400" },
  { key: "running_high_s", label: "Running High", color: "bg-emerald-600" },
  { key: "dynamic_low_s", label: "Dynamic Low", color: "bg-amber-300" },
  { key: "dynamic_medium_s", label: "Dynamic Med", color: "bg-amber-500" },
  { key: "dynamic_high_s", label: "Dynamic High", color: "bg-rose-500" },
];

type InjuryInfo = {
  status: "injured" | "rehabilitation" | "rtp_training" | "cleared" | null;
  rtp_stage: number | null;
  body_part: string | null;
  injury_type: string | null;
  estimated_return: string | null;
  severity: string | null;
};

type Row = {
  player_id: string;
  full_name: string;
  status: IndoorStatus | null;
  injury: InjuryInfo | null;
  // Brown 2016 — latest session activity classification + corrected MP
  // for transparency only (Indoor Composite is intentionally MP-free).
  brown: {
    date: string;
    activity_class: string | null;
    mp_raw: number | null;
    mp_corrected: number | null;
  } | null;
};

const FLAG_COLORS: Record<Flag | "none", string> = {
  green: "bg-emerald-50 border-emerald-300 text-emerald-900",
  yellow: "bg-amber-50 border-amber-300 text-amber-900",
  red: "bg-rose-50 border-rose-300 text-rose-900",
  none: "bg-slate-50 border-slate-200 text-slate-500",
};

const FLAG_DOT: Record<Flag | "none", string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-rose-500",
  none: "bg-slate-300",
};

// ── Page-level UI strings ───────────────────────────────────────────────
const PAGE_I18N = {
  pageTitle: { EN: "Indoor Load Intelligence", IS: "Indoor Load Intelligence" },
  pageSubtitle: {
    EN: "Höll-mode load monitoring built on Football Movement Profile (FMP). Auto-detects indoor sessions from low velocity-band 6 + meaningful FMP activity.",
    IS: "Höll-mode álagsgreining byggð á Football Movement Profile (FMP). Auto-greinir innan-húss sessions út frá lágu velocity-band 6 og marktækri FMP-virkni.",
  },
  refresh: { EN: "Refresh", IS: "Endurnýja" },
  loadingData: { EN: "Loading indoor load data…", IS: "Sæki indoor load gögn…" },
  notSignedIn: { EN: "Not signed in", IS: "Ekki innskráður" },
  noTeam: { EN: "Not connected to a team", IS: "Ekki tengdur við lið" },
  errorLoading: { EN: "Error", IS: "Villa" },
  teamToday: { EN: "Team today", IS: "Liðið í dag" },
  ready: { EN: "ready", IS: "tilbúnir" },
  lighter: { EN: "lighter", IS: "léttari" },
  rest: { EN: "rest", IS: "hvíld" },
  injured: { EN: "injured", IS: "meiddir" },
  sick: { EN: "sick", IS: "veikir" },
  topConcerns: { EN: "Top concerns", IS: "Top concerns" },
  morePlayers: { EN: "more players — see list below", IS: "fleiri leikmenn — sjá lista neðar" },
  withIndoorData: { EN: "Players with indoor data", IS: "Leikmenn með indoor data" },
  heavyOrSpike: { EN: "Heavy / Spike", IS: "Heavy / Spike" },
  typicalSession: { EN: "Typical session", IS: "Typical session" },
  lightOrBelow: { EN: "Light / Below avg", IS: "Light / Below avg" },
  indoorSessions7d: { EN: "Indoor sessions last 7d", IS: "Indoor sessions sl. 7d" },
  noIndoorSession: { EN: "— no indoor session in last 28d", IS: "— engin indoor session sl. 28d" },
  indoorIn28d: { EN: "indoor (28d)", IS: "indoor (28d)" },
  illness: { EN: "Illness", IS: "Veikindi" },
  injury: { EN: "Injury", IS: "Meiðsl" },
  estimatedReturn: { EN: "estimated return", IS: "endurkoma" },
  rtp: { EN: "RTP", IS: "RTP" },
  activeIllness: { EN: "🤒 Active illness", IS: "🤒 Active veikindi" },
  activeInjury: { EN: "Active injury", IS: "Active meiðsli" },
  rtpStage: { EN: "RTP stage", IS: "RTP stage" },
  estReturnLabel: { EN: "Estimated return", IS: "Áætluð endurkoma" },
  readyToday: { EN: "Ready today?", IS: "Tilbúinn í dag?" },
  whyHeading: { EN: "Why", IS: "Hvers vegna" },
  coachGuidance: { EN: "Coach guidance", IS: "Þjálfara-leiðbeining" },
  fullSignals: { EN: "All signals within healthy range — no warning flags", IS: "Allir signal innan heilbrigðs sviðs — engin warning flag" },
  compositeScoreTitle: { EN: "Composite Indoor Load Score", IS: "Composite Indoor Load Score" },
  vsBaseline: { EN: "(100 = personal 28d avg)", IS: "(100 = personal 28d avg)" },
  latestSession: { EN: "Latest indoor session", IS: "Síðasta indoor session" },
  personalBaseline: { EN: "Personal baseline (28d indoor)", IS: "Personal baseline (28d indoor)" },
  recent7dCumulative: { EN: "Last 7 days (cumulative)", IS: "Sl. 7 dagar (cumulative)" },
  playerLoad: { EN: "Player Load", IS: "Player Load" },
  duration: { EN: "Duration", IS: "Lengd" },
  min: { EN: "min", IS: "mín" },
  dynamicHigh: { EN: "Dynamic High %", IS: "Dynamic High %" },
  hmldM: { EN: "HMLD (m)", IS: "HMLD (m)" },
  imaTotal: { EN: "IMA total", IS: "IMA total" },
  decelB23: { EN: "Decel B2-3", IS: "Decel B2-3" },
  avgPlayerLoad: { EN: "Avg Player Load", IS: "Avg Player Load" },
  avgDuration: { EN: "Avg duration", IS: "Avg lengd" },
  avgDynHighPct: { EN: "Avg Dyn High %", IS: "Avg Dyn High %" },
  avgHmldM: { EN: "Avg HMLD (m)", IS: "Avg HMLD (m)" },
  avgImaTotal: { EN: "Avg IMA total", IS: "Avg IMA total" },
  avgDecelB23: { EN: "Avg Decel B2-3", IS: "Avg Decel B2-3" },
  indoorSessionsLabel: { EN: "Indoor sessions", IS: "Indoor sessions" },
  playerLoadTotal: { EN: "Player Load total", IS: "Player Load samtals" },
  dynHighSec: { EN: "Dyn High (sec)", IS: "Dyn High (sek)" },
  indoorMcburnieProxy: { EN: "Indoor McBurnie proxy", IS: "Indoor McBurnie proxy" },
  decelsPerMinDynHigh: { EN: "decels / min Dyn High (healthy", IS: "decels / mín Dyn High (heilbrigt" },
  acwrTitle: { EN: "ACWR (Gabbett 2017)", IS: "ACWR (Gabbett 2017)" },
  acwrSubtitle: { EN: "7d / 28d-week-avg (0.8–1.3 = familiar range)", IS: "7d / 28d-week-avg (0.8–1.3 = venjulegt bil)" },
  // Team status sentence parts
  allReadyToday: { EN: "All players ready for full program today", IS: "Allir leikmenn tilbúnir í fullt prógram í dag" },
  needsRest: { EN: "need rest", IS: "þurfa hvíld" },
  needsLighter: { EN: "need a lighter session", IS: "þurfa léttari æfingu" },
  inMeidsl: { EN: "in injury/RTP", IS: "í meiðslum/RTP" },
  // Concern reasons
  illNoTraining: { EN: "Sick — no training", IS: "Veikindi — engin æfing" },
  recoveringFromIll: { EN: "Recovering from illness", IS: "Á batavegi eftir veikindi" },
  acuteInjury: { EN: "Acute injury", IS: "Acute meiðsl" },
  rehabSuffix: { EN: "rehab", IS: "endurhæfing" },
  rehabilitation: { EN: "Rehabilitation", IS: "Endurhæfing" },
  rtpStageSuffix: { EN: "stage", IS: "stage" },
  // Heatmap
  teamHeatmapTitle: { EN: "Team load heatmap (14 days)", IS: "Team load heatmap (14 dagar)" },
  teamHeatmapSubtitle: {
    EN: "Each cell = one session colored by composite score. Inner red border = indoor.",
    IS: "Hver reitur = ein session colored eftir composite score. Innri rauður border = indoor.",
  },
  legendLight: { EN: "Light", IS: "Light" },
  legendBelow: { EN: "Below", IS: "Below" },
  legendTypical: { EN: "Typical", IS: "Typical" },
  legendHeavy: { EN: "Heavy", IS: "Heavy" },
  legendSpike: { EN: "Spike", IS: "Spike" },
  player: { EN: "Player", IS: "Leikmaður" },
  rest_label: { EN: "rest", IS: "hvíld" },
  // FMP movement bars
  fmpDistribution: { EN: "FMP movement distribution (latest indoor session)", IS: "FMP movement distribution (síðasta indoor session)" },
  minTotal: { EN: "min total", IS: "mín alls" },
  // Sparkline
  loadTrend14d: { EN: "14-day load trend", IS: "14-day load trend" },
  indoor: { EN: "Indoor", IS: "Indoor" },
  outdoor: { EN: "Outdoor", IS: "Outdoor" },
  // Methodology footer
  methodology: { EN: "Methodology", IS: "Aðferðafræði" },
} as const;
function pt(key: keyof typeof PAGE_I18N, lang: Lang): string {
  return lang === "IS" ? PAGE_I18N[key].IS : PAGE_I18N[key].EN;
}

export default function CoachIndoorLoadPage() {
  const [lang] = useLang();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        setError(pt("notSignedIn", lang));
        return;
      }
      const { data: profile } = await sb
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .maybeSingle();
      const tid = (profile as { team_id?: string } | null)?.team_id;
      if (!tid) {
        setError(pt("noTeam", lang));
        return;
      }

      const { data: roster } = await sb
        .from("players")
        .select("id, full_name")
        .eq("team_id", tid)
        .order("full_name");
      const players = (roster ?? []) as Array<{ id: string; full_name: string }>;
      if (players.length === 0) {
        setRows([]);
        return;
      }

      // Fetch from BOTH player_injuries AND injury_events + recent training data
      // (last for illness auto-promote when player resumes training)
      const playerIds = players.map((p) => p.id);
      const todayStr = new Date().toISOString().slice(0, 10);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

      // Brown 2016 — pull latest session's activity classification + corrected MP
      // for an informational disclosure block. Indoor Composite itself is IMU-only
      // (designed without MP since Brown 2016 confirms GPS-MP is unreliable indoors)
      // so this is purely transparency about the raw vs corrected metabolic power.
      const brownLookup = await sb
        .from("player_external_load_daily")
        .select("player_id, date, activity_class_brown, metabolic_power_peak, metabolic_power_corrected_brown")
        .in("player_id", playerIds)
        .gte("date", sevenDaysAgoStr)
        .not("activity_class_brown", "is", null)
        .order("date", { ascending: false });
      const brownByPlayer = new Map<string, {
        date: string;
        activity_class: string | null;
        mp_raw: number | null;
        mp_corrected: number | null;
      }>();
      for (const b of (brownLookup.data ?? []) as Array<Record<string, unknown>>) {
        const pid = String(b.player_id);
        if (brownByPlayer.has(pid)) continue; // keep latest only
        brownByPlayer.set(pid, {
          date: String(b.date),
          activity_class: (b.activity_class_brown as string | null) ?? null,
          mp_raw: b.metabolic_power_peak != null ? Number(b.metabolic_power_peak) : null,
          mp_corrected: b.metabolic_power_corrected_brown != null ? Number(b.metabolic_power_corrected_brown) : null,
        });
      }

      const [results, piResp, ieResp, trainingResp] = await Promise.all([
        Promise.all(
          players.map(async (p) => {
            const { data, error: rpcErr } = await sb.rpc("get_indoor_load_status", {
              p_player_id: p.id,
            });
            if (rpcErr) console.warn(`Indoor status failed for ${p.full_name}:`, rpcErr);
            return {
              player_id: p.id,
              full_name: (p.full_name ?? "—").trim(),
              status: (data as IndoorStatus | null) ?? null,
              injury: null as InjuryInfo | null,
              brown: brownByPlayer.get(p.id) ?? null,
            };
          }),
        ),
        sb
          .from("player_injuries")
          .select("player_id, status, rtp_stage, body_part, injury_type, estimated_return_date, severity, injury_date")
          .in("player_id", playerIds)
          .order("injury_date", { ascending: false }),
        sb
          .from("injury_events")
          .select("player_id, injury_type, body_side, severity, is_active, return_date, injury_date")
          .in("player_id", playerIds)
          .eq("is_active", true)
          .order("injury_date", { ascending: false }),
        sb
          .from("player_external_load_daily")
          .select("player_id, date, total_player_load")
          .in("player_id", playerIds)
          .eq("source", "catapult")
          .gte("date", sevenDaysAgoStr)
          .gt("total_player_load", 0)
          .order("date", { ascending: false }),
      ]);

      // Build training history map for illness auto-promote
      const trainingDatesByPlayer = new Map<string, string[]>();
      for (const t of (trainingResp.data ?? []) as Array<Record<string, unknown>>) {
        const pid = String(t.player_id);
        const list = trainingDatesByPlayer.get(pid) ?? [];
        list.push(String(t.date));
        trainingDatesByPlayer.set(pid, list);
      }
      const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

      function resolveIllnessStatus(
        pid: string,
        illnessDate: string | null,
      ): "injured" | "rehabilitation" | null {
        const dates = trainingDatesByPlayer.get(pid) ?? [];
        const trainedAfterIllness = illnessDate ? dates.some((d) => d > illnessDate) : false;
        const trainedRecently = dates.length > 0 && (dates[0] === todayStr || dates[0] === yesterdayStr);
        const daysSinceLogged = illnessDate
          ? Math.floor((Date.now() - new Date(illnessDate).getTime()) / 86_400_000)
          : 0;
        if (daysSinceLogged >= 7 && trainedAfterIllness) return null;
        if (trainedRecently || trainedAfterIllness) return "rehabilitation";
        return "injured";
      }

      // Merge: injury_events first (lower precedence), player_injuries overwrites
      const injuryByPlayer = new Map<string, InjuryInfo>();
      for (const ev of (ieResp.data ?? []) as Array<Record<string, unknown>>) {
        const pid = String(ev.player_id);
        if (injuryByPlayer.has(pid)) continue;
        const evType = String(ev.injury_type ?? "");
        const isIllness = evType === "illness";
        const illnessDate = typeof ev.injury_date === "string" ? ev.injury_date : null;
        let effectiveStatus: InjuryInfo["status"] = "injured";
        if (isIllness) {
          const resolved = resolveIllnessStatus(pid, illnessDate);
          if (resolved == null) continue;
          effectiveStatus = resolved;
        }
        injuryByPlayer.set(pid, {
          status: effectiveStatus,
          rtp_stage: null,
          body_part: isIllness ? "Illness" : evType.replace(/_/g, " "),
          injury_type: isIllness ? pt("illness", lang) : evType.replace(/_/g, " "),
          estimated_return: typeof ev.return_date === "string" ? ev.return_date : null,
          severity: typeof ev.severity === "string" ? ev.severity : null,
        });
      }
      for (const inj of (piResp.data ?? []) as Array<Record<string, unknown>>) {
        const pid = String(inj.player_id);
        const status = inj.status as InjuryInfo["status"];
        if (status !== "injured" && status !== "rehabilitation" && status !== "rtp_training") continue;
        // Only overwrite injury_events fallback when player_injuries has RTP-stage data
        const existing = injuryByPlayer.get(pid);
        if (existing && existing.rtp_stage != null) continue;
        injuryByPlayer.set(pid, {
          status,
          rtp_stage: typeof inj.rtp_stage === "number" ? inj.rtp_stage : null,
          body_part: typeof inj.body_part === "string" ? inj.body_part : null,
          injury_type: typeof inj.injury_type === "string" ? inj.injury_type : null,
          estimated_return: typeof inj.estimated_return_date === "string" ? inj.estimated_return_date : null,
          severity: typeof inj.severity === "string" ? inj.severity : null,
        });
      }
      for (const r of results) {
        r.injury = injuryByPlayer.get(r.player_id) ?? null;
      }

      // Sort by ACTION priority — illness first (contagion), then injuries, then load.
      // Tie-break by composite score DESC (so heaviest within band shows first).
      const actionOrder: Record<Action, number> = {
        ILL: 0,
        RECOVERING_ILL: 1,
        INJURED: 2,
        REHAB: 3,
        RTP: 4,
        RECOVERY: 5,
        MODIFIED: 6,
        FULL: 7,
        NO_DATA: 8,
      };
      const sorted = results.sort((a, b) => {
        const aAction = recommendAction(a.status, a.injury);
        const bAction = recommendAction(b.status, b.injury);
        if (aAction !== bAction) return actionOrder[aAction] - actionOrder[bAction];
        const aScore = a.status?.composite_score ?? -1;
        const bScore = b.status?.composite_score ?? -1;
        if (aScore !== bScore) return bScore - aScore;
        return a.full_name.localeCompare(b.full_name);
      });
      setRows(sorted);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : pt("errorLoading", lang);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Team-level summary stats + action distribution
  const teamStats = React.useMemo(() => {
    // Include players with indoor data OR active injury (so injured players show)
    const relevant = rows.filter(
      (r) =>
        (r.status?.indoor_sessions_28d ?? 0) > 0 ||
        (r.injury?.status && r.injury.status !== "cleared"),
    );
    const withIndoor = rows.filter((r) => (r.status?.indoor_sessions_28d ?? 0) > 0);
    const heavyOrSpike = withIndoor.filter(
      (r) =>
        r.status?.composite_score_band === "heavy" ||
        r.status?.composite_score_band === "spike",
    ).length;
    const typicalCount = withIndoor.filter((r) => r.status?.composite_score_band === "typical").length;
    const lightOrLow = withIndoor.filter(
      (r) =>
        r.status?.composite_score_band === "light" ||
        r.status?.composite_score_band === "below_average",
    ).length;
    const totalIndoorSessions7d = withIndoor.reduce(
      (sum, r) => sum + (r.status?.indoor_sessions_7d ?? 0),
      0,
    );
    // Action distribution — injuries + illness counted separately
    const actionsCount = {
      FULL: 0, MODIFIED: 0, RECOVERY: 0, NO_DATA: 0,
      INJURED: 0, REHAB: 0, RTP: 0,
      ILL: 0, RECOVERING_ILL: 0,
    } as Record<Action, number>;
    const concernPlayers: Array<{ name: string; action: Action; reason: string }> = [];
    for (const r of relevant) {
      const action = recommendAction(r.status, r.injury);
      actionsCount[action]++;
      if (action !== "FULL" && action !== "NO_DATA") {
        // Reason: illness > injury > load
        let reason: string;
        if (action === "ILL") {
          reason = pt("illNoTraining", lang);
        } else if (action === "RECOVERING_ILL") {
          reason = pt("recoveringFromIll", lang);
        } else if (r.injury?.status === "injured") {
          reason = r.injury.body_part
            ? `${r.injury.body_part} (${pt("acuteInjury", lang).toLowerCase()})`
            : pt("acuteInjury", lang);
        } else if (r.injury?.status === "rehabilitation") {
          reason = r.injury.body_part
            ? `${r.injury.body_part} — ${pt("rehabSuffix", lang)}`
            : pt("rehabilitation", lang);
        } else if (r.injury?.status === "rtp_training") {
          const stage = r.injury.rtp_stage != null ? ` (${pt("rtpStageSuffix", lang)} ${r.injury.rtp_stage}/5)` : "";
          reason = r.injury.body_part ? `${r.injury.body_part} — RTP${stage}` : `RTP${stage}`;
        } else {
          reason = buildLoadReason({
            composite_band: r.status?.composite_score_band,
            acwr_value: r.status?.acwr?.value,
            acwr_flag: r.status?.acwr?.flag,
            mcburnie_flag: r.status?.indoor_mcburnie?.flag,
          }, lang);
        }
        concernPlayers.push({ name: r.full_name, action, reason });
      }
    }
    // Team-level status: derive from action distribution (illness + injury aware)
    const totalInjured = actionsCount.INJURED + actionsCount.REHAB + actionsCount.RTP;
    const totalIll = actionsCount.ILL + actionsCount.RECOVERING_ILL;
    let teamAction: Action = "FULL";
    let teamSentence = pt("allReadyToday", lang);
    const sentenceParts: string[] = [];
    if (totalIll > 0) {
      sentenceParts.push(`${totalIll} ${pt("sick", lang)}`);
      teamAction = "MODIFIED";
    }
    if (totalInjured > 0) {
      sentenceParts.push(`${totalInjured} ${pt("inMeidsl", lang)}`);
      teamAction = "MODIFIED";
    }
    if (actionsCount.RECOVERY >= 1) {
      sentenceParts.push(`${actionsCount.RECOVERY} ${pt("needsRest", lang)}`);
      teamAction = "RECOVERY";
    }
    if (actionsCount.MODIFIED >= 1) {
      sentenceParts.push(`${actionsCount.MODIFIED} ${pt("needsLighter", lang)}`);
      if (teamAction === "FULL") teamAction = "MODIFIED";
    }
    if (sentenceParts.length > 0) {
      teamSentence = `${actionsCount.FULL} ${pt("ready", lang)}, ${sentenceParts.join(", ")}`;
    }
    // Sort concerns: illness first (contagion + cardio risk), then injuries, then load
    const concernOrder: Record<Action, number> = {
      ILL: 0, RECOVERING_ILL: 1, INJURED: 2, REHAB: 3, RTP: 4, RECOVERY: 5, MODIFIED: 6, FULL: 7, NO_DATA: 8,
    };
    return {
      withIndoor: withIndoor.length,
      heavyOrSpike,
      typicalCount,
      lightOrLow,
      totalInjured,
      totalIll,
      totalIndoorSessions7d,
      actionsCount,
      concernPlayers: concernPlayers.sort((a, b) => {
        const ao = concernOrder[a.action];
        const bo = concernOrder[b.action];
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name);
      }),
      teamAction,
      teamSentence,
    };
  }, [rows]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <LiteTierBanner
        feature="Indoor Load"
        reasonIs="Indoor Load reiknar úr FMP IMA-bands gögnum sem eru ekki tiltæk á núverandi Catapult-pakkanum ykkar."
        reasonEn="Indoor Load is computed from FMP IMA-band data that's not included in your current Catapult plan."
      />
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            <Link href="/coach" className="hover:text-slate-700">
              Coach
            </Link>
            <span>›</span>
            <span>Indoor Load</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{pt("pageTitle", lang)}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {pt("pageSubtitle", lang)}
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? (lang === "IS" ? "Sæki…" : "Loading…") : pt("refresh", lang)}
        </button>
      </div>

      {/* ── Team Status Banner — single sentence + traffic-light color ── */}
      {!loading && rows.length > 0 && teamStats.withIndoor > 0 && (
        <div
          className={`mb-4 rounded-lg border p-4 ${
            teamStats.teamAction === "RECOVERY"
              ? "border-rose-300 bg-rose-50"
              : teamStats.teamAction === "MODIFIED"
              ? "border-amber-300 bg-amber-50"
              : "border-emerald-300 bg-emerald-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`inline-block h-3 w-3 rounded-full ${
                teamStats.teamAction === "RECOVERY"
                  ? "bg-rose-500"
                  : teamStats.teamAction === "MODIFIED"
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
            />
            <div className="flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {pt("teamToday", lang)}
              </div>
              <div className="mt-0.5 text-base font-semibold text-slate-900">
                {teamStats.teamSentence}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                ✅ {teamStats.actionsCount.FULL} {pt("ready", lang)}
              </span>
              <span className="rounded-md bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                ⚠️ {teamStats.actionsCount.MODIFIED} {pt("lighter", lang)}
              </span>
              <span className="rounded-md bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">
                🛑 {teamStats.actionsCount.RECOVERY} {pt("rest", lang)}
              </span>
              {teamStats.totalInjured > 0 && (
                <span className="rounded-md bg-violet-100 px-2 py-0.5 font-semibold text-violet-700">
                  🏥 {teamStats.totalInjured} {pt("injured", lang)}
                </span>
              )}
              {teamStats.totalIll > 0 && (
                <span className="rounded-md bg-teal-100 px-2 py-0.5 font-semibold text-teal-700">
                  🤒 {teamStats.totalIll} {pt("sick", lang)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Top concerns — players needing coach attention today ── */}
      {!loading && teamStats.concernPlayers.length > 0 && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {pt("topConcerns", lang)} ({teamStats.concernPlayers.length})
          </div>
          <ul className="space-y-1.5">
            {teamStats.concernPlayers.slice(0, 6).map((c) => (
              <li key={c.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      c.action === "RECOVERY" ? "bg-rose-500" : "bg-amber-500"
                    }`}
                  />
                  <span className="font-medium text-slate-900">{c.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-500">{c.reason}</span>
                  {(() => {
                    const cInfo = actionLabels(c.action, lang);
                    return (
                      <span className={`rounded px-2 py-0.5 font-semibold ${cInfo.color}`}>
                        {cInfo.icon} {cInfo.label}
                      </span>
                    );
                  })()}
                </div>
              </li>
            ))}
            {teamStats.concernPlayers.length > 6 && (
              <li className="pt-1 text-xs text-slate-500">
                + {teamStats.concernPlayers.length - 6} {pt("morePlayers", lang)}
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Team summary */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label={pt("withIndoorData", lang)} value={String(teamStats.withIndoor)} />
        <SummaryCard
          label={pt("heavyOrSpike", lang)}
          value={String(teamStats.heavyOrSpike)}
          accent="text-rose-700"
        />
        <SummaryCard
          label={pt("typicalSession", lang)}
          value={String(teamStats.typicalCount)}
          accent="text-emerald-700"
        />
        <SummaryCard
          label={pt("lightOrBelow", lang)}
          value={String(teamStats.lightOrLow)}
          accent="text-sky-700"
        />
        <SummaryCard
          label={pt("indoorSessions7d", lang)}
          value={String(teamStats.totalIndoorSessions7d)}
        />
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading && rows.length === 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          {pt("loadingData", lang)}
        </div>
      )}

      {/* Team-wide 14-day heatmap — at-a-glance roster overview */}
      {!loading && rows.length > 0 && <TeamHeatmap rows={rows} lang={lang} />}

      {/* Player rows */}
      <div className="space-y-2">
        {rows.map((row) => {
          const flag: Flag | "none" = row.status?.indoor_mcburnie?.flag ?? "none";
          const noData = (row.status?.indoor_sessions_28d ?? 0) === 0;
          const isInjured =
            row.injury?.status === "injured" ||
            row.injury?.status === "rehabilitation" ||
            row.injury?.status === "rtp_training";
          const isIll = isInjured && isIllnessRecord(row.injury?.body_part);
          // Hide rows that have neither indoor data nor active injury/illness
          if (noData && !isInjured) return null;
          const isExpanded = expanded.has(row.player_id);
          const colorClass = isIll
            ? "bg-teal-50 border-teal-300 text-teal-900"
            : isInjured
            ? "bg-violet-50 border-violet-300 text-violet-900"
            : noData
            ? FLAG_COLORS.none
            : FLAG_COLORS[flag];

          return (
            <div
              key={row.player_id}
              className={`overflow-hidden rounded-lg border ${colorClass}`}
            >
              {/* Row header — clickable */}
              <button
                onClick={() => toggleExpand(row.player_id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-3">
                    {/* Plain-language readiness verdict — coach's primary signal */}
                    {(!noData || row.injury) && (() => {
                      const rowAction = actionLabels(recommendAction(row.status, row.injury), lang);
                      return (
                        <span
                          className={`shrink-0 rounded px-2 py-1 text-xs font-bold ${rowAction.color}`}
                          title={rowAction.recommendation}
                        >
                          {rowAction.icon} {rowAction.label}
                        </span>
                      );
                    })()}
                    <span className="truncate font-medium text-slate-900">{row.full_name}</span>
                    {noData && !row.injury ? (
                      <span className="text-xs text-slate-500">{pt("noIndoorSession", lang)}</span>
                    ) : !noData ? (
                      <span className="hidden text-xs text-slate-600 sm:inline">
                        {row.status!.indoor_sessions_28d}/{row.status!.total_sessions_28d} {pt("indoorIn28d", lang)}
                      </span>
                    ) : null}
                  </div>
                  {/* Injury / illness context line */}
                  {row.injury && (
                    <p
                      className={`ml-1 text-[11px] font-medium ${
                        isIll ? "text-teal-700" : "text-violet-700"
                      }`}
                    >
                      {isIll
                        ? `${pt("illness", lang)}${row.injury.injury_type ? ` (${row.injury.injury_type})` : ""}`
                        : `${row.injury.body_part ?? pt("injury", lang)}${row.injury.injury_type ? ` (${row.injury.injury_type})` : ""}${row.injury.rtp_stage != null ? ` · RTP ${row.injury.rtp_stage}/5` : ""}`}
                      {row.injury.estimated_return ? ` · ${pt("estimatedReturn", lang)} ${row.injury.estimated_return.slice(5)}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {!noData && row.status?.composite_score != null && row.status.composite_score_band && (
                    <span
                      className={`rounded-md px-2 py-0.5 text-sm font-bold tabular-nums ${SCORE_BAND_COLORS[row.status.composite_score_band]}`}
                      title={`Composite Indoor Load Score: ${scoreBandLabel(row.status.composite_score_band, lang)} (100 = personal avg)`}
                    >
                      {row.status.composite_score}
                    </span>
                  )}
                  {!noData && row.status?.acwr && (
                    <span
                      className={`hidden rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums sm:inline ${
                        row.status.acwr.flag === "red"
                          ? "bg-rose-100 text-rose-800"
                          : row.status.acwr.flag === "yellow"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                      title={`ACWR (Gabbett 2017): ${row.status.acwr.interpretation}`}
                    >
                      ACWR {row.status.acwr.value.toFixed(2)}
                    </span>
                  )}
                  {!noData && row.status?.indoor_mcburnie && (
                    <span className="hidden text-xs font-semibold tabular-nums text-slate-700 md:inline">
                      {row.status.indoor_mcburnie.decel_per_dyn_high_min.toFixed(2)} d/min
                    </span>
                  )}
                  <span className="text-xs text-slate-400">{isExpanded ? "▴" : "▾"}</span>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (row.status || row.injury) && (
                <div className="border-t border-current border-opacity-20 bg-white/60 px-4 py-4 text-sm text-slate-800">
                  {/* Active injury / illness detail box — shown FIRST */}
                  {row.injury && (
                    <div
                      className={`mb-4 rounded-lg border-2 p-4 ${
                        isIll ? "border-teal-300 bg-teal-50" : "border-violet-300 bg-violet-50"
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap items-baseline gap-2">
                        <span
                          className={`text-xs font-semibold uppercase tracking-wide ${
                            isIll ? "text-teal-700" : "text-violet-700"
                          }`}
                        >
                          {isIll ? pt("activeIllness", lang) : pt("activeInjury", lang)}
                        </span>
                        {row.injury.severity && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold capitalize ${
                              isIll ? "bg-teal-100 text-teal-700" : "bg-violet-100 text-violet-700"
                            }`}
                          >
                            {row.injury.severity}
                          </span>
                        )}
                        {!isIll && row.injury.rtp_stage != null && (
                          <span className="rounded border border-violet-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">
                            RTP stage {row.injury.rtp_stage}/5
                          </span>
                        )}
                      </div>
                      <p className="text-base font-bold text-slate-900">
                        {isIll
                          ? row.injury.injury_type ?? pt("illness", lang)
                          : `${row.injury.body_part ?? pt("injury", lang)}${row.injury.injury_type ? ` — ${row.injury.injury_type}` : ""}`}
                      </p>
                      {row.injury.estimated_return && (
                        <p className={`mt-1 text-sm ${isIll ? "text-teal-700" : "text-violet-700"}`}>
                          {pt("estReturnLabel", lang)}:{" "}
                          <span className="font-semibold">{row.injury.estimated_return}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Coach guidance box — TOP PRIORITY: clear yes/no + concrete recommendation */}
                  {(() => {
                    const action = recommendAction(row.status, row.injury);
                    const labelInfo = actionLabels(action, lang);
                    const reason = row.injury
                      ? labelInfo.sentence
                      : row.status
                      ? buildLoadReason({
                          composite_band: row.status.composite_score_band,
                          acwr_value: row.status.acwr?.value,
                          acwr_flag: row.status.acwr?.flag,
                          mcburnie_flag: row.status.indoor_mcburnie?.flag,
                        }, lang)
                      : "—";
                    const bannerBg =
                      action === "ILL" || action === "RECOVERING_ILL"
                        ? "border-teal-300 bg-teal-50"
                        : action === "INJURED" || action === "REHAB" || action === "RTP"
                        ? "border-violet-300 bg-violet-50"
                        : action === "RECOVERY" ? "border-rose-300 bg-rose-50"
                        : action === "MODIFIED" ? "border-amber-300 bg-amber-50"
                        : action === "FULL" ? "border-emerald-300 bg-emerald-50"
                        : "border-slate-200 bg-slate-50";
                    return (
                      <div className={`mb-4 rounded-lg border p-4 ${bannerBg}`}>
                        <div className="flex flex-wrap items-baseline gap-3">
                          <span className="text-2xl">{labelInfo.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {pt("readyToday", lang)}
                            </div>
                            <div className="mt-0.5 text-lg font-bold text-slate-900">
                              {labelInfo.sentence}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              {pt("whyHeading", lang)}
                            </div>
                            <div className="mt-0.5 text-sm text-slate-800">
                              {action === "FULL"
                                ? pt("fullSignals", lang)
                                : reason}
                            </div>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              {pt("coachGuidance", lang)}
                            </div>
                            <div className="mt-0.5 text-sm font-medium text-slate-900">
                              {labelInfo.recommendation}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Composite Score banner + 14-day sparkline + FMP movement bars */}
                  {row.status?.latest_session?.fmp_bands && row.status.composite_score != null && row.status.composite_score_band && (
                    <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
                      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {pt("compositeScoreTitle", lang)}
                          </span>
                          <div className="mt-0.5 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tabular-nums text-slate-900">
                              {row.status.composite_score}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-xs font-semibold ${SCORE_BAND_COLORS[row.status.composite_score_band]}`}
                            >
                              {scoreBandLabel(row.status.composite_score_band, lang)}
                            </span>
                            <span className="text-xs text-slate-500">
                              {pt("vsBaseline", lang)}
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* 14-day trend sparkline */}
                      {row.status.history_14d && row.status.history_14d.length > 0 && (
                        <div className="mb-3">
                          <HistorySparkline history={row.status.history_14d} lang={lang} />
                        </div>
                      )}
                      <FmpMovementBars bands={row.status.latest_session.fmp_bands} lang={lang} />
                    </div>
                  )}

                  {row.status && !noData && (
                  <div className="grid gap-4 md:grid-cols-3">
                    {/* Latest session */}
                    {row.status.latest_session && (
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {pt("latestSession", lang)} ({row.status.latest_session.date})
                        </div>
                        <dl className="space-y-1 tabular-nums">
                          <Stat label={pt("playerLoad", lang)} value={row.status.latest_session.player_load} />
                          <Stat
                            label={pt("duration", lang)}
                            value={`${row.status.latest_session.duration_min} ${pt("min", lang)}`}
                          />
                          <Stat
                            label={pt("dynamicHigh", lang)}
                            value={
                              row.status.latest_session.dyn_high_pct != null
                                ? `${row.status.latest_session.dyn_high_pct.toFixed(2)}%`
                                : null
                            }
                          />
                          <Stat label={pt("hmldM", lang)} value={row.status.latest_session.hmld_m} />
                          <Stat label={pt("imaTotal", lang)} value={row.status.latest_session.ima_total} />
                          <Stat label={pt("decelB23", lang)} value={row.status.latest_session.decel_b23} />
                        </dl>

                        {/* Brown 2016 — activity classification + corrected MP transparency.
                            Indoor Composite is intentionally MP-free (since Brown 2016 confirms
                            GPS-MP is unreliable indoors), but we surface raw vs corrected so
                            coaches see the bias if they look at MP elsewhere. */}
                        {row.brown && (
                          <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] text-slate-600">
                            <div className="font-semibold">
                              Brown 2016: <span className="capitalize">{row.brown.activity_class}</span>
                            </div>
                            {row.brown.mp_raw != null && row.brown.mp_corrected != null && (
                              <div className="tabular-nums">
                                MP raw {row.brown.mp_raw.toFixed(1)} → corrected {row.brown.mp_corrected.toFixed(1)} W/kg
                                <span className="text-slate-400"> (±20% bias)</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Baseline 28d */}
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {pt("personalBaseline", lang)}
                      </div>
                      <dl className="space-y-1 tabular-nums">
                        <Stat
                          label={pt("avgPlayerLoad", lang)}
                          value={row.status.baseline_indoor.avg_player_load}
                        />
                        <Stat
                          label={pt("avgDuration", lang)}
                          value={`${row.status.baseline_indoor.avg_duration_min} ${pt("min", lang)}`}
                        />
                        <Stat
                          label={pt("avgDynHighPct", lang)}
                          value={`${row.status.baseline_indoor.avg_dyn_high_pct.toFixed(2)}%`}
                        />
                        <Stat
                          label={pt("avgHmldM", lang)}
                          value={row.status.baseline_indoor.avg_hmld_m}
                        />
                        <Stat
                          label={pt("avgImaTotal", lang)}
                          value={row.status.baseline_indoor.avg_ima_total}
                        />
                        <Stat
                          label={pt("avgDecelB23", lang)}
                          value={row.status.baseline_indoor.avg_decel_b23}
                        />
                      </dl>
                    </div>

                    {/* 7-day cumulative + McBurnie */}
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {pt("recent7dCumulative", lang)}
                      </div>
                      <dl className="space-y-1 tabular-nums">
                        <Stat label={pt("indoorSessionsLabel", lang)} value={row.status.recent_7d.sessions} />
                        <Stat
                          label={pt("playerLoadTotal", lang)}
                          value={row.status.recent_7d.sum_player_load}
                        />
                        <Stat
                          label={pt("dynHighSec", lang)}
                          value={row.status.recent_7d.sum_dyn_high_s}
                        />
                        <Stat label={pt("decelB23", lang)} value={row.status.recent_7d.sum_decel_b23} />
                      </dl>

                      {row.status.indoor_mcburnie && (
                        <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {pt("indoorMcburnieProxy", lang)}
                          </div>
                          <div className="mt-1 flex items-baseline justify-between">
                            <span className="text-lg font-bold tabular-nums">
                              {row.status.indoor_mcburnie.decel_per_dyn_high_min.toFixed(2)}
                            </span>
                            <span className="text-xs text-slate-500">
                              {pt("decelsPerMinDynHigh", lang)} {row.status.indoor_mcburnie.healthy_range})
                            </span>
                          </div>
                          {row.status.indoor_mcburnie.interpretation && (
                            <div className="mt-2 text-xs leading-relaxed text-slate-600">
                              {row.status.indoor_mcburnie.interpretation}
                            </div>
                          )}
                        </div>
                      )}
                      {row.status.acwr && (
                        <div
                          className={`mt-2 rounded-md border px-3 py-2 ${
                            row.status.acwr.flag === "red"
                              ? "border-rose-300 bg-rose-50"
                              : row.status.acwr.flag === "yellow"
                              ? "border-amber-300 bg-amber-50"
                              : "border-emerald-200 bg-emerald-50"
                          }`}
                        >
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {pt("acwrTitle", lang)}
                          </div>
                          <div className="mt-1 flex items-baseline justify-between">
                            <span className="text-lg font-bold tabular-nums">
                              {row.status.acwr.value.toFixed(2)}
                            </span>
                            <span className="text-xs text-slate-500">
                              {pt("acwrSubtitle", lang)}
                            </span>
                          </div>
                          <div className="mt-1 text-xs leading-relaxed text-slate-700">
                            {row.status.acwr.interpretation}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Methodology footer */}
      <MethodologyFooter lang={lang} />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${accent ?? "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function TeamHeatmap({ rows, lang = "EN" }: { rows: Row[]; lang?: Lang }) {
  // 14 columns × N players. Each cell = composite score for that day.
  // Players with no recent indoor data are skipped.
  const playersWithHistory = rows.filter(
    (r) => r.status?.history_14d && r.status.history_14d.length > 0,
  );
  if (playersWithHistory.length === 0) return null;

  // Build 14-day window
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  function cellColor(score: number | null | undefined, isIndoor: boolean | undefined): string {
    if (score == null || score <= 0) return "bg-slate-50";
    const baseColor =
      score >= 140 ? "bg-rose-500"
        : score >= 110 ? "bg-amber-400"
        : score >= 90 ? "bg-emerald-400"
        : score >= 60 ? "bg-sky-300"
        : "bg-slate-300";
    return isIndoor ? `${baseColor} ring-1 ring-rose-700/30 ring-inset` : baseColor;
  }

  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-baseline justify-between border-b border-slate-100 px-4 py-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{pt("teamHeatmapTitle", lang)}</h3>
          <p className="text-xs text-slate-500">
            {pt("teamHeatmapSubtitle", lang)}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> {pt("legendLight", lang)}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-sky-300" /> {pt("legendBelow", lang)}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" /> {pt("legendTypical", lang)}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> {pt("legendHeavy", lang)}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> {pt("legendSpike", lang)}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] text-slate-500">
              <th className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left font-medium">
                {pt("player", lang)}
              </th>
              {days.map((d, i) => (
                <th
                  key={d}
                  className={`px-1 py-1.5 text-center font-medium tabular-nums ${
                    i === days.length - 1 ? "text-slate-700" : ""
                  }`}
                >
                  {d.slice(8)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {playersWithHistory.map((row) => {
              const history = row.status?.history_14d ?? [];
              return (
                <tr key={row.player_id} className="border-b border-slate-50 last:border-b-0">
                  <td className="sticky left-0 z-10 truncate bg-white px-3 py-1 text-left font-medium text-slate-800 max-w-[10rem]">
                    {row.full_name}
                  </td>
                  {days.map((d) => {
                    const point = history.find((h) => h.date === d) ?? null;
                    return (
                      <td key={d} className="px-0.5 py-0.5 text-center">
                        <div
                          className={`mx-auto h-5 w-full max-w-[1.5rem] rounded ${cellColor(point?.score, point?.is_indoor)}`}
                          title={
                            point
                              ? `${d}: ${point.score ?? "—"} (${point.is_indoor ? pt("indoor", lang) : pt("outdoor", lang)})`
                              : `${d}: ${pt("rest_label", lang)}`
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistorySparkline({ history, lang = "EN" }: { history: HistoryPoint[]; lang?: Lang }) {
  // Render last 14 days as a daily column chart with score values + indoor/outdoor coloring.
  // Empty days = rest, shown as faint grid background.
  if (history.length === 0) return null;

  // Build a 14-day window ending today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: Array<{ date: string; point: HistoryPoint | null }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const point = history.find((h) => h.date === iso) ?? null;
    days.push({ date: iso, point });
  }

  // Y-axis scale: 0..max(score, 150) so spikes fit
  const maxScore = Math.max(150, ...days.map((d) => d.point?.score ?? 0));
  const W = 280;
  const H = 64;
  const padX = 4;
  const padY = 6;
  const colW = (W - padX * 2) / days.length;
  const yFor = (score: number) => H - padY - ((score / maxScore) * (H - padY * 2));

  // Reference lines at 100 (baseline) and 140 (spike threshold)
  const baseY = yFor(100);
  const spikeY = yFor(140);

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex items-baseline justify-between border-b border-slate-100 px-2 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {pt("loadTrend14d", lang)}
        </span>
        <span className="text-[10px] text-slate-400">
          <span className="inline-block h-2 w-2 rounded-sm bg-rose-500"></span> {pt("indoor", lang)} &nbsp;
          <span className="inline-block h-2 w-2 rounded-sm bg-slate-400"></span> {pt("outdoor", lang)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" preserveAspectRatio="none">
        {/* Grid: spike threshold (rose) and baseline (slate) reference lines */}
        <line x1={padX} x2={W - padX} y1={spikeY} y2={spikeY} stroke="#fda4af" strokeWidth="0.6" strokeDasharray="2,2" />
        <line x1={padX} x2={W - padX} y1={baseY} y2={baseY} stroke="#cbd5e1" strokeWidth="0.6" strokeDasharray="2,2" />
        {/* Daily bars */}
        {days.map((day, i) => {
          const x = padX + i * colW + colW / 2;
          const score = day.point?.score ?? null;
          const isIndoor = day.point?.is_indoor ?? false;
          if (score == null || score <= 0) {
            // Rest day — faint dot at baseline
            return (
              <circle key={day.date} cx={x} cy={baseY} r="1" fill="#e2e8f0" />
            );
          }
          const y = yFor(score);
          const barH = H - padY - y;
          const fill =
            score >= 140 ? "#f43f5e" // spike → rose
              : score >= 110 ? "#f59e0b" // heavy → amber
              : score >= 90 ? "#10b981" // typical → emerald
              : score >= 60 ? "#0ea5e9" // below avg → sky
              : "#94a3b8"; // light → slate
          return (
            <g key={day.date}>
              <rect
                x={x - colW * 0.32}
                y={y}
                width={colW * 0.64}
                height={barH}
                fill={fill}
                rx="1"
              >
                <title>{`${day.date}: ${score} (${isIndoor ? pt("indoor", lang) : pt("outdoor", lang)})`}</title>
              </rect>
              {/* Indoor marker dot */}
              {isIndoor && (
                <circle cx={x} cy={y - 2} r="1.4" fill="#f43f5e">
                  <title>{`Indoor session — ${day.point?.duration_min ?? "?"} min`}</title>
                </circle>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between border-t border-slate-100 px-2 py-0.5 text-[9px] text-slate-400">
        <span>{days[0].date.slice(5)}</span>
        <span>{days[Math.floor(days.length / 2)].date.slice(5)}</span>
        <span>{days[days.length - 1].date.slice(5)}</span>
      </div>
    </div>
  );
}

function FmpMovementBars({ bands, lang = "EN" }: { bands: FmpBands; lang?: Lang }) {
  // Use total of the 7 movement bands (excludes total_s)
  const total =
    bands.very_low_s +
    bands.low_s +
    bands.running_medium_s +
    bands.running_high_s +
    bands.dynamic_low_s +
    bands.dynamic_medium_s +
    bands.dynamic_high_s;
  if (total <= 0) return null;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>{pt("fmpDistribution", lang)}</span>
        <span className="tabular-nums">{Math.round(total / 60)} {pt("minTotal", lang)}</span>
      </div>
      {/* Stacked horizontal bar */}
      <div className="flex h-6 w-full overflow-hidden rounded-md border border-slate-200 bg-white">
        {FMP_BAND_COLORS.map((band) => {
          const value = bands[band.key];
          const pct = total > 0 ? (value / total) * 100 : 0;
          if (pct < 0.5) return null;
          return (
            <div
              key={band.key}
              className={`${band.color} flex items-center justify-center text-[10px] font-semibold text-white`}
              style={{ width: `${pct}%` }}
              title={`${band.label}: ${Math.round(value)}s (${pct.toFixed(1)}%)`}
            >
              {pct >= 8 ? `${pct.toFixed(0)}%` : ""}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
        {FMP_BAND_COLORS.map((band) => {
          const value = bands[band.key];
          const pct = total > 0 ? (value / total) * 100 : 0;
          if (pct < 0.5) return null;
          return (
            <span key={band.key} className="inline-flex items-center gap-1">
              <span className={`h-2 w-2 rounded-sm ${band.color}`} />
              <span>
                {band.label}{" "}
                <span className="tabular-nums text-slate-500">{pct.toFixed(1)}%</span>
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number | string | null | undefined;
}) {
  const display =
    value == null
      ? "—"
      : typeof value === "number"
        ? Number.isInteger(value)
          ? String(value)
          : value.toFixed(1)
        : value;
  return (
    <div className="flex items-center justify-between text-xs">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{display}</dd>
    </div>
  );
}

// ── Methodology footer (bilingual) ──────────────────────────────────────────
function MethodologyFooter({ lang }: { lang: Lang }) {
  const isEN = lang === "EN";
  return (
    <details className="mt-8 rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
      <summary className="cursor-pointer font-semibold text-slate-800">
        {isEN ? "Methodology" : "Aðferðafræði"}
      </summary>
      <div className="mt-3 space-y-2">
        <p>
          <strong>{isEN ? "Indoor session auto-detection:" : "Auto-greining á indoor session:"}</strong>{" "}
          {isEN
            ? "A session counts as indoor if velocity_band6_total_distance < 50m and fmp_total_duration_s > 600s (10 min). This excludes outdoor sessions that capture true max-speed work and surfaces hall-based sessions where GPS-dependent metrics are uninformative."
            : "Session telst innan-húss ef velocity_band6_total_distance < 50m og fmp_total_duration_s > 600s (10 mín). Þetta útilokar útiæfingar sem mæla raunverulega max-hraða og fangar æfingar í höllum þar sem GPS-háðir mælar segja lítið."}
        </p>
        <p>
          <strong>{isEN ? "Composite Indoor Load Score (0-150+):" : "Composite Indoor Load Score (0-150+):"}</strong>{" "}
          {isEN
            ? "Weighted average of 3 IMU-native components normalized to the player's 28-day personal baseline."
            : "Vegið meðaltal af 3 IMU-native þáttum normaliseraðum við 28-daga personal baseline."}{" "}
          <strong>
            {isEN
              ? "100 = exactly an average session for that player."
              : "100 = nákvæmlega meðal-session þíns leikmanns."}
          </strong>{" "}
          {isEN
            ? "Weights: Player Load 40%, Dynamic High % 33%, IMA total 27%."
            : "Vegir: Player Load 40%, Dynamic High % 33%, IMA total 27%."}{" "}
          {isEN
            ? "HMLD and Decel B2-3 are excluded — Catapult derives those from GPS context, so they're noisy indoors. Both are still shown as session-context fields and feed the McBurnie indoor ratio."
            : "HMLD og Decel B2-3 eru útilokaðir — Catapult fær þau úr GPS context og verða því noisy inni. Báðir eru samt sýndir sem session-context og fara í McBurnie indoor ratio-inn."}
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>&lt; 60:</strong> {isEN ? "Light — recovery/walkthrough" : "Light — recovery/walkthrough"}
          </li>
          <li>
            <strong>60-90:</strong> {isEN ? "Below average — mild tactical" : "Below average — mild tactical"}
          </li>
          <li>
            <strong>90-110:</strong> {isEN ? "Typical — standard training" : "Typical — standard training"}
          </li>
          <li>
            <strong>110-140:</strong> {isEN ? "Heavy — match-style training" : "Heavy — match-style training"}
          </li>
          <li>
            <strong>&gt; 140:</strong>{" "}
            {isEN ? "Spike — overload risk if sustained" : "Spike — overload risk ef sustained"}
          </li>
        </ul>
        <p>
          <strong>FMP movement bars:</strong>{" "}
          {isEN
            ? "Stacked bar showing how session time was distributed across the 7 stride-velocity bands. Lots of red (Dynamic High) = high-intensity session. Lots of grey (Very Low) = recovery. IMU-based, works fully indoors."
            : "Stacked bar sem sýnir hvernig session-tími dreifðist á 7 stride-velocity bands. Mikið rautt (Dynamic High) = high-intensity session. Mikið grátt (Very Low) = recovery. Þetta er IMU-byggt og virkar fullkomlega indoor."}
        </p>
        <p>
          <strong>14-day load trend:</strong>{" "}
          {isEN ? (
            <>
              Daily composite score over the last 14 days. Each column is one session, colored by score band
              (slate/sky/emerald/amber/rose). A red dot above a column = indoor session. Empty days (faint dots) =
              recovery/rest. Dashed lines mark baseline (100) and spike threshold (140). Lets the coach see{" "}
              <em>trajectory</em> — is this player trending up, down, or stable.
            </>
          ) : (
            <>
              Daily composite score yfir síðustu 14 daga. Hver dálkur er ein session, litaður eftir score band
              (slate/sky/emerald/amber/rose). Rautt punktur ofan á dálki = indoor session. Tómir dagar (faint dots) =
              recovery/rest. Slitnar línur sýna baseline (100) og spike threshold (140). Þetta gerir þjálfara kleift
              að sjá <em>trajectory</em> — er þessi leikmaður á uppleið, niðurleið, eða stable.
            </>
          )}
        </p>
        <p>
          <strong>{isEN ? "Team load heatmap (top of page):" : "Team load heatmap (efst á síðu):"}</strong>{" "}
          {isEN ? (
            <>
              14×N grid showing the entire roster at once — each row is a player, each column is a day. Cell color
              = composite score band. Red inner border = indoor session. A <em>tactical overview</em> the coach can
              scan in 5 seconds to spot players with sustained spikes vs distributed load.
            </>
          ) : (
            <>
              14×N grid sem sýnir allt liðið í einu — hver röð er leikmaður, hver dálkur er dagur. Litur reitar =
              composite score band. Rauður innri border = indoor session. Þetta er <em>tactical overview</em> sem
              þjálfari getur scan-að á 5 sekúndum til að spot-a leikmenn með sustained spikes vs distributed load.
            </>
          )}
        </p>
        <p>
          <strong>ACWR (Acute:Chronic Workload Ratio, Gabbett 2017):</strong>{" "}
          {isEN
            ? "Weekly cumulative player load divided by the 28-day weekly average. Sweet spot 0.8-1.3 — indicates the player is adapted to the current load. A spike above 1.5 (acute spike) is associated with 2-4× higher injury risk."
            : "Vikulegt cumulative player load deilt með 28-day weekly average. Sweet spot 0.8-1.3 — sýnir að leikmaður er adapted til að höndla núverandi load. Hækkun yfir 1.5 (acute spike) tengist 2-4× hærri injury risk."}
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>0.8-1.3:</strong> 🟢 {isEN ? "Sweet spot — adapted, ready to perform" : "Sweet spot — adapted, ready to perform"}
          </li>
          <li>
            <strong>{isEN ? "0.5-0.8 or 1.3-1.5:" : "0.5-0.8 eða 1.3-1.5:"}</strong> 🟡{" "}
            {isEN ? "Caution — detraining or acute spike" : "Caution — detraining eða acute spike"}
          </li>
          <li>
            <strong>{isEN ? "< 0.5 or > 1.5:" : "< 0.5 eða > 1.5:"}</strong> 🔴{" "}
            {isEN
              ? "Danger zone — severe undertraining or elevated injury risk"
              : "Danger zone — severe undertraining eða elevated injury risk"}
          </li>
        </ul>
        <p>
          <strong>Indoor McBurnie proxy:</strong>{" "}
          {isEN
            ? "decel_b23_count / (FMP duration × Dynamic High %). Measures how many high-intensity decelerations a player performs per minute of high-intensity movement."
            : "decel_b23_count / (FMP duration × Dynamic High %). Mælir hversu margar high-intensity bremsanir leikmaður gerir per mínútu af high-intensity hreyfingu."}
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>1-10:</strong> 🟢{" "}
            {isEN
              ? "Healthy — normal indoor decel:intensity coupling"
              : "Healthy — eðlilegt indoor decel:intensity coupling"}
          </li>
          <li>
            <strong>{isEN ? "0.5-1 or 10-15:" : "0.5-1 eða 10-15:"}</strong> 🟡{" "}
            {isEN
              ? "Caution — either underload (little brake-work) or decel-heavy training"
              : "Caution — annað hvort underload (lítið brake-work) eða decel-heavy training"}
          </li>
          <li>
            <strong>{isEN ? "< 0.5 or > 15:" : "< 0.5 eða > 15:"}</strong> 🔴{" "}
            {isEN
              ? "At-risk — significant mismatch between brake-work and movement (overload or underwork)"
              : "At-risk — verulegt mismunur milli bremsuvinnu og hreyfingar (overload eða undirvinnsla)"}
          </li>
        </ul>
        <p>
          <strong>Source:</strong>{" "}
          {isEN
            ? "Football Movement Profile (Catapult OpenField, IMU-only, no GPS required), accelerometry IMA Accel/Decel/CoD, Player Load."
            : "Football Movement Profile (Catapult OpenField, IMU-only, engin GPS-þörf), accelerometry IMA Accel/Decel/CoD, Player Load."}
        </p>
        <p className="italic text-slate-500">
          Reference: McBurnie, Harper, Jones &amp; Dos&apos;Santos 2022 — Deceleration Training in Team Sports.
          Sports Medicine.
        </p>
      </div>
    </details>
  );
}

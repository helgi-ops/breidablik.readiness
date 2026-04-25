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

const SCORE_BAND_LABELS: Record<ScoreBand, string> = {
  light: "Light",
  below_average: "Below avg",
  typical: "Typical",
  heavy: "Heavy",
  spike: "Spike",
};

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

const ACTION_LABELS: Record<
  Action,
  {
    /** Short label for badge — plain Icelandic answer to "tilbúinn?" */
    label: string;
    /** Tailwind classes for badge background */
    color: string;
    /** Symbol prefix (✅ / ⚠️ / 🛑 / ❓) */
    icon: string;
    /** Single-line summary sentence */
    sentence: string;
    /** Concrete coaching recommendation */
    recommendation: string;
  }
> = {
  FULL: {
    label: "Tilbúinn",
    color: "bg-emerald-500 text-white",
    icon: "✅",
    sentence: "Tilbúinn í fullt prógram",
    recommendation: "Engin takmörk — fullt æfing, sprint work OK",
  },
  MODIFIED: {
    label: "Léttari æfing",
    color: "bg-amber-500 text-white",
    icon: "⚠️",
    sentence: "Þarf léttari æfingu í dag",
    recommendation: "Lækka volume 30-40% og sleppa max-intensity sprints",
  },
  RECOVERY: {
    label: "Hvíld",
    color: "bg-rose-500 text-white",
    icon: "🛑",
    sentence: "Hvíld eða mobility eingöngu",
    recommendation: "Engin high-intensity vinna — focus á hreyfanleika, recovery, light technical work",
  },
  NO_DATA: {
    label: "Engin gögn",
    color: "bg-slate-300 text-slate-700",
    icon: "❓",
    sentence: "Ekki nóg gögn til að meta",
    recommendation: "Treysta á eyemark þjálfara í dag",
  },
  INJURED: {
    label: "Frá æfingu — meiðsl",
    color: "bg-violet-600 text-white",
    icon: "🚫",
    sentence: "Acute meiðsli — engin æfing",
    recommendation: "Medical/physio prótókoll. Engin team-æfing fyrr en sjúkraþjálfari clear-ar.",
  },
  REHAB: {
    label: "Endurhæfing",
    color: "bg-violet-600 text-white",
    icon: "🏥",
    sentence: "Í endurhæfingu hjá sjúkraþjálfara",
    recommendation: "Aðeins physio-prescribed exercises. Engin team-vinna eða running.",
  },
  RTP: {
    label: "Return-to-play",
    color: "bg-violet-500 text-white",
    icon: "🩹",
    sentence: "Í endurkomu — modified team work",
    recommendation: "Léttari æfingar með liðinu. Sleppa max-intensity sprints og full contact þar til stage 5.",
  },
  ILL: {
    label: "Veikur",
    color: "bg-teal-600 text-white",
    icon: "🤒",
    sentence: "Veikur — engin æfing",
    recommendation: "Engin æfing. Hvíld, drekka mikið, monitor symptoms. Fjarlægð frá öðrum leikmönnum vegna smithættu.",
  },
  RECOVERING_ILL: {
    label: "Að jafna sig",
    color: "bg-teal-500 text-white",
    icon: "🫧",
    sentence: "Á batavegi — léttari æfing",
    recommendation: "Light technical/aerobic work í dag. Sleppa max-intensity sprints. Drekka mikið. Skoða aftur eftir session.",
  },
};

/** Build natural Icelandic reason text for why a player is in MODIFIED or RECOVERY band. */
function buildIcelandicReason(args: {
  composite_band: ScoreBand | null | undefined;
  acwr_value: number | null | undefined;
  acwr_flag: Flag | null | undefined;
  mcburnie_flag: Flag | null | undefined;
}): string {
  const parts: string[] = [];
  if (args.composite_band === "spike") parts.push("æfði miklu meira en venjulega í gær");
  else if (args.composite_band === "heavy") parts.push("þung session í gær");
  else if (args.composite_band === "light") parts.push("nær engin æfing nýlega");
  if (args.acwr_flag === "red" && args.acwr_value != null) {
    if (args.acwr_value > 1.5) parts.push(`acute spike á 7 dögum (ACWR ${args.acwr_value.toFixed(2)})`);
    else if (args.acwr_value < 0.5) parts.push(`undirvinnsla (ACWR ${args.acwr_value.toFixed(2)})`);
  } else if (args.acwr_flag === "yellow" && args.acwr_value != null) {
    parts.push(`ACWR ${args.acwr_value.toFixed(2)} (utan sweet spot)`);
  }
  if (args.mcburnie_flag === "red") parts.push("decel overload (mikið brake-work án nóg sprint)");
  else if (args.mcburnie_flag === "yellow") parts.push("decel:intensity skekkja");
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

export default function CoachIndoorLoadPage() {
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
        setError("Ekki innskráður");
        return;
      }
      const { data: profile } = await sb
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .maybeSingle();
      const tid = (profile as { team_id?: string } | null)?.team_id;
      if (!tid) {
        setError("Ekki tengdur við lið");
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

      // Fetch from BOTH player_injuries AND injury_events (latter for legacy + illness)
      const playerIds = players.map((p) => p.id);
      const [results, piResp, ieResp] = await Promise.all([
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
      ]);

      // Merge: injury_events first (lower precedence), player_injuries overwrites
      const injuryByPlayer = new Map<string, InjuryInfo>();
      for (const ev of (ieResp.data ?? []) as Array<Record<string, unknown>>) {
        const pid = String(ev.player_id);
        if (injuryByPlayer.has(pid)) continue;
        const evType = String(ev.injury_type ?? "");
        const isIllness = evType === "illness";
        injuryByPlayer.set(pid, {
          status: "injured",
          rtp_stage: null,
          body_part: isIllness ? "Illness" : evType.replace(/_/g, " "),
          injury_type: isIllness ? "Veikindi" : evType.replace(/_/g, " "),
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
      const message = e instanceof Error ? e.message : "Villa";
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
          reason = "Veikindi — engin æfing";
        } else if (action === "RECOVERING_ILL") {
          reason = "Á batavegi eftir veikindi";
        } else if (r.injury?.status === "injured") {
          reason = r.injury.body_part ? `${r.injury.body_part} (acute meiðsl)` : "Acute meiðsl";
        } else if (r.injury?.status === "rehabilitation") {
          reason = r.injury.body_part ? `${r.injury.body_part} — endurhæfing` : "Endurhæfing";
        } else if (r.injury?.status === "rtp_training") {
          const stage = r.injury.rtp_stage != null ? ` (stage ${r.injury.rtp_stage}/5)` : "";
          reason = r.injury.body_part ? `${r.injury.body_part} — RTP${stage}` : `RTP${stage}`;
        } else {
          reason = buildIcelandicReason({
            composite_band: r.status?.composite_score_band,
            acwr_value: r.status?.acwr?.value,
            acwr_flag: r.status?.acwr?.flag,
            mcburnie_flag: r.status?.indoor_mcburnie?.flag,
          });
        }
        concernPlayers.push({ name: r.full_name, action, reason });
      }
    }
    // Team-level status: derive from action distribution (illness + injury aware)
    const totalInjured = actionsCount.INJURED + actionsCount.REHAB + actionsCount.RTP;
    const totalIll = actionsCount.ILL + actionsCount.RECOVERING_ILL;
    let teamAction: Action = "FULL";
    let teamSentence = "Allir leikmenn tilbúnir í fullt prógram í dag";
    const sentenceParts: string[] = [];
    if (totalIll > 0) {
      sentenceParts.push(`${totalIll} ${totalIll === 1 ? "veikur" : "veikir"}`);
      teamAction = "MODIFIED";
    }
    if (totalInjured > 0) {
      sentenceParts.push(`${totalInjured} í meiðslum/RTP`);
      teamAction = "MODIFIED";
    }
    if (actionsCount.RECOVERY >= 1) {
      sentenceParts.push(`${actionsCount.RECOVERY} ${actionsCount.RECOVERY === 1 ? "þarf" : "þurfa"} hvíld`);
      teamAction = "RECOVERY";
    }
    if (actionsCount.MODIFIED >= 1) {
      sentenceParts.push(`${actionsCount.MODIFIED} ${actionsCount.MODIFIED === 1 ? "þarf" : "þurfa"} léttari æfingu`);
      if (teamAction === "FULL") teamAction = "MODIFIED";
    }
    if (sentenceParts.length > 0) {
      teamSentence = `${actionsCount.FULL} tilbúnir, ${sentenceParts.join(", ")}`;
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
          <h1 className="text-2xl font-semibold text-slate-900">Indoor Load Intelligence</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Höll-mode álagsgreining byggð á Football Movement Profile (FMP). Auto-greinir
            innan-húss sessions út frá lágu velocity-band 6 og marktækri FMP-virkni.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Sæki…" : "Endurnýja"}
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
                Liðið í dag
              </div>
              <div className="mt-0.5 text-base font-semibold text-slate-900">
                {teamStats.teamSentence}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                ✅ {teamStats.actionsCount.FULL} tilbúnir
              </span>
              <span className="rounded-md bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                ⚠️ {teamStats.actionsCount.MODIFIED} léttari
              </span>
              <span className="rounded-md bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">
                🛑 {teamStats.actionsCount.RECOVERY} hvíld
              </span>
              {teamStats.totalInjured > 0 && (
                <span className="rounded-md bg-violet-100 px-2 py-0.5 font-semibold text-violet-700">
                  🏥 {teamStats.totalInjured} meiddir
                </span>
              )}
              {teamStats.totalIll > 0 && (
                <span className="rounded-md bg-teal-100 px-2 py-0.5 font-semibold text-teal-700">
                  🤒 {teamStats.totalIll} veikir
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
            Top concerns ({teamStats.concernPlayers.length})
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
                  <span
                    className={`rounded px-2 py-0.5 font-semibold ${ACTION_LABELS[c.action].color}`}
                  >
                    {ACTION_LABELS[c.action].icon} {ACTION_LABELS[c.action].label}
                  </span>
                </div>
              </li>
            ))}
            {teamStats.concernPlayers.length > 6 && (
              <li className="pt-1 text-xs text-slate-500">
                + {teamStats.concernPlayers.length - 6} fleiri leikmenn — sjá lista neðar
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Team summary */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="Leikmenn með indoor data" value={String(teamStats.withIndoor)} />
        <SummaryCard
          label="Heavy / Spike"
          value={String(teamStats.heavyOrSpike)}
          accent="text-rose-700"
        />
        <SummaryCard
          label="Typical session"
          value={String(teamStats.typicalCount)}
          accent="text-emerald-700"
        />
        <SummaryCard
          label="Light / Below avg"
          value={String(teamStats.lightOrLow)}
          accent="text-sky-700"
        />
        <SummaryCard
          label="Indoor sessions sl. 7d"
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
          Sæki indoor load gögn…
        </div>
      )}

      {/* Team-wide 14-day heatmap — at-a-glance roster overview */}
      {!loading && rows.length > 0 && <TeamHeatmap rows={rows} />}

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
                    {(!noData || row.injury) && (
                      <span
                        className={`shrink-0 rounded px-2 py-1 text-xs font-bold ${ACTION_LABELS[recommendAction(row.status, row.injury)].color}`}
                        title={ACTION_LABELS[recommendAction(row.status, row.injury)].recommendation}
                      >
                        {ACTION_LABELS[recommendAction(row.status, row.injury)].icon}{" "}
                        {ACTION_LABELS[recommendAction(row.status, row.injury)].label}
                      </span>
                    )}
                    <span className="truncate font-medium text-slate-900">{row.full_name}</span>
                    {noData && !row.injury ? (
                      <span className="text-xs text-slate-500">— engin indoor session sl. 28d</span>
                    ) : !noData ? (
                      <span className="hidden text-xs text-slate-600 sm:inline">
                        {row.status!.indoor_sessions_28d}/{row.status!.total_sessions_28d} indoor
                        (28d)
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
                        ? `Veikindi${row.injury.injury_type ? ` (${row.injury.injury_type})` : ""}`
                        : `${row.injury.body_part ?? "Meiðsl"}${row.injury.injury_type ? ` (${row.injury.injury_type})` : ""}${row.injury.rtp_stage != null ? ` · RTP ${row.injury.rtp_stage}/5` : ""}`}
                      {row.injury.estimated_return ? ` · endurkoma ${row.injury.estimated_return.slice(5)}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {!noData && row.status?.composite_score != null && row.status.composite_score_band && (
                    <span
                      className={`rounded-md px-2 py-0.5 text-sm font-bold tabular-nums ${SCORE_BAND_COLORS[row.status.composite_score_band]}`}
                      title={`Composite Indoor Load Score: ${SCORE_BAND_LABELS[row.status.composite_score_band]} (100 = personal avg)`}
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
                          {isIll ? "🤒 Active veikindi" : "Active meiðsli"}
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
                          ? row.injury.injury_type ?? "Veikindi"
                          : `${row.injury.body_part ?? "Meiðsl"}${row.injury.injury_type ? ` — ${row.injury.injury_type}` : ""}`}
                      </p>
                      {row.injury.estimated_return && (
                        <p className={`mt-1 text-sm ${isIll ? "text-teal-700" : "text-violet-700"}`}>
                          Áætluð endurkoma:{" "}
                          <span className="font-semibold">{row.injury.estimated_return}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Coach guidance box — TOP PRIORITY: clear yes/no + concrete recommendation */}
                  {(() => {
                    const action = recommendAction(row.status, row.injury);
                    const labelInfo = ACTION_LABELS[action];
                    const reason = row.injury
                      ? labelInfo.sentence
                      : row.status
                      ? buildIcelandicReason({
                          composite_band: row.status.composite_score_band,
                          acwr_value: row.status.acwr?.value,
                          acwr_flag: row.status.acwr?.flag,
                          mcburnie_flag: row.status.indoor_mcburnie?.flag,
                        })
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
                              Tilbúinn í dag?
                            </div>
                            <div className="mt-0.5 text-lg font-bold text-slate-900">
                              {labelInfo.sentence}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Hvers vegna
                            </div>
                            <div className="mt-0.5 text-sm text-slate-800">
                              {action === "FULL"
                                ? "Allir signal innan heilbrigðs sviðs — engin warning flag"
                                : reason}
                            </div>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Þjálfara-leiðbeining
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
                            Composite Indoor Load Score
                          </span>
                          <div className="mt-0.5 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tabular-nums text-slate-900">
                              {row.status.composite_score}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-xs font-semibold ${SCORE_BAND_COLORS[row.status.composite_score_band]}`}
                            >
                              {SCORE_BAND_LABELS[row.status.composite_score_band]}
                            </span>
                            <span className="text-xs text-slate-500">
                              (100 = personal 28d avg)
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* 14-day trend sparkline */}
                      {row.status.history_14d && row.status.history_14d.length > 0 && (
                        <div className="mb-3">
                          <HistorySparkline history={row.status.history_14d} />
                        </div>
                      )}
                      <FmpMovementBars bands={row.status.latest_session.fmp_bands} />
                    </div>
                  )}

                  {row.status && !noData && (
                  <div className="grid gap-4 md:grid-cols-3">
                    {/* Latest session */}
                    {row.status.latest_session && (
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Síðasta indoor session ({row.status.latest_session.date})
                        </div>
                        <dl className="space-y-1 tabular-nums">
                          <Stat label="Player Load" value={row.status.latest_session.player_load} />
                          <Stat
                            label="Lengd"
                            value={`${row.status.latest_session.duration_min} mín`}
                          />
                          <Stat
                            label="Dynamic High %"
                            value={
                              row.status.latest_session.dyn_high_pct != null
                                ? `${row.status.latest_session.dyn_high_pct.toFixed(2)}%`
                                : null
                            }
                          />
                          <Stat label="HMLD (m)" value={row.status.latest_session.hmld_m} />
                          <Stat label="IMA total" value={row.status.latest_session.ima_total} />
                          <Stat label="Decel B2-3" value={row.status.latest_session.decel_b23} />
                        </dl>
                      </div>
                    )}

                    {/* Baseline 28d */}
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Personal baseline (28d indoor)
                      </div>
                      <dl className="space-y-1 tabular-nums">
                        <Stat
                          label="Avg Player Load"
                          value={row.status.baseline_indoor.avg_player_load}
                        />
                        <Stat
                          label="Avg lengd"
                          value={`${row.status.baseline_indoor.avg_duration_min} mín`}
                        />
                        <Stat
                          label="Avg Dyn High %"
                          value={`${row.status.baseline_indoor.avg_dyn_high_pct.toFixed(2)}%`}
                        />
                        <Stat
                          label="Avg HMLD (m)"
                          value={row.status.baseline_indoor.avg_hmld_m}
                        />
                        <Stat
                          label="Avg IMA total"
                          value={row.status.baseline_indoor.avg_ima_total}
                        />
                        <Stat
                          label="Avg Decel B2-3"
                          value={row.status.baseline_indoor.avg_decel_b23}
                        />
                      </dl>
                    </div>

                    {/* 7-day cumulative + McBurnie */}
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Sl. 7 dagar (cumulative)
                      </div>
                      <dl className="space-y-1 tabular-nums">
                        <Stat label="Indoor sessions" value={row.status.recent_7d.sessions} />
                        <Stat
                          label="Player Load samtals"
                          value={row.status.recent_7d.sum_player_load}
                        />
                        <Stat
                          label="Dyn High (sek)"
                          value={row.status.recent_7d.sum_dyn_high_s}
                        />
                        <Stat label="Decel B2-3" value={row.status.recent_7d.sum_decel_b23} />
                      </dl>

                      {row.status.indoor_mcburnie && (
                        <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Indoor McBurnie proxy
                          </div>
                          <div className="mt-1 flex items-baseline justify-between">
                            <span className="text-lg font-bold tabular-nums">
                              {row.status.indoor_mcburnie.decel_per_dyn_high_min.toFixed(2)}
                            </span>
                            <span className="text-xs text-slate-500">
                              decels / mín Dyn High (heilbrigt {row.status.indoor_mcburnie.healthy_range})
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
                            ACWR (Gabbett 2017)
                          </div>
                          <div className="mt-1 flex items-baseline justify-between">
                            <span className="text-lg font-bold tabular-nums">
                              {row.status.acwr.value.toFixed(2)}
                            </span>
                            <span className="text-xs text-slate-500">
                              7d / 28d-week-avg (sweet spot 0.8-1.3)
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
      <details className="mt-8 rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
        <summary className="cursor-pointer font-semibold text-slate-800">Aðferðafræði</summary>
        <div className="mt-3 space-y-2">
          <p>
            <strong>Auto-greining á indoor session:</strong> Session telst innan-húss ef
            velocity_band6_total_distance &lt; 50m og fmp_total_duration_s &gt; 600s (10 mín).
            Þetta útilokar útiæfingar sem mæla raunverulega max-hraða og fangar æfingar í höllum
            þar sem GPS-háðir mælar segja lítið.
          </p>
          <p>
            <strong>Composite Indoor Load Score (0-150+):</strong> Vegið meðaltal af 5 þáttum
            normaliseraðum við 28-daga personal baseline. <strong>100 = nákvæmlega meðal-session
            þíns leikmanns.</strong> Vegir: Player Load 30%, Dynamic High % 25%, IMA total 20%,
            HMLD 15%, Decel B2-3 10%.
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>&lt; 60:</strong> Light — recovery/walkthrough
            </li>
            <li>
              <strong>60-90:</strong> Below average — mild tactical
            </li>
            <li>
              <strong>90-110:</strong> Typical — standard training
            </li>
            <li>
              <strong>110-140:</strong> Heavy — match-style training
            </li>
            <li>
              <strong>&gt; 140:</strong> Spike — overload risk ef sustained
            </li>
          </ul>
          <p>
            <strong>FMP movement bars:</strong> Stacked bar sem sýnir hvernig session-tími
            dreifðist á 7 stride-velocity bands. Mikið rautt (Dynamic High) = high-intensity
            session. Mikið grátt (Very Low) = recovery. Þetta er IMU-byggt og virkar fullkomlega
            indoor.
          </p>
          <p>
            <strong>14-day load trend:</strong> Daily composite score yfir síðustu 14 daga.
            Hver dálkur er ein session, litaður eftir score band (slate/sky/emerald/amber/rose).
            Rautt punktur ofan á dálki = indoor session. Tómir dagar (faint dots) = recovery/rest.
            Slitnar línur sýna baseline (100) og spike threshold (140). Þetta gerir þjálfara kleift
            að sjá <em>trajectory</em> — er þessi leikmaður á uppleið, niðurleið, eða stable.
          </p>
          <p>
            <strong>Team load heatmap (efst á síðu):</strong> 14×N grid sem sýnir allt liðið í
            einu — hver röð er leikmaður, hver dálkur er dagur. Litur reitar = composite score band.
            Rauður innri border = indoor session. Þetta er <em>tactical overview</em> sem þjálfari
            getur scan-að á 5 sekúndum til að spot-a leikmenn með sustained spikes vs distributed
            load.
          </p>
          <p>
            <strong>ACWR (Acute:Chronic Workload Ratio, Gabbett 2017):</strong> Vikulegt
            cumulative player load deilt með 28-day weekly average. Sweet spot 0.8-1.3 — sýnir
            að leikmaður er adapted til að höndla núverandi load. Hækkun yfir 1.5 (acute spike)
            tengist 2-4× hærri injury risk.
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>0.8-1.3:</strong> 🟢 Sweet spot — adapted, ready to perform
            </li>
            <li>
              <strong>0.5-0.8 eða 1.3-1.5:</strong> 🟡 Caution — detraining eða acute spike
            </li>
            <li>
              <strong>&lt; 0.5 eða &gt; 1.5:</strong> 🔴 Danger zone — severe undertraining eða
              elevated injury risk
            </li>
          </ul>
          <p>
            <strong>Indoor McBurnie proxy:</strong> decel_b23_count / (FMP duration × Dynamic High
            %). Mælir hversu margar high-intensity bremsanir leikmaður gerir per mínútu af
            high-intensity hreyfingu.
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>1-10:</strong> 🟢 Healthy — eðlilegt indoor decel:intensity coupling
            </li>
            <li>
              <strong>0.5-1 eða 10-15:</strong> 🟡 Caution — annað hvort underload
              (lítið brake-work) eða decel-heavy training
            </li>
            <li>
              <strong>&lt; 0.5 eða &gt; 15:</strong> 🔴 At-risk — verulegt mismunur milli
              bremsuvinnu og hreyfingar (overload eða undirvinnsla)
            </li>
          </ul>
          <p>
            <strong>Source:</strong> Football Movement Profile (Catapult OpenField, IMU-only,
            engin GPS-þörf), accelerometry IMA Accel/Decel/CoD, Player Load.
          </p>
          <p className="italic text-slate-500">
            Reference: McBurnie, Harper, Jones &amp; Dos&apos;Santos 2022 — Deceleration Training
            in Team Sports. Sports Medicine.
          </p>
        </div>
      </details>
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

function TeamHeatmap({ rows }: { rows: Row[] }) {
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
          <h3 className="text-sm font-semibold text-slate-900">Team load heatmap (14 dagar)</h3>
          <p className="text-xs text-slate-500">
            Hver reitur = ein session colored eftir composite score. Innri rauður border = indoor.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> Light
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-sky-300" /> Below
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" /> Typical
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Heavy
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Spike
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] text-slate-500">
              <th className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left font-medium">
                Player
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
                              ? `${d}: ${point.score ?? "—"} (${point.is_indoor ? "Indoor" : "Outdoor"})`
                              : `${d}: rest`
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

function HistorySparkline({ history }: { history: HistoryPoint[] }) {
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
          14-day load trend
        </span>
        <span className="text-[10px] text-slate-400">
          <span className="inline-block h-2 w-2 rounded-sm bg-rose-500"></span> Indoor &nbsp;
          <span className="inline-block h-2 w-2 rounded-sm bg-slate-400"></span> Outdoor
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
                <title>{`${day.date}: ${score} (${isIndoor ? "Indoor" : "Outdoor"})`}</title>
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

function FmpMovementBars({ bands }: { bands: FmpBands }) {
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
        <span>FMP movement distribution (síðasta indoor session)</span>
        <span className="tabular-nums">{Math.round(total / 60)} mín alls</span>
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

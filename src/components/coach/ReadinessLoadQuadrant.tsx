"use client";

/**
 * ReadinessLoadQuadrant
 * ──────────────────────
 * Shows today's team as a scatter plot of Readiness (y) × Planned PL (x),
 * with four coloured quadrants for quick decision-support:
 *
 *   Ready + Low planned  → green  (safe, possible overload if needed)
 *   Ready + High planned → blue   (go: this is the hard day)
 *   Tired + Low planned  → yellow (watch)
 *   Tired + High planned → red    (MODIFY or pull)
 *
 * Data source: GET /api/coach/readiness-load?date=YYYY-MM-DD&team_id=...
 *
 * This is a read-only visualization — no writes to the DB. Clicking a
 * point expands a side panel with the player's details and a suggested
 * action based on quadrant position.
 */

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Quadrant = "green" | "blue" | "yellow" | "red" | "neutral";
type Action = "full" | "modified" | "recovery" | null;
type ConcernLevel = "none" | "low" | "moderate" | "high";

type PlayerPoint = {
  player_id: string;
  initials: string;
  full_name: string;
  readiness: number | null;
  planned_pl: number | null;
  action: Action;
  quadrant: Quadrant;
};

export type PlayerComposite = {
  compositeScore: number;
  concernLevel: ConcernLevel;
  fatigueType?: string | null;
  /** Today's PL ÷ 28d baseline PL (raw spike, ~0–3). null when no PL today/baseline. */
  playerLoadSpike?: number | null;
  /** Relative training load mapped to [0,1]: 0 = none, 0.5 = on baseline, 1.0 = 2×+ baseline. */
  loadRatio?: number | null;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  date: string;
  team_target_pl: number | null;
  session_name: string | null;
  target_pl_source?: "session_for_date" | "latest_session" | "default";
  thresholds: {
    readiness_ready: number;
    readiness_tired: number;
    readiness_max?: number;
    pl_high_ratio: number;
  };
  players: PlayerPoint[];
};

const COPY = {
  IS: {
    title: "Readiness × Load",
    subtitle: "Snöggt yfirlit: hverjir eru tilbúnir fyrir dagsins æfingu",
    loading: "Hleð…",
    noData: "Enginn leikmaður hefur skilað check-in fyrir þennan dag.",
    noSession: "Engin skipulögð æfing fyrir þennan dag — notum sjálfgefið target PL.",
    usingLatestSession: "Ekkert session fyrir þennan dag — notum nýjasta skipulagða target PL.",
    usingDefault: "Sjálfgefið target PL (engin saved_sessions til ennþá).",
    refresh: "Endurnýja",
    targetPl: "Target PL",
    session: "Æfing",
    axisReady: "Readiness",
    axisPl: "Planned PL",
    axisComposite: "Composite álag · PL + IMA (0 = ekkert · 0.5 = baseline · 1.0 = 2×)",
    composite: "Composite álag (PL + IMA)",
    compositeBands: "Vegið: PL spike + IMA decel/accel/CoD spike + HIR. 0.5 = baseline · >0.75 = 1.5× baseline · punktur verður rauður ef composite áhættuskor er hátt.",
    usingComposite: "X-ás er composite mechanical load score: PL spike dagsins + IMA-byggt decel/accel/change-of-direction álag, vegið eftir indoor/outdoor mode (Foster + Hill-Haas + McBurnie). Hverjum leikmanni er borið saman við hans eigin 28-daga baseline.",
    fallbackHint: "Enn vantar GPS-álag fyrir suma leikmenn — brotnar línur nota planned_pl/target sem fallback.",
    plannedFallback: "planned (engin GPS)",
    legend: {
      green: "🟢 Tilbúinn + Lítið PL",
      blue: "🔵 Tilbúinn + Mikið PL",
      yellow: "🟡 Þreyttur + Lítið PL",
      red: "🔴 Þreyttur + Mikið PL ⚠",
    },
    quadrantLabel: {
      green: "Safe",
      blue: "Go — þetta er harða dagurinn",
      yellow: "Fylgstu með",
      red: "Breyta eða taka úr",
      neutral: "—",
    },
    suggestion: {
      green: "Fullur skammtur — gæti tekið meira ef þarf.",
      blue: "Fullur skammtur — planned PL er viðeigandi.",
      yellow: "Fylgstu með á meðan æfingu stendur.",
      red: "Lækka PL niður í ~60% eða sleppa lokablokk.",
      neutral: "Hlutlaus — engin sérstök tillaga.",
    },
    noReadiness: "Ekkert check-in",
    playerStatus: "Staða",
    click: "Smelltu á punkt fyrir nánari upplýsingar",
    close: "Loka",
  },
  EN: {
    title: "Readiness × Load",
    subtitle: "Quick view: who is ready for today's session",
    loading: "Loading…",
    noData: "No check-ins submitted for this date yet.",
    noSession: "No session planned for this date — using default target PL.",
    usingLatestSession: "No session for this date — showing latest saved target PL.",
    usingDefault: "Default target PL (no saved_sessions yet).",
    refresh: "Refresh",
    targetPl: "Target PL",
    session: "Session",
    axisReady: "Readiness",
    axisPl: "Planned PL",
    axisComposite: "Composite load · PL + IMA (0 = none · 0.5 = baseline · 1.0 = 2×)",
    composite: "Composite load (PL + IMA)",
    compositeBands: "Weighted blend: PL spike + IMA decel/accel/CoD spike + HIR. 0.5 = baseline · >0.75 = 1.5× baseline · dot turns red when composite risk is high.",
    usingComposite: "X-axis is a composite mechanical load score: today's PL spike + IMA-derived decel/accel/change-of-direction load, weighted per indoor/outdoor mode (Foster + Hill-Haas + McBurnie). Each player is compared against their own 28-day baseline.",
    fallbackHint: "Some players still missing GPS — dashed dots use planned_pl/target as a fallback.",
    plannedFallback: "planned (no GPS)",
    legend: {
      green: "🟢 Ready + Low PL",
      blue: "🔵 Ready + High PL",
      yellow: "🟡 Tired + Low PL",
      red: "🔴 Tired + High PL ⚠",
    },
    quadrantLabel: {
      green: "Safe",
      blue: "Go — this is the hard day",
      yellow: "Watch",
      red: "Modify or pull",
      neutral: "—",
    },
    suggestion: {
      green: "Full dose — could overload if needed.",
      blue: "Full dose — planned PL is appropriate.",
      yellow: "Monitor during the session.",
      red: "Reduce PL to ~60% or skip the final block.",
      neutral: "Neutral — no specific suggestion.",
    },
    noReadiness: "No check-in",
    playerStatus: "Status",
    click: "Click a dot for details",
    close: "Close",
  },
} as const;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const QUADRANT_COLOR: Record<Quadrant, { dot: string; ring: string; text: string }> = {
  green: { dot: "#16a34a", ring: "#bbf7d0", text: "#166534" },
  blue: { dot: "#2563eb", ring: "#bfdbfe", text: "#1e40af" },
  yellow: { dot: "#ca8a04", ring: "#fde68a", text: "#854d0e" },
  red: { dot: "#dc2626", ring: "#fecaca", text: "#991b1b" },
  neutral: { dot: "#64748b", ring: "#e2e8f0", text: "#334155" },
};

export default function ReadinessLoadQuadrant({
  teamId,
  lang = "IS",
  playerComposites,
}: {
  teamId?: string | null;
  lang?: "IS" | "EN";
  playerComposites?: Record<string, PlayerComposite>;
}) {
  // When composites are provided, use relative-load ratio (0–1) as x-axis
  // instead of raw planned_pl. 0.5 = today on baseline, 0.75 = 1.5× baseline.
  // Composite concernLevel still escalates dot colour so a light day that is
  // still high-risk (e.g. after an overload streak) stays visible.
  const useComposite = !!playerComposites && Object.keys(playerComposites ?? {}).length > 0;
  const LOAD_BASELINE = 0.5;   // 1.0× 28d baseline
  const LOAD_OVERLOAD = 0.75;  // 1.5× baseline
  const supabase = useMemo(() => getSupabaseClient(), []);
  const c = COPY[lang];
  const [dateKey, setDateKey] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [selected, setSelected] = useState<PlayerPoint | null>(null);

  async function load(target = dateKey) {
    setLoading(true);
    setError("");
    try {
      const { data: authData, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw new Error(authErr.message);
      const token = authData?.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const qs = new URLSearchParams({ date: target });
      if (teamId) qs.set("team_id", teamId);

      const res = await fetch(`/api/coach/readiness-load?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load");
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(dateKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  // ── Plot geometry ──
  const WIDTH = 520;
  const HEIGHT = 300;
  const PAD = { top: 12, right: 16, bottom: 32, left: 44 };
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const maxPl = Math.max(
    data?.team_target_pl ?? 0,
    ...(data?.players ?? []).map((p) => p.planned_pl ?? 0),
    100
  );
  const xMaxPl = Math.ceil((maxPl * 1.1) / 50) * 50;
  // Composite axis is always 0–1 (with a tiny headroom for the label)
  const xMaxComposite = 1.0;
  const xMax = useComposite ? xMaxComposite : xMaxPl;

  const readinessMax = data?.thresholds.readiness_max ?? 25;

  // Lookup composite metadata for a player.
  function compEntryFor(pid: string): PlayerComposite | null {
    return playerComposites?.[pid] ?? null;
  }

  /**
   * X-axis value for a player in composite mode.
   *
   * Prefers the relative-load ratio (today PL / 28d baseline PL, mapped to 0–1
   * where 0.5 = baseline, 1.0 = ≥2× baseline). This shows actual training
   * intensity on any day — light, normal, or heavy — instead of only firing
   * when overload risk is present.
   *
   * Falls back to planned_pl / team_target_pl when GPS spike data is missing,
   * so the chart stays useful until Catapult sync catches up.
   *
   * Returns { value, isFallback }.
   */
  function xValueForPlayer(p: PlayerPoint): { value: number; isFallback: boolean } {
    const entry = compEntryFor(p.player_id);
    if (entry && entry.loadRatio != null && Number.isFinite(entry.loadRatio)) {
      return { value: Math.max(0, Math.min(1, entry.loadRatio)), isFallback: false };
    }
    // Fallback: planned_pl / team_target_pl, clamped to 0–1
    const target = data?.team_target_pl ?? null;
    if (target != null && target > 0 && p.planned_pl != null) {
      const ratio = Math.max(0, Math.min(1, p.planned_pl / target));
      return { value: ratio, isFallback: true };
    }
    return { value: 0, isFallback: true };
  }

  // Any fallback in play? Used to show a "planned (no GPS)" hint.
  const anyFallback = useComposite
    ? (data?.players ?? []).some((p) => {
        const entry = compEntryFor(p.player_id);
        return (entry?.loadRatio == null) && p.readiness != null;
      })
    : false;

  function xScaleRaw(v: number): number {
    return PAD.left + (v / xMax) * plotW;
  }
  function xScalePl(pl: number | null): number {
    return xScaleRaw(pl ?? 0);
  }
  function xScaleComposite(score: number | null): number {
    return xScaleRaw(score ?? 0);
  }
  function yScale(r: number | null): number {
    // readiness 0..readinessMax, inverted (max at top)
    const v = r ?? 0;
    return PAD.top + (1 - v / readinessMax) * plotH;
  }

  // Thresholds for quadrant divider lines
  const readyLineY = yScale(data?.thresholds.readiness_ready ?? 18);
  // "High load" divider sits at baseline (x = 0.5) in composite mode: anything
  // above baseline is a harder-than-usual day. In raw-PL mode keep the original
  // team_target_pl × pl_high_ratio behaviour.
  const plHighX = useComposite
    ? xScaleComposite(LOAD_BASELINE)
    : xScalePl(
        data?.team_target_pl != null ? data.team_target_pl * (data.thresholds.pl_high_ratio ?? 0.7) : 0
      );
  // Secondary divider (composite mode): overload marker at 1.5× baseline (x=0.75).
  const plModerateX = useComposite ? xScaleComposite(LOAD_OVERLOAD) : null;

  // Jitter so dots that share the same (readiness, planned_pl) don't overlap.
  // Larger x-jitter because many players share the same planned_pl (target × modifier).
  function jitterX(idx: number): number {
    const n = (idx * 9301 + 49297) % 233280;
    return ((n / 233280) * 2 - 1) * 22;
  }
  function jitterY(idx: number): number {
    const n = (idx * 7919 + 12479) % 233280;
    return ((n / 233280) * 2 - 1) * 8;
  }

  const hasTarget = data?.team_target_pl != null && data.team_target_pl > 0;
  const plottable = (data?.players ?? []).filter((p) =>
    useComposite ? p.readiness != null : p.readiness != null && p.planned_pl != null
  );
  const missing = (data?.players ?? []).filter((p) =>
    useComposite ? p.readiness == null : p.readiness == null || p.planned_pl == null
  );

  // Re-classify quadrant in composite mode.
  // Load axis → relative-load ratio vs baseline (>=0.5 is a hard day).
  // If composite concern is moderate/high, escalate tired players into the
  // red quadrant even when today's load is light (they're accumulating fatigue).
  function effectiveQuadrant(p: PlayerPoint): Quadrant {
    if (!useComposite) return p.quadrant;
    const readiness = p.readiness;
    if (readiness == null) return "neutral";
    const { value: loadVal } = xValueForPlayer(p);
    const concern = compEntryFor(p.player_id)?.concernLevel ?? "none";
    const isReady = readiness >= (data?.thresholds.readiness_ready ?? 18);
    const isTired = readiness < (data?.thresholds.readiness_tired ?? 15);
    if (!isReady && !isTired) return "neutral";
    const isHighLoad = loadVal >= LOAD_BASELINE || concern === "high" || concern === "moderate";
    if (isReady && isHighLoad) return "blue";
    if (isReady && !isHighLoad) return "green";
    if (isTired && isHighLoad) return "red";
    return "yellow";
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            MicroPulse · Decision support
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{c.title}</div>
          <div className="mt-0.5 text-xs text-slate-500">{c.subtitle}</div>
          {data ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              {data.session_name ? (
                <span>
                  <span className="font-medium text-slate-700">{c.session}:</span>{" "}
                  {data.session_name}
                </span>
              ) : null}
              {data.team_target_pl != null ? (
                <span>
                  <span className="font-medium text-slate-700">{c.targetPl}:</span>{" "}
                  {data.team_target_pl}
                </span>
              ) : null}
              <span className="text-slate-500">
                {(data.players ?? []).filter((p) => p.readiness != null).length}/
                {(data.players ?? []).length} check-ins
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateKey}
            onChange={(e) => {
              const next = e.target.value;
              setDateKey(next);
              if (/^\d{4}-\d{2}-\d{2}$/.test(next)) void load(next);
            }}
            className="h-8 rounded-md border border-slate-300 px-2 text-xs"
          />
          <button
            type="button"
            onClick={() => void load(dateKey)}
            disabled={loading}
            className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? c.loading : c.refresh}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

      {!loading && useComposite ? (
        <div className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-800">
          <div className="font-medium">{c.usingComposite}</div>
          <div className="mt-0.5 opacity-80">{c.compositeBands}</div>
          {anyFallback ? (
            <div className="mt-1 text-[11px] text-indigo-700/90 italic">{c.fallbackHint}</div>
          ) : null}
        </div>
      ) : null}
      {!loading && !useComposite && data?.target_pl_source && data.target_pl_source !== "session_for_date" ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          {data.target_pl_source === "default" ? c.usingDefault : c.usingLatestSession}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr,220px]">
        {/* ── Chart ── */}
        <div className="relative">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            className="w-full"
            style={{ maxHeight: 340, height: "auto" }}
            role="img"
            aria-label={c.title}
          >
            {/* Quadrant backgrounds (only if we have a target_pl) */}
            {hasTarget ? (
              <>
                {/* top-left: ready + low */}
                <rect
                  x={PAD.left}
                  y={PAD.top}
                  width={plHighX - PAD.left}
                  height={readyLineY - PAD.top}
                  fill="#dcfce7"
                  fillOpacity={0.55}
                />
                {/* top-right: ready + high */}
                <rect
                  x={plHighX}
                  y={PAD.top}
                  width={PAD.left + plotW - plHighX}
                  height={readyLineY - PAD.top}
                  fill="#dbeafe"
                  fillOpacity={0.55}
                />
                {/* bottom-left: tired + low */}
                <rect
                  x={PAD.left}
                  y={readyLineY}
                  width={plHighX - PAD.left}
                  height={PAD.top + plotH - readyLineY}
                  fill="#fef3c7"
                  fillOpacity={0.55}
                />
                {/* bottom-right: tired + high */}
                <rect
                  x={plHighX}
                  y={readyLineY}
                  width={PAD.left + plotW - plHighX}
                  height={PAD.top + plotH - readyLineY}
                  fill="#fee2e2"
                  fillOpacity={0.7}
                />
                {/* divider lines */}
                <line
                  x1={plHighX}
                  x2={plHighX}
                  y1={PAD.top}
                  y2={PAD.top + plotH}
                  stroke="#94a3b8"
                  strokeDasharray="3,3"
                  strokeWidth={1}
                />
                <line
                  x1={PAD.left}
                  x2={PAD.left + plotW}
                  y1={readyLineY}
                  y2={readyLineY}
                  stroke="#94a3b8"
                  strokeDasharray="3,3"
                  strokeWidth={1}
                />
              </>
            ) : (
              <rect
                x={PAD.left}
                y={PAD.top}
                width={plotW}
                height={plotH}
                fill="#f8fafc"
              />
            )}

            {/* Axes */}
            <line
              x1={PAD.left}
              x2={PAD.left}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="#cbd5e1"
              strokeWidth={1}
            />
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={PAD.top + plotH}
              y2={PAD.top + plotH}
              stroke="#cbd5e1"
              strokeWidth={1}
            />

            {/* Y ticks (0,5,10,15,20,25 by default for wellness-sum scale) */}
            {Array.from({ length: 6 }, (_, i) => Math.round((readinessMax / 5) * i)).map((v) => (
              <g key={`yt-${v}`}>
                <line
                  x1={PAD.left - 3}
                  x2={PAD.left}
                  y1={yScale(v)}
                  y2={yScale(v)}
                  stroke="#94a3b8"
                />
                <text
                  x={PAD.left - 6}
                  y={yScale(v) + 3}
                  textAnchor="end"
                  fontSize={9}
                  fill="#64748b"
                >
                  {v}
                </text>
              </g>
            ))}

            {/* X ticks */}
            {(useComposite
              ? [0, 0.25, 0.5, 0.75, 1.0]
              : Array.from({ length: 5 }, (_, i) => Math.round((xMax / 4) * i))
            ).map((v) => (
              <g key={`xt-${v}`}>
                <line
                  x1={xScaleRaw(v)}
                  x2={xScaleRaw(v)}
                  y1={PAD.top + plotH}
                  y2={PAD.top + plotH + 3}
                  stroke="#94a3b8"
                />
                <text
                  x={xScaleRaw(v)}
                  y={PAD.top + plotH + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#64748b"
                >
                  {useComposite ? (v as number).toFixed(2) : v}
                </text>
              </g>
            ))}

            {/* Axis labels */}
            <text
              x={PAD.left - 34}
              y={PAD.top + plotH / 2}
              textAnchor="middle"
              fontSize={10}
              fill="#475569"
              transform={`rotate(-90, ${PAD.left - 34}, ${PAD.top + plotH / 2})`}
            >
              {c.axisReady}
            </text>
            <text
              x={PAD.left + plotW / 2}
              y={HEIGHT - 6}
              textAnchor="middle"
              fontSize={10}
              fill="#475569"
            >
              {useComposite ? c.axisComposite : c.axisPl}
            </text>

            {/* Overload reference line (composite mode, 1.5× baseline = x 0.75) */}
            {useComposite && plModerateX != null ? (
              <g>
                <line
                  x1={plModerateX}
                  x2={plModerateX}
                  y1={PAD.top}
                  y2={PAD.top + plotH}
                  stroke="#ea580c"
                  strokeOpacity={0.45}
                  strokeDasharray="2,3"
                  strokeWidth={1}
                />
                <text
                  x={plModerateX + 3}
                  y={PAD.top + 10}
                  fontSize={8}
                  fill="#ea580c"
                  fillOpacity={0.85}
                >
                  1.5× baseline
                </text>
              </g>
            ) : null}

            {/* Baseline reference line (composite mode, 1.0× baseline = x 0.5) */}
            {useComposite ? (
              <g>
                <line
                  x1={plHighX}
                  x2={plHighX}
                  y1={PAD.top}
                  y2={PAD.top + plotH}
                  stroke="#0f172a"
                  strokeOpacity={0.45}
                  strokeDasharray="4,3"
                  strokeWidth={1.25}
                />
                <text
                  x={plHighX + 3}
                  y={PAD.top + 10}
                  fontSize={9}
                  fill="#0f172a"
                  fillOpacity={0.75}
                >
                  baseline
                </text>
              </g>
            ) : hasTarget ? (
              <g>
                <line
                  x1={xScalePl(data!.team_target_pl)}
                  x2={xScalePl(data!.team_target_pl)}
                  y1={PAD.top}
                  y2={PAD.top + plotH}
                  stroke="#0f172a"
                  strokeOpacity={0.4}
                  strokeWidth={1.5}
                />
                <text
                  x={xScalePl(data!.team_target_pl) + 3}
                  y={PAD.top + 10}
                  fontSize={9}
                  fill="#0f172a"
                >
                  target {data!.team_target_pl}
                </text>
              </g>
            ) : null}

            {/* Points */}
            {plottable.map((p, idx) => {
              const quad = effectiveQuadrant(p);
              const color = QUADRANT_COLOR[quad];
              const xv = useComposite ? xValueForPlayer(p) : { value: 0, isFallback: false };
              const cx = useComposite
                ? xScaleComposite(xv.value) + jitterX(idx)
                : xScalePl(p.planned_pl) + jitterX(idx);
              const cy = yScale(p.readiness) + jitterY(idx);
              const isFallbackPoint = useComposite && xv.isFallback;
              const isSelected = selected?.player_id === p.player_id;
              return (
                <g
                  key={p.player_id}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelected(isSelected ? null : p)}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? 14 : 11}
                    fill={color.dot}
                    fillOpacity={isFallbackPoint ? 0.55 : 0.95}
                    stroke="#fff"
                    strokeWidth={isSelected ? 3 : 2}
                    strokeDasharray={isFallbackPoint ? "2,2" : undefined}
                  />
                  <text
                    x={cx}
                    y={cy + 3}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#fff"
                    fontWeight={700}
                    style={{ pointerEvents: "none" }}
                  >
                    {p.initials}
                  </text>
                </g>
              );
            })}
          </svg>

          {!loading && plottable.length === 0 && !error ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
                {c.noData}
              </div>
            </div>
          ) : null}

          {plottable.length > 0 && !selected ? (
            <div className="mt-1 text-[11px] text-slate-500 italic">{c.click}</div>
          ) : null}
        </div>

        {/* ── Legend + details ── */}
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">
              Legend
            </div>
            <div className="space-y-1 text-xs text-slate-700">
              <div>{c.legend.green}</div>
              <div>{c.legend.blue}</div>
              <div>{c.legend.yellow}</div>
              <div className="font-semibold">{c.legend.red}</div>
            </div>
          </div>

          {selected ? (() => {
            const selectedQuad = effectiveQuadrant(selected);
            const selComp = playerComposites?.[selected.player_id] ?? null;
            const selXv = useComposite ? xValueForPlayer(selected) : null;
            return (
              <div
                className="rounded-lg border p-3"
                style={{
                  borderColor: QUADRANT_COLOR[selectedQuad].ring,
                  backgroundColor: `${QUADRANT_COLOR[selectedQuad].dot}10`,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      {c.playerStatus}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-slate-900">
                      {selected.full_name}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    {c.close}
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-white/70 px-2 py-1">
                    <div className="text-[10px] text-slate-500">{c.axisReady}</div>
                    <div className="font-semibold tabular-nums">
                      {selected.readiness ?? "—"}
                    </div>
                  </div>
                  {useComposite && selXv ? (
                    <div className="rounded bg-white/70 px-2 py-1">
                      <div className="text-[10px] text-slate-500">
                        {selXv.isFallback ? c.plannedFallback : c.composite}
                      </div>
                      <div className="font-semibold tabular-nums">
                        {selXv.value.toFixed(2)}
                        {selComp && !selXv.isFallback ? (
                          <span className="ml-1 text-[10px] font-normal text-slate-500">
                            ({selComp.concernLevel})
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded bg-white/70 px-2 py-1">
                      <div className="text-[10px] text-slate-500">{c.axisPl}</div>
                      <div className="font-semibold tabular-nums">
                        {selected.planned_pl ?? "—"}
                      </div>
                    </div>
                  )}
                </div>
                <div
                  className="mt-2 text-xs font-semibold"
                  style={{ color: QUADRANT_COLOR[selectedQuad].text }}
                >
                  {c.quadrantLabel[selectedQuad]}
                </div>
                <div className="mt-1 text-xs text-slate-700">
                  {c.suggestion[selectedQuad]}
                </div>
              </div>
            );
          })() : null}

          {missing.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-500">
              <span className="font-medium">{c.noReadiness}:</span>{" "}
              {missing
                .slice(0, 6)
                .map((p) => p.initials)
                .join(", ")}
              {missing.length > 6 ? ` +${missing.length - 6}` : ""}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

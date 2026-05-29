"use client";

/**
 * LoadQuadrant — Fitness × Fatigue 2×2 for the PT client.
 *
 * Explainability-first: a one-sentence plain-language verdict on top, the 2×2
 * with the client's current position, then the underlying numbers + a "why".
 * X = fitness (chronic load), Y = fatigue (acute load vs baseline / ACWR).
 *
 * Data: /api/client/load-quadrant (derived from session_rpe_entries).
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Lang = "IS" | "EN";

type Quadrant = {
  acute_daily: number;
  chronic_daily: number;
  older_chronic: number;
  acwr: number | null;
  fitness_high: boolean;
  fatigue_high: boolean;
  zone: "primed" | "overreaching" | "detrained" | "danger" | "baseline";
  confidence: "low" | "medium" | "high";
  days_with_data: number;
};

const COPY = {
  IS: {
    title: "Form & álag",
    fitness: "Form (langtímaálag)",
    fatigue: "Þreyta (nýlegt álag)",
    low: "Lágt", high: "Hátt",
    acwrLabel: "Álagshlutfall (ACWR)",
    acuteLabel: "Nýlegt (7 daga)",
    chronicLabel: "Grunnform (28 daga)",
    confidence: "Áreiðanleiki",
    conf: { low: "lágur", medium: "miðlungs", high: "hár" },
    why: "Af hverju",
    auDay: "AU/dag",
    zones: {
      primed: "Þú ert í góðu formi og ferskur — kjöraðstæður til að æfa fast.",
      overreaching: "Gott form en mikið álag nýlega — passaðu endurheimt næstu daga.",
      detrained: "Álag hefur minnkað — formið dalar ef þú bætir ekki við.",
      danger: "Skörp álagsaukning á lágum grunni — aukin meiðslahætta, farðu varlega.",
      baseline: "Safna grunnlínu — haltu áfram að skrá svo formið verði marktækt.",
    },
    zoneLabels: { primed: "Ferskur", overreaching: "Yfirálag", detrained: "Formtap", danger: "Hættusvæði" },
    whyText: (q: Quadrant) =>
      `Nýlegt álag ${q.acute_daily} AU/dag á móti grunnformi ${q.chronic_daily} AU/dag` +
      (q.acwr != null ? ` (hlutfall ${q.acwr}).` : "."),
  },
  EN: {
    title: "Fitness & load",
    fitness: "Fitness (chronic load)",
    fatigue: "Fatigue (recent load)",
    low: "Low", high: "High",
    acwrLabel: "Load ratio (ACWR)",
    acuteLabel: "Recent (7-day)",
    chronicLabel: "Base fitness (28-day)",
    confidence: "Confidence",
    conf: { low: "low", medium: "medium", high: "high" },
    why: "Why",
    auDay: "AU/day",
    zones: {
      primed: "You're fit and fresh — a great window to train hard.",
      overreaching: "Good fitness but high recent load — protect recovery over the next days.",
      detrained: "Load has dropped — fitness will fade if you don't add some back.",
      danger: "A sharp load spike on a low base — higher injury risk, ease in.",
      baseline: "Building a baseline — keep logging so this becomes meaningful.",
    },
    zoneLabels: { primed: "Primed", overreaching: "Overreaching", detrained: "Detraining", danger: "Danger" },
    whyText: (q: Quadrant) =>
      `Recent load ${q.acute_daily} AU/day vs base fitness ${q.chronic_daily} AU/day` +
      (q.acwr != null ? ` (ratio ${q.acwr}).` : "."),
  },
} as const;

const ZONE_COLOR: Record<string, string> = {
  primed: "#16a34a",
  overreaching: "#d97706",
  detrained: "#64748b",
  danger: "#dc2626",
  baseline: "#94a3b8",
};

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

export default function LoadQuadrant({ lang = "IS" }: { lang?: Lang }) {
  const t = COPY[lang];
  const [q, setQ] = useState<Quadrant | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/client/load-quadrant`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.ok) setQ(json.quadrant as Quadrant);
    } catch { /* soft */ } finally { setLoaded(true); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!loaded || !q) return null;

  // Plot position. X by chronic vs own baseline (ratio→0.5 centred). Y by ACWR.
  const ratio = q.older_chronic > 0 ? q.chronic_daily / q.older_chronic : (q.chronic_daily > 0 ? 1.2 : 0.4);
  const xFrac = clamp(0.5 * ratio, 0.1, 0.9);
  const acwr = q.acwr ?? (q.chronic_daily > 0 ? 1 : 0.5);
  const fatFrac = clamp((acwr - 0.5) / (1.8 - 0.5), 0.08, 0.92);

  const W = 280, H = 220, pad = 28;
  const px = pad + xFrac * (W - 2 * pad);
  const py = pad + (1 - fatFrac) * (H - 2 * pad);
  // Dividers: fitness midline at xFrac 0.5; fatigue line at ACWR 1.3.
  const divX = pad + 0.5 * (W - 2 * pad);
  const acwrLineFrac = clamp((1.3 - 0.5) / (1.8 - 0.5), 0.08, 0.92);
  const divY = pad + (1 - acwrLineFrac) * (H - 2 * pad);
  const color = ZONE_COLOR[q.zone] ?? "#94a3b8";

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">{t.title}</h3>
        <span className="text-[11px] text-slate-500">
          {t.confidence}: {t.conf[q.confidence]}
        </span>
      </div>

      {/* One-sentence verdict */}
      <p className="text-sm font-medium" style={{ color }}>
        {q.zone !== "baseline" && <span className="mr-1">●</span>}
        {t.zones[q.zone]}
      </p>

      <div className="flex justify-center">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[320px]" role="img" aria-label={t.title}>
          {/* zone tints */}
          <rect x={divX} y={pad} width={W - pad - divX} height={divY - pad} fill="#16a34a" opacity="0.06" />
          <rect x={divX} y={divY} width={W - pad - divX} height={H - pad - divY} fill="#16a34a" opacity="0.03" />
          <rect x={pad} y={pad} width={divX - pad} height={divY - pad} fill="#dc2626" opacity="0.05" />
          <rect x={pad} y={divY} width={divX - pad} height={H - pad - divY} fill="#64748b" opacity="0.05" />

          {/* axes */}
          <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#cbd5e1" strokeWidth="1" />
          <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="#cbd5e1" strokeWidth="1" />
          {/* dividers */}
          <line x1={divX} y1={pad} x2={divX} y2={H - pad} stroke="#e2e8f0" strokeDasharray="4 3" />
          <line x1={pad} y1={divY} x2={W - pad} y2={divY} stroke="#e2e8f0" strokeDasharray="4 3" />

          {/* zone labels */}
          <text x={(divX + W - pad) / 2} y={pad + 12} textAnchor="middle" fontSize="9" fill="#16a34a">{t.zoneLabels.overreaching}</text>
          <text x={(divX + W - pad) / 2} y={H - pad - 6} textAnchor="middle" fontSize="9" fill="#16a34a">{t.zoneLabels.primed}</text>
          <text x={(pad + divX) / 2} y={pad + 12} textAnchor="middle" fontSize="9" fill="#dc2626">{t.zoneLabels.danger}</text>
          <text x={(pad + divX) / 2} y={H - pad - 6} textAnchor="middle" fontSize="9" fill="#64748b">{t.zoneLabels.detrained}</text>

          {/* current position */}
          <circle cx={px} cy={py} r="7" fill={color} stroke="white" strokeWidth="2" />

          {/* axis captions */}
          <text x={W / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="#64748b">→ {t.fitness}</text>
          <text x={10} y={H / 2} textAnchor="middle" fontSize="9" fill="#64748b" transform={`rotate(-90 10 ${H / 2})`}>→ {t.fatigue}</text>
        </svg>
      </div>

      {/* numbers + why */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{t.acuteLabel}</div>
          <div className="text-sm font-semibold text-slate-900">{q.acute_daily} <span className="text-[10px] font-normal text-slate-500">{t.auDay}</span></div>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{t.chronicLabel}</div>
          <div className="text-sm font-semibold text-slate-900">{q.chronic_daily} <span className="text-[10px] font-normal text-slate-500">{t.auDay}</span></div>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{t.acwrLabel}</div>
          <div className="text-sm font-semibold text-slate-900">{q.acwr ?? "—"}</div>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">{t.why}: {t.whyText(q)}</p>
    </div>
  );
}

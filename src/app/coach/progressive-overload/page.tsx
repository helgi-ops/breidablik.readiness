"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import ProgressiveOverloadCard from "@/components/coach/ProgressiveOverloadCard";
import VerdictBanner, { type VerdictDriver, type VerdictTone } from "@/components/coach/VerdictBanner";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

// Minimal shape of the plan the verdict needs — mirrors /api/coach/progressive-overload.
// The dense ramp table below renders from ProgressiveOverloadCard's own fetch (unchanged).
type PlanStatus = "build" | "progress" | "hold";
type VerdictPlayer = { name: string; acwr: number | null; status: PlanStatus };
type VerdictRamp = { kpi: string; ratePct: number };
type VerdictPlan = {
  hasData: boolean;
  teamAcwr: number | null;
  ramps: VerdictRamp[];
  perPlayer: VerdictPlayer[];
  coverage: { trainingDays: number; playersWithHistory: number; totalPlayers: number };
};

export default function ProgressiveOverloadPage() {
  const [lang] = useLang();
  const [date, setDate] = useState<string>("");
  const [weeks, setWeeks] = useState<number>(5);
  const today = new Date().toISOString().slice(0, 10);

  // Lightweight fetch — only to compute the plain-language verdict banner.
  // The ramp table / per-player drill-down still come from ProgressiveOverloadCard.
  const [plan, setPlan] = useState<VerdictPlan | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session?.access_token) return;
        const qs = new URLSearchParams();
        if (date) qs.set("date", date);
        qs.set("weeks", String(weeks));
        const res = await fetch(`/api/coach/progressive-overload?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const j = await res.json();
        if (!alive) return;
        setPlan(res.ok ? ((j.plan ?? null) as VerdictPlan | null) : null);
      } catch {
        if (alive) setPlan(null);
      }
    })();
    return () => { alive = false; };
  }, [date, weeks]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* ── Plain-language verdict (rules, not AI) — explainability-first header ── */}
      {plan != null && (() => {
        const buildPlayers = plan.perPlayer.filter((p) => p.status === "build");
        const holdPlayers = plan.perPlayer.filter((p) => p.status === "hold");
        const holdN = holdPlayers.length;
        const buildN = buildPlayers.length;
        const covered = plan.coverage.playersWithHistory;
        const totalP = plan.coverage.totalPlayers;

        // Headline weekly build rate — prefer Player Load, else median of available ramps.
        const plRamp = plan.ramps.find((r) => r.kpi === "playerLoad");
        let rate = plRamp?.ratePct ?? null;
        if (rate == null && plan.ramps.length > 0) {
          const rates = plan.ramps.map((r) => r.ratePct).sort((a, b) => a - b);
          rate = rates[Math.floor(rates.length / 2)];
        }

        // Confidence from coverage (signal coverage + baseline maturity).
        const noData = !plan.hasData || plan.ramps.length === 0 || covered === 0;
        const confLevel: "high" | "moderate" | "low" =
          noData || covered < 6 || plan.coverage.trainingDays < 10 ? "low"
          : covered < 12 || plan.coverage.trainingDays < 21 ? "moderate"
          : "high";
        const confNote = noData
          ? { EN: "no usable training history yet", IS: "engin nothæf æfingasaga enn" }
          : {
              EN: `${covered}/${totalP} players · ${plan.coverage.trainingDays} training days`,
              IS: `${covered}/${totalP} leikmenn · ${plan.coverage.trainingDays} æfingadagar`,
            };

        // Tone: no data → neutral; mostly hold → watch; otherwise healthy build → good.
        let tone: VerdictTone;
        if (noData) tone = "neutral";
        else if (holdN > 0 && holdN >= buildN) tone = "watch";
        else tone = "good";

        // One plain sentence — no raw jargon (ACWR / ceiling / rate live in tooltips).
        const ratePart = rate != null
          ? { EN: `about ${rate}% harder week-on-week`, IS: `um ${rate}% þyngra viku frá viku` }
          : { EN: "a small, steady amount harder each week", IS: "örlítið þyngra á hverri viku" };
        let sentence: { EN: string; IS: string };
        if (noData) {
          sentence = {
            EN: "Not enough training history yet to build a safe ramp.",
            IS: "Ekki nóg æfingasaga enn til að byggja öruggan stiganda.",
          };
        } else {
          const buildClause = buildN > 0
            ? { EN: ` ${buildN} ${buildN === 1 ? "player has" : "players have"} room to build faster`, IS: ` ${buildN} ${buildN === 1 ? "leikmaður hefur" : "leikmenn hafa"} svigrúm til að byggja hraðar` }
            : { EN: "", IS: "" };
          const holdClause = holdN > 0
            ? { EN: ` ${holdN} should hold steady`, IS: ` ${holdN} ættu að halda í horfinu` }
            : { EN: "", IS: "" };
          const tail = holdN > 0 || buildN > 0
            ? {
                EN: `;${[buildClause.EN, holdClause.EN].filter(Boolean).join(",")}.`,
                IS: `;${[buildClause.IS, holdClause.IS].filter(Boolean).join(",")}.`,
              }
            : { EN: " across the whole squad.", IS: " fyrir allt liðið." };
          sentence = {
            EN: `The squad can safely train ${ratePart.EN}${tail.EN}`,
            IS: `Liðið getur örugglega æft ${ratePart.IS}${tail.IS}`,
          };
        }

        const subtitle = {
          EN: "Progressive overload = how much harder training can get each week without overloading. The build is capped so the recent-vs-typical workload ratio stays safe and never exceeds match demand.",
          IS: "Stígandi álag = hversu mikið þyngri æfingar mega verða í hverri viku án þess að ofhlaða. Stigandinn er takmarkaður svo hlutfall nýlegs álags á móti venjulegu haldist öruggt og fari aldrei yfir leikálag.",
        };

        // Drivers — named hold / build-faster players, ACWR jargon + citation in the tip.
        const gabbettTip = {
          EN: "Acute:chronic workload ratio (ACWR ≥ 1.3 = already loaded; < 0.8 = under-loaded). Gabbett 2017; Hulin 2014.",
          IS: "Acute:chronic vinnuálagshlutfall (ACWR ≥ 1.3 = þegar hlaðinn; < 0.8 = vanhlaðinn). Gabbett 2017; Hulin 2014.",
        };
        const drivers: VerdictDriver[] = [
          ...holdPlayers.slice(0, 4).map((p): VerdictDriver => ({
            label: p.name,
            detail: { EN: "hold steady", IS: "halda í horfinu" },
            tone: "watch",
            tip: gabbettTip,
          })),
          ...buildPlayers.slice(0, 3).map((p): VerdictDriver => ({
            label: p.name,
            detail: { EN: "room to build faster", IS: "svigrúm til að byggja hraðar" },
            tone: "good",
            tip: gabbettTip,
          })),
        ];

        return (
          <div className="mb-4">
            <VerdictBanner
              lang={lang}
              tone={tone}
              kicker={{ EN: "Build plan", IS: "Uppbyggingaráætlun" }}
              sentence={sentence}
              subtitle={subtitle}
              confidence={{ level: confLevel, note: confNote }}
              drivers={drivers.length > 0 ? drivers : undefined}
            />
          </div>
        );
      })()}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Progressive Overload — Build Plan</h1>
          <p className="text-sm text-slate-500">
            A preparation-phase ramp for every load KPI: a safe week-by-week build from the squad&apos;s current
            baseline toward match demand. Volume ramps faster than high-speed/sprint, every week is capped so the
            projected acute:chronic ratio stays ≤ 1.3, and no session is pushed past match load.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-[11px] text-slate-500">
            Weeks
            <select
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
              className="mt-0.5 h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700"
            >
              {[3, 4, 5, 6, 8].map((w) => <option key={w} value={w}>{w} weeks</option>)}
            </select>
          </label>
          <label className="flex flex-col text-[11px] text-slate-500">
            Anchor day
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              title="Anchor day (empty = today)"
              className="mt-0.5 h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
            />
          </label>
        </div>
      </div>
      <ProgressiveOverloadCard date={date || undefined} weeks={weeks} />
    </div>
  );
}

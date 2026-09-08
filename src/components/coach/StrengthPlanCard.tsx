"use client";

/**
 * Strength plan from the deficit ledger — the second consumer, surfaced. Reads the
 * reconciled ledger's strength-feeding deficits (strength-capacity / speed-power /
 * asymmetry) and shows the strength emphases + VBT force-velocity targeting for the
 * per-player periodization block, each traceable to its driving deficit(s). The
 * corrective/prehab plan (Correctives tab) + this strength emphasis + the deficit
 * ledger are the one individualised plan. Silent until a strength-feeding deficit
 * exists. Descriptive — never the readiness colour.
 */
import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import type { StrengthTarget } from "@/lib/micropulse/unifiedDeficits/strengthPlan";

const GREEN = "#1c7a4a";
const SOURCE_LABEL: Record<string, string> = {
  movement_screen: "screen", movement_form: "form", region: "region", vald: "VALD", vbt: "VBT", ima: "IMA", load: "load", clinical_ax: "clinical", rehab_track: "rehab",
};

export default function StrengthPlanCard({ playerId, isEN }: { playerId: string; isEN: boolean }) {
  const [plan, setPlan] = React.useState<StrengthTarget[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);

  React.useEffect(() => {
    let alive = true;
    if (!playerId) { setPlan([]); setLoaded(true); return; }
    (async () => {
      try {
        const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "";
        const res = await fetch(`/api/coach/deficit-ledger?player_id=${encodeURIComponent(playerId)}`, { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
        const j = await res.json().catch(() => ({}));
        if (alive) { setPlan(res.ok && Array.isArray(j.strengthPlan) ? (j.strengthPlan as StrengthTarget[]) : []); setLoaded(true); }
      } catch { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [playerId]);

  if (!loaded || plan.length === 0) return null; // silent until a strength-feeding deficit exists

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: `${GREEN}22`, background: `${GREEN}0a` }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: GREEN }}>{T("Strength plan (from the ledger)", "Styrktar-plan (úr halla-bókinni)")}</p>
      <p className="mt-0.5 text-[11px] text-slate-600">{T("Strength / power / asymmetry deficits → emphasis + VBT targeting for the periodization block. Every emphasis traces to its deficit.", "Styrk / kraft / ósamhverfu hölla → áhersla + VBT-miðun fyrir periodization-blokkina. Hver áhersla rekjanleg til sinnar höllu.")}</p>

      <ul className="mt-2 space-y-2">
        {plan.map((t) => (
          <li key={t.emphasis} className="rounded-lg border bg-white p-2.5" style={{ borderColor: `${GREEN}22` }}>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[13px] font-semibold text-slate-800">{L(t.label)}</span>
              <span className="rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ background: t.confidenceTier === "high" ? `${GREEN}22` : t.confidenceTier === "moderate" ? "#de932822" : "#94a3b822", color: t.confidenceTier === "high" ? GREEN : t.confidenceTier === "moderate" ? "#8a5a12" : "#64748b" }}>{t.confidenceTier === "high" ? T("high confidence", "há vissa") : t.confidenceTier === "moderate" ? T("moderate", "miðlungs") : T("hint", "vísbending")}</span>
            </div>
            <p className="mt-1 text-[12px] text-slate-700">{L(t.howTo)}</p>
            <p className="mt-0.5 text-[11px] text-slate-500"><span className="font-semibold">VBT:</span> {L(t.vbtNote)}</p>
            <p className="mt-1 text-[10px] text-slate-400">
              {T("Driven by:", "Drifið af:")} {[...new Set(t.drivers.map((d) => `${L(d.label)} (${SOURCE_LABEL[d.source] ?? d.source})`))].join(" · ")}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[9px] text-slate-500">{T("Rules recommend; the coach decides. Feeds the periodization block alongside the corrective/prehab plan — one individualised plan. Never the readiness colour.", "Reglur mæla með; þjálfarinn ákveður. Fæðir periodization-blokkina samhliða corrective/prehab plani — eitt einstaklingsmiðað plan. Aldrei readiness-liturinn.")}</p>
    </div>
  );
}

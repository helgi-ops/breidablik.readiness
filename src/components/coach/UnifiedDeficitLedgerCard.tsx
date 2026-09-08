"use client";

/**
 * Unified deficit ledger for Total Player Analysis — the reconciled per-player
 * summary: every source (movement screen, screening form, VALD, …) aggregated
 * into ONE ranked list, each deficit with its status (hypothesis/confirmed),
 * confidence, contributing sources, which consumer it feeds (corrective / strength)
 * and the confirmation tests outstanding. The coach can dismiss / confirm any
 * deficit. Same finding across sources = one higher-confidence target.
 *
 * Descriptive — never the readiness colour; a hypothesis is not a diagnosis;
 * pain / red flags → clinician. Self-contained; silent until any source has data.
 */
import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import { DOMAIN_LABEL } from "@/lib/micropulse/movementScreen/testCatalogue";
import type { ReconciledDeficit } from "@/lib/micropulse/unifiedDeficits/reconcile";

const BLUE = "#2740e6";
const SOURCE_LABEL: Record<string, Bi> = {
  movement_screen: { en: "Movement screen", is: "Hreyfiskimun" },
  movement_form: { en: "Screening form", is: "Skimunar-form" },
  region: { en: "Region assessment", is: "Svæðismat" },
  vald: { en: "VALD", is: "VALD" },
  vbt: { en: "VBT", is: "VBT" },
  ima: { en: "IMA / GPS", is: "IMA / GPS" },
  load: { en: "Load monitor", is: "Álags-vöktun" },
  clinical_ax: { en: "Clinical assessment", is: "Klínískt mat" },
  rehab_track: { en: "Rehab track", is: "Endurhæfingar-ferill" },
};

export default function UnifiedDeficitLedgerCard({ playerId, isEN }: { playerId: string; isEN: boolean }) {
  const [summary, setSummary] = React.useState<ReconciledDeficit[]>([]);
  const [counts, setCounts] = React.useState<{ corrective: number; strength: number }>({ corrective: 0, strength: 0 });
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);
  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "", []);

  const load = React.useCallback(async () => {
    if (!playerId) { setSummary([]); setLoaded(true); return; }
    const res = await fetch(`/api/coach/deficit-ledger?player_id=${encodeURIComponent(playerId)}`, { cache: "no-store", headers: { Authorization: `Bearer ${await token()}` } });
    const j = await res.json().catch(() => ({}));
    setSummary(res.ok && Array.isArray(j.summary) ? (j.summary as ReconciledDeficit[]) : []);
    setCounts({ corrective: j.correctiveCount ?? 0, strength: j.strengthCount ?? 0 });
    setLoaded(true);
  }, [playerId, token]);
  React.useEffect(() => { setLoaded(false); load(); }, [load]);

  const override = async (quality: string, action: "dismiss" | "confirm" | "clear") => {
    setBusy(quality);
    try {
      await fetch("/api/coach/deficit-ledger", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ player_id: playerId, quality, action }) });
      await load();
    } finally { setBusy(null); }
  };

  if (!loaded || summary.length === 0) return null; // silent until a source has data

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: `${BLUE}22`, background: `${BLUE}08` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: BLUE }}>{T("Deficit ledger (all sources)", "Halla-bók (allar heimildir)")}</p>
        <span className="text-[10px] text-slate-500">{T(`→ ${counts.corrective} corrective · ${counts.strength} strength`, `→ ${counts.corrective} corrective · ${counts.strength} styrkur`)}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-600">{T("Every source reconciled into one ranked list — a finding on several sources is one higher-confidence target. Feeds the corrective/prehab and strength plans; a hypothesis is not a diagnosis.", "Allar heimildir sameinaðar í einn raðaðan lista — niðurstaða á mörgum heimildum er eitt hærri-vissu markmið. Fæðir corrective/prehab og styrktar-plön; tilgáta er ekki greining.")}</p>

      <ul className="mt-2 space-y-2">
        {summary.map((d) => {
          const dismissed = d.overridden === "dismiss";
          return (
            <li key={d.quality} className={`rounded-lg border bg-white p-2.5 ${dismissed ? "opacity-50" : ""}`} style={{ borderColor: d.medicalReferral ? "#de932855" : `${BLUE}22` }}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[13px] font-semibold text-slate-800">{L(d.label)}</span>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${d.status === "confirmed" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{d.status === "confirmed" ? T("confirmed", "staðfest") : T("hypothesis", "tilgáta")}</span>
                <span className="rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ background: d.confidenceTier === "high" ? "#1c7a4a22" : d.confidenceTier === "moderate" ? "#de932822" : "#94a3b822", color: d.confidenceTier === "high" ? "#1c7a4a" : d.confidenceTier === "moderate" ? "#8a5a12" : "#64748b" }}>{d.confidenceTier === "high" ? T("high confidence", "há vissa") : d.confidenceTier === "moderate" ? T("moderate", "miðlungs") : T("hint", "vísbending")}</span>
                {d.sides.filter((s) => s !== "both").length > 0 && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600">{d.sides.filter((s) => s !== "both").join("/")}</span>}
                {d.medicalReferral && <span className="rounded bg-[#a83e28]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#a83e28]">{T("→ clinician", "→ klíníker")}</span>}
                {dismissed && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] text-slate-600">{T("dismissed", "vísað frá")}</span>}
              </div>

              {/* feeds + sources */}
              <div className="mt-1 flex flex-wrap gap-1">
                {!d.medicalReferral && d.feeds.map((f) => <span key={f} className="rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: `${BLUE}12`, color: BLUE }}>{f === "corrective" ? T("→ corrective", "→ corrective") : T("→ strength", "→ styrkur")}</span>)}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{T("Sources:", "Heimildir:")} {d.sources.map((s) => `${L(SOURCE_LABEL[s.source] ?? { en: s.source, is: s.source })}${s.status === "confirmed" ? " ✓" : ""}`).join(" · ")}</p>
              {d.outstandingConfirmations.length > 0 && (
                <p className="mt-0.5 text-[11px] text-slate-600">{T("Confirm with:", "Staðfestu með:")} <span className="text-slate-500">{d.outstandingConfirmations.map((s) => s.replace(/_/g, " ")).join(" · ")}</span></p>
              )}
              <p className="mt-0.5 text-[9px] text-slate-400">{L(DOMAIN_LABEL[d.domain])}{d.evidenceGrade ? ` · ${d.evidenceGrade}` : ""}</p>

              {/* coach override */}
              <div className="mt-1.5 flex gap-2">
                {dismissed ? (
                  <button disabled={busy === d.quality} onClick={() => override(d.quality, "clear")} className="text-[10px] font-semibold text-[#2740e6] hover:underline">{T("Restore", "Endurheimta")}</button>
                ) : (
                  <>
                    {d.status !== "confirmed" && <button disabled={busy === d.quality} onClick={() => override(d.quality, "confirm")} className="text-[10px] font-semibold text-emerald-700 hover:underline">{T("Confirm", "Staðfesta")}</button>}
                    <button disabled={busy === d.quality} onClick={() => override(d.quality, "dismiss")} className="text-[10px] font-semibold text-slate-500 hover:underline">{T("Dismiss", "Vísa frá")}</button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[9px] text-slate-500">{T("Rules reconcile; the coach decides. Descriptive — never the readiness colour. Pain / red flags → clinician; a movement-screen quality is a hypothesis, not a diagnosis.", "Reglur sameina; þjálfarinn ákveður. Lýsandi — aldrei readiness-liturinn. Verkur / rauð flögg → klíníker; hreyfiskimunar-gæði er tilgáta, ekki greining.")}</p>
    </div>
  );
}

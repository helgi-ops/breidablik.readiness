"use client";

/**
 * The one individualised plan — the capstone synthesis on the player profile.
 * Reads the SAME reconciled deficit ledger from both consumers and merges them
 * into one traceable overview: the deficits (why) → prehab/corrective block +
 * strength emphasis + rehab track, each tracing back to source + confidence. The
 * detail (per-deficit provenance, overrides, VBT, exercises-to-send) lives in the
 * cards below + the Correctives tab; this is the glance + the "why".
 *
 * Descriptive/advisory — never the readiness colour; rules recommend, the coach
 * decides; pain / red flags → clinician; re-tests update it automatically. Silent
 * until there is a plan.
 */
import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";

const INK = "#14181c";
const SOURCE_LABEL: Record<string, string> = {
  movement_screen: "screen", movement_form: "form", region: "region", vald: "VALD", vbt: "VBT", ima: "IMA", load: "load", clinical_ax: "clinical", rehab_track: "rehab",
};

type Deficit = { quality: string; label: Bi; status: string; confidenceTier: string; medicalReferral: boolean; overridden?: string; sources: Array<{ source: string }>; feeds: string[] };
type Strength = { emphasis: string; label: Bi; confidenceTier: string };
type Priority = { key: string; label: Bi };
type Phase = { label: Bi; items: Array<{ slug: string }> };
type Prescription = { priorities: Priority[]; phases: Phase[] } | null;
type RehabTrack = { name: Bi } | null;
type RehabProtocol = { slug: string; title: Bi; coachPath: string };

export default function IndividualisedPlanCard({ playerId, isEN }: { playerId: string; isEN: boolean }) {
  const [summary, setSummary] = React.useState<Deficit[]>([]);
  const [strengthPlan, setStrengthPlan] = React.useState<Strength[]>([]);
  const [prescription, setPrescription] = React.useState<Prescription>(null);
  const [rehabTrack, setRehabTrack] = React.useState<RehabTrack>(null);
  const [rehabProtocols, setRehabProtocols] = React.useState<RehabProtocol[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);

  React.useEffect(() => {
    let alive = true;
    if (!playerId) { setLoaded(true); return; }
    setLoaded(false);
    (async () => {
      try {
        const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "";
        const h = { Authorization: `Bearer ${tok}` };
        const q = encodeURIComponent(playerId);
        const [led, corr] = await Promise.all([
          fetch(`/api/coach/deficit-ledger?player_id=${q}`, { cache: "no-store", headers: h }).then((r) => r.json()).catch(() => ({})),
          fetch(`/api/coach/movement-screen/corrective?player_id=${q}`, { cache: "no-store", headers: h }).then((r) => r.json()).catch(() => ({})),
        ]);
        if (!alive) return;
        setSummary(Array.isArray(led.summary) ? led.summary : []);
        setStrengthPlan(Array.isArray(led.strengthPlan) ? led.strengthPlan : []);
        setPrescription(corr.prescription ?? null);
        setRehabTrack(corr.rehabTrack ?? null);
        setRehabProtocols(Array.isArray(corr.rehabProtocols) ? corr.rehabProtocols : []);
        setLoaded(true);
      } catch { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [playerId]);

  const active = summary.filter((d) => !d.medicalReferral && d.overridden !== "dismiss");
  const medical = summary.filter((d) => d.medicalReferral);
  const prehabCount = prescription ? prescription.phases.reduce((n, p) => n + p.items.length, 0) : 0;
  const sourcesUsed = [...new Set(active.flatMap((d) => d.sources.map((s) => SOURCE_LABEL[s.source] ?? s.source)))];

  if (!loaded) return null;
  if (active.length === 0 && !prescription && strengthPlan.length === 0) return null; // no plan yet

  return (
    <div className="rounded-xl border border-slate-300 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: INK }}>{T("Individualised plan", "Einstaklingsmiðað plan")}</p>
        <span className="text-[10px] text-slate-400">{T("one plan · all data reconciled", "eitt plan · öll gögn sameinuð")}</span>
      </div>

      {/* (0) verdict */}
      <p className="mt-1 text-[13px] font-semibold text-slate-800">
        {active.length > 0
          ? T(`${active.length} target${active.length === 1 ? "" : "s"} → ${prehabCount} prehab exercise${prehabCount === 1 ? "" : "s"} + ${strengthPlan.length} strength emphas${strengthPlan.length === 1 ? "is" : "es"}${rehabTrack ? " + rehab track" : ""}`,
              `${active.length} markmið → ${prehabCount} prehab æfingar + ${strengthPlan.length} styrktar-áherslur${rehabTrack ? " + endurhæfingar-ferill" : ""}`)
          : T("No corroborated targets yet.", "Engin staðfest markmið enn.")}
        {medical.length > 0 && <span className="ml-1.5 text-[#a83e28]">· {medical.length} {T("→ clinician", "→ klíníker")}</span>}
      </p>

      {/* (1) the merged plan — prehab · strength · rehab */}
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#5a3ea4]">{T("Prehab / corrective", "Prehab / corrective")}</p>
          {prescription && prescription.priorities.length > 0 ? (
            <>
              <ul className="mt-1 space-y-0.5">{prescription.priorities.slice(0, 4).map((p) => <li key={p.key} className="text-[11px] text-slate-700">· {L(p.label)}</li>)}</ul>
              <p className="mt-1 text-[10px] text-slate-400">{T(`${prehabCount} exercises — send on the Correctives tab`, `${prehabCount} æfingar — sendu á Correctives flipanum`)}</p>
            </>
          ) : <p className="mt-1 text-[11px] text-slate-400">{T("—", "—")}</p>}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1c7a4a]">{T("Strength emphasis", "Styrktar-áhersla")}</p>
          {strengthPlan.length > 0 ? (
            <ul className="mt-1 space-y-0.5">{strengthPlan.map((t) => <li key={t.emphasis} className="text-[11px] text-slate-700">· {L(t.label)}</li>)}</ul>
          ) : <p className="mt-1 text-[11px] text-slate-400">{T("—", "—")}</p>}
          {strengthPlan.length > 0 && <p className="mt-1 text-[10px] text-slate-400">{T("applied to the MD session", "beitt á MD-session")}</p>}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7a5cc4]">{T("Rehab", "Endurhæfing")}</p>
          {rehabTrack ? <p className="mt-1 text-[11px] text-slate-700">· {L(rehabTrack.name)}</p> : <p className="mt-1 text-[11px] text-slate-400">{T("—", "—")}</p>}
          {rehabProtocols.map((p) => <a key={p.slug} href={`${p.coachPath}?player=${encodeURIComponent(playerId)}`} className="mt-0.5 block text-[10px] font-semibold text-[#7a5cc4] hover:underline">{L(p.title)} →</a>)}
        </div>
      </div>

      {/* (1) provenance + re-test */}
      {sourcesUsed.length > 0 && (
        <p className="mt-2 text-[10px] text-slate-500">{T("Built from:", "Byggt á:")} {sourcesUsed.join(" · ")} · {T("re-test updates this automatically", "endurpróf uppfærir þetta sjálfkrafa")}</p>
      )}
      <p className="mt-1 text-[9px] text-slate-500">{T("Rules reconcile; the coach decides. Descriptive — never the readiness colour. Pain / red flags → clinician; a movement-screen finding is a hypothesis. See the deficit ledger below for each target's sources and confidence.", "Reglur sameina; þjálfarinn ákveður. Lýsandi — aldrei readiness-liturinn. Verkur / rauð flögg → klíníker; hreyfiskimunar-niðurstaða er tilgáta. Sjá halla-bókina að neðan fyrir heimildir og vissu hvers markmiðs.")}</p>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { buildRtpReportDocument } from "@/lib/micropulse/rtp/rtpReportDocument";
import { buildPdfRenderModel } from "@/lib/micropulse/reporting/pdfModel";
import { downloadReportPdf } from "@/components/reporting/ReportPdf";
import type { RtpAssessment, RtpCriterion } from "@/lib/micropulse/rtp/types";

const STATUS_STYLE: Record<RtpCriterion["status"], string> = {
  PASS: "bg-[#eaf3ec] text-[#145233] border-[#b0d6bd]",
  CAUTION: "bg-[#faf1de] text-[#7c5210] border-[#e9c983]",
  FLAG: "bg-[#f8e9e3] text-[#72291c] border-[#e6b6a6]",
  NO_DATA: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

export default function RtpAssessmentPage() {
  const params = useParams<{ playerId: string }>();
  const router = useRouter();
  const playerId = params?.playerId;

  const [assessment, setAssessment] = useState<RtpAssessment | null>(null);
  const [players, setPlayers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrLoading, setNarrLoading] = useState(false);
  const [showFacts, setShowFacts] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [valgusSev, setValgusSev] = useState<string>("none");
  const [valgusNote, setValgusNote] = useState<string>("");
  const [valgusSaving, setValgusSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null); setNarrative(null);
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { setError("Not signed in."); setLoading(false); return; }
        const res = await fetch(`/api/coach/rtp/${playerId}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json();
        if (!res.ok) { if (alive) setError(json.error ?? "Failed to load"); setLoading(false); return; }
        if (!alive) return;
        setAssessment(json.assessment);
        if (json.assessment?.valgus) { setValgusSev(json.assessment.valgus.severity ?? "none"); setValgusNote(json.assessment.valgus.note ?? ""); }
        // Team roster for the switcher.
        const teamId = json.assessment?.player?.teamId;
        if (teamId) {
          const { data: roster } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true).order("full_name");
          if (alive) setPlayers((roster ?? []) as Array<{ id: string; full_name: string }>);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [playerId, refresh]);

  async function saveValgus() {
    setValgusSaving(true);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/coach/rtp/${playerId}/valgus`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ severity: valgusSev, note: valgusNote }),
      });
      if (res.ok) { setNarrative(null); setRefresh((r) => r + 1); }
    } finally {
      setValgusSaving(false);
    }
  }

  const doc = useMemo(() => (assessment ? buildRtpReportDocument(assessment, narrative) : null), [assessment, narrative]);

  async function generateNarrative() {
    if (!assessment) return;
    setNarrLoading(true);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/coach/rtp/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ assessment, lang: "EN" }),
      });
      const json = await res.json();
      if (res.ok) setNarrative(json.narrative);
      else setNarrative(`(AI summary unavailable: ${json.error ?? res.status})`);
    } finally {
      setNarrLoading(false);
    }
  }

  function downloadPdf() {
    if (!doc || !assessment) return;
    const model = buildPdfRenderModel(doc);
    downloadReportPdf(model, `RTP_${assessment.player.fullName.replace(/\s+/g, "_")}_${assessment.assessmentDate}.pdf`);
  }

  if (loading) return <div className="mx-auto max-w-3xl p-6 text-sm text-zinc-500">Loading assessment…</div>;
  if (error) return <div className="mx-auto max-w-3xl p-6 text-sm text-red-600">{error}</div>;
  if (!assessment) return null;

  const a = assessment;
  const decisionTone = a.rtt?.currentlyInjured || a.criteria.some((c) => c.status === "FLAG")
    ? "bg-[#f8e9e3] text-[#72291c] border-[#e6b6a6]"
    : a.criteria.some((c) => c.status === "CAUTION")
      ? "bg-[#faf1de] text-[#7c5210] border-[#e9c983]"
      : "bg-[#eaf3ec] text-[#145233] border-[#b0d6bd]";

  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-6 space-y-4">
      {/* Header + switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Return-to-Play Assessment</h1>
          <p className="text-sm text-zinc-500">{a.player.fullName}{a.player.position ? ` · ${a.player.position}` : ""} · VALD ForceDecks</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={playerId}
            onChange={(e) => router.push(`/coach/rtp/${e.target.value}`)}
            className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm"
          >
            {players.length === 0 ? <option value={playerId}>{a.player.fullName}</option> : players.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <button type="button" onClick={downloadPdf} className="rounded-lg bg-[#2740e6] px-3.5 py-1.5 text-sm font-semibold text-white">Download PDF</button>
        </div>
      </div>

      {/* Coverage banner (honesty) */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-900">
        <b>Partial battery.</b> Present: {a.coverage.present.join(", ") || "—"}. Pending ingestion: {a.coverage.pending.join(", ")}.
      </div>

      {/* Decision */}
      <div className={`rounded-xl border px-4 py-3 ${decisionTone}`}>
        <div className="text-[11px] font-bold uppercase tracking-wide opacity-80">Decision (rules)</div>
        <div className="mt-0.5 text-sm font-semibold">{a.decision}</div>
        <div className="mt-1 text-xs opacity-80">{a.criteriaMet} of {a.criteriaTotal} measured criteria met{a.injury?.weeksPostInjury != null ? ` · ${a.injury.weeksPostInjury} weeks post-injury` : ""}{a.injury?.stage != null ? ` · RTP stage ${a.injury.stage}/5` : ""}</div>
      </div>

      {/* Domain status */}
      {a.domains.length ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">Domain status</div>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {a.domains.map((d) => (
              <div key={d.domain} className="flex items-center gap-2 text-[12.5px]">
                <span className={`w-[68px] shrink-0 rounded-full border px-2 py-0.5 text-center text-[10px] font-bold ${STATUS_STYLE[d.status]}`}>{d.status}</span>
                <span className="flex-1 text-zinc-700">{d.domain}</span>
                <span className="truncate text-[11px] text-zinc-400">{d.keyFinding}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* AI executive summary (labelled) */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-zinc-900">Executive summary</div>
          {!narrative ? (
            <button type="button" onClick={generateNarrative} disabled={narrLoading} className="rounded-lg border border-[#2740e6] px-3 py-1 text-xs font-semibold text-[#2740e6] disabled:opacity-50">
              {narrLoading ? "Writing…" : "Generate AI summary"}
            </button>
          ) : (
            <span className="text-[11px] font-medium text-zinc-400">AI synthesis · Claude Haiku</span>
          )}
        </div>
        {narrative ? (
          <>
            <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-zinc-700">{narrative}</p>
            <button type="button" onClick={() => setShowFacts((v) => !v)} className="mt-2 text-[11px] font-semibold text-[#2740e6]">{showFacts ? "Hide facts used" : "Show facts used"}</button>
            {showFacts ? (
              <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-zinc-50 p-2 text-[10px] text-zinc-600">{JSON.stringify({ cmj: a.cmj, cod: a.cod, criteria: a.criteria, injury: a.injury }, null, 2)}</pre>
            ) : null}
          </>
        ) : (
          <p className="mt-2 text-[12.5px] text-zinc-400">Rules compute the statuses below. The AI summary only rephrases them — generate it when you want the prose.</p>
        )}
      </div>

      {/* Criteria checklist */}
      {a.criteria.length ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">RTP criteria ({a.criteriaMet}/{a.criteriaTotal} met)</div>
          <div className="mt-2 space-y-1.5">
            {a.criteria.map((c) => (
              <div key={c.key} className="flex items-center gap-2 text-[13px]">
                <span className={`w-[68px] shrink-0 rounded-full border px-2 py-0.5 text-center text-[10px] font-bold ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                <span className="flex-1 text-zinc-700">{c.label} <span className="text-zinc-400">· target {c.target}</span></span>
                <span className="font-semibold text-zinc-900">{c.current}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Metric tables */}
      <div className="grid gap-4 sm:grid-cols-2">
        {a.imtp ? (
          <MetricCard title="Isometric Mid-Thigh Pull" rows={[
            ["Peak force", a.imtp.peakForceN == null ? "—" : `${a.imtp.peakForceN} N`],
            ["Rel. peak force", a.imtp.relPeakForceNkg == null ? "—" : `${a.imtp.relPeakForceNkg.toFixed(1)} N/kg`],
            ["Left / Right", `${a.imtp.leftN ?? "—"} / ${a.imtp.rightN ?? "—"} N`],
            ["Asymmetry", a.imtp.asymmetryPct == null ? "—" : `${a.imtp.asymmetryPct.toFixed(1)}%`],
            ...(a.imtp.lsiPct != null ? [["LSI (inv/uninv)", `${a.imtp.lsiPct}%`] as [string, string]] : []),
            ["Trials (mean)", `${a.imtp.trialCount}`],
          ]} sub={a.imtp.testDate ?? undefined} />
        ) : null}
        {a.cmj ? (
          <MetricCard title="Countermovement Jump" rows={[
            ["Jump height", a.cmj.jumpHeightCm == null ? "—" : `${a.cmj.jumpHeightCm.toFixed(1)} cm`],
            ["RSI-modified", a.cmj.rsiMod == null ? "—" : a.cmj.rsiMod.toFixed(2)],
            ["Peak power", a.cmj.peakPowerW == null ? "—" : `${Math.round(a.cmj.peakPowerW)} W`],
            ["Rel. peak power", a.cmj.relPeakPowerWkg == null ? "—" : `${a.cmj.relPeakPowerWkg.toFixed(1)} W/kg`],
            ["Limb asymmetry", a.cmj.asymmetryPct == null ? "—" : `${a.cmj.asymmetryPct.toFixed(1)}%${a.cmj.asymmetrySide ? ` (${a.cmj.asymmetrySide})` : ""}`],
            ["Trials (mean)", `${a.cmj.trialCount}`],
          ]} sub={a.cmj.testDate ?? undefined} />
        ) : null}
        {a.battery.map((b) => (
          <MetricCard key={b.testType} title={b.label} rows={[
            [b.primaryLabel, b.primaryValue == null ? "—" : `${b.primaryValue}${b.primaryUnit ? " " + b.primaryUnit : ""}`],
            ["Left / Right", `${b.left ?? "—"} / ${b.right ?? "—"}`],
            ["Asymmetry", b.asymmetryPct == null ? "—" : `${b.asymmetryPct.toFixed(1)}%`],
            ...(b.stiffnessAsymPct != null ? [["Stiffness asym", `${b.stiffnessAsymPct.toFixed(1)}%`] as [string, string]] : []),
            ...(b.lsiPct != null ? [["LSI (inv/uninv)", `${b.lsiPct}%`] as [string, string]] : []),
          ]} sub={b.testDate ?? undefined} />
        ))}
        {a.cod ? (
          <MetricCard title="Change-of-Direction (14d)" rows={[
            ["Left (high)", `${a.cod.highLeft}`],
            ["Right (high)", `${a.cod.highRight}`],
            ["Asymmetry", a.cod.asymPct == null ? "—" : `${a.cod.asymPct.toFixed(1)}%`],
            ["Flag", a.cod.flag.toUpperCase()],
            ["Sessions", `${a.cod.sessions}`],
          ]} />
        ) : null}
      </div>

      {/* Dynamic valgus — coach-assessed manual input (not computed) */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm font-semibold text-zinc-900">Dynamic valgus <span className="font-normal text-zinc-400">· coach-assessed video (manual)</span></div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {(["none", "mild", "moderate", "severe"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setValgusSev(s)} className={`rounded-full border px-3 py-1 text-[12px] font-medium capitalize ${valgusSev === s ? "border-[#2740e6] bg-[#2740e6] text-white" : "border-zinc-300 bg-white text-zinc-600"}`}>{s}</button>
          ))}
          <input value={valgusNote} onChange={(e) => setValgusNote(e.target.value)} placeholder="Note (e.g. mild medial shift, right knee)" className="min-w-[220px] flex-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm" />
          <button type="button" onClick={saveValgus} disabled={valgusSaving} className="rounded-lg bg-[#2740e6] px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{valgusSaving ? "Saving…" : "Save"}</button>
        </div>
      </div>

      {/* Recommendations (rule-derived) */}
      {a.recommendations.length ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">Recommendations</div>
          <ul className="mt-2 space-y-1.5">
            {a.recommendations.map((r, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-snug text-zinc-700">
                <span className="text-[#2740e6]">•</span><span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({ title, rows, sub }: { title: string; rows: [string, string][]; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        {sub ? <div className="text-[11px] text-zinc-400">{sub}</div> : null}
      </div>
      <div className="mt-2 divide-y divide-zinc-100">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-1.5 text-[13px]">
            <span className="text-zinc-500">{k}</span>
            <span className="font-semibold text-zinc-900">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { buildRtpReportDocument, type RtpSprintInput } from "@/lib/micropulse/rtp/rtpReportDocument";
import { buildPdfRenderModel } from "@/lib/micropulse/reporting/pdfModel";
import { downloadReportPdf } from "@/components/reporting/ReportPdf";
import PagePurpose from "@/components/coach/PagePurpose";
import BodyMassWidget from "@/components/coach/BodyMassWidget";
import DPrimeSprintCostBlock from "@/components/coach/DPrimeSprintCostBlock";
import ValdBenchmarkPanel from "@/components/coach/ValdBenchmarkPanel";
import ValdTrainingFocus from "@/components/coach/ValdTrainingFocus";
import { djRsiFromBattery, cmrjRsiFromBattery, slHamstringLsiFromBattery, beltSquatRelForceFromBattery, buildValdTrainingPlan } from "@/lib/micropulse/vald/valdSummary";
import type { RtpAssessment, RtpCriterion, RtpLimbStrengthTest } from "@/lib/micropulse/rtp/types";
import type { CriticalSpeedRead, CsCombinedResult, CsTestRead, AnaerobicSpeedReserveRead } from "@/lib/micropulse/load/criticalSpeed";

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
  // Anaerobic sprint capacity (D′ reserve) — same CS/D′ read as the Conditioning card, shown when
  // the player's curve is pinned. Threaded into the PDF too so the report matches the screen.
  const [csSprint, setCsSprint] = useState<RtpSprintInput | null>(null);

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

  // D′ reserve + per-sprint cost. Mirrors the Conditioning card's `primary` selection (3-min test
  // > multi-effort field test > guardrailed MII fit) so the RTP report shows the same CS/D′.
  useEffect(() => {
    let alive = true;
    (async () => {
      setCsSprint(null);
      if (!playerId) return;
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;
        const h = { Authorization: `Bearer ${session.access_token}` };
        const [peak, test] = await Promise.all([
          fetch(`/api/coach/load/peak-period?player=${playerId}`, { headers: h }).then((r) => r.ok ? r.json() : null).catch(() => null) as Promise<{ criticalSpeed?: CsCombinedResult; asr?: AnaerobicSpeedReserveRead | null } | null>,
          fetch(`/api/coach/player/${playerId}/cs-test`, { headers: h }).then((r) => r.ok ? r.json() : null).catch(() => null) as Promise<{ read?: CsTestRead; threeMt?: CriticalSpeedRead | null } | null>,
        ]);
        if (!alive) return;
        const combined = peak?.criticalSpeed ?? null;
        const threeMtCs = test?.threeMt && test.threeMt.csMetresPerMin != null ? test.threeMt : null;
        const testCs = test?.read?.cs && test.read.cs.csMetresPerMin != null ? test.read.cs : null;
        const combinedCs = combined && combined.csMetresPerMin != null && (combined.usedTestAnchor || combined.confidence !== "low") ? combined : null;
        const primary: CriticalSpeedRead | null = threeMtCs ?? testCs ?? combinedCs;
        if (primary && primary.csKmh != null && primary.dPrimeM != null) {
          setCsSprint({ csKmh: primary.csKmh, dPrimeM: primary.dPrimeM, dPrimePercentile: primary.dPrimePercentile, mssKmh: peak?.asr?.mssKmh ?? null });
        }
      } catch { /* D′ read optional — never break the report */ }
    })();
    return () => { alive = false; };
  }, [playerId]);

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

  const doc = useMemo(() => (assessment ? buildRtpReportDocument(assessment, narrative, csSprint) : null), [assessment, narrative, csSprint]);

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

  if (loading) return <div className="mx-auto max-w-4xl p-6 text-sm text-zinc-500">Loading assessment…</div>;
  if (error) return <div className="mx-auto max-w-4xl p-6 text-sm text-red-600">{error}</div>;
  if (!assessment) return null;

  const a = assessment;
  const decisionTone = a.rtt?.currentlyInjured || a.criteria.some((c) => c.status === "FLAG")
    ? "bg-[#f8e9e3] text-[#72291c] border-[#e6b6a6]"
    : a.criteria.some((c) => c.status === "CAUTION")
      ? "bg-[#faf1de] text-[#7c5210] border-[#e9c983]"
      : "bg-[#eaf3ec] text-[#145233] border-[#b0d6bd]";

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6 space-y-4">
      {/* Header + switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">{a.mode === "RTP" ? "Return-to-Play Assessment" : "VALD Assessment"}</h1>
          <PagePurpose
            en="turn a player's VALD tests — ForceDecks jump, NordBord hamstring, ForceFrame groin — into one readiness picture: verdict, why, then the numbers"
            is="breyta VALD prófum leikmanns — ForceDecks stökk, NordBord hamstring, ForceFrame nára — í eina readiness-mynd: niðurstaða, af hverju, svo tölurnar"
            tutorial="force-plate-assessment"
          />
          <p className="text-sm text-zinc-500">{a.player.fullName}{a.player.position ? ` · ${a.player.position}` : ""} · VALD</p>
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

      {/* Body mass — anthropometry for per-kg figures (coach entry preferred, VALD fallback). */}
      {playerId ? <BodyMassWidget playerId={playerId} /> : null}

      {/* Decision */}
      <div className={`rounded-xl border px-4 py-3 ${decisionTone}`}>
        <div className="text-[11px] font-bold uppercase tracking-wide opacity-80">{a.mode === "RTP" ? "Return-to-play decision (rules)" : "Assessment summary (rules)"}</div>
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
          <div className="text-sm font-semibold text-zinc-900">{a.mode === "RTP" ? "RTP criteria" : "Benchmarks"} ({a.criteriaMet}/{a.criteriaTotal} {a.mode === "RTP" ? "met" : "in target"})</div>
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
            ["Net peak force", a.imtp.netPeakForceN == null ? "—" : `${a.imtp.netPeakForceN} N`],
            ["Force @100ms", a.imtp.force100N == null ? "—" : `${a.imtp.force100N} N`],
            ["Force @200ms", a.imtp.force200N == null ? "—" : `${a.imtp.force200N} N`],
            ["Rel. force @200ms", a.imtp.relForce200Nkg == null ? "—" : `${a.imtp.relForce200Nkg.toFixed(1)} N/kg`],
            ["RFD 0-100ms", a.imtp.rfd100 == null ? "—" : `${a.imtp.rfd100} N/s`],
            ["RFD 0-200ms", a.imtp.rfd200 == null ? "—" : `${a.imtp.rfd200} N/s`],
            ["Impulse @200ms", a.imtp.impulse200 == null ? "—" : `${a.imtp.impulse200} N·s`],
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
            ["Contraction time", a.cmj.contractionTimeMs == null ? "—" : `${Math.round(a.cmj.contractionTimeMs)} ms`],
            ["Concentric peak velocity", a.cmj.concentricPeakVelocityMS == null ? "—" : `${a.cmj.concentricPeakVelocityMS.toFixed(2)} m/s`],
            ["Concentric RFD", a.cmj.concentricRfdNS == null ? "—" : `${Math.round(a.cmj.concentricRfdNS)} N/s`],
            ["Limb asymmetry", a.cmj.asymmetryPct == null ? "—" : `${a.cmj.asymmetryPct.toFixed(1)}%${a.cmj.asymmetrySide ? ` (${a.cmj.asymmetrySide})` : ""}`],
            ["Trials (mean)", `${a.cmj.trialCount}`],
          ]} sub={a.cmj.testDate ?? undefined} />
        ) : null}
        {a.battery.map((b) => (
          <MetricCard key={b.testType} title={b.label} rows={[
            [b.primaryLabel, b.primaryValue == null ? "—" : `${b.primaryValue}${b.primaryUnit ? " " + b.primaryUnit : ""}`],
            ...(b.relForceNkg != null ? [["Rel. peak force", `${b.relForceNkg.toFixed(1)} N/kg`] as [string, string]] : []),
            ["Left / Right", `${b.left ?? "—"} / ${b.right ?? "—"}`],
            ["Asymmetry", b.asymmetryPct == null ? "—" : `${b.asymmetryPct.toFixed(1)}%`],
            ...(b.stiffnessAsymPct != null ? [["Stiffness asym", `${b.stiffnessAsymPct.toFixed(1)}%`] as [string, string]] : []),
            ...(b.lsiPct != null ? [["LSI (inv/uninv)", `${b.lsiPct}%`] as [string, string]] : []),
          ]} sub={b.testDate ?? undefined} />
        ))}
        {a.limbStrength.map((l) => (
          <LimbStrengthCard key={`${l.device}-${l.testType}-${l.direction ?? ""}`} test={l} />
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

      {/* How he compares vs his population reference + how to improve.
          Population context (cited), never the verdict — player-shareable. */}
      {(() => {
        const nb = a.limbStrength.find((l) => l.device === "nordbord");
        const ff = a.limbStrength.find((l) => l.device === "forceframe");
        const nbMean = nb && nb.leftN != null && nb.rightN != null ? (nb.leftN + nb.rightN) / 2 : null;
        return (
          <ValdBenchmarkPanel
            pop={a.benchmarkPop}
            imtpRelForceNkg={a.imtp?.relPeakForceNkg}
            imtpRelForce200Nkg={a.imtp?.relForce200Nkg}
            imtpForce100N={a.imtp?.force100N}
            imtpForce200N={a.imtp?.force200N}
            imtpRfd0100Ns={a.imtp?.rfd100}
            imtpRfd0200Ns={a.imtp?.rfd200}
            imtpAsymPct={a.imtp?.asymmetryPct}
            cmjJumpHeightCm={a.cmj?.jumpHeightCm}
            cmjRsiMod={a.cmj?.rsiMod}
            cmjRelPeakPowerWkg={a.cmj?.relPeakPowerWkg}
            cmjAsymPct={a.cmj?.asymmetryPct}
            djRsi={djRsiFromBattery(a.battery)}
            cmrjRsi={cmrjRsiFromBattery(a.battery)}
            beltSquatRelForceNkg={beltSquatRelForceFromBattery(a.battery)}
            slHamstringLsi={slHamstringLsiFromBattery(a.battery)}
            nordbordMeanN={nbMean}
            groinAsymPct={ff?.asymmetryPct ?? null}
            className="mt-4"
          />
        );
      })()}

      {/* Rule-based training recommendation from the VALD benchmarks (IMTP + CMJ primary). */}
      <ValdTrainingFocus plan={buildValdTrainingPlan(a, false)} is={false} className="mt-4" />

      {/* Anaerobic sprint capacity (D′ reserve) — repeated-sprint readiness context for RTP. Same
          CS/D′ read as the Conditioning card; only shows when the curve is pinned. In the PDF too. */}
      {csSprint ? (
        <DPrimeSprintCostBlock csKmh={csSprint.csKmh} dPrimeM={csSprint.dPrimeM} dPrimePercentile={csSprint.dPrimePercentile} mssKmh={csSprint.mssKmh} />
      ) : null}

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

/** NordBord/ForceFrame strength card: latest test up top, expandable history
 *  (all tests of this type, newest first) when the player has more than one. */
function LimbStrengthCard({ test }: { test: RtpLimbStrengthTest }) {
  const [open, setOpen] = useState(false);
  const l = test;
  const asymText = l.asymmetryPct == null ? "—" : `${l.asymmetryPct.toFixed(1)}%${l.asymmetrySide ? ` (${l.asymmetrySide} weaker)` : ""}`;
  const hasHistory = l.history.length > 1;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold text-zinc-900">{l.label}</div>
        <div className="text-[11px] text-zinc-400">{l.device === "nordbord" ? "NordBord" : "ForceFrame"}{l.testDate ? ` · ${l.testDate}` : ""}</div>
      </div>
      <div className="mt-2 divide-y divide-zinc-100">
        {[
          ["Left / Right (peak)", `${l.leftN ?? "—"} / ${l.rightN ?? "—"} N`],
          ...(l.avgLeftN != null || l.avgRightN != null ? [["Left / Right (avg)", `${l.avgLeftN ?? "—"} / ${l.avgRightN ?? "—"} N`] as [string, string]] : []),
          ...(l.maxRfdLeftNS != null || l.maxRfdRightNS != null ? [["Max RFD (L / R)", `${l.maxRfdLeftNS != null ? Math.round(l.maxRfdLeftNS) : "—"} / ${l.maxRfdRightNS != null ? Math.round(l.maxRfdRightNS) : "—"} N/s`] as [string, string]] : []),
          ["Asymmetry", asymText],
          ...(l.lsiPct != null ? [["LSI (inv/uninv)", `${l.lsiPct}%`] as [string, string]] : []),
          ["Status", l.status],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-1.5 text-[13px]">
            <span className="text-zinc-500">{k}</span>
            <span className="font-semibold text-zinc-900">{v}</span>
          </div>
        ))}
      </div>
      {hasHistory && (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 flex items-center gap-1 text-[12px] font-medium text-[#2740e6]">
            {open ? "Hide history" : `Show history (${l.history.length} tests)`} <span className="text-[10px]">{open ? "▴" : "▾"}</span>
          </button>
          {open && (
            <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-100">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    <th className="px-2.5 py-1.5 text-left">Date</th>
                    {l.device === "forceframe" && <th className="px-2.5 py-1.5 text-left">Test</th>}
                    <th className="px-2.5 py-1.5 text-right">L / R</th>
                    <th className="px-2.5 py-1.5 text-right">Asym</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {l.history.map((h, i) => (
                    <tr key={`${h.testDate}-${i}`} className={i === 0 ? "bg-[#f7f9ff]" : ""}>
                      <td className="px-2.5 py-1.5 text-zinc-500">{h.testDate ?? "—"}{i === 0 ? " ·latest" : ""}</td>
                      {l.device === "forceframe" && <td className="px-2.5 py-1.5 text-zinc-500">{h.movement ?? l.testType}</td>}
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-zinc-700">{h.leftN ?? "—"} / {h.rightN ?? "—"}</td>
                      <td className={`px-2.5 py-1.5 text-right tabular-nums font-semibold ${h.status === "FLAG" ? "text-[#a83e28]" : h.status === "CAUTION" ? "text-[#b06a12]" : h.status === "PASS" ? "text-[#1c7a4a]" : "text-zinc-400"}`}>
                        {h.asymmetryPct == null ? "—" : `${h.asymmetryPct.toFixed(1)}%${h.asymmetrySide ? ` ${h.asymmetrySide[0].toUpperCase()}` : ""}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
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

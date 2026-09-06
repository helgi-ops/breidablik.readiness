"use client";

/**
 * Movement Screen — coach records an Onform-style movement test against a player
 * + date, picks the test from the registry, records findings (assisted), and
 * sees the interpreted readings (finding → corrective/strength lever, confidence,
 * RTP/red-flag). Screening/training only — never a diagnosis, never the readiness
 * colour. Video is consent- and access-gated server-side.
 */
import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { MOVEMENT_CATEGORY_LABEL, SEED_MOVEMENT_TESTS, type MovementTest, type Severity } from "@/lib/micropulse/movementScreen/registry";
import { type ScreenContext, type ScreenFinding, type ScreenResult, type Leg, type PoseQuality } from "@/lib/micropulse/movementScreen/interpret";
import { extractPoseFrames } from "@/lib/micropulse/movementScreen/pose/extractClient";
import { analyzePose } from "@/lib/micropulse/movementScreen/pose/analyze";
import { buildScreenReport, type ScreenReport } from "@/lib/micropulse/movementScreen/report";
import MovementScreenReport from "@/components/movement/MovementScreenReport";

type Player = { id: string; full_name: string | null };
type SavedScreen = {
  id: string; testSlug: string; screenDate: string; fileName: string | null; videoUrl: string | null; url: string | null;
  findings: ScreenFinding[]; context: ScreenContext; result: ScreenResult | null;
};
const SEVERITIES: Severity[] = ["ok", "mild", "moderate", "marked"];
const TEST_BY_SLUG = Object.fromEntries(SEED_MOVEMENT_TESTS.map((t) => [t.slug, t]));

export default function MovementScreenClient() {
  const [lang] = useLang();
  const is = lang === "IS";
  const T = (en: string, isT: string) => (is ? isT : en);

  const [tests, setTests] = React.useState<MovementTest[]>([]);
  const [players, setPlayers] = React.useState<Player[]>([]);
  const [teamId, setTeamId] = React.useState<string>("");
  const [slug, setSlug] = React.useState<string>("");
  const [playerId, setPlayerId] = React.useState<string>("");
  const [date, setDate] = React.useState<string>(new Date().toISOString().slice(0, 10));
  const [findings, setFindings] = React.useState<Record<string, { severity: Severity; leg: Leg | ""; value: string }>>({});
  const [pain, setPain] = React.useState(false);
  const [viewCount, setViewCount] = React.useState(1);
  const [poseQuality, setPoseQuality] = React.useState<PoseQuality>("fair");
  const [repeated, setRepeated] = React.useState(false);
  const [videoUrl, setVideoUrl] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [view, setView] = React.useState<"front" | "side" | "both">("front");
  const [clipLeg, setClipLeg] = React.useState<"L" | "R" | "both">("L");
  const [autoBusy, setAutoBusy] = React.useState(false);
  const [autoMsg, setAutoMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<ScreenReport | null>(null);
  const [screens, setScreens] = React.useState<SavedScreen[]>([]);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "", []);

  const refreshScreens = React.useCallback(async (pid: string) => {
    if (!pid) { setScreens([]); return; }
    try {
      const res = await fetch(`/api/coach/movement-screen?player_id=${encodeURIComponent(pid)}`, { headers: { Authorization: `Bearer ${await token()}` } });
      const j = await res.json().catch(() => ({}));
      setScreens(res.ok && Array.isArray(j.screens) ? (j.screens as SavedScreen[]) : []);
    } catch { setScreens([]); }
  }, [token]);

  React.useEffect(() => { void refreshScreens(playerId); }, [playerId, refreshScreens]);

  React.useEffect(() => {
    (async () => {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;
      const { data: prof } = await sb.from("profiles").select("team_id").eq("id", uid).maybeSingle();
      const tid = (prof as { team_id?: string } | null)?.team_id ?? "";
      setTeamId(tid);
      const tok = session.access_token;
      const [tRes, pRes] = await Promise.all([
        fetch(`/api/coach/movement-tests?team_id=${tid}`, { headers: { Authorization: `Bearer ${tok}` } }),
        sb.from("players").select("id, full_name").eq("team_id", tid).eq("is_active", true).order("full_name"),
      ]);
      const tj = await tRes.json().catch(() => ({}));
      if (tRes.ok && tj.tests) { setTests(tj.tests as MovementTest[]); if ((tj.tests as MovementTest[])[0]) setSlug((tj.tests as MovementTest[])[0].slug); }
      setPlayers((pRes.data ?? []) as Player[]);
    })();
  }, []);

  const test = React.useMemo(() => tests.find((t) => t.slug === slug) ?? null, [tests, slug]);

  React.useEffect(() => {
    if (!test) { setFindings({}); return; }
    const next: Record<string, { severity: Severity; leg: Leg | ""; value: string }> = {};
    for (const v of test.variables) next[v.key] = { severity: "ok", leg: test.laterality === "per_leg" ? "L" : "", value: "" };
    setFindings(next);
    setReport(null);
  }, [test]);

  const canAuto = !!file && !!test && test.variables.some((v) => v.extract);

  const autoMeasure = async () => {
    if (!file || !test) return;
    setAutoBusy(true); setAutoMsg(T("Loading pose model…", "Hleð pose-líkani…"));
    try {
      const frames = await extractPoseFrames(file, { onProgress: (p) => setAutoMsg(T(`Analysing frames… ${Math.round(p * 100)}%`, `Greini ramma… ${Math.round(p * 100)}%`)) });
      if (!frames.length) throw new Error(T("No pose detected in the clip.", "Engin pose greind í myndbandinu."));
      const res = analyzePose(test, frames, { side: clipLeg, view });
      if (!res.measures.length) throw new Error(T("Nothing measurable from this view.", "Ekkert mælanlegt úr þessari sýn."));
      setFindings((prev) => {
        const next = { ...prev };
        for (const m of res.measures) {
          next[m.variableKey] = { severity: m.severity, leg: (m.leg ?? "") as Leg | "", value: m.value == null ? "" : String(m.value) };
        }
        return next;
      });
      setAutoMsg(T(`Auto-measured ${res.measures.length} variable(s) — confirm or override below.`, `Sjálfvirkt mældi ${res.measures.length} breytu(r) — staðfestu eða breyttu að neðan.`));
    } catch (e) {
      setAutoMsg((T("Auto-measure failed", "Sjálfvirk mæling brást")) + ": " + (e instanceof Error ? e.message : "error"));
    } finally {
      setAutoBusy(false);
    }
  };

  const submit = async () => {
    if (!test) return;
    setBusy(true); setMsg(null); setReport(null);
    try {
      const findingArr: ScreenFinding[] = Object.entries(findings)
        .filter(([, f]) => f.severity !== "ok" || f.value.trim() !== "")
        .map(([variableKey, f]) => ({
          variableKey,
          severity: f.severity,
          leg: f.leg || null,
          value: f.value.trim() === "" ? null : Number(f.value),
        }));
      const ctx = { painReported: pain, viewCount, poseQuality, repeated };
      const fd = new FormData();
      fd.set("team_id", teamId);
      if (playerId) fd.set("player_id", playerId);
      fd.set("test_slug", slug);
      fd.set("screen_date", date);
      fd.set("findings", JSON.stringify(findingArr));
      fd.set("context", JSON.stringify(ctx));
      if (videoUrl.trim()) fd.set("video_url", videoUrl.trim());
      if (file) fd.set("file", file);
      const res = await fetch("/api/coach/movement-screen", { method: "POST", headers: { Authorization: `Bearer ${await token()}` }, body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setReport(buildScreenReport(test, findingArr, ctx, j.result as ScreenResult));
      setMsg(T("Screen saved.", "Skimun vistuð."));
      if (playerId) void refreshScreens(playerId);
    } catch (e) {
      setMsg((T("Could not save", "Náði ekki að vista")) + ": " + (e instanceof Error ? e.message : "error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{T("Movement Screen", "Hreyfiskimun")}</h1>
        <p className="mt-0.5 text-[12px] text-slate-500">
          {T(
            "Attach a movement-test video (or its exported angles / link) to a player + date, record findings, and get cited corrective/strength directions. Screening & training only — not a diagnosis; pain / red flags route to a clinician. Never the readiness colour.",
            "Tengdu hreyfiprófs-myndband (eða útflutt horn / hlekk) við leikmann + dagsetningu, skráðu niðurstöður og fáðu tilvitnaðar leiðréttingar/styrktar-áherslur. Aðeins skimun & þjálfun — ekki greining; verkur / rauð flögg fara til klíníkers. Aldrei readiness-liturinn.",
          )}
        </p>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <label className="text-[12px] text-slate-600">{T("Test", "Próf")}
          <select value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]">
            {tests.map((t) => <option key={t.slug} value={t.slug}>{(is ? t.name.is : t.name.en)} · {is ? MOVEMENT_CATEGORY_LABEL[t.category].is : MOVEMENT_CATEGORY_LABEL[t.category].en}</option>)}
          </select>
        </label>
        <label className="text-[12px] text-slate-600">{T("Player", "Leikmaður")}
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]">
            <option value="">{T("— pick a player —", "— veldu leikmann —")}</option>
            {players.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? "—"}</option>)}
          </select>
        </label>
        <label className="text-[12px] text-slate-600">{T("Date", "Dagsetning")}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
        </label>
        <label className="text-[12px] text-slate-600">{T("Video URL (Onform) — optional", "Myndband-hlekkur (Onform) — valfrjálst")}
          <input type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…" className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
        </label>
        <label className="text-[12px] text-slate-600 sm:col-span-2">{T("Or upload video (private, consent-gated) — optional", "Eða hlaða upp myndbandi (einka, consent-læst) — valfrjálst")}
          <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-0.5 block w-full text-[12px]" />
        </label>
      </div>

      {/* Auto-measure (Stage 2): browser pose estimation pre-fills the findings; the
          coach confirms/overrides. Video is processed locally, not uploaded for pose. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-[12px] text-slate-600">
        <span className="font-semibold text-slate-700">{T("Auto-measure", "Sjálfvirk mæling")}</span>
        <label className="flex items-center gap-1">{T("View", "Sýn")}
          <select value={view} onChange={(e) => setView(e.target.value as "front" | "side" | "both")} className="rounded border border-slate-300 px-1 py-0.5"><option value="front">front</option><option value="side">side</option><option value="both">both</option></select>
        </label>
        {test?.laterality === "per_leg" && (
          <label className="flex items-center gap-1">{T("Leg", "Fótur")}
            <select value={clipLeg} onChange={(e) => setClipLeg(e.target.value as "L" | "R" | "both")} className="rounded border border-slate-300 px-1 py-0.5"><option value="L">L</option><option value="R">R</option><option value="both">{T("both (worse)", "báðir (verri)")}</option></select>
          </label>
        )}
        <button onClick={autoMeasure} disabled={!canAuto || autoBusy} className="rounded-lg border border-[#2740e6] px-3 py-1 text-[12px] font-semibold text-[#2740e6] disabled:opacity-40">
          {autoBusy ? T("Analysing…", "Greini…") : T("Auto-measure from video", "Mæla sjálfvirkt úr myndbandi")}
        </button>
        {!file && <span className="text-[11px] text-slate-400">{T("upload a video first", "hladdu upp myndbandi fyrst")}</span>}
        {autoMsg && <span className="text-[11px] text-slate-500">{autoMsg}</span>}
      </div>

      {test && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{T("Findings", "Niðurstöður")}</div>
          <p className="mb-2 text-[11px] text-slate-500">{is ? test.capture.standardisation.is : test.capture.standardisation.en}</p>
          <div className="space-y-2">
            {test.variables.map((v) => (
              <div key={v.key} className="flex flex-wrap items-center gap-2 border-b border-slate-100 py-1">
                <div className="w-52 shrink-0 text-[12px] text-slate-800">
                  {is ? v.label.is : v.label.en}
                  {v.reliability === "low_precision" && <span className="ml-1 text-[9px] text-amber-600" title={is ? v.note?.is : v.note?.en}>⚠ {T("low precision", "ónákvæmt")}</span>}
                </div>
                <select value={findings[v.key]?.severity ?? "ok"} onChange={(e) => setFindings((f) => ({ ...f, [v.key]: { ...f[v.key], severity: e.target.value as Severity } }))} className="rounded border border-slate-300 px-1.5 py-1 text-[12px]">
                  {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {test.laterality === "per_leg" && (
                  <select value={findings[v.key]?.leg ?? ""} onChange={(e) => setFindings((f) => ({ ...f, [v.key]: { ...f[v.key], leg: e.target.value as Leg | "" } }))} className="rounded border border-slate-300 px-1.5 py-1 text-[12px]">
                    <option value="">{T("both", "báðir")}</option>
                    <option value="L">L</option>
                    <option value="R">R</option>
                  </select>
                )}
                <input value={findings[v.key]?.value ?? ""} onChange={(e) => setFindings((f) => ({ ...f, [v.key]: { ...f[v.key], value: e.target.value } }))} placeholder={v.unit} className="w-20 rounded border border-slate-300 px-1.5 py-1 text-[12px]" />
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-slate-600">
            <label className="flex items-center gap-1"><input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} />{T("Pain / red flag", "Verkur / rautt flagg")}</label>
            <label className="flex items-center gap-1">{T("Views", "Sýn")}
              <select value={viewCount} onChange={(e) => setViewCount(Number(e.target.value))} className="rounded border border-slate-300 px-1 py-0.5"><option value={1}>1</option><option value={2}>2</option></select>
            </label>
            <label className="flex items-center gap-1">{T("Pose", "Pose")}
              <select value={poseQuality} onChange={(e) => setPoseQuality(e.target.value as PoseQuality)} className="rounded border border-slate-300 px-1 py-0.5"><option value="good">good</option><option value="fair">fair</option><option value="poor">poor</option></select>
            </label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={repeated} onChange={(e) => setRepeated(e.target.checked)} />{T("Repeated screen", "Endurtekin skimun")}</label>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={submit} disabled={busy || !slug} className="rounded-lg bg-[#2740e6] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
          {busy ? T("Saving…", "Vista…") : T("Save screen", "Vista skimun")}
        </button>
        {msg && <span className="text-[12px] text-slate-600">{msg}</span>}
      </div>

      {report && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <MovementScreenReport report={report} isEN={!is} title={T("Interpretation", "Túlkun")} defaultOpen />
        </div>
      )}

      {/* Saved screens for the selected player — each as its layered report. */}
      {playerId && screens.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">{T("Recent screens", "Nýlegar skimanir")}</h2>
          {screens.map((s) => {
            const t = TEST_BY_SLUG[s.testSlug];
            if (!t || !s.result) return null;
            const rep = buildScreenReport(t, s.findings ?? [], s.context ?? {}, s.result);
            return (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <MovementScreenReport report={rep} isEN={!is} title={is ? t.name.is : t.name.en} subtitle={s.screenDate} />
                {s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] font-medium text-[#2740e6] hover:underline">
                    {T("Video", "Myndband")} →
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * Movement Screen — coach records an Onform-style movement test against a player
 * + date, picks the test from the registry, records findings (assisted), and
 * sees the interpreted readings (finding → corrective/strength lever, confidence,
 * RTP/red-flag). Screening/training only — never a diagnosis, never the readiness
 * colour. Video is consent- and access-gated server-side.
 *
 * A screen can carry one clip per viewpoint (front / side / back): each viewpoint
 * supports different variables (valgus from the front, knee-flexion / trunk-lean /
 * RSI from the side), so auto-measure runs every clip and merges the results into
 * one explainability report the coach confirms before saving.
 */
import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { MOVEMENT_CATEGORY_LABEL, SEED_MOVEMENT_TESTS, type MovementTest, type Severity } from "@/lib/micropulse/movementScreen/registry";
import { interpretScreen, type ScreenContext, type ScreenFinding, type ScreenResult, type Leg, type PoseQuality } from "@/lib/micropulse/movementScreen/interpret";
import { extractPoseFrames } from "@/lib/micropulse/movementScreen/pose/extractClient";
import { analyzePose, legAsymmetryFinding, type AutoMeasure } from "@/lib/micropulse/movementScreen/pose/analyze";
import { buildScreenReport, type ScreenReport } from "@/lib/micropulse/movementScreen/report";
import { prescribeCorrectives } from "@/lib/micropulse/movementScreen/correctives/mapping";
import MovementScreenReport from "@/components/movement/MovementScreenReport";
import CorrectivePlan from "@/components/movement/CorrectivePlan";

type Player = { id: string; full_name: string | null };
type ClipView = "front" | "side" | "back";
type RunLeg = "L" | "R" | "both";
type Clip = { id: string; file: File; view: ClipView };
/** Auto-measures accumulated per capture leg, so the coach can screen one leg,
 *  keep it, then screen the other and get the left/right picture. */
type LegMeasures = Partial<Record<RunLeg, AutoMeasure[]>>;
type SavedVideo = { name: string | null; view: string | null; url: string | null };
type SavedScreen = {
  id: string; testSlug: string; screenDate: string; fileName: string | null; videoUrl: string | null; url: string | null;
  videos: SavedVideo[] | null;
  findings: ScreenFinding[]; context: ScreenContext; result: ScreenResult | null;
};
const SEVERITIES: Severity[] = ["ok", "mild", "moderate", "marked"];
const SEV_RANK: Record<Severity, number> = { ok: 0, mild: 1, moderate: 2, marked: 3 };
const VIEWS: ClipView[] = ["front", "side", "back"];
const TEST_BY_SLUG = Object.fromEntries(SEED_MOVEMENT_TESTS.map((t) => [t.slug, t]));

/** Guess a viewpoint from the file name so a batch upload pre-tags sensibly. */
function guessView(name: string): ClipView {
  const n = name.toLowerCase();
  if (/\b(side|sagittal|hlid|hli[ðd])\b/.test(n) || n.includes("side")) return "side";
  if (/\b(back|rear|post|aftan)\b/.test(n) || n.includes("back")) return "back";
  return "front";
}

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
  const [clips, setClips] = React.useState<Clip[]>([]);
  const [runLeg, setRunLeg] = React.useState<RunLeg>("L");
  const [legMeasures, setLegMeasures] = React.useState<LegMeasures>({});
  const [autoBusy, setAutoBusy] = React.useState(false);
  const [autoMsg, setAutoMsg] = React.useState<string | null>(null);
  const [autoReport, setAutoReport] = React.useState<ScreenReport | null>(null);
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
    setAutoReport(null);
    setLegMeasures({});
  }, [test]);

  const addClips = (fl: FileList | null) => {
    if (!fl?.length) return;
    const added: Clip[] = Array.from(fl).map((file) => ({ id: crypto.randomUUID(), file, view: guessView(file.name) }));
    setClips((c) => [...c, ...added]);
  };
  const updateClip = (id: string, patch: Partial<Clip>) => setClips((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeClip = (id: string) => setClips((c) => c.filter((x) => x.id !== id));

  const canAuto = clips.length > 0 && !!test && test.variables.some((v) => v.extract);
  const perLeg = test?.laterality === "per_leg";
  const measuredLegs = (["L", "R", "both"] as RunLeg[]).filter((k) => (legMeasures[k]?.length ?? 0) > 0);

  /** Auto findings across every measured leg (+ the left/right asymmetry flag). */
  const autoFindingsFrom = React.useCallback((lm: LegMeasures): ScreenFinding[] => {
    const keyed = new Map<string, ScreenFinding>();
    for (const k of ["L", "R", "both"] as RunLeg[]) {
      for (const m of lm[k] ?? []) keyed.set(`${m.variableKey}|${m.leg ?? ""}`, { variableKey: m.variableKey, leg: m.leg ?? null, severity: m.severity, value: m.value });
    }
    const asym = legAsymmetryFinding({ L: lm.L, R: lm.R });
    if (asym) keyed.set(`lsi|${asym.leg ?? ""}`, asym);
    return [...keyed.values()];
  }, []);

  /** What gets saved: the per-leg auto findings, overlaid by any manual entries
   *  the coach touched (a manual row wins for its variable + leg). */
  const combinedFindings = React.useCallback((lm: LegMeasures): ScreenFinding[] => {
    const keyed = new Map<string, ScreenFinding>();
    for (const f of autoFindingsFrom(lm)) keyed.set(`${f.variableKey}|${f.leg ?? ""}`, f);
    for (const [vk, mf] of Object.entries(findings)) {
      if (mf.severity === "ok" && mf.value.trim() === "") continue;
      const leg = (mf.leg || null) as Leg | null;
      keyed.set(`${vk}|${leg ?? ""}`, { variableKey: vk, leg, severity: mf.severity, value: mf.value.trim() === "" ? null : Number(mf.value) });
    }
    return [...keyed.values()];
  }, [autoFindingsFrom, findings]);

  const clearMeasuredLegs = () => { setLegMeasures({}); setAutoReport(null); setAutoMsg(null); };

  const playerName = React.useMemo(() => players.find((p) => p.id === playerId)?.full_name ?? "", [players, playerId]);
  const [pdfBusy, setPdfBusy] = React.useState<string | null>(null);
  const [correctiveBusy, setCorrectiveBusy] = React.useState(false);
  const [correctiveMsg, setCorrectiveMsg] = React.useState<string | null>(null);
  const sendCorrective = async () => {
    if (!playerId) { setCorrectiveMsg(T("Pick a player first.", "Veldu leikmann fyrst.")); return; }
    setCorrectiveBusy(true); setCorrectiveMsg(null);
    try {
      const res = await fetch("/api/coach/movement-screen/corrective", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ player_id: playerId, lang: is ? "IS" : "EN" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setCorrectiveMsg(T(`Sent to ${playerName || "player"}'s Today (${j.blocks} blocks).`, `Sent á Today hjá ${playerName || "leikmanni"} (${j.blocks} blokkir).`));
    } catch (e) {
      setCorrectiveMsg((T("Send failed", "Sending brást")) + ": " + (e instanceof Error ? e.message : "error"));
    } finally { setCorrectiveBusy(false); }
  };
  const downloadPdf = async (rep: ScreenReport, meta: { testName: string; playerName: string; date: string }, key: string) => {
    setPdfBusy(key);
    try {
      const { downloadMovementScreenPdf } = await import("@/components/coach/MovementScreenPdf");
      await downloadMovementScreenPdf(rep, meta, !is);
    } catch { /* download failed — no-op */ } finally { setPdfBusy(null); }
  };

  const autoMeasure = async () => {
    if (!clips.length || !test) return;
    const side: RunLeg | undefined = perLeg ? runLeg : undefined;
    const legLabel = perLeg ? (runLeg === "both" ? T("both legs", "báða fætur") : runLeg) : "";
    setAutoBusy(true); setAutoMsg(T("Loading pose model…", "Hleð pose-líkani…"));
    try {
      const merged = new Map<string, AutoMeasure>();
      const contributed = new Set<ClipView>();
      const emptyViews: ClipView[] = [];
      for (let i = 0; i < clips.length; i++) {
        const c = clips[i];
        const tag = perLeg ? `${legLabel} · ${c.view}` : c.view;
        setAutoMsg(T(`Analysing ${tag} (${i + 1}/${clips.length})…`, `Greini ${tag} (${i + 1}/${clips.length})…`));
        const frames = await extractPoseFrames(c.file, { onProgress: (p) => setAutoMsg(T(`Analysing ${tag} (${i + 1}/${clips.length})… ${Math.round(p * 100)}%`, `Greini ${tag} (${i + 1}/${clips.length})… ${Math.round(p * 100)}%`)) });
        if (!frames.length) { emptyViews.push(c.view); continue; }
        const res = analyzePose(test, frames, { side, view: c.view });
        let added = 0;
        for (const m of res.measures) {
          const prev = merged.get(m.variableKey);
          if (!prev || SEV_RANK[m.severity] > SEV_RANK[prev.severity]) merged.set(m.variableKey, m);
          added++;
        }
        if (added > 0) contributed.add(c.view); else emptyViews.push(c.view);
      }
      // Tag every measure with the capture leg (a per-leg run marks the landing leg).
      const measures: AutoMeasure[] = [...merged.values()].map((m) => ({ ...m, leg: perLeg && side !== "both" ? (side ?? null) : m.leg }));
      if (!measures.length) throw new Error(T("Nothing measurable from these clips — check the viewpoint tags and framing.", "Ekkert mælanlegt úr þessum myndböndum — athugaðu sýnar-merkingar og römmun."));

      // Store under this leg, KEEPING any other leg already measured.
      const storeKey: RunLeg = perLeg ? runLeg : "both";
      const nextLeg: LegMeasures = { ...legMeasures, [storeKey]: measures };
      setLegMeasures(nextLeg);

      // Build the explainability report from all measured legs (+ asymmetry).
      const distinctViews = contributed.size || 1;
      const bothLegs = !!nextLeg.L?.length && !!nextLeg.R?.length;
      setViewCount(distinctViews >= 2 || bothLegs ? 2 : 1);
      const findingArr = autoFindingsFrom(nextLeg);
      const ctx: ScreenContext = { painReported: pain, viewCount: distinctViews, poseQuality, repeated };
      const result = interpretScreen(test, findingArr, ctx);
      setAutoReport(buildScreenReport(test, findingArr, ctx, result));

      const emptyNote = emptyViews.length
        ? T(` (${[...new Set(emptyViews)].join(", ")}: nothing measurable)`, ` (${[...new Set(emptyViews)].join(", ")}: ekkert mælanlegt)`)
        : "";
      const legNote = perLeg && side !== "both"
        ? (bothLegs ? T(" Both legs measured — see the left/right read.", " Báðir fætur mældir — sjá hægri/vinstri lestur.") : T(` Now screen the ${runLeg === "L" ? "right" : "left"} leg to compare.`, ` Skimaðu nú ${runLeg === "L" ? "hægri" : "vinstri"} fót til að bera saman.`))
        : "";
      setAutoMsg(T(`Measured ${measures.length} variable(s)${perLeg ? ` for ${legLabel}` : ""} from ${[...contributed].join(", ") || "—"}.${emptyNote}${legNote}`, `Mældi ${measures.length} breytu(r)${perLeg ? ` fyrir ${legLabel}` : ""} úr ${[...contributed].join(", ") || "—"}.${emptyNote}${legNote}`));
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
      // Per-leg auto findings (accumulated across legs) overlaid by manual edits.
      const findingArr: ScreenFinding[] = combinedFindings(legMeasures);
      const ctx = { painReported: pain, viewCount, poseQuality, repeated };
      const fd = new FormData();
      fd.set("team_id", teamId);
      if (playerId) fd.set("player_id", playerId);
      fd.set("test_slug", slug);
      fd.set("screen_date", date);
      fd.set("findings", JSON.stringify(findingArr));
      fd.set("context", JSON.stringify(ctx));
      if (videoUrl.trim()) fd.set("video_url", videoUrl.trim());
      for (const c of clips) fd.append("file", c.file);
      fd.set("views", JSON.stringify(clips.map((c) => c.view)));
      const res = await fetch("/api/coach/movement-screen", { method: "POST", headers: { Authorization: `Bearer ${await token()}` }, body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setReport(buildScreenReport(test, findingArr, ctx, j.result as ScreenResult));
      setAutoReport(null);
      setLegMeasures({});
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
        <label className="text-[12px] text-slate-600 sm:col-span-2">{T("Upload viewpoint clips (private, consent-gated) — front / side / back", "Hlaða upp sýnar-myndböndum (einka, consent-læst) — framan / hlið / aftan")}
          <input type="file" accept="video/*" multiple onChange={(e) => { addClips(e.target.files); e.target.value = ""; }} className="mt-0.5 block w-full text-[12px]" />
          {perLeg && <span className="mt-0.5 block text-[10px] text-slate-400">{T("Single-leg test: screen one leg (its clips), analyse it, then swap to the other leg's clips and analyse — both legs are kept and compared.", "Einfætt próf: skimaðu annan fótinn (myndböndin hans), greindu, skiptu svo yfir í myndbönd hins fótarins og greindu — báðir fætur eru geymdir og bornir saman.")}</span>}
        </label>
        {clips.length > 0 && (
          <div className="sm:col-span-2 space-y-1.5">
            {clips.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5 text-[12px]">
                <span className="min-w-0 flex-1 truncate text-slate-700" title={c.file.name}>{c.file.name}</span>
                <label className="flex items-center gap-1 text-slate-500">{T("View", "Sýn")}
                  <select value={c.view} onChange={(e) => updateClip(c.id, { view: e.target.value as ClipView })} className="rounded border border-slate-300 px-1 py-0.5">
                    {VIEWS.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <button onClick={() => removeClip(c.id)} className="rounded px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50">{T("remove", "fjarlægja")}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auto-measure (Stage 2): browser pose estimation over every viewpoint clip
          pre-fills the findings + builds the explainability report; the coach
          confirms/overrides. Video is processed locally, not uploaded for pose. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-[12px] text-slate-600">
        <span className="font-semibold text-slate-700">{T("Auto-measure", "Sjálfvirk mæling")}</span>
        {perLeg && (
          <label className="flex items-center gap-1">{T("These clips are the", "Þessi myndbönd eru")}
            <select value={runLeg} onChange={(e) => setRunLeg(e.target.value as RunLeg)} className="rounded border border-slate-300 px-1 py-0.5">
              <option value="L">{T("left leg", "vinstri fótur")}</option>
              <option value="R">{T("right leg", "hægri fótur")}</option>
              <option value="both">{T("either (worse)", "óviss (verri)")}</option>
            </select>
          </label>
        )}
        <button onClick={autoMeasure} disabled={!canAuto || autoBusy} className="rounded-lg border border-[#2740e6] px-3 py-1 text-[12px] font-semibold text-[#2740e6] disabled:opacity-40">
          {autoBusy ? T("Analysing…", "Greini…") : perLeg ? T(`Analyse ${runLeg === "both" ? "clips" : runLeg === "L" ? "left leg" : "right leg"}`, `Greina ${runLeg === "both" ? "myndbönd" : runLeg === "L" ? "vinstri fót" : "hægri fót"}`) : T("Auto-measure from clips", "Mæla sjálfvirkt úr myndböndum")}
        </button>
        {perLeg && measuredLegs.length > 0 && (
          <span className="flex items-center gap-1.5 text-[11px]">
            {(["L", "R"] as RunLeg[]).map((lg) => (
              <span key={lg} className={`rounded px-1.5 py-0.5 font-semibold ${legMeasures[lg]?.length ? "bg-[#1c7a4a]/10 text-[#1c7a4a]" : "bg-slate-100 text-slate-400"}`}>
                {lg} {legMeasures[lg]?.length ? "✓" : "—"}
              </span>
            ))}
            <button onClick={clearMeasuredLegs} className="text-[10px] text-slate-400 hover:text-red-600 hover:underline">{T("clear", "hreinsa")}</button>
          </span>
        )}
        {!clips.length && <span className="text-[11px] text-slate-400">{T("upload a clip first", "hladdu upp myndbandi fyrst")}</span>}
        {autoMsg && <span className="w-full text-[11px] text-slate-500">{autoMsg}</span>}
      </div>

      {/* Explainability from the auto-measurement — before saving. */}
      {autoReport && (
        <div className="rounded-xl border border-[#2740e6]/30 bg-[#2740e6]/5 p-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]">
            {T("Auto-measured — not yet saved. Confirm the findings, then save.", "Sjálfvirk mæling — ekki vistuð enn. Staðfestu niðurstöðurnar og vistaðu.")}
          </div>
          <MovementScreenReport report={autoReport} isEN={!is} title={T("Auto-analysis", "Sjálfvirk greining")} />
          <button
            onClick={() => downloadPdf(autoReport, { testName: test ? (is ? test.name.is : test.name.en) : slug, playerName, date }, "auto")}
            disabled={pdfBusy === "auto"}
            className="mt-2 rounded-lg border border-[#2740e6] px-3 py-1 text-[11px] font-semibold text-[#2740e6] disabled:opacity-40"
          >
            {pdfBusy === "auto" ? T("Preparing…", "Undirbý…") : T("Download PDF (draft)", "Sækja PDF (drög)")}
          </button>
        </div>
      )}
      {autoReport && (() => { const p = prescribeCorrectives(autoReport.readings); return p ? <CorrectivePlan prescription={p} isEN={!is} /> : null; })()}

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
          <MovementScreenReport report={report} isEN={!is} title={T("Interpretation", "Túlkun")} />
          <button
            onClick={() => downloadPdf(report, { testName: test ? (is ? test.name.is : test.name.en) : slug, playerName, date }, "saved")}
            disabled={pdfBusy === "saved"}
            className="mt-2 rounded-lg border border-[#2740e6] px-3 py-1 text-[11px] font-semibold text-[#2740e6] disabled:opacity-40"
          >
            {pdfBusy === "saved" ? T("Preparing…", "Undirbý…") : T("Download PDF", "Sækja PDF")}
          </button>
        </div>
      )}
      {report && (() => { const p = prescribeCorrectives(report.readings); return p ? <CorrectivePlan prescription={p} isEN={!is} onSend={sendCorrective} sending={correctiveBusy} sentMsg={correctiveMsg} /> : null; })()}

      {/* Saved screens for the selected player — each as its layered report. */}
      {playerId && screens.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">{T("Recent screens", "Nýlegar skimanir")}</h2>
          {screens.map((s) => {
            const t = TEST_BY_SLUG[s.testSlug];
            if (!t || !s.result) return null;
            const rep = buildScreenReport(t, s.findings ?? [], s.context ?? {}, s.result);
            const vids = (s.videos && s.videos.length ? s.videos : s.url ? [{ name: s.fileName, view: null, url: s.url }] : []).filter((v) => v.url);
            return (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <MovementScreenReport report={rep} isEN={!is} title={is ? t.name.is : t.name.en} subtitle={s.screenDate} />
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => downloadPdf(rep, { testName: is ? t.name.is : t.name.en, playerName, date: s.screenDate }, s.id)}
                    disabled={pdfBusy === s.id}
                    className="text-[11px] font-medium text-[#2740e6] hover:underline disabled:opacity-40"
                  >
                    {pdfBusy === s.id ? T("Preparing…", "Undirbý…") : T("Download PDF", "Sækja PDF")}
                  </button>
                  {vids.map((v, i) => (
                    <a key={i} href={v.url!} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-[#2740e6] hover:underline">
                      {T("Video", "Myndband")}{v.view ? ` · ${v.view}` : ""} →
                    </a>
                  ))}
                </div>
                {(() => { const p = prescribeCorrectives(rep.readings); return p ? <div className="mt-2"><CorrectivePlan prescription={p} isEN={!is} compact /></div> : null; })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

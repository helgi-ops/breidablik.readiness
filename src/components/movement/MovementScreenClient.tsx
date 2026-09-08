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
import { SEED_MOVEMENT_TESTS, type MovementTest, type Severity, type Bi } from "@/lib/micropulse/movementScreen/registry";
import {
  catalogueByCategory, operationalFor, CATALOGUE_BY_SLUG, CATALOGUE_CATEGORY_LABEL,
  CATALOGUE_SPEED_LABEL, CATALOGUE_LATERALITY_LABEL, CATALOGUE_SCORING_LABEL, CATALOGUE_INJURY_CAVEAT,
  type CatalogueTest,
} from "@/lib/micropulse/movementScreen/testCatalogue";
import MovementObservations from "@/components/movement/MovementObservations";
import TestCatalogueBrowser from "@/components/movement/TestCatalogueBrowser";
import { interpretScreen, type ScreenContext, type ScreenFinding, type ScreenResult, type Leg, type PoseQuality } from "@/lib/micropulse/movementScreen/interpret";
import { extractPoseFrames } from "@/lib/micropulse/movementScreen/pose/extractClient";
import { analyzePose, legAsymmetryFinding, type AutoMeasure } from "@/lib/micropulse/movementScreen/pose/analyze";
import { buildScreenReport, type ScreenReport } from "@/lib/micropulse/movementScreen/report";
import { prescribeCorrectives } from "@/lib/micropulse/movementScreen/correctives/mapping";
import MovementScreenReport from "@/components/movement/MovementScreenReport";
import { MOVEMENT_CARRYOVER_KEY, MOVEMENT_CARRYOVER_EVENT } from "@/lib/micropulse/movementScreen/vision/carryover";
import { REGION_BY_KEY, fieldLabel, type RegionKey } from "@/lib/micropulse/movementScreen/vision/regions";
import type { MovementVisionAnalysis } from "@/lib/micropulse/movementScreen/vision/schema";
import MovementVisionResult from "@/components/movement/MovementVisionResult";

/** Which catalogue test best assesses a carried-over body region. */
const REGION_TEST: Record<RegionKey, string> = {
  knee: "single_leg_landing",
  ankle_foot: "overhead_squat",
  hip: "overhead_squat",
  thoracic: "overhead_squat",
  shoulder: "overhead_squat",
  lumbar: "overhead_squat",
  cervical: "overhead_squat",
};

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
const CUSTOM_SLUG = "__custom__"; // an ad-hoc movement with no pose test (AI read only)

/** Guess a viewpoint from the file name so a batch upload pre-tags sensibly. */
function guessView(name: string): ClipView {
  const n = name.toLowerCase();
  if (/\b(side|sagittal|hlid|hli[ðd])\b/.test(n) || n.includes("side")) return "side";
  if (/\b(back|rear|post|aftan)\b/.test(n) || n.includes("back")) return "back";
  return "front";
}

export default function MovementScreenClient({ hideHeader = false, playerId: playerIdProp, onPlayerChange }: { hideHeader?: boolean; playerId?: string; onPlayerChange?: (id: string) => void } = {}) {
  const [lang] = useLang();
  const is = lang === "IS";
  const T = (en: string, isT: string) => (is ? isT : en);

  const [tests, setTests] = React.useState<MovementTest[]>([]);
  const [players, setPlayers] = React.useState<Player[]>([]);
  const [teamId, setTeamId] = React.useState<string>("");
  const [slug, setSlug] = React.useState<string>("");
  const [customName, setCustomName] = React.useState<string>("");
  const [playerIdInternal, setPlayerIdInternal] = React.useState<string>("");
  const playerId = playerIdProp ?? playerIdInternal;
  const setPlayerId = onPlayerChange ?? setPlayerIdInternal;
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
  const [carryFocus, setCarryFocus] = React.useState<{ region: RegionKey; fields: string[] } | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "", []);

  // Carry-over from the AI movement analysis: focus the assessment on a region,
  // preselect the test that assesses it, and name the priority fields.
  React.useEffect(() => {
    const apply = (region: RegionKey, fields: string[]) => {
      setCarryFocus({ region, fields });
      const preferred = REGION_TEST[region];
      if (preferred && CATALOGUE_BY_SLUG[preferred]) setSlug(preferred);
    };
    try {
      const raw = sessionStorage.getItem(MOVEMENT_CARRYOVER_KEY);
      if (raw) { const c = JSON.parse(raw) as { region?: RegionKey; priorityFieldIds?: string[] }; if (c.region) apply(c.region, c.priorityFieldIds ?? []); }
    } catch { /* private mode */ }
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent).detail as { region?: RegionKey; priorityFieldIds?: string[] } | undefined;
      if (d?.region) apply(d.region, d.priorityFieldIds ?? []);
    };
    window.addEventListener(MOVEMENT_CARRYOVER_EVENT, onEvent);
    return () => window.removeEventListener(MOVEMENT_CARRYOVER_EVENT, onEvent);
  }, [tests]);

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
      if (tRes.ok && tj.tests) setTests(tj.tests as MovementTest[]);
      setPlayers((pRes.data ?? []) as Player[]);
    })();
  }, []);

  const isCustom = slug === CUSTOM_SLUG;

  // The full published catalogue, grouped by category, filtered to what you can
  // actually assess here — pose-measurable or with a structured observation list.
  const catalogueGroups = React.useMemo(
    () => catalogueByCategory()
      .map((g) => ({ category: g.category, tests: g.tests.filter((x) => x.poseMeasurable || operationalFor(x.slug)) }))
      .filter((g) => g.tests.length > 0),
    [],
  );
  // Registry slugs an instrumented catalogue test already represents (avoid dupes).
  const instrumentedSlugs = React.useMemo(
    () => new Set(Object.values(CATALOGUE_BY_SLUG).map((c) => c.instrumentedSlug).filter((s): s is string => !!s)),
    [],
  );
  // Team-added movement tests that are NOT in the catalogue → a "Custom" group.
  const customTests = React.useMemo(
    () => tests.filter((t) => !CATALOGUE_BY_SLUG[t.slug] && !instrumentedSlugs.has(t.slug)),
    [tests, instrumentedSlugs],
  );

  const catalogueTest = React.useMemo<CatalogueTest | null>(() => CATALOGUE_BY_SLUG[slug] ?? null, [slug]);

  // The registry test that carries pose extraction + measured variables: an
  // instrumented catalogue test maps through instrumentedSlug; a custom (team) test
  // is itself a registry test; a pose-only / observation-only catalogue test has none.
  const test = React.useMemo<MovementTest | null>(() => {
    if (slug === CUSTOM_SLUG) return null;
    const ct = CATALOGUE_BY_SLUG[slug];
    if (ct) return ct.instrumentedSlug ? (tests.find((t) => t.slug === ct.instrumentedSlug) ?? null) : null;
    return tests.find((t) => t.slug === slug) ?? null;
  }, [tests, slug]);

  // One name everywhere: an instrumented test shows its registry name (the name the
  // saved screen, correctives and trend also use), so the picker matches the results.
  const displayName = React.useMemo<Bi>(() => {
    if (slug === CUSTOM_SLUG) return { en: customName.trim() || "Other movement", is: customName.trim() || "Önnur hreyfing" };
    const ct = CATALOGUE_BY_SLUG[slug];
    if (ct?.instrumentedSlug) return TEST_BY_SLUG[ct.instrumentedSlug]?.name ?? test?.name ?? ct.name;
    return test?.name ?? ct?.name ?? { en: slug, is: slug };
  }, [slug, customName, test]);

  // Default the picker to the first assessable catalogue test.
  React.useEffect(() => {
    if (!slug && catalogueGroups[0]?.tests[0]) setSlug(catalogueGroups[0].tests[0].slug);
  }, [catalogueGroups, slug]);

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

  // AI read on the SAME clips (one upload → pose measurement + the qualitative AI eye).
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiMsg, setAiMsg] = React.useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = React.useState<MovementVisionAnalysis | null>(null);
  const aiRead = async () => {
    if (!clips.length || !slug) { setAiMsg(T("Upload a clip first.", "Hladdu upp myndbandi fyrst.")); return; }
    setAiBusy(true); setAiMsg(T("Reading with AI…", "Les með AI…")); setAiAnalysis(null);
    try {
      const { extractFilmFrames } = await import("@/lib/video/extractFilmFrames");
      const payload: Array<{ label: string; frames: string[] }> = [];
      for (const c of clips) {
        const r = await extractFilmFrames(c.file, { count: 4, maxWidth: 1024, quality: 0.72 });
        if (r.frames.length) payload.push({ label: `${is ? displayName.is : displayName.en} · ${c.view}`, frames: r.frames });
      }
      if (!payload.length) throw new Error(T("No frames from these clips.", "Engir rammar úr klippunum."));
      const res = await fetch("/api/coach/movement-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ tests: payload, lang: is ? "IS" : "EN" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setAiAnalysis(j.analysis as MovementVisionAnalysis);
      setAiMsg(null);
    } catch (e) {
      setAiMsg(T("AI read failed", "AI-lestur brást") + ": " + (e instanceof Error ? e.message : "error"));
    } finally { setAiBusy(false); }
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
      fd.set("test_slug", test.slug);
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
    <div className={hideHeader ? "space-y-4" : "mx-auto max-w-3xl space-y-4 p-4"}>
      {!hideHeader && (
        <div>
          <h1 className="text-lg font-bold text-slate-900">{T("Movement Screen", "Hreyfiskimun")}</h1>
          <p className="mt-0.5 text-[12px] text-slate-500">
            {T(
              "Attach a movement-test video (or its exported angles / link) to a player + date, record findings, and get cited corrective/strength directions. Screening & training only — not a diagnosis; pain / red flags route to a clinician. Never the readiness colour.",
              "Tengdu hreyfiprófs-myndband (eða útflutt horn / hlekk) við leikmann + dagsetningu, skráðu niðurstöður og fáðu tilvitnaðar leiðréttingar/styrktar-áherslur. Aðeins skimun & þjálfun — ekki greining; verkur / rauð flögg fara til klíníkers. Aldrei readiness-liturinn.",
            )}
          </p>
        </div>
      )}

      {carryFocus && (
        <div className="rounded-xl border border-[#2740e6]/30 bg-[#2740e6]/5 p-3">
          <p className="text-[12px] text-slate-700">
            <span className="font-semibold text-[#2740e6]">{T("From the analysis:", "Út frá greiningunni:")}</span>{" "}
            {T("focus on", "einbeittu þér að")} <span className="font-semibold">{is ? REGION_BY_KEY[carryFocus.region]?.label.is : REGION_BY_KEY[carryFocus.region]?.label.en}</span>
            {carryFocus.fields.length > 0 && <> — {carryFocus.fields.map((id) => { const l = fieldLabel(carryFocus.region, id); return l ? (is ? l.is : l.en) : id; }).join(", ")}</>}
            {". "}{T("The matching test is selected below.", "Prófið sem á við er valið að neðan.")}
          </p>
        </div>
      )}

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <label className="text-[12px] text-slate-600">{T("Test", "Próf")}
          <select value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]">
            {catalogueGroups.map((g) => (
              <optgroup key={g.category} label={is ? CATALOGUE_CATEGORY_LABEL[g.category].is : CATALOGUE_CATEGORY_LABEL[g.category].en}>
                {g.tests.map((t) => {
                  const nm = t.instrumentedSlug ? (TEST_BY_SLUG[t.instrumentedSlug]?.name ?? t.name) : t.name;
                  return <option key={t.slug} value={t.slug}>{(is ? nm.is : nm.en)}{t.instrumentedSlug ? " · auto-measure" : t.poseMeasurable ? " · pose" : ""}</option>;
                })}
              </optgroup>
            ))}
            {customTests.length > 0 && (
              <optgroup label={T("Team-added", "Bætt við af liði")}>
                {customTests.map((t) => <option key={t.slug} value={t.slug}>{is ? t.name.is : t.name.en}</option>)}
              </optgroup>
            )}
            <option value={CUSTOM_SLUG}>+ {T("Other movement (AI read only)", "Önnur hreyfing (AI-lestur)")}</option>
          </select>
          {isCustom && (
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder={T("Name it (e.g. Gait, Y-balance)", "Nefndu hana (t.d. Göngulag, Y-balance)")} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
          )}
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

      {/* About the selected test — the catalogue reference, inline (no separate tab). */}
      {catalogueTest && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[13px] font-semibold text-slate-800">{is ? displayName.is : displayName.en}</span>
            {catalogueTest.instrumentedSlug
              ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">{T("auto-measure (pose)", "sjálf-mæling (pose)")}</span>
              : catalogueTest.poseMeasurable
                ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">{T("pose-measurable", "pose-mælanlegt")}</span>
                : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600">{T("scored by eye / observations", "skorað með auga / frávikum")}</span>}
            {catalogueTest.defaultBattery && <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold text-white" style={{ background: "#2740e6" }}>{T("STANDARD", "STAÐALL")}</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{is ? CATALOGUE_SPEED_LABEL[catalogueTest.speed].is : CATALOGUE_SPEED_LABEL[catalogueTest.speed].en}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{is ? CATALOGUE_LATERALITY_LABEL[catalogueTest.laterality].is : CATALOGUE_LATERALITY_LABEL[catalogueTest.laterality].en}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{is ? CATALOGUE_SCORING_LABEL[catalogueTest.scoring].is : CATALOGUE_SCORING_LABEL[catalogueTest.scoring].en}</span>
          </div>
          <p className="mt-1.5 text-[12px] text-slate-600">{is ? catalogueTest.screensFor.is : catalogueTest.screensFor.en}</p>
          {!test && catalogueTest.poseMeasurable && <p className="mt-1 text-[11px] text-slate-500">{T("Pose maths aren't wired for this movement yet — capture it with the AI read + the structured observations below.", "Pose-stærðfræði er ekki tengd þessari hreyfingu enn — fangaðu hana með AI-lestrinum + skipulögðu frávikunum að neðan.")}</p>}
        </div>
      )}

      {/* Auto-measure (Stage 2): browser pose estimation over every viewpoint clip
          pre-fills the findings + builds the explainability report; the coach
          confirms/overrides. Video is processed locally, not uploaded for pose. */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
        <p className="text-[11px] text-slate-500">{T("Two reads of the same clips — use both.", "Tveir lestrar á sömu klippum — notaðu báða.")}</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {/* Measure — pose maths, exact numbers, saved */}
          <div className="rounded-lg border border-[#2740e6]/20 bg-white p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {perLeg && (
                <label className="flex items-center gap-1 text-[11px] text-slate-500">{T("Leg", "Fótur")}
                  <select value={runLeg} onChange={(e) => setRunLeg(e.target.value as RunLeg)} className="rounded border border-slate-300 px-1 py-0.5">
                    <option value="L">{T("left", "vinstri")}</option>
                    <option value="R">{T("right", "hægri")}</option>
                    <option value="both">{T("either (worse)", "óviss (verri)")}</option>
                  </select>
                </label>
              )}
              <button onClick={autoMeasure} disabled={!canAuto || autoBusy} className="rounded-lg border border-[#2740e6] px-3 py-1 text-[12px] font-semibold text-[#2740e6] disabled:opacity-40">
                {autoBusy ? T("Measuring…", "Mæli…") : perLeg ? T(`Measure ${runLeg === "both" ? "clips" : runLeg === "L" ? "left leg" : "right leg"}`, `Mæla ${runLeg === "both" ? "myndbönd" : runLeg === "L" ? "vinstri fót" : "hægri fót"}`) : T("Auto-measure from clips", "Mæla sjálfvirkt úr myndböndum")}
              </button>
              {perLeg && measuredLegs.length > 0 && (
                <span className="flex items-center gap-1.5 text-[11px]">
                  {(["L", "R"] as RunLeg[]).map((lg) => (
                    <span key={lg} className={`rounded px-1.5 py-0.5 font-semibold ${legMeasures[lg]?.length ? "bg-[#1c7a4a]/10 text-[#1c7a4a]" : "bg-slate-100 text-slate-400"}`}>{lg} {legMeasures[lg]?.length ? "✓" : "—"}</span>
                  ))}
                  <button onClick={clearMeasuredLegs} className="text-[10px] text-slate-400 hover:text-red-600 hover:underline">{T("clear", "hreinsa")}</button>
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[10px] text-slate-500">{!test ? T("No pose measurement for this movement — use the AI read + the observations below.", "Engin pose-mæling fyrir þessa hreyfingu — notaðu AI-lesturinn + frávikin að neðan.") : T("Pose maths → exact angles + cited bands. This is what you confirm, save & prescribe.", "Pose-stærðfræði → nákvæm horn + tilvitnuð bönd. Þetta staðfestir þú, vistar & ávísar.")}</p>
            {autoMsg && <p className="mt-1 text-[11px] text-slate-600">{autoMsg}</p>}
          </div>

          {/* AI read — qualitative, advisory, not saved */}
          <div className="rounded-lg border border-[#7a5cc4]/25 bg-white p-2.5">
            <button onClick={aiRead} disabled={!clips.length || aiBusy} className="rounded-lg border border-[#7a5cc4] px-3 py-1 text-[12px] font-semibold text-[#7a5cc4] disabled:opacity-40">
              {aiBusy ? T("Reading…", "Les…") : T("AI read", "AI-lestur")}
            </button>
            <p className="mt-1.5 text-[10px] text-slate-500">{T("AI eye → plain-language read of the whole body + where to look. Advisory, not saved.", "AI-auga → einfaldur lestur á öllum líkamanum + hvar á að leita. Ráðgjöf, ekki vistað.")}</p>
            {aiMsg && <p className="mt-1 text-[11px] text-slate-600">{aiMsg}</p>}
          </div>
        </div>
        {!clips.length && <p className="mt-2 text-[11px] text-slate-400">{!test ? T("Upload a clip above for the AI read, then tick the observations below.", "Hladdu upp myndbandi að ofan fyrir AI-lestur, hakaðu svo frávikin að neðan.") : T("Upload a clip above — or, with no video, record the findings by hand below.", "Hladdu upp myndbandi að ofan — eða, án myndbands, skráðu niðurstöðurnar handvirkt að neðan.")}</p>}
      </div>

      {/* Qualitative AI read on the same clips (region observations + carry-over). */}
      {aiAnalysis && (
        <div className="rounded-xl border border-[#7a5cc4]/30 bg-[#7a5cc4]/5 p-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#5a3ea4]">{T("AI read (from these clips)", "AI-lestur (úr þessum klippum)")}</div>
          <MovementVisionResult analysis={aiAnalysis} isEN={!is} />
        </div>
      )}

      {/* Explainability from the auto-measurement — before saving. */}
      {autoReport && (
        <div className="rounded-xl border border-[#2740e6]/30 bg-[#2740e6]/5 p-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]">
            {T("Auto-measured — not yet saved. Confirm the findings, then save.", "Sjálfvirk mæling — ekki vistuð enn. Staðfestu niðurstöðurnar og vistaðu.")}
          </div>
          <MovementScreenReport report={autoReport} isEN={!is} title={T("Auto-analysis", "Sjálfvirk greining")} hideReferences />
          <button
            onClick={() => downloadPdf(autoReport, { testName: is ? displayName.is : displayName.en, playerName, date }, "auto")}
            disabled={pdfBusy === "auto"}
            className="mt-2 rounded-lg border border-[#2740e6] px-3 py-1 text-[11px] font-semibold text-[#2740e6] disabled:opacity-40"
          >
            {pdfBusy === "auto" ? T("Preparing…", "Undirbý…") : T("Download PDF (draft)", "Sækja PDF (drög)")}
          </button>
        </div>
      )}

      {test && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <details open={!clips.length}>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-600">{clips.length ? T("Findings — adjust / override (optional)", "Niðurstöður — breyta / yfirskrifa (valfrjálst)") : T("Findings — record by hand (no video needed)", "Niðurstöður — skrá handvirkt (ekkert myndband)")}</summary>
          <p className="mb-2 mt-1 text-[11px] text-slate-500">{clips.length ? T("The analysis above is the record — use this only to override a measured value or add a coach-scored one. ", "Greiningin að ofan er skráin — notaðu þetta aðeins til að breyta mældu gildi eða bæta við þjálfara-skori. ") : T("No video? Score each variable by eye and save — a screen doesn't need a clip. ", "Ekkert myndband? Skoraðu hverja breytu með auga og vistaðu — skimun þarf ekki klippu. ")}{is ? test.capture.standardisation.is : test.capture.standardisation.en}</p>
          <div className="grid gap-x-4 gap-y-1 lg:grid-cols-2">
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
          </details>

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

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={submit} disabled={busy || !test} className="rounded-lg bg-[#2740e6] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
          {busy ? T("Saving…", "Vista…") : T("Save screen", "Vista skimun")}
        </button>
        {!test && !isCustom && <span className="text-[11px] text-slate-500">{T("No pose screen to save for this movement — save the structured observations below instead.", "Engin pose-skimun til að vista fyrir þessa hreyfingu — vistaðu skipulögðu frávikin að neðan í staðinn.")}</span>}
        {isCustom && <span className="text-[11px] text-slate-500">{T("Custom movement — use the AI read; nothing to save as a pose screen.", "Sérsniðin hreyfing — notaðu AI-lesturinn; ekkert að vista sem pose-skimun.")}</span>}
        {msg && <span className="text-[12px] text-slate-600">{msg}</span>}
      </div>

      {report && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <MovementScreenReport report={report} isEN={!is} title={T("Interpretation", "Túlkun")} />
          <button
            onClick={() => downloadPdf(report, { testName: is ? displayName.is : displayName.en, playerName, date }, "saved")}
            disabled={pdfBusy === "saved"}
            className="mt-2 rounded-lg border border-[#2740e6] px-3 py-1 text-[11px] font-semibold text-[#2740e6] disabled:opacity-40"
          >
            {pdfBusy === "saved" ? T("Preparing…", "Undirbý…") : T("Download PDF", "Sækja PDF")}
          </button>
        </div>
      )}
      {report && (() => { const p = prescribeCorrectives(report.readings); return p ? (
        <p className="rounded-lg border border-[#7a5cc4]/30 bg-[#7a5cc4]/5 px-3 py-2 text-[12px] text-slate-600">
          {T("Corrective exercises are ready — open the ", "Corrective æfingar tilbúnar — opnaðu ")}<span className="font-semibold text-[#5a3ea4]">{T("Correctives", "Corrective æfingar")}</span>{T(" tab to review and send them (merged with region + VALD).", " flipann til að fara yfir og senda (sameinað við svæði + VALD).")}</p>
      ) : null; })()}

      {/* Structured observations for the selected test — the screening form, folded
          in: one test = analyse + measure + tick its observations, feeding one
          cross-test deficit ledger. (Hidden for ad-hoc "Other movement".) */}
      {!isCustom && playerId && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{T("Observations & deficit ledger", "Frávik & halla-bók")}</p>
          <MovementObservations playerId={playerId} slug={slug} />
        </div>
      )}

      {/* Saved screens for the selected player — collapsed; each as its layered report. */}
      {playerId && screens.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">{T(`Recent screens (${screens.length})`, `Nýlegar skimanir (${screens.length})`)}</summary>
          <div className="mt-3 space-y-3">
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
              </div>
            );
          })}
          </div>
        </details>
      )}

      {/* Full published catalogue — reference, folded in (was a separate tab). */}
      <details className="rounded-xl border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">{T("Full published catalogue (reference)", "Allur útgefni prófabankinn (til viðmiðunar)")}</summary>
        <p className="mt-1 text-[11px] text-slate-500">{T("Every published movement-quality assessment (Wijekulasuriya 2025). The picker above lists the ones you can analyse or observe here; the rest are reference only.", "Öll birt hreyfigæða-möt (Wijekulasuriya 2025). Valmyndin að ofan sýnir þau sem þú getur greint eða skoðað hér; hin eru aðeins til viðmiðunar.")}</p>
        <div className="mt-3"><TestCatalogueBrowser /></div>
      </details>

      <p className="text-[9px] text-slate-500">{is ? CATALOGUE_INJURY_CAVEAT.is : CATALOGUE_INJURY_CAVEAT.en}</p>
    </div>
  );
}

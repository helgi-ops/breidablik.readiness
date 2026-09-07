"use client";

/**
 * AI movement-vision analysis (OsteoSport-style). The coach adds one or more
 * named tests, each with photos or a short clip; frames are sampled IN THE
 * BROWSER (the raw video never leaves the device), handed to Claude vision, and
 * the model returns a strict, server-normalized read: summary, observations by
 * body region, movement-chain patterns, corrective suggestions (cited, linked to
 * the corrective library), tests to run next, references, red flags, and a
 * "carry into the assessment" region + priority fields. Decision support only —
 * never a diagnosis, never the readiness colour.
 */
import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { REGIONS, REGION_BY_KEY, fieldLabel, type RegionKey } from "@/lib/micropulse/movementScreen/vision/regions";
import type { MovementVisionAnalysis, VisionSeverity } from "@/lib/micropulse/movementScreen/vision/schema";
import { CORRECTIVE_BY_SLUG } from "@/lib/micropulse/movementScreen/correctives/registry";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";

export const MOVEMENT_CARRYOVER_KEY = "micropulse:movement-carryover";
export const MOVEMENT_CARRYOVER_EVENT = "micropulse:movement-carryover";

type TestClip = { id: string; label: string; frames: string[] }; // frames = bare base64 JPEG
const SEV_HEX: Record<VisionSeverity, string> = { notable: "#a83e28", mild: "#de9328", normal: "#1c7a4a" };
const PER_TEST_CAP = 8;
const TOTAL_CAP = 32;

/** Downscale an image file to a bare base64 JPEG (longest side ≤ maxW). */
async function downscaleImage(file: File, maxW = 1024, quality = 0.72): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode failed"));
      i.src = url;
    });
    const scale = Math.min(1, maxW / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality).replace(/^data:image\/jpeg;base64,/, "");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function MovementVisionAnalysis() {
  const [lang] = useLang();
  const is = lang === "IS";
  const T = (en: string, isT: string) => (is ? isT : en);
  const L = (b: Bi) => (is ? b.is : b.en);

  const [tests, setTests] = React.useState<TestClip[]>([{ id: crypto.randomUUID(), label: "", frames: [] }]);
  const [note, setNote] = React.useState("");
  const [extractingId, setExtractingId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [analysis, setAnalysis] = React.useState<MovementVisionAnalysis | null>(null);
  const [carried, setCarried] = React.useState<RegionKey | null>(null);

  const totalFrames = tests.reduce((n, t) => n + t.frames.length, 0);
  const canAnalyse = totalFrames > 0 && !busy && extractingId == null;

  const addTest = () => setTests((ts) => [...ts, { id: crypto.randomUUID(), label: "", frames: [] }]);
  const removeTest = (id: string) => setTests((ts) => (ts.length > 1 ? ts.filter((t) => t.id !== id) : ts));
  const setLabel = (id: string, label: string) => setTests((ts) => ts.map((t) => (t.id === id ? { ...t, label } : t)));
  const removeFrame = (id: string, idx: number) => setTests((ts) => ts.map((t) => (t.id === id ? { ...t, frames: t.frames.filter((_, i) => i !== idx) } : t)));

  const addFiles = async (id: string, fileList: FileList | null) => {
    if (!fileList?.length) return;
    setExtractingId(id); setMsg(null);
    try {
      const collected: string[] = [];
      for (const file of Array.from(fileList)) {
        if (collected.length >= PER_TEST_CAP) break;
        if (file.type.startsWith("video/")) {
          const { extractFilmFrames } = await import("@/lib/video/extractFilmFrames");
          const r = await extractFilmFrames(file, { count: 4, maxWidth: 1024, quality: 0.72 });
          collected.push(...r.frames);
        } else if (file.type.startsWith("image/")) {
          collected.push(await downscaleImage(file));
        }
      }
      setTests((ts) => ts.map((t) => (t.id === id ? { ...t, frames: [...t.frames, ...collected].slice(0, PER_TEST_CAP) } : t)));
    } catch (e) {
      setMsg(T("Couldn't read that file", "Náði ekki að lesa skrána") + ": " + (e instanceof Error ? e.message : "error"));
    } finally {
      setExtractingId(null);
    }
  };

  const analyse = async () => {
    setBusy(true); setMsg(T("Analysing movement…", "Greini hreyfingu…")); setAnalysis(null); setCarried(null);
    try {
      const payload = tests.filter((t) => t.frames.length).map((t, i) => ({ label: t.label.trim() || `${T("Movement", "Hreyfing")} ${i + 1}${note ? ` — ${note}` : ""}`, frames: t.frames }));
      if (!payload.length) { setMsg(T("Add a photo or clip first.", "Bættu við mynd eða myndbandi fyrst.")); setBusy(false); return; }
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "";
      const res = await fetch("/api/coach/movement-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ tests: payload, lang: is ? "IS" : "EN" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setAnalysis(j.analysis as MovementVisionAnalysis);
      setMsg(null);
    } catch (e) {
      setMsg(T("Analysis failed", "Greining brást") + ": " + (e instanceof Error ? e.message : "error"));
    } finally {
      setBusy(false);
    }
  };

  /** Carry a region (+ the AI's priority fields when it matches) into the assessment. */
  const carryOver = (region: RegionKey) => {
    const priorityFieldIds = analysis?.region === region ? analysis.priorityFieldIds : [];
    try { sessionStorage.setItem(MOVEMENT_CARRYOVER_KEY, JSON.stringify({ region, priorityFieldIds, ts: Date.now() })); } catch { /* private mode */ }
    try { window.dispatchEvent(new CustomEvent(MOVEMENT_CARRYOVER_EVENT, { detail: { region, priorityFieldIds } })); } catch { /* older browser */ }
    setCarried(region);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <details open>
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">🎥 {T("Movement analysis (photos / video) — optional", "Hreyfigreining (myndir / myndband) — valfrjálst")}</summary>
        <p className="mt-1 text-[12px] text-slate-500">
          {T("Add one or more tests (e.g. overhead squat, single-leg squat, gait) — each with a photo or short clip (key frames are sampled automatically). The AI reads each test AND the whole picture, and suggests a region + tests to take into the assessment. Descriptive support — not a diagnosis.",
            "Bættu við einu eða fleiri prófum (t.d. overhead squat, single-leg squat, göngulag) — hverju með mynd eða stuttu myndbandi (úr myndbandi eru dregnir lykilrammar sjálfkrafa). AI les hvert próf OG heildarmyndina, og leggur til svæði og próf sem þú getur tekið beint inn í matið. Lýsandi stuðningur — ekki greining.")}
        </p>

        {/* Test inputs */}
        <div className="mt-3 space-y-3">
          {tests.map((t, i) => (
            <div key={t.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-slate-400">{i + 1}.</span>
                <input value={t.label} onChange={(e) => setLabel(t.id, e.target.value)} placeholder={T("Test name (e.g. Overhead squat)", "Heiti prófs (t.d. Overhead squat)")} className="flex-1 rounded border border-slate-300 px-2 py-1 text-[13px]" />
                {tests.length > 1 && <button onClick={() => removeTest(t.id)} className="text-[11px] text-slate-400 hover:text-red-600">{T("Remove", "Fjarlægja")}</button>}
              </div>
              {t.frames.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.frames.map((f, idx) => (
                    <div key={idx} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`data:image/jpeg;base64,${f}`} alt="" className="h-16 w-24 rounded object-cover" />
                      <button onClick={() => removeFrame(t.id, idx)} className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[9px] text-white">×</button>
                    </div>
                  ))}
                </div>
              )}
              <label className="mt-2 block text-[11px] text-slate-500">
                {extractingId === t.id ? T("Reading frames…", "Les ramma…") : T("Add photos / video", "Bæta við myndum / myndbandi")}
                <input type="file" accept="image/*,video/*" multiple disabled={extractingId != null} onChange={(e) => { void addFiles(t.id, e.target.files); e.target.value = ""; }} className="mt-0.5 block w-full text-[11px]" />
              </label>
            </div>
          ))}
        </div>

        <button onClick={addTest} className="mt-2 rounded-lg border border-dashed border-slate-300 px-3 py-1 text-[12px] text-slate-500 hover:border-slate-400">+ {T("Add test", "Bæta við prófi")}</button>

        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={T("Note (optional): what's shown, which movement, what you noticed…", "Athugasemd (valfrjálst): hvað er sýnt, hvaða hreyfing, hvað þú tókst eftir…")} rows={2} className="mt-3 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[12px]" />

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button onClick={analyse} disabled={!canAnalyse} className="rounded-lg bg-[#2740e6] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
            {busy ? T("Analysing…", "Greini…") : T("Analyse movement", "Greina hreyfingu")}
          </button>
          <span className="text-[11px] text-slate-400">{T(`${totalFrames}/${TOTAL_CAP} frames · analysed, not stored.`, `${totalFrames}/${TOTAL_CAP} rammar · greint, ekki vistað.`)}</span>
          {msg && <span className="text-[11px] text-slate-500">{msg}</span>}
        </div>
      </details>

      {analysis && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {analysis.summary && <p className="text-[13px] text-slate-800">{analysis.summary}</p>}
          {analysis.captureQuality && <p className="mt-1 text-[11px] italic text-slate-400">{T("Capture quality:", "Myndgæði:")} {analysis.captureQuality}</p>}

          {analysis.redFlags.length > 0 && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">⚑ {T("Red flags — route to a clinician", "Rauð flögg — vísaðu til klíníkers")}</p>
              <ul className="mt-1 space-y-0.5">{analysis.redFlags.map((r, i) => <li key={i} className="text-[12px] text-red-800">· {r}</li>)}</ul>
            </div>
          )}

          {/* Observations by region */}
          {analysis.observations.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{T("Observations", "Athuganir")}</p>
              <ul className="mt-1 space-y-1">
                {analysis.observations.map((o, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-[12px]">
                    <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SEV_HEX[o.severity] }} />
                    <span><span className="font-semibold text-slate-700">{L(REGION_BY_KEY[o.region]?.label ?? { en: o.region, is: o.region })}:</span> <span className="text-slate-700">{o.text}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Patterns */}
          {analysis.patterns.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{T("Patterns / compensations", "Mynstur / kompensasjónir")}</p>
              <ul className="mt-1 space-y-0.5">{analysis.patterns.map((p, i) => <li key={i} className="text-[12px] text-slate-700">· {p}</li>)}</ul>
            </div>
          )}

          {/* Suggestions */}
          {analysis.suggestions.length > 0 && (
            <div className="mt-3 rounded-lg border border-[#1c7a4a]/20 bg-[#1c7a4a]/5 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1c7a4a]">{T("Suggestions — what to work on", "Tillögur — hvað á að vinna með")}</p>
              <div className="mt-1 space-y-2">
                {analysis.suggestions.map((sug, i) => (
                  <div key={i}>
                    <span className="text-[12px] font-semibold text-slate-800">{sug.title}</span>
                    {sug.detail && <span className="text-[12px] text-slate-700"> — {sug.detail}</span>}
                    {sug.cite && <span className="text-[10px] text-slate-400"> ({sug.cite})</span>}
                    {sug.correctiveSlugs && sug.correctiveSlugs.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {sug.correctiveSlugs.map((slug) => { const ex = CORRECTIVE_BY_SLUG[slug]; return ex ? <span key={slug} className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#5a3ea4]">{L(ex.name)}{ex.videoUrl ? " ▶" : ""}</span> : null; })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[9px] italic text-slate-400">{T("Suggestions to consider — you choose the treatment.", "Tillögur til íhugunar — þú velur meðferðina.")}</p>
            </div>
          )}

          {/* Tests to run next (priority fields of the AI's region) */}
          {analysis.region && analysis.priorityFieldIds.length > 0 && (
            <p className="mt-3 text-[12px] text-slate-700">
              <span className="font-semibold">{T("Assess next:", "Prófa næst:")}</span>{" "}
              {analysis.priorityFieldIds.map((id) => L(fieldLabel(analysis.region!, id) ?? { en: id, is: id })).join(", ")}
            </p>
          )}

          {analysis.references.length > 0 && (
            <p className="mt-2 text-[9px] text-slate-400">{T("References:", "Heimildir:")} {analysis.references.join(" · ")}</p>
          )}

          {/* Carry-over into the assessment */}
          {analysis.region && (
            <button onClick={() => carryOver(analysis.region!)} className="mt-3 rounded-lg border border-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-[#2740e6]">
              {carried === analysis.region ? T("Carried ✓", "Tekið með ✓") : `${T("Take into assessment:", "Taka með í mat:")} ${L(REGION_BY_KEY[analysis.region].label)} →`}
            </button>
          )}

          {/* Region picker */}
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-slate-500">{T("Choose a region:", "Veldu svæði:")}</p>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {REGIONS.map((r) => (
                <button key={r.key} onClick={() => carryOver(r.key)} className={`rounded-lg border px-3 py-2 text-[12px] ${carried === r.key ? "border-[#2740e6] bg-[#2740e6]/10 text-[#2740e6]" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                  {L(r.label)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
import type { MovementVisionAnalysis } from "@/lib/micropulse/movementScreen/vision/schema";
import MovementVisionResult from "@/components/movement/MovementVisionResult";

type TestClip = { id: string; label: string; frames: string[] }; // frames = bare base64 JPEG
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

  const [tests, setTests] = React.useState<TestClip[]>([{ id: crypto.randomUUID(), label: "", frames: [] }]);
  const [note, setNote] = React.useState("");
  const [extractingId, setExtractingId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [analysis, setAnalysis] = React.useState<MovementVisionAnalysis | null>(null);

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
    setBusy(true); setMsg(T("Analysing movement…", "Greini hreyfingu…")); setAnalysis(null);
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


  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">🎥 {T("AI read — any movement, no test needed (e.g. gait)", "AI-lestur — hvaða hreyfing sem er, ekkert próf (t.d. göngulag)")}</summary>
        <p className="mt-1 text-[12px] text-slate-500">
          {T("A quick AI eye on any movement (overhead squat, single-leg squat, gait, anything) — a photo or short clip per test. It does NOT measure angles or save anything; it reads the movement visually and points you to a region + tests to record in Step 2. Use it to decide where to look. Descriptive support — not a diagnosis.",
            "Snöggur AI-lestur á hvaða hreyfingu sem er (overhead squat, single-leg squat, göngulag, hvað sem er) — mynd eða stutt myndband per próf. Hann MÆLIR ekki horn og vistar ekkert; hann les hreyfinguna sjónrænt og beinir þér að svæði + prófum til að skrá í þrepi 2. Notaðu hann til að ákveða hvar á að leita. Lýsandi stuðningur — ekki greining.")}
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
          <MovementVisionResult analysis={analysis} isEN={!is} />
        </div>
      )}
    </div>
  );
}

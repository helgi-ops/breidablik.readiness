"use client";

/**
 * PlayDiagramsSection — the opponent's set plays on the scouting page. Lists the saved
 * diagrams (thumbnail + name + play type), with add / edit / delete / confirm, opens the
 * half-court editor, and offers an optional "Draft from clip" step: a short video is decoded
 * in the browser (frames only leave the client) and Claude vision returns a first-draft
 * diagram the coach then edits and confirms. Keyed to the scouted opponent.
 * Descriptive — never a readiness signal.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PlayDiagramSvg from "@/components/coach/PlayDiagramSvg";
import PlayDiagramEditor, { type SavedDiagram } from "@/components/coach/PlayDiagramEditor";
import { playTypeLabel } from "@/lib/micropulse/basketballStats/playDiagram";
import { extractFilmFrames, FrameExtractError, MAX_CLIP_SECONDS } from "@/lib/video/extractFilmFrames";

export default function PlayDiagramsSection({ opponent }: { opponent: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [plays, setPlays] = React.useState<SavedDiagram[] | null>(null);
  const [editing, setEditing] = React.useState<null | "new" | SavedDiagram>(null);
  const [drafting, setDrafting] = React.useState(false);
  const [draftMsg, setDraftMsg] = React.useState<string | null>(null);
  const [draftErr, setDraftErr] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const load = React.useCallback(async () => {
    if (!opponent) return;
    const t = await token(); if (!t) return;
    const res = await fetch(`/api/coach/scouting/play-diagrams?opponent=${encodeURIComponent(opponent)}`, { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
    const j = await res.json();
    if (j.ok) setPlays(j.diagrams ?? []);
  }, [opponent, token]);
  React.useEffect(() => { setEditing(null); setDraftErr(null); setDraftMsg(null); void load(); }, [load]);

  async function del(id: string) {
    const t = await token(); if (!t) return;
    await fetch(`/api/coach/scouting/play-diagrams?id=${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
    void load();
  }

  async function confirm(id: string) {
    const t = await token(); if (!t) return;
    await fetch("/api/coach/scouting/play-diagrams", {
      method: "PUT", headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" },
      body: JSON.stringify({ id, confirmed: true }),
    });
    void load();
  }

  // Decode the clip in the browser (frames only leave the client), then ask the AI for a draft.
  async function onFile(file: File) {
    setDraftErr(null); setDraftMsg(null); setDrafting(true);
    try {
      setDraftMsg(is ? "Les myndbandið…" : "Reading the clip…");
      const { frames, durationSec } = await extractFilmFrames(file, { count: 10 });
      if (durationSec > MAX_CLIP_SECONDS) setDraftMsg(is ? "Langt myndband — nota 10 ramma úr því." : "Long clip — sampling 10 frames from it.");
      else setDraftMsg(is ? "AI teiknar uppkast…" : "AI is drafting…");
      const t = await token(); if (!t) { setDraftErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const res = await fetch("/api/coach/scouting/play-diagrams/draft-from-frames", {
        method: "POST", headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" },
        body: JSON.stringify({ opponent, frames, durationSec: Math.round(durationSec), lang }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setDraftErr(j.error ?? "Error"); return; }
      setDraftMsg(null);
      await load();
      // Open the fresh draft straight in the editor so the coach can correct + confirm it.
      if (j.diagram) setEditing(j.diagram as SavedDiagram);
    } catch (e) {
      if (e instanceof FrameExtractError) {
        setDraftErr(e.code === "DECODE_UNSUPPORTED"
          ? (is ? "Vafrinn gat ekki lesið þetta myndband (oft HEVC/.mov) — prófaðu .mp4." : "The browser couldn't decode this clip (often HEVC/.mov) — try an .mp4.")
          : e.message);
      } else setDraftErr(e instanceof Error ? e.message : "Error");
    } finally { setDrafting(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <div className="rounded-xl border border-[#e3e1d9] bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold text-slate-800">{is ? "Leikkerfi (teiknuð)" : "Set plays"}</span>
        <span className="rounded bg-[#2740e6] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">{is ? "Lýsandi" : "Scouting"}</span>
        {editing === null && (
          <div className="ml-auto flex items-center gap-2">
            <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
            <button type="button" disabled={drafting} onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {drafting ? (is ? "Vinn…" : "Working…") : (is ? "✨ Uppkast úr myndbandi" : "✨ Draft from clip")}
            </button>
            <button type="button" onClick={() => setEditing("new")} className="rounded-lg border border-[#2740e6] px-2.5 py-1 text-[12px] font-semibold text-[#2740e6] hover:bg-[#eef0fb]">
              {is ? "+ Teikna leik" : "+ Draw a play"}
            </button>
          </div>
        )}
      </div>

      {editing === null && (draftMsg || draftErr) ? (
        <p className={`mb-2 text-[12px] ${draftErr ? "text-red-600" : "text-slate-500"}`}>{draftErr ?? draftMsg}</p>
      ) : null}
      {editing === null && !draftErr && !drafting ? (
        <p className="mb-2 text-[11px] text-slate-400">
          {is ? "Uppkast úr myndbandi: hlaðið upp stuttu búti (ein sókn, ~10–25 s). AI teiknar fyrsta uppkast sem þú lagar og staðfestir — myndbandið fer aldrei á netþjóninn." : "Draft from clip: upload a short possession (~10–25 s). The AI sketches a first draft you edit and confirm — the video never leaves your browser."}
        </p>
      ) : null}

      {editing !== null ? (
        <PlayDiagramEditor opponent={opponent} initial={editing === "new" ? null : editing}
          onSaved={() => { setEditing(null); void load(); }} onCancel={() => setEditing(null)} />
      ) : plays && plays.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plays.map((p) => {
            const isDraft = p.source === "ai_draft";
            return (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-2">
                <div className="rounded-lg border border-slate-200 bg-white p-1">
                  <PlayDiagramSvg diagram={p.diagram} />
                </div>
                <div className="mt-1.5 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-slate-900">{p.name}</div>
                    <div className="text-[11px] text-slate-500">{playTypeLabel(p.play_type, is ? "IS" : "EN")}</div>
                    {isDraft ? (
                      <div className="mt-0.5 inline-flex items-center gap-1">
                        <span className="rounded bg-[#eef0fb] px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#2740e6]">{is ? "AI-uppkast" : "AI draft"}{p.confidence ? ` · ${p.confidence}` : ""}</span>
                        {!p.confirmed ? <span className="text-[10px] font-semibold text-amber-600">{is ? "óstaðfest" : "unconfirmed"}</span> : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] font-semibold">
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setEditing(p)} className="text-[#2740e6] hover:underline">{is ? "Breyta" : "Edit"}</button>
                      <button type="button" onClick={() => void del(p.id)} className="text-red-600 hover:underline">{is ? "Eyða" : "Delete"}</button>
                    </div>
                    {isDraft && !p.confirmed ? (
                      <button type="button" onClick={() => void confirm(p.id)} className="rounded border border-emerald-600 px-1.5 py-0.5 text-[10px] text-emerald-700 hover:bg-emerald-50">{is ? "Staðfesta" : "Confirm"}</button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[13px] text-slate-500">
          {is ? "Engin leikkerfi enn — teiknaðu mest notuðu sóknir andstæðingsins á hálfan völl, eða láttu AI gera uppkast úr myndbandi. Aðeins staðfest kerfi rata í scouting-PDF-ið." : "No set plays yet — draw the opponent's most-used sets on a half court, or let the AI draft one from a clip. Only confirmed plays carry into the scouting PDF."}
        </p>
      )}
    </div>
  );
}

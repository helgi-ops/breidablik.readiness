"use client";

/**
 * PlayDiagramsSection — the opponent's set plays on the scouting page. Lists the saved
 * diagrams (thumbnail + name + play type), with add / edit / delete, opens the half-court
 * editor, and offers an optional "Recognise from clip" step: a short video is decoded in the
 * browser (frames only leave the client) and Claude vision MATCHES the possession against the
 * known sets (the coach's drawn plays + a common-sets library), reporting which it resembles
 * with the visual evidence. The coach confirms — matching a standard set saves it as a play.
 * Keyed to the scouted opponent. Descriptive — never a readiness signal.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PlayDiagramSvg from "@/components/coach/PlayDiagramSvg";
import PlayDiagramEditor, { type SavedDiagram } from "@/components/coach/PlayDiagramEditor";
import { playTypeLabel } from "@/lib/micropulse/basketballStats/playDiagram";
import { commonSetByKey, COMMON_SETS } from "@/lib/micropulse/basketballStats/commonSets";
import { extractFilmFrames, FrameExtractError } from "@/lib/video/extractFilmFrames";

type MatchResult = {
  matchedKey: string | null; confidence: "high" | "medium" | "low";
  evidence: string[]; note: string; freeRead: string;
  matchedName: string | null; matchedPlayType: string | null;
};

export default function PlayDiagramsSection({ opponent }: { opponent: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [plays, setPlays] = React.useState<SavedDiagram[] | null>(null);
  const [editing, setEditing] = React.useState<null | "new" | SavedDiagram>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [match, setMatch] = React.useState<MatchResult | null>(null);
  const [picking, setPicking] = React.useState(false); // choose-from-library panel open
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const load = React.useCallback(async () => {
    if (!opponent) return;
    const t = await token(); if (!t) return;
    const res = await fetch(`/api/coach/scouting/play-diagrams?opponent=${encodeURIComponent(opponent)}`, { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
    const j = await res.json();
    if (j.ok) setPlays(j.diagrams ?? []);
  }, [opponent, token]);
  React.useEffect(() => { setEditing(null); setErr(null); setMsg(null); setMatch(null); setPicking(false); void load(); }, [load]);

  async function del(id: string) {
    const t = await token(); if (!t) return;
    await fetch(`/api/coach/scouting/play-diagrams?id=${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
    void load();
  }

  // Decode the clip in the browser (frames only leave the client), then ask the AI which known
  // set it matches. Nothing is saved until the coach acts on the result.
  async function onFile(file: File) {
    setErr(null); setMsg(null); setMatch(null); setBusy(true);
    try {
      setMsg(is ? "Les myndbandið…" : "Reading the clip…");
      const { frames, durationSec } = await extractFilmFrames(file, { count: 10 });
      setMsg(is ? "AI ber saman við þekkt kerfi…" : "AI is matching against known sets…");
      const t = await token(); if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const res = await fetch("/api/coach/scouting/play-diagrams/match-from-frames", {
        method: "POST", headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" },
        body: JSON.stringify({ opponent, frames, durationSec: Math.round(durationSec), lang }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); return; }
      setMsg(null);
      setMatch(j.match as MatchResult);
    } catch (e) {
      if (e instanceof FrameExtractError) {
        setErr(e.code === "DECODE_UNSUPPORTED"
          ? (is ? "Vafrinn gat ekki lesið þetta myndband (oft HEVC/.mov) — prófaðu .mp4." : "The browser couldn't decode this clip (often HEVC/.mov) — try an .mp4.")
          : e.message);
      } else setErr(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  // Save a matched common set as one of this opponent's plays (so it lists + prints).
  async function saveStdMatch(stdKey: string, notes: string) {
    const set = commonSetByKey(stdKey); if (!set) return;
    const t = await token(); if (!t) return;
    await fetch("/api/coach/scouting/play-diagrams", {
      method: "POST", headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" },
      body: JSON.stringify({ opponent, name: is ? set.name.is : set.name.en, playType: set.playType, diagram: set.diagram, notes }),
    });
    setMatch(null);
    void load();
  }

  const confBadge = (c: MatchResult["confidence"]) => {
    const t = c === "high" ? (is ? "mikil vissa" : "high") : c === "medium" ? (is ? "nokkur vissa" : "medium") : (is ? "lítil vissa" : "low");
    const cls = c === "high" ? "bg-emerald-100 text-emerald-700" : c === "medium" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600";
    return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>{t}</span>;
  };

  function MatchCard({ m }: { m: MatchResult }) {
    const std = m.matchedKey?.startsWith("std:") ? m.matchedKey.slice(4) : null;
    const isOwn = m.matchedKey?.startsWith("play:");
    const notes = [m.note, ...m.evidence].filter(Boolean).join(" · ");
    return (
      <div className="mb-3 rounded-xl border border-[#c4cbf5] bg-[#f6f7fe] p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="rounded bg-[#2740e6] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">AI</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#2740e6]">{is ? "les myndbandið — ákveður ekkert" : "reads the clip — decides nothing"}</span>
          <button type="button" onClick={() => setMatch(null)} className="ml-auto text-[12px] text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {m.matchedKey ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-bold text-slate-900">{is ? "Líkist: " : "Looks like: "}{m.matchedName}</span>
              {m.matchedPlayType ? <span className="text-[11px] text-slate-500">{m.matchedPlayType}</span> : null}
              {confBadge(m.confidence)}
            </div>
            {m.evidence.length ? (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12px] text-slate-600">
                {m.evidence.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            ) : null}
            {m.note ? <p className="mt-1.5 text-[11px] italic text-slate-500">{m.note}</p> : null}
            <div className="mt-2">
              {std ? (
                <button type="button" onClick={() => void saveStdMatch(std, notes)} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1e34c0]">
                  {is ? "Staðfesta og vista sem kerfi" : "Confirm & save as a play"}
                </button>
              ) : isOwn ? (
                <p className="text-[12px] font-semibold text-emerald-700">{is ? `✓ Passar við kerfið þitt „${m.matchedName}"` : `✓ Matches your play "${m.matchedName}"`}</p>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className="text-[13px] font-semibold text-slate-800">{is ? "Ekkert þekkt kerfi passaði." : "No known set matched."}</p>
            {m.freeRead ? <p className="mt-1 text-[12px] text-slate-600">{m.freeRead}</p> : null}
            <button type="button" onClick={() => { setMatch(null); setEditing("new"); }} className="mt-2 rounded-lg border border-[#2740e6] px-2.5 py-1 text-[12px] font-semibold text-[#2740e6] hover:bg-[#eef0fb]">
              {is ? "Teikna það sjálf(ur)" : "Draw it yourself"}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#e3e1d9] bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold text-slate-800">{is ? "Leikkerfi (teiknuð)" : "Set plays"}</span>
        <span className="rounded bg-[#2740e6] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">{is ? "Lýsandi" : "Scouting"}</span>
        {editing === null && (
          <div className="ml-auto flex items-center gap-2">
            <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {busy ? (is ? "Vinn…" : "Working…") : (is ? "🔍 Þekkja úr myndbandi" : "🔍 Recognise from clip")}
            </button>
            <button type="button" onClick={() => { setMatch(null); setPicking((v) => !v); }} className={`rounded-lg border px-2.5 py-1 text-[12px] font-semibold ${picking ? "border-[#2740e6] bg-[#eef0fb] text-[#2740e6]" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
              {is ? "+ Velja kerfi" : "+ Choose a set"}
            </button>
            <button type="button" onClick={() => setEditing("new")} className="rounded-lg border border-[#2740e6] px-2.5 py-1 text-[12px] font-semibold text-[#2740e6] hover:bg-[#eef0fb]">
              {is ? "+ Teikna leik" : "+ Draw a play"}
            </button>
          </div>
        )}
      </div>

      {editing === null && (msg || err) ? (
        <p className={`mb-2 text-[12px] ${err ? "text-red-600" : "text-slate-500"}`}>{err ?? msg}</p>
      ) : null}
      {editing === null && !err && !busy && !match ? (
        <p className="mb-2 text-[11px] text-slate-400">
          {is ? "Þekkja úr myndbandi: hlaðið upp stuttu búti (ein sókn, ~10–25 s). AI ber það saman við teiknuðu kerfin þín og algeng kerfi og segir hvert það líkist — myndbandið fer aldrei á netþjóninn." : "Recognise from clip: upload a short possession (~10–25 s). The AI compares it to your drawn plays and common sets and says which it resembles — the video never leaves your browser."}
        </p>
      ) : null}

      {editing === null && match ? <MatchCard m={match} /> : null}

      {editing === null && picking ? (
        <div className="mb-3 rounded-xl border border-[#c4cbf5] bg-[#f6f7fe] p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[12px] font-semibold text-slate-800">{is ? "Algeng kerfi — veldu til að bæta á andstæðinginn" : "Common sets — pick one to add to this opponent"}</span>
            <button type="button" onClick={() => setPicking(false)} className="ml-auto text-[12px] text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COMMON_SETS.map((s) => (
              <div key={s.key} className="rounded-xl border border-slate-200 bg-white p-2">
                <div className="rounded-lg border border-slate-200 bg-white p-1"><PlayDiagramSvg diagram={s.diagram} /></div>
                <div className="mt-1.5 min-w-0">
                  <div className="truncate text-[13px] font-semibold text-slate-900">{is ? s.name.is : s.name.en}</div>
                  <div className="text-[11px] text-slate-500">{playTypeLabel(s.playType, is ? "IS" : "EN")}</div>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">{is ? s.description.is : s.description.en}</p>
                <button type="button" onClick={() => { void saveStdMatch(s.key, is ? s.description.is : s.description.en); setPicking(false); }} className="mt-1.5 w-full rounded-lg bg-[#2740e6] px-2 py-1 text-[12px] font-semibold text-white hover:bg-[#1e34c0]">
                  {is ? "+ Bæta á report" : "+ Add to report"}
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">{is ? "Hreint hús-stíls diagram — ratar beint í scouting-PDF-ið. Þú getur breytt því eftir á (Breyta)." : "A clean house-style diagram — carries straight into the scouting PDF. You can tweak it afterwards (Edit)."}</p>
        </div>
      ) : null}

      {editing !== null ? (
        <PlayDiagramEditor opponent={opponent} initial={editing === "new" ? null : editing}
          onSaved={() => { setEditing(null); void load(); }} onCancel={() => setEditing(null)} />
      ) : plays && plays.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plays.map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-2">
              <div className="rounded-lg border border-slate-200 bg-white p-1">
                <PlayDiagramSvg diagram={p.diagram} />
              </div>
              <div className="mt-1.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-slate-900">{p.name}</div>
                  <div className="text-[11px] text-slate-500">{playTypeLabel(p.play_type, is ? "IS" : "EN")}</div>
                </div>
                <div className="flex shrink-0 gap-1.5 text-[11px] font-semibold">
                  <button type="button" onClick={() => setEditing(p)} className="text-[#2740e6] hover:underline">{is ? "Breyta" : "Edit"}</button>
                  <button type="button" onClick={() => void del(p.id)} className="text-red-600 hover:underline">{is ? "Eyða" : "Delete"}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-slate-500">
          {is ? "Engin leikkerfi enn — teiknaðu mest notuðu sóknir andstæðingsins á hálfan völl, eða láttu AI þekkja kerfi úr myndbandi. Aðeins kerfi hér rata í scouting-PDF-ið." : "No set plays yet — draw the opponent's most-used sets on a half court, or let the AI recognise one from a clip. Only plays here carry into the scouting PDF."}
        </p>
      )}
    </div>
  );
}

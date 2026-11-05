"use client";

/**
 * SetPlayVideos — opponent set plays as VIDEO links (the simple alternative to drawn diagrams). The
 * coach pastes a YouTube (or other) link + a name per play; it shows here as a playable card (thumbnail
 * → inline embed) and carries into the scouting PDF as a "▶ Watch" link. No video is stored, just the
 * link. Keyed to the scouted opponent. Descriptive scouting — never a readiness signal.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { parseVideoLink } from "@/lib/micropulse/basketballStats/videoLink";

type SetVideo = { id: string; label: string; url: string; note: string | null; created_at: string };

export default function SetPlayVideos({ opponent }: { opponent: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [videos, setVideos] = React.useState<SetVideo[] | null>(null);
  const [label, setLabel] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [playing, setPlaying] = React.useState<string | null>(null);
  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const load = React.useCallback(async () => {
    if (!opponent) return;
    const t = await token(); if (!t) return;
    const r = await fetch(`/api/coach/scouting/set-videos?opponent=${encodeURIComponent(opponent)}`, { cache: "no-store", headers: { Authorization: `Bearer ${t}` } }).then((x) => x.json()).catch(() => null);
    if (r?.ok) setVideos(r.videos ?? []);
  }, [opponent, token]);
  React.useEffect(() => { setPlaying(null); setErr(null); void load(); }, [load]);

  async function add() {
    if (!label.trim() || !url.trim()) { setErr(is ? "Nafn og hlekk vantar." : "A name and a link are required."); return; }
    setBusy(true); setErr(null);
    try {
      const t = await token(); if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const res = await fetch("/api/coach/scouting/set-videos", {
        method: "POST", headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" },
        body: JSON.stringify({ opponent, label: label.trim(), url: url.trim() }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); return; }
      setLabel(""); setUrl(""); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  }

  async function del(id: string) {
    const t = await token(); if (!t) return;
    await fetch(`/api/coach/scouting/set-videos?id=${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
    void load();
  }

  return (
    <div className="rounded-xl border border-[#e3e1d9] bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold text-slate-800">{is ? "Leikkerfi (vídeó)" : "Set plays (video)"}</span>
        <span className="rounded bg-[#2740e6] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">{is ? "Lýsandi" : "Scouting"}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={is ? "Nafn (t.d. Horns)" : "Name (e.g. Horns)"}
          className="min-w-[140px] flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder={is ? "YouTube-hlekkur" : "YouTube link"}
          className="min-w-[220px] flex-[2] rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" />
        <button type="button" disabled={busy} onClick={() => void add()} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">{busy ? "…" : (is ? "+ Bæta við" : "+ Add")}</button>
      </div>
      {err ? <p className="mt-2 text-[12px] font-medium text-red-700">{err}</p> : null}
      <p className="mt-1.5 text-[11px] text-slate-400">{is
        ? "Límdu YouTube-hlekk á kerfi andstæðingsins — birtist hér sem spilanlegt kort og sem „▶ Horfa“ hlekkur í scouting-PDF-inu. Myndböndin eru ekki geymd, bara hlekkurinn."
        : "Paste a YouTube link to the opponent's set play — it shows here as a playable card and as a \"▶ Watch\" link in the scouting PDF. Videos aren't stored, only the link."}</p>

      {videos && videos.length > 0 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => {
            const pl = parseVideoLink(v.url);
            const open = playing === v.id;
            return (
              <div key={v.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-2">
                <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-black" style={{ aspectRatio: "16 / 9" }}>
                  {open && pl.embed ? (
                    <iframe src={`${pl.embed}?autoplay=1`} title={v.label} allow="autoplay; encrypted-media; fullscreen" allowFullScreen className="absolute inset-0 h-full w-full" />
                  ) : pl.thumb ? (
                    <button type="button" onClick={() => setPlaying(v.id)} className="group absolute inset-0" aria-label={is ? `Spila ${v.label}` : `Play ${v.label}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pl.thumb} alt={v.label} className="h-full w-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="rounded-full bg-black/60 px-3.5 py-2 text-[15px] font-bold text-white group-hover:bg-[#2740e6]">▶</span>
                      </span>
                    </button>
                  ) : (
                    <a href={v.url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold text-white hover:underline">▶ {is ? "Opna hlekk" : "Open link"}</a>
                  )}
                </div>
                <div className="mt-1.5 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-slate-900">{v.label}</div>
                    <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#2740e6] hover:underline">{pl.provider === "youtube" ? "YouTube" : (is ? "Opna hlekk" : "Open link")} ↗</a>
                  </div>
                  <button type="button" onClick={() => void del(v.id)} className="shrink-0 text-[11px] font-semibold text-red-600 hover:underline">{is ? "Eyða" : "Delete"}</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-slate-500">{is ? "Engin kerfi-myndbönd enn — límdu YouTube-hlekk að ofan. Aðeins hlekkir hér rata í scouting-PDF-ið." : "No set-play videos yet — paste a YouTube link above. Only links here carry into the scouting PDF."}</p>
      )}
    </div>
  );
}

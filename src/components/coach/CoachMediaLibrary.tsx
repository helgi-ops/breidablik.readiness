"use client";

/**
 * Coaching Library — Videos view. Searchable/filterable grid of the coach's media
 * (clips, images, docs) plus add-by-link (default) and opt-in upload. A clip can be
 * attached to a drill from the library. Content surface — no readiness coupling.
 *
 * Player-identifiable video stays private: uploads live in the private bucket and are
 * reached only via short-lived signed URLs; add-by-link is the encouraged default so
 * the cloud bill (uploaded video) only grows when a coach deliberately uploads.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { filterMedia, collectTags, detectMediaKindFromUrl, type MediaKind, type ResolvedMedia } from "@/lib/micropulse/library/media";

/** Human size / duration for the storage-footprint view. */
const fmtBytes = (b: number | null | undefined): string | null =>
  b == null ? null : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const fmtDur = (s: number | null | undefined): string | null =>
  s == null ? null : s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : `${Math.round(s)}s`;

/** Read a video File's duration (seconds) from its metadata, client-side. Null if unreadable. */
function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null); };
      v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      v.src = url;
    } catch { resolve(null); }
  });
}

const COPY = {
  IS: {
    search: "Leita í myndböndum…", all: "Allt", video: "Myndbönd", image: "Myndir", doc: "Skjöl",
    add: "Bæta við hlekk", upload: "Hlaða upp", title: "Titill", link: "Hlekkur (YouTube/Vimeo/…)",
    tags: "Tögg (aðskilin með kommu)", drill: "Tengja við drillu (valfrjálst)", note: "Athugasemd",
    save: "Vista", saving: "Vista…", cancel: "Hætta við", none: "—",
    empty: "Ekkert myndband enn — bættu við hlekk eða hlaðið upp.", open: "Opna", del: "Eyða", delConfirm: "Eyða þessu?",
    uploading: "Hleð upp…", uploadHint: "Hlekkur er sjálfgefinn (ódýrt). Upphlaðin myndbönd eru einkamál (undirrituð slóð).",
    linkedDrill: "drilla", errAuth: "Auðkenning vantar", err: "Villa",
    file: "Skrá (myndband/mynd/PDF, hám. 200 MB)",
  },
  EN: {
    search: "Search videos…", all: "All", video: "Videos", image: "Images", doc: "Docs",
    add: "Add link", upload: "Upload", title: "Title", link: "Link (YouTube/Vimeo/…)",
    tags: "Tags (comma-separated)", drill: "Attach to a drill (optional)", note: "Note",
    save: "Save", saving: "Saving…", cancel: "Cancel", none: "—",
    empty: "No media yet — add a link or upload.", open: "Open", del: "Delete", delConfirm: "Delete this?",
    uploading: "Uploading…", uploadHint: "Add-by-link is the default (cheap). Uploaded video is private (signed URL).",
    linkedDrill: "drill", errAuth: "Missing auth", err: "Error",
    file: "File (video/image/PDF, max 200 MB)",
  },
} as const;

type DrillOpt = { id: string; drill_name: string };

async function token(): Promise<string | null> {
  return (await getSupabaseClient().auth.getSession()).data?.session?.access_token ?? null;
}

export default function CoachMediaLibrary({ teamId }: { teamId: string; teamSport?: string | null }) {
  const [lang] = useLang();
  const c = COPY[lang];
  const [media, setMedia] = useState<ResolvedMedia[]>([]);
  const [drills, setDrills] = useState<DrillOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<MediaKind | "all">("all");
  const [tag, setTag] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "link" | "upload">("none");

  const refresh = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const tk = await token();
      if (!tk) throw new Error(c.errAuth);
      const res = await fetch(`/api/coach/library/media?team_id=${encodeURIComponent(teamId)}`, { headers: { Authorization: `Bearer ${tk}` } });
      const json = await res.json();
      setMedia(res.ok && json.ok ? (json.media ?? []) : []);
    } catch { setMedia([]); }
    finally { setLoading(false); }
  }, [teamId, c.errAuth]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      try {
        const tk = await token();
        if (!tk || cancelled) return;
        const res = await fetch(`/api/coach/drill-library?team_id=${encodeURIComponent(teamId)}`, { headers: { Authorization: `Bearer ${tk}` } });
        const json = res.ok ? await res.json() : null;
        if (!cancelled && json?.ok) setDrills(((json.drills ?? []) as Array<{ id: string; drill_name: string }>).map((d) => ({ id: d.id, drill_name: d.drill_name })));
      } catch { /* drills optional */ }
    })();
    return () => { cancelled = true; };
  }, [teamId]);

  const allTags = useMemo(() => collectTags(media), [media]);
  const shown = useMemo(() => filterMedia(media, { q, kind, tag }), [media, q, kind, tag]);
  // Storage footprint = uploaded objects only (external links cost nothing).
  const footprint = useMemo(() => {
    const up = media.filter((m) => m.uploaded);
    return { count: up.length, bytes: up.reduce((a, m) => a + (m.bytes ?? 0), 0) };
  }, [media]);
  const drillName = useCallback((id: string | null) => drills.find((d) => d.id === id)?.drill_name ?? null, [drills]);

  async function softDelete(id: string) {
    if (!window.confirm(c.delConfirm)) return;
    const tk = await token();
    if (!tk) return;
    await fetch(`/api/coach/library/media`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` }, body: JSON.stringify({ id, deleted: true }) });
    setMedia((m) => m.filter((x) => x.id !== id));
  }

  const KIND_TABS: Array<[MediaKind | "all", string]> = [["all", c.all], ["video", c.video], ["image", c.image], ["doc", c.doc]];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={c.search}
          className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#2740e6] focus:outline-none focus:ring-1 focus:ring-[#2740e6]" />
        <div className="flex gap-1">
          {KIND_TABS.map(([k, lbl]) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${kind === k ? "bg-[#2740e6] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{lbl}</button>
          ))}
        </div>
        <button type="button" onClick={() => setMode(mode === "link" ? "none" : "link")} className="rounded-lg bg-[#2740e6] px-3 py-2 text-xs font-semibold text-white">+ {c.add}</button>
        <button type="button" onClick={() => setMode(mode === "upload" ? "none" : "upload")} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">↑ {c.upload}</button>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setTag(null)} className={`rounded-full px-2.5 py-1 text-[11px] ${tag === null ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>{c.all}</button>
          {allTags.map((tg) => (
            <button key={tg} type="button" onClick={() => setTag(tag === tg ? null : tg)} className={`rounded-full px-2.5 py-1 text-[11px] ${tag === tg ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>#{tg}</button>
          ))}
        </div>
      )}

      {mode === "link" && <AddLinkForm teamId={teamId} drills={drills} lang={lang} onDone={() => { setMode("none"); refresh(); }} />}
      {mode === "upload" && <UploadForm teamId={teamId} drills={drills} lang={lang} onDone={() => { setMode("none"); refresh(); }} />}

      {footprint.count > 0 && (
        <div className="text-[11px] text-slate-400">
          {lang === "IS" ? "Upphlaðið geymslupláss" : "Uploaded footprint"}: {footprint.count} {lang === "IS" ? "skrár" : "files"} · {fmtBytes(footprint.bytes)}
          <span className="ml-1 text-slate-300">({lang === "IS" ? "hlekkir kosta ekkert" : "links cost nothing"})</span>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>
      ) : shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{c.empty}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((m) => (
            <MediaCard key={m.id} m={m} drillName={drillName(m.drill_id)} lang={lang} onDelete={() => softDelete(m.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaCard({ m, drillName, lang, onDelete }: { m: ResolvedMedia; drillName: string | null; lang: "IS" | "EN"; onDelete: () => void }) {
  const c = COPY[lang];
  const thumb = m.youtubeId ? `https://i.ytimg.com/vi/${m.youtubeId}/hqdefault.jpg` : m.kind === "image" ? m.url : null;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="relative flex aspect-video items-center justify-center bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : (
          <span className="text-3xl text-slate-300">{m.kind === "doc" ? "📄" : m.kind === "image" ? "🖼️" : "🎬"}</span>
        )}
        {m.uploaded && <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">{lang === "IS" ? "einka" : "private"}</span>}
      </div>
      <div className="space-y-1.5 p-3">
        <div className="text-sm font-semibold text-slate-900">{m.title}</div>
        {m.note && <div className="line-clamp-2 text-[11px] text-slate-500">{m.note}</div>}
        <div className="flex flex-wrap gap-1">
          {(m.tags ?? []).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">#{t}</span>)}
          {drillName && <span className="rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#2740e6]">🎯 {drillName}</span>}
        </div>
        {m.uploaded && (fmtBytes(m.bytes) || fmtDur(m.duration_s)) && (
          <div className="text-[10px] tabular-nums text-slate-400">{[fmtDur(m.duration_s), fmtBytes(m.bytes)].filter(Boolean).join(" · ")}</div>
        )}
        <div className="flex items-center justify-between pt-1">
          {m.url ? (
            <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-[#2740e6] hover:underline">{c.open} →</a>
          ) : <span className="text-[11px] text-slate-300">{c.none}</span>}
          <button type="button" onClick={onDelete} className="text-[11px] text-slate-400 hover:text-red-600">{c.del}</button>
        </div>
      </div>
    </div>
  );
}

function AddLinkForm({ teamId, drills, lang, onDone }: { teamId: string; drills: DrillOpt[]; lang: "IS" | "EN"; onDone: () => void }) {
  const c = COPY[lang];
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");
  const [drillId, setDrillId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const tk = await token();
      if (!tk) throw new Error(c.errAuth);
      const res = await fetch(`/api/coach/library/media`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ team_id: teamId, title: title.trim(), kind: detectMediaKindFromUrl(url), external_url: url.trim(), tags: tags.split(",").map((x) => x.trim()).filter(Boolean), drill_id: drillId || null, note: note.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || c.err);
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : c.err); setBusy(false); }
  }

  const canSave = title.trim() && url.trim() && !busy;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <FormFields {...{ title, setTitle, tags, setTags, drillId, setDrillId, note, setNote, drills, c }}
        linkSlot={<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={c.link} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-[#2740e6] focus:outline-none" />} />
      {err && <div className="mt-1 text-[11px] text-red-600">{err}</div>}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded px-3 py-1.5 text-xs text-slate-500">{c.cancel}</button>
        <button type="button" onClick={save} disabled={!canSave} className="rounded bg-[#2740e6] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{busy ? c.saving : c.save}</button>
      </div>
    </div>
  );
}

function UploadForm({ teamId, drills, lang, onDone }: { teamId: string; drills: DrillOpt[]; lang: "IS" | "EN"; onDone: () => void }) {
  const c = COPY[lang];
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [drillId, setDrillId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function save() {
    const file = fileRef.current?.files?.[0];
    if (!file || !title.trim()) return;
    setBusy(true); setErr(null);
    try {
      const tk = await token();
      if (!tk) throw new Error(c.errAuth);
      // Read the clip's duration client-side so the server can enforce the duration cap + store it.
      const durationS = file.type.startsWith("video/") ? await readVideoDuration(file) : null;
      const fd = new FormData();
      fd.set("file", file); fd.set("title", title.trim()); fd.set("team_id", teamId);
      fd.set("tags", tags); if (drillId) fd.set("drill_id", drillId); if (note.trim()) fd.set("note", note.trim());
      if (durationS) fd.set("duration_s", String(Math.round(durationS)));
      const res = await fetch(`/api/coach/library/media/upload`, { method: "POST", headers: { Authorization: `Bearer ${tk}` }, body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || c.err);
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : c.err); setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-[11px] text-slate-500">{c.uploadHint}</div>
      <FormFields {...{ title, setTitle, tags, setTags, drillId, setDrillId, note, setNote, drills, c }}
        linkSlot={<input ref={fileRef} type="file" accept="video/*,image/*,application/pdf" className="w-full text-xs text-slate-600" aria-label={c.file} />} />
      {err && <div className="mt-1 text-[11px] text-red-600">{err}</div>}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded px-3 py-1.5 text-xs text-slate-500">{c.cancel}</button>
        <button type="button" onClick={save} disabled={busy || !title.trim()} className="rounded bg-[#2740e6] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{busy ? c.uploading : c.save}</button>
      </div>
    </div>
  );
}

function FormFields({
  title, setTitle, tags, setTags, drillId, setDrillId, note, setNote, drills, c, linkSlot,
}: {
  title: string; setTitle: (v: string) => void; tags: string; setTags: (v: string) => void;
  drillId: string; setDrillId: (v: string) => void; note: string; setNote: (v: string) => void;
  drills: DrillOpt[]; c: { title: string; tags: string; drill: string; note: string }; linkSlot: ReactNode;
}) {
  const input = "w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-[#2740e6] focus:outline-none";
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={c.title} className={input} />
      {linkSlot}
      <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={c.tags} className={input} />
      <select value={drillId} onChange={(e) => setDrillId(e.target.value)} className={input}>
        <option value="">{c.drill}</option>
        {drills.map((d) => <option key={d.id} value={d.id}>{d.drill_name}</option>)}
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={c.note} className={`${input} sm:col-span-2`} />
    </div>
  );
}

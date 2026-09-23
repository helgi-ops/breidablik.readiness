"use client";

/**
 * Coaching Library — Meetings view. A list of meetings (staff / team / 1-to-1 /
 * video-review) with agenda, minutes, attendees, and attached drills / videos / files.
 * Content/knowledge surface — no readiness coupling.
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { ResolvedMedia } from "@/lib/micropulse/library/media";

const COPY = {
  IS: {
    newMeeting: "Nýr fundur", title: "Titill", date: "Dagsetning", type: "Tegund", agenda: "Dagskrá",
    minutes: "Fundargerð", attendees: "Mætingar", save: "Vista", saving: "Vista…", cancel: "Hætta við",
    empty: "Engir fundir enn.", del: "Eyða", delConfirm: "Eyða þessum fundi?", edit: "Breyta",
    attach: "Viðhengi", addDrill: "Tengja drillu", addMedia: "Tengja myndband", addLink: "Bæta hlekk",
    addUpload: "Hlaða upp PDF/skjali", uploading: "Hleð upp…",
    readPdf: "Lesa PDF (AI) → fylla titil & dagskrá", reading: "Les PDF…", readFilled: "Fyllt út úr PDF (AI) — staðfestu",
    pickDrill: "Veldu drillu…", pickMedia: "Veldu myndband…", link: "Hlekkur", note: "Nóta", add: "Bæta við",
    remove: "Fjarlægja", open: "Opna", errAuth: "Auðkenning vantar", err: "Villa",
    types: { staff: "Starfsfólk", team: "Lið", "1to1": "Einstaklings", "video-review": "Myndbandarýni", other: "Annað" },
  },
  EN: {
    newMeeting: "New meeting", title: "Title", date: "Date", type: "Type", agenda: "Agenda",
    minutes: "Minutes", attendees: "Attendees", save: "Save", saving: "Saving…", cancel: "Cancel",
    empty: "No meetings yet.", del: "Delete", delConfirm: "Delete this meeting?", edit: "Edit",
    attach: "Attachments", addDrill: "Attach drill", addMedia: "Attach video", addLink: "Add link",
    addUpload: "Upload PDF/file", uploading: "Uploading…",
    readPdf: "Read PDF (AI) → fill title & agenda", reading: "Reading PDF…", readFilled: "Filled from the PDF (AI) — confirm",
    pickDrill: "Pick a drill…", pickMedia: "Pick a video…", link: "Link", note: "Note", add: "Add",
    remove: "Remove", open: "Open", errAuth: "Missing auth", err: "Error",
    types: { staff: "Staff", team: "Team", "1to1": "1-to-1", "video-review": "Video review", other: "Other" },
  },
} as const;

const MEETING_TYPES = ["staff", "team", "1to1", "video-review", "other"] as const;
type MeetingType = (typeof MEETING_TYPES)[number];

type Meeting = {
  id: string; title: string; meeting_date: string; meeting_type: MeetingType | null;
  agenda: string | null; minutes: string | null; attendees: string | null;
};
type Attachment = {
  id: string; kind: "drill" | "media" | "file" | "note";
  drill_id: string | null; media_id: string | null; external_url: string | null; note: string | null;
  position: number; drill_name?: string | null; media?: ResolvedMedia | null;
};
type DrillOpt = { id: string; drill_name: string };

async function token(): Promise<string | null> {
  return (await getSupabaseClient().auth.getSession()).data?.session?.access_token ?? null;
}

export default function CoachMeetings({ teamId }: { teamId: string }) {
  const [lang] = useLang();
  const c = COPY[lang];
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [drills, setDrills] = useState<DrillOpt[]>([]);
  const [mediaOpts, setMediaOpts] = useState<ResolvedMedia[]>([]);

  const refresh = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const tk = await token();
      if (!tk) throw new Error(c.errAuth);
      const res = await fetch(`/api/coach/library/meetings?team_id=${encodeURIComponent(teamId)}`, { headers: { Authorization: `Bearer ${tk}` } });
      const json = await res.json();
      setMeetings(res.ok && json.ok ? (json.meetings ?? []) : []);
    } catch { setMeetings([]); }
    finally { setLoading(false); }
  }, [teamId, c.errAuth]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      const tk = await token();
      if (!tk || cancelled) return;
      const [dr, md] = await Promise.all([
        fetch(`/api/coach/drill-library?team_id=${encodeURIComponent(teamId)}`, { headers: { Authorization: `Bearer ${tk}` } }).then((r) => r.json()).catch(() => null),
        fetch(`/api/coach/library/media?team_id=${encodeURIComponent(teamId)}`, { headers: { Authorization: `Bearer ${tk}` } }).then((r) => r.json()).catch(() => null),
      ]);
      if (cancelled) return;
      if (dr?.ok) setDrills(((dr.drills ?? []) as Array<{ id: string; drill_name: string }>).map((d) => ({ id: d.id, drill_name: d.drill_name })));
      if (md?.ok) setMediaOpts((md.media ?? []) as ResolvedMedia[]);
    })();
    return () => { cancelled = true; };
  }, [teamId]);

  async function del(id: string) {
    if (!window.confirm(c.delConfirm)) return;
    const tk = await token();
    if (!tk) return;
    await fetch(`/api/coach/library/meetings`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` }, body: JSON.stringify({ id, deleted: true }) });
    setMeetings((m) => m.filter((x) => x.id !== id));
    if (selected === id) setSelected(null);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">{meetings.length} {lang === "IS" ? "fundir" : "meetings"}</div>
        <button type="button" onClick={() => { setCreating(true); setSelected(null); }} className="rounded-lg bg-[#2740e6] px-3 py-2 text-xs font-semibold text-white">+ {c.newMeeting}</button>
      </div>

      {creating && <MeetingForm teamId={teamId} lang={lang} onDone={(m) => { setCreating(false); if (m) { refresh(); setSelected(m.id); } }} />}

      {loading ? (
        <div className="p-8 text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>
      ) : meetings.length === 0 && !creating ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{c.empty}</div>
      ) : (
        <div className="space-y-2">
          {meetings.map((m) => (
            <div key={m.id} className="rounded-xl border border-slate-200 bg-white">
              <button type="button" onClick={() => setSelected(selected === m.id ? null : m.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{m.title}</div>
                  <div className="text-[11px] text-slate-500">
                    {new Date(m.meeting_date + "T00:00:00").toLocaleDateString(lang === "IS" ? "is-IS" : "en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {m.meeting_type && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{c.types[m.meeting_type]}</span>}
                  </div>
                </div>
                <span className="text-xs text-slate-400">{selected === m.id ? "▲" : "▼"}</span>
              </button>
              {selected === m.id && <MeetingDetail meeting={m} teamId={teamId} lang={lang} drills={drills} mediaOpts={mediaOpts} onDelete={() => del(m.id)} onChanged={refresh} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingForm({ teamId, lang, onDone, initial }: { teamId: string; lang: "IS" | "EN"; onDone: (m: Meeting | null) => void; initial?: Meeting }) {
  const c = COPY[lang];
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(initial?.meeting_date ?? new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<MeetingType | "">(initial?.meeting_type ?? "");
  const [agenda, setAgenda] = useState(initial?.agenda ?? "");
  const [minutes, setMinutes] = useState(initial?.minutes ?? "");
  const [attendees, setAttendees] = useState(initial?.attendees ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [readMsg, setReadMsg] = useState<string | null>(null);
  const input = "w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-[#2740e6] focus:outline-none";

  const fileToBase64 = (f: File) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]*;base64,/, ""));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(f);
  });

  // Read the first staged PDF and prefill EMPTY fields only (never overwrite the coach's typing).
  async function readPdf() {
    const pdf = files.find((f) => f.type === "application/pdf");
    if (!pdf) return;
    setReading(true); setErr(null); setReadMsg(null);
    try {
      const tk = await token();
      if (!tk) throw new Error(c.errAuth);
      const b64 = await fileToBase64(pdf);
      const res = await fetch(`/api/coach/library/meetings/read-pdf`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` }, body: JSON.stringify({ pdf: b64, lang }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || c.err);
      const r = json.read as { title: string | null; meetingType: MeetingType | null; agenda: string | null; attendees: string | null; summary: string | null };
      if (r.title && !title.trim()) setTitle(r.title);
      if (r.meetingType && !type) setType(r.meetingType);
      if (r.agenda && !agenda.trim()) setAgenda(r.agenda);
      if (r.attendees && !attendees.trim()) setAttendees(r.attendees);
      if (r.summary && !minutes.trim()) setMinutes(r.summary);
      setReadMsg(c.readFilled);
    } catch (e) { setErr(e instanceof Error ? e.message : c.err); }
    finally { setReading(false); }
  }

  async function save() {
    if (!title.trim() || !date) return;
    setBusy(true); setErr(null);
    try {
      const tk = await token();
      if (!tk) throw new Error(c.errAuth);
      const payload = { title: title.trim(), meeting_date: date, meeting_type: type || null, agenda: agenda.trim() || null, minutes: minutes.trim() || null, attendees: attendees.trim() || null };
      const res = initial
        ? await fetch(`/api/coach/library/meetings`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` }, body: JSON.stringify({ id: initial.id, ...payload }) })
        : await fetch(`/api/coach/library/meetings`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` }, body: JSON.stringify({ team_id: teamId, ...payload }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || c.err);
      const meetingId = (json.meeting as { id?: string } | undefined)?.id ?? initial?.id ?? null;
      // Staged files → upload to the private bucket + attach to the (now saved) meeting.
      if (files.length && meetingId) {
        for (const f of files) {
          const fd = new FormData();
          fd.set("file", f);
          fd.set("title", f.name.replace(/\.[^.]+$/, "") || "Document");
          if (teamId) fd.set("team_id", teamId);
          const up = await fetch(`/api/coach/library/media/upload`, { method: "POST", headers: { Authorization: `Bearer ${tk}` }, body: fd });
          const upJson = await up.json().catch(() => ({}));
          if (!up.ok || !upJson.ok) throw new Error(upJson.error || c.err);
          const mediaId = (upJson.media as { id?: string } | undefined)?.id;
          if (mediaId) await fetch(`/api/coach/library/meetings/attachments`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` }, body: JSON.stringify({ meeting_id: meetingId, kind: "media", media_id: mediaId }) });
        }
      }
      onDone(json.meeting ?? (initial ? { ...initial, ...payload } as Meeting : null));
    } catch (e) { setErr(e instanceof Error ? e.message : c.err); setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={c.title} className={input} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        <select value={type} onChange={(e) => setType(e.target.value as MeetingType | "")} className={input}>
          <option value="">{c.type}</option>
          {MEETING_TYPES.map((t) => <option key={t} value={t}>{c.types[t]}</option>)}
        </select>
        <input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder={c.attendees} className={input} />
        <textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder={c.agenda} rows={2} className={`${input} sm:col-span-2`} />
        <textarea value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder={c.minutes} rows={3} className={`${input} sm:col-span-2`} />
        <div className="sm:col-span-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-[#2740e6] hover:text-[#2740e6]">
            📎 {c.addUpload}
            <input type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={(e) => { setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]); e.currentTarget.value = ""; }} />
          </label>
          {files.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-[11px] text-slate-600">
                  <span className="truncate">📄 {f.name}</span>
                  <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600">✕</button>
                </li>
              ))}
            </ul>
          )}
          {files.some((f) => f.type === "application/pdf") && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <button type="button" onClick={readPdf} disabled={reading} className="inline-flex items-center gap-1.5 rounded bg-[#7a5cc4]/10 px-2.5 py-1 text-[11px] font-semibold text-[#7a5cc4] disabled:opacity-50">
                <span className="rounded bg-[#7a5cc4]/20 px-1 text-[9px] uppercase tracking-wide">AI</span>
                {reading ? c.reading : c.readPdf}
              </button>
              {readMsg && <span className="text-[11px] text-slate-500">{readMsg}</span>}
            </div>
          )}
        </div>
      </div>
      {err && <div className="mt-1 text-[11px] text-red-600">{err}</div>}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={() => onDone(null)} className="rounded px-3 py-1.5 text-xs text-slate-500">{c.cancel}</button>
        <button type="button" onClick={save} disabled={busy || !title.trim()} className="rounded bg-[#2740e6] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{busy ? c.saving : c.save}</button>
      </div>
    </div>
  );
}

function MeetingDetail({ meeting, teamId, lang, drills, mediaOpts, onDelete, onChanged }: {
  meeting: Meeting; teamId: string; lang: "IS" | "EN"; drills: DrillOpt[]; mediaOpts: ResolvedMedia[]; onDelete: () => void; onChanged: () => void;
}) {
  const c = COPY[lang];
  const [editing, setEditing] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [addKind, setAddKind] = useState<"" | "drill" | "media" | "file" | "upload">("");
  const [pickId, setPickId] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    const tk = await token();
    if (!tk) return;
    const res = await fetch(`/api/coach/library/meetings?id=${encodeURIComponent(meeting.id)}`, { headers: { Authorization: `Bearer ${tk}` } });
    const json = await res.json();
    if (res.ok && json.ok) setAttachments((json.attachments ?? []) as Attachment[]);
  }, [meeting.id]);

  // Load attachments on open — inline async IIFE so setState is off the effect's
  // synchronous path (react-hooks/set-state-in-effect); handlers reuse loadDetail.
  useEffect(() => {
    let alive = true;
    (async () => {
      const tk = await token();
      if (!tk || !alive) return;
      const res = await fetch(`/api/coach/library/meetings?id=${encodeURIComponent(meeting.id)}`, { headers: { Authorization: `Bearer ${tk}` } });
      const json = await res.json().catch(() => null);
      if (alive && res.ok && json?.ok) setAttachments((json.attachments ?? []) as Attachment[]);
    })();
    return () => { alive = false; };
  }, [meeting.id]);

  async function addAttachment() {
    const tk = await token();
    if (!tk || !addKind) return;
    const body: Record<string, unknown> = { meeting_id: meeting.id, kind: addKind };
    if (addKind === "drill") { if (!pickId) return; body.drill_id = pickId; }
    else if (addKind === "media") { if (!pickId) return; body.media_id = pickId; }
    else if (addKind === "file") { if (!linkUrl.trim()) return; body.external_url = linkUrl.trim(); body.note = linkNote.trim() || null; }
    const res = await fetch(`/api/coach/library/meetings/attachments`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` }, body: JSON.stringify(body) });
    if (res.ok) { setAddKind(""); setPickId(""); setLinkUrl(""); setLinkNote(""); loadDetail(); }
  }

  async function uploadAndAttach(file: File) {
    const tk = await token();
    if (!tk) return;
    setUploading(true); setUploadErr(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("title", file.name.replace(/\.[^.]+$/, "") || "Document");
      if (teamId) fd.set("team_id", teamId);
      const up = await fetch(`/api/coach/library/media/upload`, { method: "POST", headers: { Authorization: `Bearer ${tk}` }, body: fd });
      const upJson = await up.json().catch(() => ({}));
      if (!up.ok || !upJson.ok) { setUploadErr(upJson.error ?? c.err); return; }
      const mediaId = (upJson.media as { id?: string } | undefined)?.id;
      if (!mediaId) { setUploadErr(c.err); return; }
      const att = await fetch(`/api/coach/library/meetings/attachments`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` }, body: JSON.stringify({ meeting_id: meeting.id, kind: "media", media_id: mediaId }) });
      if (att.ok) { setAddKind(""); loadDetail(); }
      else { const j = await att.json().catch(() => ({})); setUploadErr(j.error ?? c.err); }
    } finally { setUploading(false); }
  }

  async function removeAttachment(id: string) {
    const tk = await token();
    if (!tk) return;
    await fetch(`/api/coach/library/meetings/attachments?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${tk}` } });
    setAttachments((a) => a.filter((x) => x.id !== id));
  }

  const input = "rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-[#2740e6] focus:outline-none";

  return (
    <div className="space-y-3 border-t border-slate-100 px-4 py-3">
      {editing ? (
        <MeetingForm teamId="" lang={lang} initial={meeting} onDone={(m) => { setEditing(false); if (m) onChanged(); }} />
      ) : (
        <div className="space-y-1.5 text-[13px] text-slate-700">
          {meeting.attendees && <div><span className="font-semibold text-slate-500">{c.attendees}: </span>{meeting.attendees}</div>}
          {meeting.agenda && <div className="whitespace-pre-wrap"><span className="font-semibold text-slate-500">{c.agenda}: </span>{meeting.agenda}</div>}
          {meeting.minutes && <div className="whitespace-pre-wrap"><span className="font-semibold text-slate-500">{c.minutes}: </span>{meeting.minutes}</div>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setEditing(true)} className="text-[11px] font-semibold text-[#2740e6] hover:underline">{c.edit}</button>
            <button type="button" onClick={onDelete} className="text-[11px] text-slate-400 hover:text-red-600">{c.del}</button>
          </div>
        </div>
      )}

      {/* Attachments */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{c.attach}</div>
        <div className="space-y-1">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-[12px]">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{a.kind}</span>
              <span className="min-w-0 flex-1 truncate text-slate-700">
                {a.kind === "drill" ? `🎯 ${a.drill_name ?? a.drill_id}` : a.kind === "media" ? `${a.media?.kind === "doc" ? "📄" : a.media?.kind === "image" ? "🖼️" : "🎬"} ${a.media?.title ?? ""}` : a.kind === "note" ? a.note : a.external_url}
              </span>
              {(a.kind === "media" ? a.media?.url : a.external_url) && (
                <a href={(a.kind === "media" ? a.media?.url : a.external_url) as string} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-[#2740e6] hover:underline">{c.open}</a>
              )}
              <button type="button" onClick={() => removeAttachment(a.id)} className="text-[11px] text-slate-400 hover:text-red-600">✕</button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={addKind} onChange={(e) => { setAddKind(e.target.value as "" | "drill" | "media" | "file" | "upload"); setPickId(""); setUploadErr(null); }} className={input}>
            <option value="">+ {c.attach}</option>
            <option value="drill">{c.addDrill}</option>
            <option value="media">{c.addMedia}</option>
            <option value="upload">{c.addUpload}</option>
            <option value="file">{c.addLink}</option>
          </select>
          {addKind === "upload" && (
            <label className={`${input} cursor-pointer ${uploading ? "opacity-50" : ""}`}>
              {uploading ? c.uploading : c.addUpload}
              <input type="file" accept="application/pdf,image/*" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAndAttach(f); e.currentTarget.value = ""; }} />
            </label>
          )}
          {addKind === "drill" && (
            <select value={pickId} onChange={(e) => setPickId(e.target.value)} className={input}>
              <option value="">{c.pickDrill}</option>
              {drills.map((d) => <option key={d.id} value={d.id}>{d.drill_name}</option>)}
            </select>
          )}
          {addKind === "media" && (
            <select value={pickId} onChange={(e) => setPickId(e.target.value)} className={input}>
              <option value="">{c.pickMedia}</option>
              {mediaOpts.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          )}
          {addKind === "file" && (
            <>
              <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder={c.link} className={input} />
              <input value={linkNote} onChange={(e) => setLinkNote(e.target.value)} placeholder={c.note} className={input} />
            </>
          )}
          {addKind && addKind !== "upload" && <button type="button" onClick={addAttachment} className="rounded bg-[#2740e6] px-2.5 py-1.5 text-xs font-semibold text-white">{c.add}</button>}
        </div>
        {uploadErr && <div className="mt-1 text-[11px] text-red-600">{uploadErr}</div>}
      </div>
    </div>
  );
}

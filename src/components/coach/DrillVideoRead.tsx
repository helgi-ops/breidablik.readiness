"use client";

/**
 * DrillVideoRead — "Read this drill (AI)". Pick a drill video → frames are extracted in the browser
 * (never uploaded) → Claude vision returns an AI DRAFT (name/category/format/phases/description) →
 * the coach edits and saves it to drill_library (source = ai_video_draft). Physical load numbers are
 * NOT read from video (they stay GPS-sourced); the draft carries an AI label + confidence + caveat.
 */

import { useState, type FC } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { MAX_CLIP_SECONDS, FrameExtractError } from "@/lib/video/extractFilmFrames";

type Bi = { en: string; is: string };
const CATEGORIES = ["possession", "ssg", "transition", "finishing", "running", "warmup", "other"] as const;
type DrillVideoRead = {
  suggestedName: string; category: string; format: string | null; playersEst: number | null;
  areaType: string | null; phases: string[]; equipment: string[]; description: Bi;
  intensityEst: string | null; confidence: "high" | "moderate" | "low"; caveat: Bi;
};

export const DrillVideoRead: FC<{ teamId: string; videoUrl?: string | null; onSaved?: (id?: string) => void }> = ({ teamId, videoUrl, onSaved }) => {
  const [lang] = useLang();
  const t = (en: string, is: string) => (lang === "IS" ? is : en);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<DrillVideoRead | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [attachVideo, setAttachVideo] = useState(false); // opt-in: keep the clip on the drill (private)
  // editable draft fields
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [format, setFormat] = useState("");
  const [players, setPlayers] = useState("");
  const [descEn, setDescEn] = useState("");
  const [saved, setSaved] = useState(false);

  const token = async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null;

  const onFile = async (file: File) => {
    setError(null); setStatus(null); setRead(null); setSaved(false); setVideoFile(file);
    setBusy(true);
    try {
      setStatus(t("Extracting frames…", "Næ römmum…"));
      const { extractFilmFrames } = await import("@/lib/video/extractFilmFrames");
      const ex = await extractFilmFrames(file, { count: 6, maxWidth: 960, quality: 0.7 });
      setStatus(t("Reading the drill (AI)…", "Les drilluna (AI)…"));
      const tk = await token();
      if (!tk) { setError(t("Not signed in.", "Ekki innskráð(ur).")); return; }
      const res = await fetch("/api/coach/drill-library/video-read", {
        method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ frames: ex.frames, durationSec: ex.durationSec, lang }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) { setError(j?.error ?? t("Read failed.", "Lestur mistókst.")); return; }
      const r = j.read as DrillVideoRead;
      setRead(r); setFrameCount(j.frameCount ?? ex.frames.length);
      setName(r.suggestedName); setCategory(r.category); setFormat(r.format ?? "");
      setPlayers(r.playersEst != null ? String(r.playersEst) : "");
      setDescEn(lang === "IS" ? r.description.is : r.description.en);
      setStatus(null);
    } catch (e) {
      const msg = e instanceof FrameExtractError ? t("Could not read this video format.", "Gat ekki lesið þetta myndbands-snið.") : (e instanceof Error ? e.message : "Failed");
      setError(msg);
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!read || !name.trim()) return;
    setBusy(true); setError(null);
    try {
      const tk = await token();
      if (!tk) { setError(t("Not signed in.", "Ekki innskráð(ur).")); return; }
      // Capture phases/equipment in the description text (drill_library has no phase columns).
      const extras: string[] = [];
      if (read.phases.length) extras.push(`${t("Phases", "Fasar")}: ${read.phases.join(" → ")}`);
      if (read.equipment.length) extras.push(`${t("Equipment", "Búnaður")}: ${read.equipment.join(", ")}`);
      const description = [descEn.trim(), ...extras].filter(Boolean).join("\n");
      const res = await fetch("/api/coach/drill-library", {
        method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({
          team_id: teamId, owner_type: "coach", source: "ai_video_draft",
          drill_name: name.trim(), category, drill_format: format.trim() || null,
          total_players: players.trim() || null, description: description || null,
          video_url: videoUrl ?? null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) { setError(j?.error ?? t("Save failed.", "Vistun mistókst.")); return; }
      const drillId = (j.drill as { id?: string } | undefined)?.id ?? null;
      // Opt-in: attach the clip to the drill (private bucket via coach_media, same route as the form).
      if (attachVideo && videoFile && drillId) {
        setStatus(t("Uploading video…", "Hleð upp myndbandi…"));
        const fd = new FormData();
        fd.set("file", videoFile);
        fd.set("title", `${name.trim() || "Drill"} — video`);
        fd.set("team_id", teamId);
        fd.set("drill_id", drillId);
        const up = await fetch("/api/coach/library/media/upload", { method: "POST", headers: { Authorization: `Bearer ${tk}` }, body: fd });
        const upJson = await up.json().catch(() => ({}));
        if (!up.ok || !upJson.ok) { setError(upJson.error ?? t("Drill saved, but the video upload failed.", "Drilla vistuð, en myndbands-upphleðsla mistókst.")); setStatus(null); }
      }
      setStatus(null);
      setSaved(true);
      onSaved?.(drillId ?? undefined);
    } finally { setBusy(false); }
  };

  const confChip = (c: string) => {
    const m = { high: "bg-[#1c7a4a]/15 text-[#1c7a4a]", moderate: "bg-[#de9328]/15 text-[#8a5a10]", low: "bg-[#a83e28]/15 text-[#a83e28]" }[c] ?? "bg-slate-100 text-slate-500";
    return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${m}`}>{t("confidence", "vissa")}: {c}</span>;
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{t("Read a drill from video", "Lesa drillu úr myndbandi")}</span>
        <span className="rounded bg-[#7a5cc4]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7a5cc4]">AI</span>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{t(`Pick a short clip (≤ ${MAX_CLIP_SECONDS}s). Frames are read in your browser — the clip is only uploaded if you tick "attach video" below. The AI drafts the drill card; you confirm and edit. Load numbers come from GPS, not video.`, `Veldu stutt myndbrot (≤ ${MAX_CLIP_SECONDS}s). Rammar eru lesnir í vafranum — klippan er aðeins send upp ef þú hakar í „hafa myndbandið með" að neðan. AI gerir drög að drillu-korti; þú staðfestir og lagfærir. Álagstölur koma úr GPS, ekki myndbandi.`)}</p>

      <label className="mt-2 inline-block cursor-pointer rounded-md bg-[#2740e6] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
        {t("Choose video…", "Velja myndband…")}
        <input type="file" accept="video/*" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.currentTarget.value = ""; }} />
      </label>
      {status && <span className="ml-2 text-xs text-slate-500">{status}</span>}
      {error && <p className="mt-2 rounded bg-[#a83e28]/10 px-2 py-1 text-xs text-[#a83e28]">{error}</p>}

      {read && (
        <div className="mt-3 space-y-2 rounded-md border border-[#7a5cc4]/25 bg-[#7a5cc4]/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-[#7a5cc4]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7a5cc4]">{t("AI draft", "AI drög")}</span>
            {confChip(read.confidence)}
            <span className="text-[10px] text-slate-500">{t("from", "úr")} {frameCount} {t("frames", "römmum")}</span>
          </div>
          <p className="text-[11px] text-slate-500">{lang === "IS" ? read.caveat.is : read.caveat.en}</p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="col-span-2">{t("Name", "Nafn")}<input value={name} onChange={(e) => setName(e.target.value)} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" /></label>
            <label>{t("Category", "Flokkur")}<select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1">{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
            <label>{t("Format", "Snið")}<input value={format} onChange={(e) => setFormat(e.target.value)} placeholder="6v3" className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" /></label>
            <label>{t("Players (est.)", "Leikmenn (áætl.)")}<input value={players} onChange={(e) => setPlayers(e.target.value)} inputMode="numeric" className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" /></label>
            <label>{t("Intensity (est.)", "Ákefð (áætl.)")}<input value={read.intensityEst ?? "—"} readOnly className="mt-0.5 w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-500" /></label>
            <label className="col-span-2">{t("Description", "Lýsing")}<textarea value={descEn} onChange={(e) => setDescEn(e.target.value)} rows={3} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" /></label>
          </div>

          {read.phases.length > 0 && <p className="text-[11px] text-slate-600"><span className="font-semibold">{t("Phases", "Fasar")}:</span> {read.phases.join(" → ")}</p>}
          {read.equipment.length > 0 && <p className="text-[11px] text-slate-600"><span className="font-semibold">{t("Equipment", "Búnaður")}:</span> {read.equipment.join(", ")}</p>}

          <label className="flex items-center gap-2 text-[11px] text-slate-600">
            <input type="checkbox" checked={attachVideo} onChange={(e) => setAttachVideo(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-[#2740e6]" />
            <span>{t("Attach the video to this drill (stored privately, signed links only)", "Hafa myndbandið með á þessari drillu (geymt sem einkaefni, aðeins signed-hlekkir)")}</span>
          </label>
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy || saved || !name.trim()} onClick={() => void save()} className="rounded-md bg-[#1c7a4a] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {saved ? t("Saved ✓", "Vistað ✓") : t("Confirm & save drill", "Staðfesta & vista drillu")}
            </button>
            {saved && <span className="text-[11px] text-slate-500">{t("For a tactical diagram, run the micropulse-drill-diagram skill with the phases above.", "Fyrir taktíska skýringarmynd, keyrðu micropulse-drill-diagram skillið með fösunum að ofan.")}</span>}
          </div>
        </div>
      )}
    </section>
  );
};

export default DrillVideoRead;

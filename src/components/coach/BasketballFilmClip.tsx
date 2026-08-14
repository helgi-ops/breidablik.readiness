"use client";

/**
 * BasketballFilmClip — AI film-note from a SHORT clip on the Opponent Analysis page.
 *
 * The coach picks a short video (one possession / set). The browser samples ≤12 downscaled
 * JPEG frames (src/lib/video/extractFilmFrames.ts) — the raw video never leaves the client —
 * and POSTs them to /api/coach/basketball-film-clip, which hands them to Claude vision and
 * returns a structured, AI-labelled read: the action/set, ball-screen coverage, spacing,
 * off-ball movement and defensive scheme. Layered: headline → a few plain facts → full detail
 * behind a toggle. Descriptive scouting only — never touches the readiness colour or load.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { MAX_CLIP_SECONDS, FrameExtractError, type ExtractResult } from "@/lib/video/extractFilmFrames";

type Lang = "EN" | "IS";
type Strings = (typeof T)["EN"] | (typeof T)["IS"];
type FilmNote = {
  headline?: string;
  actionType?: string;
  setName?: string;
  ballScreen?: { used?: boolean; coverage?: string };
  offense?: { spacing?: string; movement?: string; strengths?: string[] };
  defense?: { scheme?: string; coverage?: string; weaknessesExposed?: string[] };
  keyPlayers?: { label?: string; note?: string }[];
  summary?: string;
  confidenceNote?: string;
};
type SavedNote = {
  id: string; opponent_name: string | null; clip_label: string; side: "own" | "opp";
  note: FilmNote; model: string | null; frame_count: number | null; duration_sec: number | null;
  thumb: string | null; created_at: string;
};

const T = {
  EN: {
    title: "Film clip analysis", badge: "AI · reads the frames, decides nothing",
    intro: "Upload a short clip of one possession or set (Hudl clip, phone recording, or a downloaded segment). It samples a handful of frames in your browser and reads the action, spacing and defensive scheme. Descriptive — never a readiness judgement.",
    side: "Clip is", sideOpp: "Opponent", sideOwn: "Our team",
    label: "Label", labelPh: "e.g. Q3 – horns set",
    pick: "Choose a clip", frames: "frames", analyze: "Analyze clip", analyzing: "Reading the frames…",
    extracting: "Sampling frames…", noFrames: "Pick a short clip to sample frames from.",
    longWarn: `Long clip — only up to 12 frames are sampled, so fine detail may be coarse. A ${MAX_CLIP_SECONDS}s-or-shorter single possession reads best.`,
    decodeErr: "This video can't be decoded in your browser (often HEVC or .mov). Export it as .mp4 (H.264) and try again.",
    genErr: "Couldn't analyze that clip — try again.",
    action: "Action", set: "Set", ballScreen: "Ball screen", defScheme: "Defense",
    offense: "Offense", spacing: "Spacing", movement: "Movement", strengths: "Doing well",
    weakness: "Exposed", players: "Players", summary: "Summary",
    details: "Details", hide: "Hide details", used: "used", notUsed: "none",
    sampled: "sampled stills, not full tracking", saved: "Saved film notes", none: "No film notes yet.",
    perfNote: "Descriptive AI film note from sampled frames — never a readiness or medical judgement.",
  },
  IS: {
    title: "Myndbands-klippa greining", badge: "AI · les rammana, ákveður ekkert",
    intro: "Hladdu inn stuttri klippu af einni sókn eða kerfi (Hudl-klippa, símaupptaka eða niðurhalað brot). Kerfið tekur nokkra ramma í vafranum þínum og les aðgerðina, spacing og varnarkerfið. Lýsandi — aldrei readiness-mat.",
    side: "Klippan er", sideOpp: "Andstæðingur", sideOwn: "Okkar lið",
    label: "Merki", labelPh: "t.d. 3. leikhluti – horns",
    pick: "Veldu klippu", frames: "rammar", analyze: "Greina klippu", analyzing: "Les rammana…",
    extracting: "Tek ramma…", noFrames: "Veldu stutta klippu til að taka ramma úr.",
    longWarn: `Löng klippa — aðeins allt að 12 rammar eru teknir, svo smáatriði geta verið gróf. Ein sókn (${MAX_CLIP_SECONDS}s eða styttri) les best.`,
    decodeErr: "Ekki tókst að afkóða þetta myndband í vafranum (oft HEVC eða .mov). Flyttu það út sem .mp4 (H.264) og reyndu aftur.",
    genErr: "Náði ekki að greina klippuna — reyndu aftur.",
    action: "Aðgerð", set: "Kerfi", ballScreen: "Skjólskerm", defScheme: "Vörn",
    offense: "Sókn", spacing: "Spacing", movement: "Hreyfing", strengths: "Gera vel",
    weakness: "Veikleiki", players: "Leikmenn", summary: "Samantekt",
    details: "Nánar", hide: "Fela nánar", used: "notaður", notUsed: "enginn",
    sampled: "teknir rammar, ekki full rakning", saved: "Vistaðar klippu-nótur", none: "Engar klippu-nótur enn.",
    perfNote: "Lýsandi AI klippu-nóta úr teknum römmum — aldrei readiness- eða læknismat.",
  },
} as const;

function Fact({ label, value }: { label: string; value: string }) {
  if (!value || value === "—") return null;
  return (
    <div className="text-[13px]">
      <span className="font-semibold text-slate-500">{label}: </span>
      <span className="text-slate-800">{value}</span>
    </div>
  );
}

function NoteCard({ n, t }: { n: SavedNote; t: Strings }) {
  const [open, setOpen] = React.useState(false);
  const note = n.note ?? {};
  const bs = note.ballScreen?.used ? `${t.used}${note.ballScreen.coverage ? ` · ${note.ballScreen.coverage}` : ""}` : t.notUsed;
  const conf = `${n.frame_count ?? "?"} ${t.frames}${n.duration_sec ? ` · ~${n.duration_sec}s` : ""} — ${t.sampled}`;
  return (
    <div className="rounded-xl border border-[#c9d2f7] bg-[#eef1fc] p-4">
      <div className="flex items-start gap-3">
        {n.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`data:image/jpeg;base64,${n.thumb}`} alt="" className="h-14 w-24 flex-none rounded-md object-cover ring-1 ring-[#c9d2f7]" />
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-[#2740e6] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">{t.badge}</span>
            <span className="text-[11px] font-semibold text-slate-500">{n.clip_label} · {n.side === "own" ? t.sideOwn : t.sideOpp}</span>
          </div>
          {note.headline ? <p className="mt-1.5 text-[15px] font-bold leading-snug text-slate-900">{note.headline}</p> : null}
        </div>
      </div>

      {/* Layer 1 — a few plain facts without a click. */}
      <div className="mt-2 grid gap-0.5 sm:grid-cols-2">
        <Fact label={t.action} value={note.setName ? `${note.actionType ?? ""}${note.actionType ? " · " : ""}${note.setName}` : (note.actionType ?? "")} />
        <Fact label={t.defScheme} value={[note.defense?.scheme, note.defense?.coverage].filter(Boolean).join(" · ")} />
        <Fact label={t.ballScreen} value={bs} />
        <Fact label={t.spacing} value={note.offense?.spacing ?? ""} />
      </div>

      {/* Layer 2 — full detail behind a toggle. */}
      <button onClick={() => setOpen((o) => !o)} className="mt-2 text-[12px] font-semibold text-[#2740e6] hover:underline">
        {open ? t.hide : t.details}
      </button>
      {open ? (
        <div className="mt-2 space-y-2 border-t border-[#c9d2f7] pt-2 text-[13px] text-slate-700">
          {note.offense?.movement ? <Fact label={t.movement} value={note.offense.movement} /> : null}
          {note.offense?.strengths?.length ? (
            <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.strengths}</div>
              <ul className="mt-0.5 list-disc pl-4">{note.offense.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          ) : null}
          {note.defense?.weaknessesExposed?.length ? (
            <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.weakness}</div>
              <ul className="mt-0.5 list-disc pl-4">{note.defense.weaknessesExposed.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          ) : null}
          {note.keyPlayers?.length ? (
            <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.players}</div>
              <ul className="mt-0.5 space-y-0.5">{note.keyPlayers.map((p, i) => <li key={i}><span className="font-semibold text-slate-800">{p.label}</span>{p.note ? ` — ${p.note}` : ""}</li>)}</ul></div>
          ) : null}
          {note.summary ? <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.summary}</div><p className="mt-0.5">{note.summary}</p></div> : null}
        </div>
      ) : null}

      <p className="mt-2 text-[11px] text-slate-400">{conf}{note.confidenceNote ? ` · ${note.confidenceNote}` : ""}</p>
    </div>
  );
}

export default function BasketballFilmClip({ opponent }: { opponent: string }) {
  const [langRaw] = useLang();
  const lang: Lang = langRaw === "IS" ? "IS" : "EN";
  const t = T[lang];

  const [side, setSide] = React.useState<"own" | "opp">("opp");
  const [clipLabel, setClipLabel] = React.useState("");
  const [extracted, setExtracted] = React.useState<ExtractResult | null>(null);
  const [extracting, setExtracting] = React.useState(false);
  const [longWarn, setLongWarn] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<SavedNote[]>([]);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const loadSaved = React.useCallback(async () => {
    const tok = await token(); if (!tok) return;
    const res = await fetch(`/api/coach/basketball-film-clip?opponent=${encodeURIComponent(opponent)}`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.ok) setSaved(j.notes ?? []);
  }, [opponent, token]);
  React.useEffect(() => { setSaved([]); void loadSaved(); }, [loadSaved]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setErr(null); setExtracted(null); setLongWarn(false);
    if (!file) return;
    setExtracting(true);
    try {
      const { extractFilmFrames } = await import("@/lib/video/extractFilmFrames");
      const result = await extractFilmFrames(file);
      setExtracted(result);
      setLongWarn(result.durationSec > MAX_CLIP_SECONDS);
    } catch (ex) {
      setExtracted(null);
      setErr(ex instanceof FrameExtractError ? t.decodeErr : (ex instanceof Error ? ex.message : t.decodeErr));
    } finally {
      setExtracting(false);
    }
  }

  async function analyze() {
    if (!extracted) return;
    setBusy(true); setErr(null);
    try {
      const tok = await token(); if (!tok) return;
      const res = await fetch("/api/coach/basketball-film-clip", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ opponent, clipLabel: clipLabel.trim(), side, frames: extracted.frames, durationSec: extracted.durationSec, lang }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setErr(j.error ?? t.genErr); return; }
      setSaved((prev) => [j.note as SavedNote, ...prev]);
      setExtracted(null); setClipLabel("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t.genErr);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold text-[#2740e6]">{t.title}</span>
        <span className="rounded bg-[#2740e6] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">{t.badge}</span>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{t.intro}</p>

      {/* Controls */}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.side}</div>
          <div className="mt-1 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[13px]">
            {(["opp", "own"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setSide(s)}
                className={`rounded-md px-3 py-1 font-semibold ${side === s ? "bg-[#2740e6] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {s === "opp" ? t.sideOpp : t.sideOwn}
              </button>
            ))}
          </div>
        </div>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.label}
          <input value={clipLabel} onChange={(e) => setClipLabel(e.target.value)} placeholder={t.labelPh}
            className="mt-1 block w-56 rounded border border-slate-300 px-2 py-1 text-[13px] font-normal normal-case text-slate-800" />
        </label>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.pick}
          <input ref={fileRef} type="file" accept="video/*" onChange={onPick} className="mt-1 block text-[12px] font-normal normal-case" />
        </label>
      </div>

      {extracting ? <p className="mt-2 text-[12px] text-slate-400">{t.extracting}</p> : null}
      {longWarn ? <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-800">{t.longWarn}</p> : null}
      {err ? <p className="mt-2 text-[12px] font-medium text-red-700">{err}</p> : null}

      {/* Extracted-frame preview + analyze */}
      {extracted ? (
        <div className="mt-3">
          <div className="flex items-center gap-2 text-[12px] text-slate-500">
            <span className="font-semibold text-slate-700">{extracted.frames.length} {t.frames}</span>
            <span>· ~{Math.round(extracted.durationSec)}s</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {extracted.frames.map((f, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={`data:image/jpeg;base64,${f}`} alt="" className="h-12 w-20 rounded object-cover ring-1 ring-slate-200" />
            ))}
          </div>
          <button onClick={() => void analyze()} disabled={busy}
            className="mt-3 rounded-lg bg-[#2740e6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">
            {busy ? t.analyzing : t.analyze}
          </button>
        </div>
      ) : (!extracting && !err ? <p className="mt-2 text-[12px] text-slate-400">{t.noFrames}</p> : null)}

      {/* Saved notes */}
      <div className="mt-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.saved}</div>
        {saved.length === 0 ? (
          <p className="mt-1 text-[12px] text-slate-400">{t.none}</p>
        ) : (
          <div className="mt-2 space-y-2">
            {saved.map((n) => <NoteCard key={n.id} n={n} t={t} />)}
          </div>
        )}
      </div>

      <p className="mt-3 text-[11px] text-slate-400">{t.perfNote}</p>
    </div>
  );
}

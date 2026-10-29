"use client";

/**
 * OpponentPlayerClips — a scouted opponent player's tagged video clips + a shot-tendency chart, shown
 * inside their scouting profile. A clip is evidence {action, timecode, deep-link} the coach tags (or,
 * later, the feed's official event-tag API supplies). No video is downloaded or re-hosted and nothing
 * is interpreted by the system — clips are links + timecodes only. Descriptive — never readiness.
 */

import * as React from "react";
import { shotChartGeometry } from "@/lib/micropulse/basketballStats/shotChartGeometry";

type Lang = "EN" | "IS";
type Clip = { id: string; player_name: string; action: string; made: boolean | null; court_x: number | null; court_y: number | null; period: string | null; clock: string | null; video_url: string | null; source: string; created_at: string };
type ShotPoint = { x: number; y: number; made: boolean; action: string };
type Resp = { ok: boolean; clips?: Clip[]; byAction?: { action: string; made: number; attempts: number }[]; shotPoints?: ShotPoint[]; error?: string };

const C = { green: "#1c7a4a", red: "#a83e28", amber: "#de9328", primary: "#2740e6" };
const ACTIONS = ["3pt_make", "3pt_miss", "drive", "post_up", "oreb_putback", "assist", "turnover", "other"] as const;
type ActionKey = (typeof ACTIONS)[number];
const ACTION_LABELS: Record<string, { en: string; is: string }> = {
  "3pt_make": { en: "3PT make", is: "3ja hitt" }, "3pt_miss": { en: "3PT miss", is: "3ja miss" },
  drive: { en: "Drive", is: "Drive" }, post_up: { en: "Post-up", is: "Póstur" }, oreb_putback: { en: "OReb put-back", is: "Sóknarfrák. troðsla" },
  assist: { en: "Assist", is: "Stoðsending" }, turnover: { en: "Turnover", is: "Tapaður bolti" }, other: { en: "Other", is: "Annað" },
};
const isPaint = (a: string) => a === "post_up" || a === "oreb_putback" || a === "drive";
const toneOf = (c: Clip) => (c.made === true ? C.green : c.made === false ? C.red : isPaint(c.action) ? C.amber : C.primary);

/**
 * Turn a clip's deep link into an inline-playable embed URL (no video is downloaded — it plays from
 * the source). Handles Vimeo (incl. the owner "manage" link + private hash) and YouTube; any `#t=`
 * timecode is preserved so the clip starts on the action. Returns null when it can't be embedded.
 */
function toEmbed(url: string | null): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\./, "");
  const t = u.hash.match(/t=([0-9hms:]+)/i)?.[1] ?? u.searchParams.get("t");
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    let id: string | null = null, hash: string | null = u.searchParams.get("h");
    const vIdx = parts.indexOf("video"); if (vIdx >= 0 && parts[vIdx + 1]) id = parts[vIdx + 1];
    const mIdx = parts.indexOf("videos"); if (mIdx >= 0 && parts[mIdx + 1]) { id = parts[mIdx + 1]; if (parts[mIdx + 2]) hash = parts[mIdx + 2]; }
    if (!id && /^\d+$/.test(parts[0] ?? "")) { id = parts[0]; if (/^[a-z0-9]+$/i.test(parts[1] ?? "")) hash = parts[1]; }
    if (!id || !/^\d+$/.test(id)) return null;
    return `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}${t ? `#t=${t}` : ""}`;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v"); if (!id) return null;
    return `https://www.youtube.com/embed/${id}${t ? `?start=${String(t).replace(/[^0-9]/g, "")}` : ""}`;
  }
  if (host === "youtu.be") {
    const id = u.pathname.split("/").filter(Boolean)[0]; if (!id) return null;
    return `https://www.youtube.com/embed/${id}${t ? `?start=${String(t).replace(/[^0-9]/g, "")}` : ""}`;
  }
  return null;
}

/** Half-court shot chart from the tagged clips' locations (shared geometry → PDF parity). */
function ShotChart({ shots, is }: { shots: ShotPoint[]; is: boolean }) {
  const g = shotChartGeometry(shots);
  if (!g.attempts) return null;
  return (
    <div>
      <svg viewBox={`-4 -4 ${g.width + 8} ${g.height + 8}`} className="w-full max-w-[320px] rounded-lg border border-slate-200 bg-[#f6efe2]">
        <rect x={0} y={0} width={g.width} height={g.height} fill="none" stroke="#c9b48a" strokeWidth={1} />
        <circle cx={6} cy={g.height / 2} r={3} fill="none" stroke="#c9b48a" />
        {g.shots.map((p, i) => p.made
          ? <circle key={i} cx={p.cx} cy={p.cy} r={2.8} fill={p.kind === "paint" ? C.amber : C.green} fillOpacity={0.85} />
          : <path key={i} d={`M ${p.cx - 2.4} ${p.cy - 2.4} L ${p.cx + 2.4} ${p.cy + 2.4} M ${p.cx + 2.4} ${p.cy - 2.4} L ${p.cx - 2.4} ${p.cy + 2.4}`} stroke={C.red} strokeWidth={1.2} />)}
      </svg>
      <p className="mt-1 text-[10px] text-slate-400">{is ? `${g.made}/${g.attempts} úr merktum skotum · grænt hitt, rautt miss, gult í teig` : `${g.made}/${g.attempts} tagged shots · green make, red miss, amber paint`}</p>
    </div>
  );
}

export default function OpponentPlayerClips({ opponent, playerName, token, lang }: { opponent: string; playerName: string; token: () => Promise<string | null>; lang: Lang }) {
  const is = lang === "IS";
  const t = (en: string, isl: string) => (is ? isl : en);
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [playing, setPlaying] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<{ action: ActionKey; made: "" | "yes" | "no"; period: string; clock: string; videoUrl: string }>({ action: "3pt_make", made: "", period: "", clock: "", videoUrl: "" });
  const [meta, setMeta] = React.useState<{ title: string; durationSec: number | null; chapters: { title: string; seconds: number }[] } | null>(null);
  const [metaBusy, setMetaBusy] = React.useState(false);
  const [metaErr, setMetaErr] = React.useState<string | null>(null);

  const readVimeo = async () => {
    if (!form.videoUrl.trim()) return;
    setMetaBusy(true); setMetaErr(null); setMeta(null);
    try {
      const tok = await token(); if (!tok) return;
      const res = await fetch("/api/coach/scouting/vimeo-clip", { method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ url: form.videoUrl.trim() }) });
      const j = await res.json();
      if (!res.ok || !j.ok) { setMetaErr(j.error ?? "Error"); return; }
      setMeta({ title: j.clip.title, durationSec: j.clip.durationSec, chapters: j.clip.chapters ?? [] });
    } catch (e) { setMetaErr(e instanceof Error ? e.message : "Error"); } finally { setMetaBusy(false); }
  };
  const fmtSecs = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const applyChapter = (ch: { title: string; seconds: number }) => {
    const base = form.videoUrl.split("#")[0];
    setForm((f) => ({ ...f, videoUrl: `${base}#t=${ch.seconds}s`, clock: fmtSecs(ch.seconds) }));
  };

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const tok = await token(); if (!tok) { setData(null); return; }
      const qs = `?opponent=${encodeURIComponent(opponent)}&player=${encodeURIComponent(playerName)}`;
      const res = await fetch(`/api/coach/scouting/player-clips${qs}`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
      setData((await res.json()) as Resp); setPlaying(null);
    } catch { setData(null); } finally { setLoading(false); }
  }, [opponent, playerName, token]);

  React.useEffect(() => { void load(); }, [load]);

  const addClip = async () => {
    setBusy(true);
    try {
      const tok = await token(); if (!tok) return;
      const made = form.made === "yes" ? true : form.made === "no" ? false : undefined;
      const res = await fetch("/api/coach/scouting/player-clips", {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ opponent, player: playerName, action: form.action, made, period: form.period || undefined, clock: form.clock || undefined, videoUrl: form.videoUrl || undefined, source: "coach" }),
      });
      if ((await res.json())?.ok) { setForm((f) => ({ ...f, period: "", clock: "", videoUrl: "" })); setAdding(false); await load(); }
    } finally { setBusy(false); }
  };

  const del = async (id: string) => {
    const tok = await token(); if (!tok) return;
    await fetch(`/api/coach/scouting/player-clips?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${tok}` } });
    await load();
  };

  const clips = data?.clips ?? [];
  const byAction = data?.byAction ?? [];
  const shotPoints = data?.shotPoints ?? [];
  const playingClip = clips.find((c) => c.id === playing) ?? null;
  const embed = playingClip ? toEmbed(playingClip.video_url) : null;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-baseline justify-between">
        <div className="text-[13px] font-bold text-slate-900">{t("Tagged clips", "Merkt myndskeið")} <span className="text-[10px] font-medium text-slate-400">· {clips.length}</span></div>
        <button type="button" onClick={() => setAdding((v) => !v)} className="rounded-lg border border-[#2740e6] px-2 py-0.5 text-[11px] font-semibold text-[#2740e6] hover:bg-[#eef0fb]">{adding ? t("Close", "Loka") : t("＋ Tag a clip", "＋ Merkja skeið")}</button>
      </div>

      {loading ? <p className="mt-2 text-[12px] text-slate-500">{t("Loading…", "Hleð…")}</p> : null}

      {/* Inline player — the selected clip plays here, beside this player's stats + shot chart. The
          video streams from its source (Vimeo/YouTube); nothing is downloaded or re-hosted. */}
      {playingClip ? (
        <div className="mt-2">
          {embed ? (
            <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-black" style={{ paddingTop: "56.25%" }}>
              <iframe src={embed} title={`${playingClip.action} — ${playerName}`} className="absolute inset-0 h-full w-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
            </div>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-800">
              {t("This link can't be played inline. ", "Ekki hægt að spila þennan hlekk hér. ")}
              {playingClip.video_url ? <a href={playingClip.video_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#2740e6] hover:underline">{t("Open it", "Opna")}</a> : null}
            </p>
          )}
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
            <span className="font-semibold text-slate-700">{is ? ACTION_LABELS[playingClip.action]?.is ?? playingClip.action : ACTION_LABELS[playingClip.action]?.en ?? playingClip.action}</span>
            {playingClip.made != null ? <span>{playingClip.made ? t("make", "hitt") : t("miss", "miss")}</span> : null}
            {(playingClip.period || playingClip.clock) ? <span>· {playingClip.period ?? ""} {playingClip.clock ?? ""}</span> : null}
            <button type="button" onClick={() => setPlaying(null)} className="ml-auto text-slate-400 hover:text-slate-700">{t("✕ close", "✕ loka")}</button>
          </div>
        </div>
      ) : null}

      {/* Shot tendency chart (from clips with a location) */}
      {shotPoints.length ? <div className="mt-2"><ShotChart shots={shotPoints} is={is} /></div> : null}

      {/* By-action aggregate */}
      {byAction.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {byAction.map((a) => (
            <span key={a.action} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
              {is ? ACTION_LABELS[a.action]?.is ?? a.action : ACTION_LABELS[a.action]?.en ?? a.action} · <b className="tabular-nums text-slate-800">{a.action.startsWith("3pt") || a.action === "drive" || a.action === "post_up" || a.action === "oreb_putback" ? `${a.made}/${a.attempts}` : a.attempts}</b>
            </span>
          ))}
        </div>
      ) : null}

      {/* Tag-a-clip form */}
      {adding ? (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
          <div className="flex flex-wrap gap-2">
            <select value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as ActionKey }))} className="rounded border border-slate-300 px-2 py-1 text-[12px]">
              {ACTIONS.map((a) => <option key={a} value={a}>{is ? ACTION_LABELS[a].is : ACTION_LABELS[a].en}</option>)}
            </select>
            <select value={form.made} onChange={(e) => setForm((f) => ({ ...f, made: e.target.value as "" | "yes" | "no" }))} className="rounded border border-slate-300 px-2 py-1 text-[12px]">
              <option value="">{t("make/miss —", "hitt/miss —")}</option>
              <option value="yes">{t("Make", "Hitt")}</option>
              <option value="no">{t("Miss", "Miss")}</option>
            </select>
            <input value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} placeholder="Q1" className="w-14 rounded border border-slate-300 px-2 py-1 text-[12px]" />
            <input value={form.clock} onChange={(e) => setForm((f) => ({ ...f, clock: e.target.value }))} placeholder="05:27" className="w-20 rounded border border-slate-300 px-2 py-1 text-[12px]" />
          </div>
          <div className="flex gap-2">
            <input value={form.videoUrl} onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))} placeholder={t("Deep link into the game feed (Vimeo / YouTube)", "Hlekkur í leikmyndband (Vimeo / YouTube)")} className="flex-1 rounded border border-slate-300 px-2 py-1 text-[12px]" />
            <button type="button" onClick={() => void readVimeo()} disabled={metaBusy || !form.videoUrl.trim()} className="shrink-0 rounded-lg border border-[#2740e6] px-2.5 py-1 text-[11px] font-semibold text-[#2740e6] hover:bg-[#eef0fb] disabled:opacity-50">{metaBusy ? t("Reading…", "Les…") : t("Read Vimeo", "Lesa Vimeo")}</button>
          </div>
          {metaErr ? <p className="text-[11px] font-medium text-red-700">{metaErr}</p> : null}
          {meta ? (
            <div className="rounded-lg border border-slate-100 bg-white px-2.5 py-2">
              <div className="text-[12px] font-semibold text-slate-800">{meta.title || t("(untitled clip)", "(ónefnd klippa)")}{meta.durationSec != null ? <span className="font-normal text-slate-400"> · {fmtSecs(Math.round(meta.durationSec))}</span> : null}</div>
              {meta.chapters.length ? (
                <>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("Chapters — tap to use the timecode", "Kaflar — smelltu til að nota tímann")}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {meta.chapters.map((ch, i) => (
                      <button key={i} type="button" onClick={() => applyChapter(ch)} className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:border-[#2740e6] hover:text-[#2740e6]">
                        <span className="tabular-nums text-slate-400">{fmtSecs(ch.seconds)}</span> {ch.title || t("chapter", "kafli")}
                      </button>
                    ))}
                  </div>
                </>
              ) : <p className="mt-1 text-[11px] text-slate-400">{t("No chapters in this clip — tag the action manually.", "Engir kaflar í klippunni — merktu aðgerðina handvirkt.")}</p>}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void addClip()} disabled={busy} className="rounded-lg bg-[#2740e6] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50">{busy ? "…" : t("Add clip", "Bæta við")}</button>
            <span className="text-[10px] text-slate-400">{t("Link + timecode only — no video is stored.", "Aðeins hlekkur + tími — ekkert myndband vistað.")}</span>
          </div>
        </div>
      ) : null}

      {/* Clip list */}
      {!loading && clips.length === 0 && !adding ? <p className="mt-2 text-[12px] text-slate-500">{t("No clips tagged yet.", "Engin skeið merkt enn.")}</p> : null}
      {clips.length ? (
        <ul className="mt-2 space-y-1">
          {clips.map((c) => (
            <li key={c.id} className="flex items-center gap-2 border-t border-slate-100 py-1 text-[12px]">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: toneOf(c) }} />
              <span className="font-medium text-slate-800">{is ? ACTION_LABELS[c.action]?.is ?? c.action : ACTION_LABELS[c.action]?.en ?? c.action}</span>
              {c.made != null ? <span className="text-slate-400">{c.made ? t("make", "hitt") : t("miss", "miss")}</span> : null}
              {(c.period || c.clock) ? <span className="text-slate-400">· {c.period ?? ""} {c.clock ?? ""}</span> : null}
              <span className="ml-auto flex items-center gap-2">
                {c.video_url ? (
                  toEmbed(c.video_url)
                    ? <button type="button" onClick={() => setPlaying(c.id)} className={`font-semibold ${playing === c.id ? "text-slate-400" : "text-[#2740e6] hover:underline"}`}>▶ {t("play", "spila")}</button>
                    : <a href={c.video_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#2740e6] hover:underline">▶ {t("open", "opna")}</a>
                ) : null}
                <span className="text-[9px] uppercase tracking-wide text-slate-300">{c.source}</span>
                <button type="button" onClick={() => void del(c.id)} className="text-slate-300 hover:text-red-600" aria-label={t("delete", "eyða")}>✕</button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

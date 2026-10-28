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
  const [form, setForm] = React.useState<{ action: ActionKey; made: "" | "yes" | "no"; period: string; clock: string; videoUrl: string }>({ action: "3pt_make", made: "", period: "", clock: "", videoUrl: "" });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const tok = await token(); if (!tok) { setData(null); return; }
      const qs = `?opponent=${encodeURIComponent(opponent)}&player=${encodeURIComponent(playerName)}`;
      const res = await fetch(`/api/coach/scouting/player-clips${qs}`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
      setData((await res.json()) as Resp);
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

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-baseline justify-between">
        <div className="text-[13px] font-bold text-slate-900">{t("Tagged clips", "Merkt myndskeið")} <span className="text-[10px] font-medium text-slate-400">· {clips.length}</span></div>
        <button type="button" onClick={() => setAdding((v) => !v)} className="rounded-lg border border-[#2740e6] px-2 py-0.5 text-[11px] font-semibold text-[#2740e6] hover:bg-[#eef0fb]">{adding ? t("Close", "Loka") : t("＋ Tag a clip", "＋ Merkja skeið")}</button>
      </div>

      {loading ? <p className="mt-2 text-[12px] text-slate-500">{t("Loading…", "Hleð…")}</p> : null}

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
          <input value={form.videoUrl} onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))} placeholder={t("Deep link into the game feed (optional)", "Hlekkur inn í leikmyndband (valfrjálst)")} className="w-full rounded border border-slate-300 px-2 py-1 text-[12px]" />
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
                {c.video_url ? <a href={c.video_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#2740e6] hover:underline">▶ {t("clip", "skeið")}</a> : null}
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

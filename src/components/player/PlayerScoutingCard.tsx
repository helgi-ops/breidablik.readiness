"use client";

/**
 * PlayerScoutingCard — the latest opponent scouting briefing the coach sent, shown in the player app:
 * the plain-language key aspects (how they play, key players to watch, how to defend, where to attack)
 * and the tagged clips, playable inline. Read-only. Informational — never a readiness or training score.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type KeyPlayer = { name: string; line: string; watchFor?: string[] };
type Attack = { action: string; target: string; concedes: string };
type Snapshot = { headline?: string | null; howWePlay?: string[]; watchOuts?: string[]; keyPlayers?: KeyPlayer[]; howToDefend?: string[]; whereToAttack?: Attack[] };
type Clip = { action: string; made: boolean | null; period: string | null; clock: string | null; video_url: string | null; is_file: boolean };
type Resp = { ok: boolean; share?: { opponent: string; title: string | null; snapshot: Snapshot; createdAt: string } | null; clipsByPlayer?: Record<string, Clip[]> | null };

const ACTION_LABELS: Record<string, { en: string; is: string }> = {
  "3pt_make": { en: "3PT make", is: "3ja hitt" }, "3pt_miss": { en: "3PT miss", is: "3ja miss" }, drive: { en: "Drive", is: "Drive" },
  post_up: { en: "Post-up", is: "Póstur" }, oreb_putback: { en: "OReb put-back", is: "Sóknarfrák." }, assist: { en: "Assist", is: "Stoðsending" },
  turnover: { en: "Turnover", is: "Tapaður bolti" }, other: { en: "Other", is: "Annað" },
};

/** Vimeo/YouTube deep link → inline-playable embed URL (keeps any #t= start). Null if not embeddable. */
function toEmbed(url: string | null): string | null {
  if (!url) return null;
  let u: URL; try { u = new URL(url); } catch { return null; }
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
  if (host === "youtube.com" || host === "m.youtube.com") { const id = u.searchParams.get("v"); return id ? `https://www.youtube.com/embed/${id}` : null; }
  if (host === "youtu.be") { const id = u.pathname.split("/").filter(Boolean)[0]; return id ? `https://www.youtube.com/embed/${id}` : null; }
  return null;
}

export default function PlayerScoutingCard({ lang }: { lang: "IS" | "EN" }) {
  const is = lang === "IS";
  const t = (en: string, isl: string) => (is ? isl : en);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Resp | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/player/scouting", { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
        const j = (await res.json()) as Resp;
        if (alive) setData(res.ok ? j : null);
      } catch { if (alive) setData(null); } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (loading || !data?.share) return null; // self-hides until a coach sends one
  const s = data.share.snapshot ?? {};
  const clipsByPlayer = data.clipsByPlayer ?? {};
  const clabel = (a: string) => (is ? ACTION_LABELS[a]?.is ?? a : ACTION_LABELS[a]?.en ?? a);
  const bullet = (arr: string[] | undefined) => (arr ?? []).filter(Boolean);
  const section = (title: string, color: string, items: string[]) => items.length ? (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>{title}</div>
      <ul className="mt-1 space-y-0.5">{items.map((x, i) => <li key={i} className="text-[12.5px] leading-snug text-zinc-700">• {x}</li>)}</ul>
    </div>
  ) : null;

  const allClips: Array<{ key: string; player: string; c: Clip }> = [];
  for (const [player, cs] of Object.entries(clipsByPlayer)) cs.forEach((c, i) => allClips.push({ key: `${player}-${i}`, player, c }));
  const playingClip = allClips.find((x) => x.key === playing)?.c ?? null;
  const embed = playingClip ? toEmbed(playingClip.video_url) : null;

  return (
    <div className="mx-auto max-w-lg space-y-3 px-1">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
        <div className="flex items-center gap-2">
          <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">{t("SCOUT", "SKÁT")}</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">{t("From your coach", "Frá þjálfaranum")}</span>
        </div>
        <h2 className="mt-1 text-base font-bold text-zinc-900">{t("Next opponent", "Næsti andstæðingur")}: {data.share.opponent}</h2>
        {s.headline ? <p className="mt-1 text-[13px] font-semibold leading-relaxed text-zinc-800">{s.headline}</p> : null}
      </div>

      <div className="space-y-2.5 rounded-xl border border-zinc-200 bg-white p-3">
        {section(t("They're dangerous because", "Þeir eru hættulegir því"), "#1c7a4a", bullet(s.howWePlay))}
        {section(t("Where they're vulnerable", "Þar sem þeir eru veikir"), "#de9328", bullet(s.watchOuts))}
        {section(t("How to defend", "Hvernig á að verjast"), "#2740e6", bullet(s.howToDefend))}
        {(s.whereToAttack ?? []).length ? (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#a83e28]">{t("Where to attack", "Hvar á að sækja")}</div>
            <ul className="mt-1 space-y-0.5">{(s.whereToAttack ?? []).map((a, i) => <li key={i} className="text-[12.5px] leading-snug text-zinc-700">• <b>{a.action}</b> → {a.target} <span className="text-zinc-400">({a.concedes})</span></li>)}</ul>
          </div>
        ) : null}
      </div>

      {(s.keyPlayers ?? []).length ? (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{t("Key players", "Lykilmenn")}</div>
          {(s.keyPlayers ?? []).map((p) => (
            <div key={p.name} className="rounded-xl border border-zinc-200 bg-white p-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-bold text-zinc-900">{p.name}</span>
                <span className="text-[11px] tabular-nums text-zinc-500">{p.line}</span>
              </div>
              {(p.watchFor ?? []).length ? <ul className="mt-1 space-y-0.5">{(p.watchFor ?? []).map((w, i) => <li key={i} className="text-[12px] leading-snug text-zinc-600">• {w}</li>)}</ul> : null}
            </div>
          ))}
        </div>
      ) : null}

      {allClips.length ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{t("Film", "Myndskeið")} · {allClips.length}</div>
          {playingClip ? (
            <div className="mt-2">
              {playingClip.is_file && playingClip.video_url ? (
                <video src={playingClip.video_url} controls autoPlay className="w-full rounded-lg border border-zinc-200 bg-black" style={{ maxHeight: "55vh" }} />
              ) : embed ? (
                <div className="relative overflow-hidden rounded-lg border border-zinc-200 bg-black" style={{ paddingTop: "56.25%" }}>
                  <iframe src={embed} title={playingClip.action} className="absolute inset-0 h-full w-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
                </div>
              ) : playingClip.video_url ? (
                <a href={playingClip.video_url} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold text-indigo-700">{t("Open clip ↗", "Opna skeið ↗")}</a>
              ) : null}
              <button type="button" onClick={() => setPlaying(null)} className="mt-1 text-[11px] text-zinc-400">{t("✕ close", "✕ loka")}</button>
            </div>
          ) : null}
          <ul className="mt-2 space-y-1">
            {allClips.map(({ key, player, c }) => (
              <li key={key} className="flex items-center gap-2 border-t border-zinc-100 py-1 text-[12px]">
                <span className="font-semibold text-zinc-800">{player}</span>
                <span className="text-zinc-500">· {clabel(c.action)}{c.made != null ? ` · ${c.made ? t("make", "hitt") : "miss"}` : ""}</span>
                {(c.period || c.clock) ? <span className="text-zinc-400">· {c.period ?? ""} {c.clock ?? ""}</span> : null}
                {c.video_url ? <button type="button" onClick={() => setPlaying(key)} className={`ml-auto font-semibold ${playing === key ? "text-zinc-400" : "text-indigo-700"}`}>▶ {t("play", "spila")}</button> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-[10px] text-zinc-400">{t("Scouting from your coach — it's about the opponent, not a score on you.", "Skátun frá þjálfaranum — um andstæðinginn, ekki einkunn á þig.")}</p>
    </div>
  );
}

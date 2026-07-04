"use client";

/**
 * ShareMatchButton — one-tap share of a player's match as a club-branded 9:16
 * card (Top Speed / Distance / Sprints, most impressive auto-promoted). Uses the
 * Web Share API with a file on mobile; falls back to a preview modal + PNG
 * download on desktop. Player-initiated only; never mentions teammates.
 */

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pickHeroStat, type ShareMetric, type ShareStats } from "@/lib/micropulse/shareCard/pickHeroStat";
import { renderCardSvg, type CardModel } from "@/lib/micropulse/shareCard/renderCard";
import { fetchImageAsDataUrl, svgToPngBlob } from "@/lib/micropulse/shareCard/toPng";

type ClubInfo = { name: string; themeColor: string | null; logoUrl: string | null };
type MatchInfo = { date: string; opponent: string | null; topSpeed: number; distance: number; sprints: number };

const DEFAULT_ACCENT = "#4f46e5"; // MicroPulse default when a club has no colour

const METRICS: Record<ShareMetric, { en: string; is: string; unit: string; fmt: (v: number) => string }> = {
  topSpeed: { en: "Top Speed", is: "Hámarkshraði", unit: "km/h", fmt: (v) => (Math.round(v * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) },
  distance: { en: "Distance", is: "Vegalengd", unit: "km", fmt: (v) => (Math.round((v / 1000) * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) },
  sprints: { en: "Sprints", is: "Sprettir", unit: "m", fmt: (v) => Math.round(v).toLocaleString("en-US") },
};
const BADGES = {
  seasonBest: { en: "New season best", is: "Nýtt árstíðar-met" },
  matchHigh: { en: "Match high", is: "Leiks-hámark" },
};
const ORDER: ShareMetric[] = ["topSpeed", "distance", "sprints"];

export default function ShareMatchButton({
  lang,
  club,
  playerName,
  match,
  allMatches,
  variant = "button",
}: {
  lang: "IS" | "EN";
  club: ClubInfo;
  playerName: string;
  match: MatchInfo;
  allMatches: ShareStats[];
  variant?: "button" | "icon";
}) {
  const isIS = lang === "IS";
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  // Nothing to show if the match has no GPS output at all.
  const hasData = match.topSpeed > 0 || match.distance > 0 || match.sprints > 0;

  const buildBlob = useCallback(async (): Promise<Blob> => {
    const stats: ShareStats = { topSpeed: match.topSpeed, distance: match.distance, sprints: match.sprints };
    const dateLabel = new Date(`${match.date}T00:00:00`).toLocaleDateString(isIS ? "is-IS" : "en-GB", { day: "numeric", month: "short" });
    const hero = pickHeroStat(stats, allMatches.length ? allMatches : [stats]);
    const accent = (club.themeColor && /^#?[0-9a-fA-F]{3,8}$/.test(club.themeColor)) ? (club.themeColor.startsWith("#") ? club.themeColor : `#${club.themeColor}`) : DEFAULT_ACCENT;
    const crestHref = club.logoUrl ? await fetchImageAsDataUrl(club.logoUrl) : null;

    const label = (k: ShareMetric) => (isIS ? METRICS[k].is : METRICS[k].en);
    const disp = (k: ShareMetric) => ({ label: label(k), value: METRICS[k].fmt(stats[k]), unit: METRICS[k].unit });

    const vs = match.opponent ? `${isIS ? "gegn" : "vs"} ${match.opponent} · ${dateLabel}` : dateLabel;
    const badge = hero.badge ? (isIS ? BADGES[hero.badge].is : BADGES[hero.badge].en) : null;

    const model: CardModel = {
      accent,
      playerName,
      clubName: club.name,
      crestHref,
      initial: (club.name.trim()[0] ?? "M").toUpperCase(),
      subline: vs,
      hero: { ...disp(hero.heroKey), badge },
      supporting: ORDER.filter((k) => k !== hero.heroKey).map(disp),
    };
    return svgToPngBlob(renderCardSvg(model));
  }, [allMatches, club, playerName, match.date, match.opponent, match.topSpeed, match.distance, match.sprints, isIS]);

  const onShare = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const blob = await buildBlob();
      const file = new File([blob], "micropulse-match.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d?: { files?: File[] }) => boolean };
      if (typeof navigator.share === "function" && nav.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: isIS ? "Leikurinn minn" : "My match", text: "MICROPULSE.IS" } as ShareData);
          return; // shared natively
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return; // user cancelled
          // otherwise fall through to the download/preview fallback
        }
      }
      // Fallback: preview modal + download.
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setPreview(url);
      const a = document.createElement("a");
      a.href = url;
      a.download = "micropulse-match.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Share failed");
    } finally {
      setBusy(false);
    }
  }, [busy, buildBlob, isIS]);

  const close = useCallback(() => {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    setPreview(null);
  }, []);

  if (!hasData) return null;

  const ShareIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={onShare}
          disabled={busy}
          aria-label={isIS ? "Deila leik" : "Share match"}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 disabled:opacity-50"
        >
          {busy ? <span className="h-3 w-3 animate-pulse rounded-full bg-slate-400" /> : ShareIcon}
        </button>
      ) : (
        <button
          type="button"
          onClick={onShare}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          {ShareIcon}
          {busy ? (isIS ? "Bý til…" : "Making…") : (isIS ? "Deila" : "Share")}
        </button>
      )}
      {err && <span className="ml-2 text-[11px] text-red-600">{err}</span>}

      {preview && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={close} role="dialog" aria-modal="true">
          <div className="flex w-full max-w-xs flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- object-URL blob preview, not a static asset */}
            <img src={preview} alt={isIS ? "Leikkort" : "Match card"} className="max-h-[70vh] w-auto rounded-xl shadow-2xl" />
            <div className="text-center text-xs text-slate-300">
              {isIS ? "Vistað í niðurhal. Haltu inni myndinni til að vista eða deila." : "Saved to downloads. Long-press the image to save or share."}
            </div>
            <div className="flex gap-2">
              <a href={preview} download="micropulse-match.png" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100">
                {isIS ? "Vista mynd" : "Save image"}
              </a>
              <button type="button" onClick={close} className="rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-white hover:bg-white/10">
                {isIS ? "Loka" : "Close"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

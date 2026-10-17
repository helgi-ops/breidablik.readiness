"use client";

/**
 * "Where do I download each stats file?" — one bilingual, collapsible reference shown
 * on every stats-upload page (Season Match Analysis, Single Match Analysis, Player
 * Season Analysis). StatsBomb IQ and Wyscout each give several separate exports; each
 * is a different file, downloaded from a different place, and uploaded on a different
 * page. This maps export → where to download → where to upload so a coach never has to
 * guess. Descriptive help only — no data, no side effects, never the readiness colour.
 */

import * as React from "react";
import { useLang } from "@/lib/lang";

type Lang = "EN" | "IS";
type Row = [string, string, string];

const T: Record<Lang, {
  title: string; intro: string; cols: Row;
  sb: string; wy: string; sbRows: Row[]; wyRows: Row[]; note: string;
}> = {
  EN: {
    title: "Where do I download each stats file?",
    intro: "Each export below is a separate file. Download it where shown, then upload it on the page named. One upload per season — re-upload only to refresh with newer matches.",
    cols: ["Export (file)", "Where to download it", "Upload it here"],
    sb: "StatsBomb IQ — statsbomb.hudl.com",
    wy: "Wyscout — wyscout.hudl.com",
    sbRows: [
      ["Squad — one row per player, whole season", "IQ → your team → Squad → Export CSV", "Player Season Analysis (StatsBomb view)"],
      ["Player Stats — season “all-metrics” (adds Primary Position)", "IQ → your team → Player Stats → Export CSV", "Player Season Analysis — upload beside Squad; they merge by player"],
      ["Match Stats — one game, all players (both teams)", "IQ → open the match → Game Team Analysis (or Match Stats) → Export CSV", "Single Match Analysis → “One match — whole squad”"],
      ["Match Stats — team totals, every fixture in one file", "IQ → your team → Match Stats (team) → Export CSV", "Season Match Analysis → “Import StatsBomb stats” (StatsBomb tab)"],
      ["Team Stats — season totals + a built-in League Average row", "IQ → your team → Team Stats → Export CSV", "Season Match Analysis → “Upload own-team profile”"],
    ],
    wyRows: [
      ["Team → Stats — General + Attacking + Defending + Passing + Indexes (5 files)", "Wyscout → team → Stats → each DISPLAY, “Show opponents” ON → Export to Excel", "Season Match Analysis → “Import Wyscout stats” (Wyscout tab) — drop all 5 at once"],
      ["Players — season player list", "Wyscout → team → Players → Export to Excel", "Player Season Analysis (Wyscout view)"],
    ],
    note: "A whole-season team file is NOT a single-match file: season team stats → Season Match Analysis; one game → Single Match Analysis. Descriptive football data — it never changes the readiness colour.",
  },
  IS: {
    title: "Hvar næ ég í hverja tölfræði-skrá?",
    intro: "Hver útflutningur hér að neðan er sér skrá. Sæktu hana þar sem sýnt er og hladdu henni svo upp á síðunni sem nefnd er. Ein upphleðsla á tímabil — endurhladdu bara til að fá ferskari tölur með fleiri leikjum.",
    cols: ["Útflutningur (skrá)", "Hvar á að sækja hana", "Hlaða upp hér"],
    sb: "StatsBomb IQ — statsbomb.hudl.com",
    wy: "Wyscout — wyscout.hudl.com",
    sbRows: [
      ["Squad — ein röð per leikmann, allt tímabilið", "IQ → liðið þitt → Squad → Export CSV", "Leikmanna-tímabilsgreining (StatsBomb)"],
      ["Player Stats — tímabils „all-metrics“ (bætir við leikstöðu)", "IQ → liðið þitt → Player Stats → Export CSV", "Leikmanna-tímabilsgreining — hladdu með Squad; sameinast eftir leikmanni"],
      ["Match Stats — einn leikur, allir leikmenn (bæði lið)", "IQ → opnaðu leikinn → Game Team Analysis (eða Match Stats) → Export CSV", "Single Match Analysis → „One match — whole squad“"],
      ["Match Stats — liðs-tölur, allir leikir í einni skrá", "IQ → liðið þitt → Match Stats (lið) → Export CSV", "Season Match Analysis → „Import StatsBomb stats“ (StatsBomb-flipi)"],
      ["Team Stats — tímabils-tölur + innbyggð League Average röð", "IQ → liðið þitt → Team Stats → Export CSV", "Season Match Analysis → „Upload own-team profile“"],
    ],
    wyRows: [
      ["Team → Stats — General + Attacking + Defending + Passing + Indexes (5 skrár)", "Wyscout → liðið → Stats → hvert DISPLAY, „Show opponents“ Á → Export to Excel", "Season Match Analysis → „Import Wyscout stats“ (Wyscout-flipi) — slepptu öllum 5 í einu"],
      ["Players — tímabils leikmannalisti", "Wyscout → liðið → Players → Export to Excel", "Leikmanna-tímabilsgreining (Wyscout)"],
    ],
    note: "Heils-tímabils liðsskrá er EKKI stakur-leiks skrá: tímabils liðstölfræði → Season Match Analysis; einn leikur → Single Match Analysis. Lýsandi fótbolta-gögn — hreyfa aldrei readiness-litinn.",
  },
};

function Section({ heading, rows }: { heading: string; rows: Row[] }) {
  return (
    <>
      <tr>
        <td colSpan={3} className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{heading}</td>
      </tr>
      {rows.map((r) => (
        <tr key={r[0]} className="border-t border-slate-200 align-top">
          <td className="py-1.5 pr-3 font-semibold text-slate-700">{r[0]}</td>
          <td className="py-1.5 pr-3 text-slate-600">{r[1]}</td>
          <td className="py-1.5 text-slate-600">{r[2]}</td>
        </tr>
      ))}
    </>
  );
}

export default function StatsFileSourceGuide() {
  const [langRaw] = useLang();
  const lang: Lang = langRaw === "IS" ? "IS" : "EN";
  const t = T[lang];
  return (
    <details className="group mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-slate-800">
        <span className="transition-transform group-open:rotate-90">▸</span>{t.title}
      </summary>
      <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{t.intro}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-slate-400">
              {t.cols.map((c) => <th key={c} className="py-1 pr-3 font-medium">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            <Section heading={t.sb} rows={t.sbRows} />
            <Section heading={t.wy} rows={t.wyRows} />
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{t.note}</p>
    </details>
  );
}

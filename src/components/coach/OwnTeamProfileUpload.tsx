"use client";

/**
 * Own-team StatsBomb Team Stats profile upload — feeds the article-quality Team season
 * report (verdict / strengths / weaknesses / vs-League table). Same file opponent
 * scouting takes (the IQ Team Stats category CSVs with the built-in League Average row),
 * but stored with is_self=true so it never shows in the opponent list. Descriptive only.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Lang = "EN" | "IS";

const T = {
  EN: {
    title: "Upload own-team profile (StatsBomb Team Stats)",
    hint: "Upload once per season — it's saved and the Article report reads it every time (re-upload only to refresh with newer matches). This is the Team Stats export (season totals + a built-in League Average row) — a DIFFERENT file from the per-match Match Stats you import on the main panel, and from the Squad file on Player Season Analysis.",
    steps: "StatsBomb IQ → your team → Team Stats → export the category CSVs (summary / shooting / passing / defensive-pressing / obv / set-pieces) or the all-metrics file. Drop them all here.",
    season: "Season", files: "Team Stats CSV(s)", importBtn: "Import profile", importing: "Saving…",
    need: "Pick your Team Stats CSV(s) and a season.", notSignedIn: "Not signed in.",
    done: "Profile saved — generate the Article report above.",
  },
  IS: {
    title: "Hlaða upp eigin prófíl (StatsBomb Team Stats)",
    hint: "Hladdu upp einu sinni á tímabil — það vistast og Ítarlega skýrslan les það í hvert sinn (endurhladdu bara til að fá ferskari tölur með fleiri leikjum). Þetta er Team Stats útflutningurinn (season-tölur + innbyggð League Average röð) — ÖNNUR skrá en per-leik Match Stats sem þú setur á aðal-import-reitinn, og en Squad-skráin á Leikmanna-tímabilsgreiningu.",
    steps: "StatsBomb IQ → liðið þitt → Team Stats → flyttu út flokka-CSV-skrárnar (summary / shooting / passing / defensive-pressing / obv / set-pieces) eða all-metrics skrána. Slepptu þeim öllum hér.",
    season: "Tímabil", files: "Team Stats CSV-skrá(r)", importBtn: "Flytja inn prófíl", importing: "Vista…",
    need: "Veldu Team Stats CSV-skrá(r) og tímabil.", notSignedIn: "Ekki innskráð(ur).",
    done: "Prófíll vistaður — búðu til Ítarlegu skýrsluna að ofan.",
  },
} as const;

export default function OwnTeamProfileUpload({ season: initSeason = "2026", onImported }: { season?: string; onImported?: () => void }) {
  const [langRaw] = useLang();
  const lang: Lang = langRaw === "IS" ? "IS" : "EN";
  const t = T[lang];
  const [season, setSeason] = React.useState(initSeason);
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function importProfile() {
    if (!files.length || !season.trim()) { setErr(t.need); return; }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const { data: sess } = await getSupabaseClient().auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) { setErr(t.notSignedIn); return; }
      const fd = new FormData();
      fd.set("phase", "commit"); fd.set("season", season.trim()); fd.set("is_self", "true");
      for (const f of files) fd.append("files", f);
      const res = await fetch("/api/coach/scouting/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); return; }
      setMsg(t.done); setFiles([]); onImported?.();
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  }

  return (
    <details className="group mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-slate-800">
        <span className="transition-transform group-open:rotate-90">▸</span>{t.title}
      </summary>
      <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{t.hint}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{t.steps}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-[12px] font-medium text-slate-700">{t.season}
          <input value={season} onChange={(e) => setSeason(e.target.value)} className="mt-1 block w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
        </label>
        <label className="text-[12px] font-medium text-slate-700">{t.files}
          <input type="file" multiple accept=".csv,.xlsx,.xls" onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setMsg(null); }} className="mt-1 block text-[12px]" />
        </label>
        <button onClick={importProfile} disabled={busy || !files.length} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40">
          {busy ? t.importing : t.importBtn}
        </button>
      </div>
      {err ? <p className="mt-2 text-[12px] font-medium text-red-700">{err}</p> : null}
      {msg ? <p className="mt-2 text-[12px] font-medium text-emerald-700">{msg}</p> : null}
    </details>
  );
}

"use client";

/**
 * InstatOpponentSeasonUpload — import an OPPONENT's InStat season export for scouting.
 * The coach downloads the opponent's Games / Players / Lineups tables from InStat and
 * uploads them here (any subset; they accumulate). Each file is auto-detected by its
 * header. Builds the whole-season opponent report from a richer feed than the free KKÍ
 * box scores — FG playtypes, per-player tendencies and 5-man units. Descriptive
 * scouting only — never touches the readiness colour, load, or the daily decision.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type ImportResult = {
  ok: boolean; error?: string; opponent?: string; season?: string; games?: number;
  parsed?: string[]; unknownFiles?: string[];
  counts?: { teamGames: number; players: number; lineups: number };
  topScorer?: string | null; playtypes?: number;
};

export default function InstatOpponentSeasonUpload({
  defaultOpponent, onImported,
}: { defaultOpponent?: string; onImported?: (opponent: string) => void }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const [opponent, setOpponent] = React.useState(defaultOpponent ?? "");
  const [season, setSeason] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<ImportResult | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  // Keep the opponent in sync with the page's selection until the coach types their own.
  const touched = React.useRef(false);
  React.useEffect(() => { if (!touched.current && defaultOpponent) setOpponent(defaultOpponent); }, [defaultOpponent]);

  async function send() {
    if (!opponent.trim() || files.length === 0) return;
    setBusy(true); setErr(null); setRes(null);
    try {
      const t = await token(); if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData();
      fd.set("opponent", opponent.trim());
      if (season.trim()) fd.set("season", season.trim());
      for (const f of files) fd.append("files", f);
      const r = await fetch("/api/coach/basketball-opponent-scout/import", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd });
      const j = (await r.json()) as ImportResult;
      if (!r.ok || !j.ok) { setErr(j.error ?? "Error"); return; }
      setRes(j); setFiles([]);
      onImported?.(opponent.trim());
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-slate-600">
        {is
          ? "Í InStat → veldu andstæðinginn → sæktu töflurnar Games, Players og Lineups (CSV/Excel) og hladdu þeim inn hér (má vera hver sem er af þeim — þær bætast við). Byggir heildar-tímabilsgreiningu: sóknartegundir (PnR, iso, cuts…), leikmanna-tilhneigingar og fimmundir."
          : "In InStat → pick the opponent → download their Games, Players and Lineups tables (CSV/Excel) and upload them here (any subset — they accumulate). Builds the whole-season read: FG playtypes (PnR, iso, cuts…), player tendencies and 5-man units."}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Andstæðingur" : "Opponent"}</div>
          <input type="text" value={opponent} onChange={(e) => { touched.current = true; setOpponent(e.target.value); }}
            placeholder={is ? "nafn liðsins (nákvæmt)" : "team name (exact)"} className="w-52 rounded border border-slate-300 px-2 py-1 text-sm" />
        </label>
        <label className="text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Tímabil" : "Season"}</div>
          <input type="text" value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2026-2027" className="w-28 rounded border border-slate-300 px-2 py-1 text-sm" />
        </label>
        <label className="text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Skrár (Games / Players / Lineups)" : "Files (Games / Players / Lineups)"}</div>
          <input type="file" accept=".csv,.xlsx,.xls" multiple
            onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setRes(null); setErr(null); }} className="text-sm" />
        </label>
        <button onClick={() => void send()} disabled={!opponent.trim() || files.length === 0 || busy}
          className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "…" : (is ? "Flytja inn" : "Import")}
        </button>
      </div>
      {files.length > 0 ? <p className="text-[11px] text-slate-400">{files.map((f) => f.name).join(", ")}</p> : null}
      {err ? <p className="text-[12px] font-medium text-red-700">{err}</p> : null}
      {res ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-[12px] text-emerald-800">
          {is ? "Vistað" : "Saved"}: {res.opponent} · {res.counts?.teamGames ?? 0} {is ? "leikir" : "games"} · {res.counts?.players ?? 0} {is ? "leikmenn" : "players"} · {res.counts?.lineups ?? 0} {is ? "fimmundir" : "lineups"}
          {res.playtypes ? ` · ${res.playtypes} ${is ? "sóknartegundir" : "playtypes"}` : ""}
          {res.topScorer ? ` · ${is ? "efstur" : "top"}: ${res.topScorer}` : ""}
          {res.unknownFiles && res.unknownFiles.length ? (
            <span className="block text-amber-700">{is ? "Ekki þekkt" : "Not recognised"}: {res.unknownFiles.join(", ")}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

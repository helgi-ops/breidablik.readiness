"use client";

/**
 * In-app Wyscout Team → Stats import for Team Match Insight.
 *
 * A collapsed panel (so it never clutters the read) that lets ANY coach load the
 * data without terminal access — the browser counterpart of the CLI script. Three
 * file pickers (General required, Indexes/Defending optional), a no-write Preview
 * that reports exactly what would change, then Import (idempotent upsert). Bilingual.
 * Descriptive football data only — it never touches the readiness colour.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Lang = "EN" | "IS";

type Summary = {
  fixtures: number;
  rows: number;
  dates: number;
  seasons: string[];
  ppda: { provided: boolean; matched: boolean; hits: number; orphans: string[] };
  defDuels: { provided: boolean; matched: boolean; hits: number; orphans: string[] };
  unmappedHeaders: string[];
  unjoined: string[];
  upserted?: number;
};

const T = {
  EN: {
    title: "Import Wyscout stats",
    intro: "Load match stats from Wyscout — no terminal needed. Export each DISPLAY tab from the team's Stats page with “Show opponents” ON, then pick the files here.",
    general: "General (required)",
    generalHint: "goals, xG, shots, possession, duels, recoveries",
    indexes: "Indexes (optional)",
    indexesHint: "adds PPDA (pressing)",
    defending: "Defending (optional)",
    defendingHint: "adds defensive duels won %",
    preview: "Preview",
    import: "Import",
    reset: "Clear",
    previewing: "Reading…",
    importing: "Saving…",
    needGeneral: "Pick the General export first.",
    notSignedIn: "Not signed in.",
    willWrite: "Ready to import",
    imported: "Imported",
    fixtures: "matches",
    across: "across",
    seasons: "season(s)",
    ppdaOk: "PPDA matched on",
    defOk: "Defensive duels matched on",
    rows: "rows",
    ppdaMissing: "PPDA file didn’t contain a PPDA column — is it the Indexes export?",
    defMissing: "Defending file didn’t contain “Defensive duels” — is it the Defending export?",
    notInFixtures: "Not in the fixture list (stored, but won’t link to movement until you add the fixture on Fixtures):",
    confirmImport: "Looks right? Import now.",
    doneReload: "Saved. The numbers below refresh on reload.",
  },
  IS: {
    title: "Flytja inn Wyscout-tölfræði",
    intro: "Hladdu inn leiktölfræði úr Wyscout — enginn terminal. Flyttu út hvern DISPLAY-flipa af Stats-síðu liðsins með „Show opponents“ ON og veldu skrárnar hér.",
    general: "General (nauðsynlegt)",
    generalHint: "mörk, xG, skot, boltahald, návígi, endurheimtur",
    indexes: "Indexes (valkvætt)",
    indexesHint: "bætir við PPDA (pressu)",
    defending: "Defending (valkvætt)",
    defendingHint: "bætir við varnarnávígi unnin %",
    preview: "Forskoða",
    import: "Flytja inn",
    reset: "Hreinsa",
    previewing: "Les…",
    importing: "Vista…",
    needGeneral: "Veldu General-skrána fyrst.",
    notSignedIn: "Ekki innskráð(ur).",
    willWrite: "Tilbúið til innflutnings",
    imported: "Flutt inn",
    fixtures: "leikir",
    across: "yfir",
    seasons: "tímabil",
    ppdaOk: "PPDA tengt á",
    defOk: "Varnarnávígi tengt á",
    rows: "raðir",
    ppdaMissing: "PPDA-skráin innihélt ekki PPDA-dálk — er þetta Indexes-útflutningur?",
    defMissing: "Defending-skráin innihélt ekki „Defensive duels“ — er þetta Defending-útflutningur?",
    notInFixtures: "Ekki í Leikjadagatalinu (vistast, en tengist ekki hreyfingu fyrr en þú bætir fixture við á Fixtures):",
    confirmImport: "Lítur rétt út? Flyttu inn núna.",
    doneReload: "Vistað. Tölurnar hér að neðan uppfærast við endurhleðslu.",
  },
} as const;

function FileRow({ label, hint, file, onPick }: { label: string; hint: string; file: File | null; onPick: (f: File | null) => void }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[12px] font-medium text-slate-700">{label} <span className="font-normal text-slate-400">· {hint}</span></span>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="text-[12px] file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-[12px] file:text-slate-700"
      />
      {file ? <span className="truncate text-[11px] text-emerald-700">✓ {file.name}</span> : null}
    </label>
  );
}

export default function TeamStatsImportPanel({ teamId }: { teamId?: string }) {
  const [langRaw] = useLang();
  const lang: Lang = langRaw === "IS" ? "IS" : "EN";
  const t = T[lang];
  const [general, setGeneral] = React.useState<File | null>(null);
  const [indexes, setIndexes] = React.useState<File | null>(null);
  const [defending, setDefending] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState<"" | "preview" | "commit">("");
  const [err, setErr] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<Summary | null>(null);
  const [done, setDone] = React.useState<Summary | null>(null);

  async function token(): Promise<string | null> {
    const { data } = await getSupabaseClient().auth.getSession();
    return data?.session?.access_token ?? null;
  }

  async function send(phase: "preview" | "commit") {
    if (!general) { setErr(t.needGeneral); return; }
    setBusy(phase); setErr(null); if (phase === "preview") setDone(null);
    try {
      const tok = await token();
      if (!tok) { setErr(t.notSignedIn); return; }
      const fd = new FormData();
      fd.set("phase", phase);
      fd.set("general", general);
      if (indexes) fd.set("indexes", indexes);
      if (defending) fd.set("defending", defending);
      if (teamId) fd.set("team_id", teamId);
      const res = await fetch("/api/coach/team-match-stats/upload", { method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: fd });
      const json = (await res.json()) as Summary & { ok: boolean; error?: string };
      if (!res.ok || !json.ok) { setErr(json.error ?? "Error"); return; }
      if (phase === "preview") setPreview(json);
      else { setDone(json); setPreview(null); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally { setBusy(""); }
  }

  function reset() { setGeneral(null); setIndexes(null); setDefending(null); setPreview(null); setDone(null); setErr(null); }

  const s = done ?? preview;

  return (
    <details className="group rounded-xl border border-slate-200 bg-white px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-800">
        <span className="transition-transform group-open:rotate-90">▸</span>
        {t.title}
      </summary>

      <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{t.intro}</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <FileRow label={t.general} hint={t.generalHint} file={general} onPick={setGeneral} />
        <FileRow label={t.indexes} hint={t.indexesHint} file={indexes} onPick={setIndexes} />
        <FileRow label={t.defending} hint={t.defendingHint} file={defending} onPick={setDefending} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => send("preview")}
          disabled={!general || busy !== ""}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          {busy === "preview" ? t.previewing : t.preview}
        </button>
        <button
          onClick={() => send("commit")}
          disabled={!preview || busy !== ""}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          {busy === "commit" ? t.importing : t.import}
        </button>
        {(general || preview || done) ? (
          <button onClick={reset} disabled={busy !== ""} className="text-[12px] text-slate-500 underline disabled:opacity-40">{t.reset}</button>
        ) : null}
      </div>

      {err ? <p className="mt-2 text-[12px] font-medium text-red-700">{err}</p> : null}

      {s ? (
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
          <div className="font-semibold text-slate-800">
            {done ? `✅ ${t.imported}` : t.willWrite}: {s.fixtures} {t.fixtures} · {s.seasons.join(", ")} ({s.seasons.length} {t.seasons})
          </div>
          {s.ppda.provided ? (
            s.ppda.matched
              ? <div className="mt-0.5 text-emerald-700">{t.ppdaOk} {s.ppda.hits} {t.rows}</div>
              : <div className="mt-0.5 text-amber-700">{t.ppdaMissing}</div>
          ) : null}
          {s.defDuels.provided ? (
            s.defDuels.matched
              ? <div className="mt-0.5 text-emerald-700">{t.defOk} {s.defDuels.hits} {t.rows}</div>
              : <div className="mt-0.5 text-amber-700">{t.defMissing}</div>
          ) : null}
          {s.unjoined.length ? (
            <div className="mt-1 text-amber-700">⚠ {t.notInFixtures} {s.unjoined.slice(0, 12).join(", ")}{s.unjoined.length > 12 ? " …" : ""}</div>
          ) : null}
          <div className="mt-1 text-slate-500">{done ? t.doneReload : t.confirmImport}</div>
        </div>
      ) : null}
    </details>
  );
}

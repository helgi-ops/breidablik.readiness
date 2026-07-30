"use client";

export const dynamic = "force-dynamic";

/**
 * Player Stats — Wyscout import (Adapter A).
 *
 * Upload a Wyscout Advanced Search player-list export → preview parsed rows with
 * their auto-resolved player mapping → review the fuzzy/unmatched ones → confirm.
 * Descriptive football data: every row shows its source, and nothing here touches
 * the readiness colour or the daily decision.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";

type Candidate = { playerId: string; fullName: string; score: number };
type PreviewRow = {
  sourcePlayerRef: string;
  wyscoutPlayerName: string;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  xg: number | null;
  suggestedPlayerId: string | null;
  confidence: "exact" | "fuzzy" | "none";
  remembered: boolean;
  candidates: Candidate[];
};
type Squad = { id: string; fullName: string };
type Preview = {
  ok: boolean;
  rows: PreviewRow[];
  skipped: { player: string; team: string; reason: string }[];
  squad: Squad[];
  season: string;
  sourceRef: string;
  counts?: { exact: number; fuzzy: number; none: number };
  error?: string;
};

const YEAR_DEFAULT = "2026";

export default function PlayerStatsPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [file, setFile] = React.useState<File | null>(null);
  const [season, setSeason] = React.useState(YEAR_DEFAULT);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [decisions, setDecisions] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<string | null>(null);

  async function token(): Promise<string | null> {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function runPreview() {
    if (!file) return;
    setBusy(true); setErr(null); setResult(null); setPreview(null);
    try {
      const t = await token();
      if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData();
      fd.set("phase", "preview"); fd.set("season", season); fd.set("file", file);
      const res = await fetch("/api/coach/player-stats/upload", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd });
      const json = (await res.json()) as Preview;
      if (!res.ok || !json.ok) { setErr(json.error ?? "Error"); return; }
      setPreview(json);
      // Seed decisions: exact/fuzzy → suggested; none → leave unmatched ("").
      const seed: Record<string, string> = {};
      for (const r of json.rows) seed[r.sourcePlayerRef] = r.confidence === "none" ? "" : (r.suggestedPlayerId ?? "");
      setDecisions(seed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  }

  async function runCommit() {
    if (!file || !preview) return;
    setBusy(true); setErr(null); setResult(null);
    try {
      const t = await token();
      if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData();
      fd.set("phase", "commit"); fd.set("season", season); fd.set("file", file);
      fd.set("decisions", JSON.stringify(decisions));
      const res = await fetch("/api/coach/player-stats/upload", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) { setErr(json.error ?? "Error"); return; }
      setResult(is
        ? `Vistað: ${json.rowsUpserted} raðir (${json.mapped} mappaðar, ${json.unmatched} ómappaðar geymdar).`
        : `Saved: ${json.rowsUpserted} rows (${json.mapped} mapped, ${json.unmatched} unmatched kept).`);
      setPreview(null); setDecisions({});
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  }

  const rows = preview?.rows ?? [];
  const exact = rows.filter((r) => r.confidence === "exact");
  const fuzzy = rows.filter((r) => r.confidence === "fuzzy");
  const none = rows.filter((r) => r.confidence === "none");
  const squad = preview?.squad ?? [];

  const PlayerSelect = ({ r }: { r: PreviewRow }) => (
    <select
      value={decisions[r.sourcePlayerRef] ?? ""}
      onChange={(e) => setDecisions((d) => ({ ...d, [r.sourcePlayerRef]: e.target.value }))}
      className="rounded border border-slate-300 px-2 py-1 text-xs"
    >
      <option value="">{is ? "— skilja eftir ómappað —" : "— leave unmatched —"}</option>
      {squad.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
    </select>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">{is ? "Leikmanna-tölfræði" : "Player Statistics"}</h1>
      <PagePurpose
        en="import Wyscout player statistics and link them to your squad — football output beside the physical GPS/IMA data"
        is="flyttu inn Wyscout leikmanna-tölfræði og tengdu hana við leikmennina — fótbolta-afköst við hlið líkamlegu GPS/IMA gagnanna"
      />
      <p className="mt-1 text-xs text-slate-500">
        {is
          ? "Lýsandi fótbolta-gögn. Hreyfir aldrei readiness-litinn eða dagsákvörðunina. Hvert gildi ber uppruna sinn."
          : "Descriptive football data. Never moves the readiness colour or the daily decision. Every value carries its source."}
      </p>

      {/* Upload */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Wyscout skrá (.xlsx / .csv)" : "Wyscout file (.xlsx / .csv)"}</div>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Tímabil" : "Season"}</div>
            <input value={season} onChange={(e) => setSeason(e.target.value)} className="w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <button
            onClick={runPreview}
            disabled={!file || busy}
            className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "…" : (is ? "Forskoða" : "Preview")}
          </button>
        </div>
        {err && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</div>}
        {result && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{result}</div>}
      </div>

      {preview && (
        <div className="mt-5 space-y-5">
          <div className="text-[12px] text-slate-500">
            {is ? "Úr" : "From"} <b>{preview.sourceRef}</b> · {is ? "tímabil" : "season"} {preview.season} ·{" "}
            {preview.counts?.exact ?? exact.length} {is ? "sjálfvirkt" : "auto"} · {fuzzy.length} {is ? "til yfirferðar" : "to review"} · {none.length} {is ? "ómappað" : "unmatched"}
          </div>

          {/* Auto-mapped */}
          {exact.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-emerald-700">{is ? `Sjálfvirkt mappað (${exact.length})` : `Auto-mapped (${exact.length})`}</h2>
              <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                {exact.map((r) => (
                  <div key={r.sourcePlayerRef} className="flex items-center justify-between rounded-md border border-emerald-100 bg-emerald-50/50 px-2.5 py-1.5 text-[12px]">
                    <span className="text-slate-700">{r.wyscoutPlayerName}{r.remembered ? <span className="ml-1 text-[9px] uppercase text-slate-400">{is ? "munað" : "remembered"}</span> : null}</span>
                    <span className="font-medium text-slate-900">→ {squad.find((p) => p.id === (decisions[r.sourcePlayerRef] || r.suggestedPlayerId))?.fullName ?? "—"}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Needs review (fuzzy) */}
          {fuzzy.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-amber-700">{is ? `Til yfirferðar (${fuzzy.length})` : `Needs review (${fuzzy.length})`}</h2>
              <p className="text-[11px] text-slate-500">{is ? "Staðfestu eða veldu réttan leikmann — engin ágiskun er vistuð sjálfkrafa." : "Confirm or pick the right player — no guess is saved automatically."}</p>
              <div className="mt-1 space-y-1">
                {fuzzy.map((r) => (
                  <div key={r.sourcePlayerRef} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50/40 px-2.5 py-1.5 text-[12px]">
                    <span className="text-slate-700">{r.wyscoutPlayerName} <span className="text-slate-400">· {r.minutes ?? "–"}′</span></span>
                    <PlayerSelect r={r} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Unmatched */}
          {none.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-slate-600">{is ? `Ómappað (${none.length})` : `Unmatched (${none.length})`}</h2>
              <p className="text-[11px] text-slate-500">{is ? "Geymt með player_id = null nema þú veljir. Aldrei giskað á rangan leikmann." : "Kept with player_id = null unless you pick. Never guessed onto the wrong player."}</p>
              <div className="mt-1 space-y-1">
                {none.map((r) => (
                  <div key={r.sourcePlayerRef} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-[12px]">
                    <span className="text-slate-700">{r.wyscoutPlayerName} <span className="text-slate-400">· {r.minutes ?? "–"}′</span></span>
                    <PlayerSelect r={r} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Skipped */}
          {preview.skipped.length > 0 && (
            <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px]">
              <summary className="cursor-pointer font-medium text-slate-600">{is ? `Sleppt — ekki A-lið (${preview.skipped.length})` : `Skipped — not the senior team (${preview.skipped.length})`}</summary>
              <div className="mt-1 text-slate-500">{preview.skipped.map((s) => `${s.player} (${s.team})`).join(", ")}</div>
            </details>
          )}

          <button
            onClick={runCommit}
            disabled={busy}
            className="rounded-lg bg-[#2740e6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "…" : (is ? "Staðfesta og flytja inn" : "Confirm & import")}
          </button>
        </div>
      )}
    </div>
  );
}

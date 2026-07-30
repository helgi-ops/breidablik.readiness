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
import CoachTutorialButton from "@/components/coach/tutorials/CoachTutorialButton";

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

type OverviewPlayer = {
  playerId: string;
  name: string;
  position: string | null;
  football: {
    minutes: number | null; goals: number | null; assists: number | null; xg: number | null;
    shots: number | null; shotsOnTarget: number | null; passAccuracyPct: number | null;
    metrics: Record<string, unknown>;
  };
  physical: {
    sessions: number; totalDistanceKm: number | null; topSpeed: number | null;
    playerLoad: number | null; matchMinutes: number | null;
  };
  source: string; sourceRef: string | null; syncedAt: string | null;
};
type Overview = {
  season: string;
  players: OverviewPlayer[];
  unmatched: number;
  missing?: { playerId: string; name: string; position: string | null }[];
};
type MatchRow = {
  playerId: string; name: string; position: string | null;
  matchDate: string; opponent: string | null; homeAway: "home" | "away" | null;
  minutes: number | null; goals: number | null; assists: number | null; xg: number | null;
  physical: { distanceKm: number | null; topSpeed: number | null; playerLoad: number | null; matchMinutes: number | null };
};

const YEAR_DEFAULT = "2026";
const fmt = (n: number | null | undefined, d = 0): string => (n == null ? "–" : n.toFixed(d));

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
  const [view, setView] = React.useState<"import" | "players" | "matches">("import");
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [ovBusy, setOvBusy] = React.useState(false);
  const [ovErr, setOvErr] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [matches, setMatches] = React.useState<{ rows: MatchRow[]; apiConnected: boolean } | null>(null);
  const [mBusy, setMBusy] = React.useState(false);
  const [cfg, setCfg] = React.useState<{ source: string; wyscout_team_id: string | null; enabled: boolean } | null>(null);
  const [apiSecret, setApiSecret] = React.useState(false);
  const [cfgMsg, setCfgMsg] = React.useState<string | null>(null);

  async function token(): Promise<string | null> {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session?.access_token ?? null;
  }

  React.useEffect(() => {
    (async () => {
      const t = await token();
      if (!t) return;
      const res = await fetch("/api/coach/player-stats/config", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) { const j = await res.json(); setCfg(j.config); setApiSecret(!!j.apiSecretConfigured); }
    })();
  }, []);

  async function saveConfig() {
    const t = await token();
    if (!t || !cfg) return;
    setCfgMsg(null);
    const res = await fetch("/api/coach/player-stats/config", {
      method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify(cfg),
    });
    const j = await res.json();
    setCfgMsg(res.ok ? (is ? "Vistað." : "Saved.") : (j.error ?? "Error"));
  }

  const fetchOverview = React.useCallback(async () => {
    setOvBusy(true); setOvErr(null);
    try {
      const t = await token();
      if (!t) { setOvErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const res = await fetch(`/api/coach/player-stats/overview?season=${encodeURIComponent(season)}&_t=${Date.now()}`, { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      const json = await res.json();
      if (!res.ok) { setOvErr(json.error ?? "Error"); return; }
      setOverview(json as Overview);
    } catch (e) {
      setOvErr(e instanceof Error ? e.message : "Error");
    } finally { setOvBusy(false); }
  }, [season, is]);

  React.useEffect(() => {
    if (view === "players") void fetchOverview();
  }, [view, fetchOverview]);

  React.useEffect(() => {
    if (view !== "matches") return;
    (async () => {
      setMBusy(true);
      try {
        const t = await token();
        if (!t) return;
        const res = await fetch(`/api/coach/player-stats/matches?_t=${Date.now()}`, { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
        if (res.ok) setMatches(await res.json());
      } finally { setMBusy(false); }
    })();
  }, [view]);

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
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{is ? "Leikmanna-tölfræði" : "Player Statistics"}</h1>
        <CoachTutorialButton slug="player-stats" label={{ en: "How to read", is: "Hvernig á að lesa" }} />
      </div>
      <PagePurpose
        en="import Wyscout player statistics and link them to your squad — football output beside the physical GPS/IMA data"
        is="flyttu inn Wyscout leikmanna-tölfræði og tengdu hana við leikmennina — fótbolta-afköst við hlið líkamlegu GPS/IMA gagnanna"
      />
      <p className="mt-1 text-xs text-slate-500">
        {is
          ? "Lýsandi fótbolta-gögn. Hreyfir aldrei readiness-litinn eða dagsákvörðunina. Hvert gildi ber uppruna sinn."
          : "Descriptive football data. Never moves the readiness colour or the daily decision. Every value carries its source."}
      </p>

      {/* Import / Players / Matches toggle */}
      <div className="mt-4 flex overflow-hidden rounded-lg border border-slate-200" style={{ width: "fit-content" }}>
        {(["import", "players", "matches"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === v ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
          >
            {v === "import" ? (is ? "Innflutningur" : "Import") : v === "players" ? (is ? "Leikmenn" : "Players") : (is ? "Leikir" : "Matches")}
          </button>
        ))}
      </div>

      {view === "import" && (<>

      {/* Data source (per-team config: Excel default, or Wyscout Data API) */}
      {cfg && (
        <details className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            {is ? "Uppspretta gagna" : "Data source"} <span className="text-slate-400">· {cfg.source === "wyscout_api" ? "Wyscout API" : "Excel"}</span>
          </summary>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" checked={cfg.source === "excel"} onChange={() => setCfg({ ...cfg, source: "excel" })} />
                {is ? "Excel-innflutningur (sjálfgefið)" : "Excel import (default)"}
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" checked={cfg.source === "wyscout_api"} onChange={() => setCfg({ ...cfg, source: "wyscout_api" })} />
                {is ? "Wyscout API (sjálfvirkt)" : "Wyscout API (automatic)"}
              </label>
            </div>
            {cfg.source === "wyscout_api" && (
              <>
                <label className="block">
                  <span className="mr-2 text-xs text-slate-500">{is ? "Wyscout lið-ID" : "Wyscout team ID"}</span>
                  <input
                    value={cfg.wyscout_team_id ?? ""}
                    onChange={(e) => setCfg({ ...cfg, wyscout_team_id: e.target.value })}
                    className="w-40 rounded border border-slate-300 px-2 py-1 text-xs"
                    placeholder="e.g. 12345"
                  />
                </label>
                <div className={`text-[11px] ${apiSecret ? "text-emerald-700" : "text-amber-700"}`}>
                  {apiSecret
                    ? (is ? "API-lykill stilltur á server." : "API secret is configured on the server.")
                    : (is ? "API-lykill EKKI stilltur enn (WYSCOUT_API_*). Sjálfvirk samstilling bíður hans + endapunkta-skjala." : "API secret NOT set yet (WYSCOUT_API_*). Automatic sync waits on it + the endpoint docs.")}
                </div>
              </>
            )}
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />
              {is ? "Virkt" : "Enabled"}
            </label>
            <div className="flex items-center gap-2">
              <button onClick={() => void saveConfig()} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                {is ? "Vista uppsprettu" : "Save source"}
              </button>
              {cfgMsg && <span className="text-[11px] text-slate-500">{cfgMsg}</span>}
            </div>
          </div>
        </details>
      )}

      {/* Upload — season totals only (per-match is Adapter B / API, never Excel) */}
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
        <p className="mt-2 text-[11px] text-slate-400">
          {is ? "Árs-samtölur (Advanced Search → All columns). Per-leik tölur koma um Wyscout Data API." : "Season totals (Advanced Search → All columns). Per-match stats come via the Wyscout Data API."}
        </p>
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

      </>)}

      {view === "players" && (
        <div className="mt-5">
          {ovBusy && <div className="py-6 text-center text-sm text-slate-500">…</div>}
          {ovErr && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{ovErr}</div>}
          {overview && !ovBusy && (
            overview.players.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
                {is ? `Engir mappaðir leikmenn fyrir tímabil ${overview.season} enn. Flyttu inn og mappaðu í Innflutningur-flipanum.` : `No mapped players for season ${overview.season} yet. Import and map on the Import tab.`}
                {overview.unmatched > 0 ? <span className="ml-1 text-slate-400">({overview.unmatched} {is ? "ómappaðar raðir" : "unmatched rows"})</span> : null}
              </div>
            ) : (
              <>
                {/* Plain read (Layer 1) + honest coverage — descriptive data, so a
                    plain summary + provenance, never a fabricated verdict. */}
                {(() => {
                  const ps = overview.players;
                  const withPhysical = ps.filter((p) => p.physical.sessions > 0).length;
                  const pick = (f: (p: OverviewPlayer) => number) => ps.reduce((a, b) => (f(b) > f(a) ? b : a), ps[0]);
                  const topScorer = pick((p) => p.football.goals ?? 0);
                  const mostMinutes = pick((p) => p.football.minutes ?? 0);
                  const topXg = pick((p) => p.football.xg ?? 0);
                  return (
                    <>
                      <div className="mb-2 rounded-xl border border-[#d4dcfb] bg-[#eef1fe] px-4 py-3 text-[13px] leading-relaxed text-slate-700">
                        {is
                          ? `${ps.length} leikmenn fluttir inn · tímabil ${overview.season}. Markahæstur: ${topScorer.name} (${topScorer.football.goals ?? 0}); flestar mínútur: ${mostMinutes.name} (${mostMinutes.football.minutes ?? 0}); hæsta xG: ${topXg.name} (${(topXg.football.xg ?? 0).toFixed(1)}).`
                          : `${ps.length} players imported · season ${overview.season}. Top scorer: ${topScorer.name} (${topScorer.football.goals ?? 0}); most minutes: ${mostMinutes.name} (${mostMinutes.football.minutes ?? 0}); highest xG: ${topXg.name} (${(topXg.football.xg ?? 0).toFixed(1)}).`}
                        {overview.unmatched > 0 ? <span className="ml-1 text-amber-700">· {overview.unmatched} {is ? "ómappaðar raðir í Innflutningi" : "unmatched rows on Import"}</span> : null}
                      </div>
                      {withPhysical === 0 ? (
                        <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-900">
                          <span aria-hidden>⚠</span>
                          <span>
                            {is
                              ? `Engin MicroPulse GPS/IMA gögn fyrir tímabil ${overview.season} — líkamlegu dálkarnir eru tómir því þetta tímabil er á undan GPS-gögnunum þínum (byrja feb 2026). Flyttu inn Wyscout-skrá fyrir yfirstandandi tímabil til að sjá fótbolta við hlið líkamlegs.`
                              : `No MicroPulse GPS/IMA for season ${overview.season} — the physical columns are empty because this season predates your GPS data (from Feb 2026). Import a current-season Wyscout export to see football beside physical.`}
                          </span>
                        </div>
                      ) : (
                        <div className="mb-2 text-[12px] text-slate-500">
                          {is
                            ? `Fótbolti (Wyscout, árs-samtölur) við hlið líkamlegs afkasts (GPS/IMA), tímabil ${overview.season}. Líkamleg gögn fyrir ${withPhysical} af ${ps.length}.`
                            : `Football (Wyscout, season totals) beside physical output (GPS/IMA), season ${overview.season}. Physical data for ${withPhysical} of ${ps.length}.`}
                        </div>
                      )}
                      {/* Coverage honesty: active squad players with no Wyscout stats this season. */}
                      {overview.missing && overview.missing.length > 0 && (
                        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] leading-snug text-slate-600">
                          <span className="font-semibold text-slate-700">
                            {is ? `${overview.missing.length} leikmenn í hópnum ekki í þessum innflutningi:` : `${overview.missing.length} squad players not in this import:`}
                          </span>{" "}
                          {overview.missing.map((m) => m.name).join(", ")}.
                          <span className="ml-1 text-slate-400">
                            {is
                              ? "Þeir voru ekki í Wyscout-skránni (t.d. undir markþröskuldi Advanced Search, eða skráðir í yngri flokk hjá Wyscout). Flyttu inn skrá sem inniheldur þá til að bæta við."
                              : "They weren't in the Wyscout export (e.g. below the Advanced Search minutes filter, or registered under a youth team in Wyscout). Import a file that includes them to add them."}
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-2 font-medium">{is ? "Leikmaður" : "Player"}</th>
                        <th className="px-2 py-2 text-right font-medium" title={is ? "Wyscout: keppnismínútur á tímabilinu (≠ MMin, sem er MicroPulse leikmínútur)" : "Wyscout: competitive minutes this season (≠ MMin, which is MicroPulse match minutes)"}>Min</th>
                        <th className="px-2 py-2 text-right font-medium" title={is ? "Mörk" : "Goals"}>G</th>
                        <th className="px-2 py-2 text-right font-medium" title={is ? "Stoðsendingar" : "Assists"}>A</th>
                        <th className="px-2 py-2 text-right font-medium" title={is ? "Expected goals — vænt mörk út frá gæðum færanna" : "Expected goals — chance quality, not actual goals"}>xG</th>
                        <th className="px-2 py-2 text-right font-medium" title={is ? "Skot (á rammann í sviga)" : "Shots (on target in parentheses)"}>Shots</th>
                        <th className="px-2 py-2 text-right font-medium" title={is ? "Nákvæmni sendinga %" : "Pass accuracy %"}>Pass%</th>
                        <th className="px-2 py-2 text-center font-medium text-[#2740e6]" title={is ? "Fótbolti (Wyscout) vinstra megin · líkamlegt (MicroPulse GPS/IMA) hægra megin" : "Football (Wyscout) on the left · physical (MicroPulse GPS/IMA) on the right"}>‖</th>
                        <th className="px-2 py-2 text-right font-medium" title={is ? "MicroPulse æfingar" : "MicroPulse sessions"}>Sess</th>
                        <th className="px-2 py-2 text-right font-medium" title={is ? "Heildar vegalengd (km)" : "Total distance (km)"}>Dist</th>
                        <th className="px-2 py-2 text-right font-medium" title={is ? "Hámarkshraði (km/klst)" : "Top speed (km/h)"}>Top</th>
                        <th className="px-2 py-2 text-right font-medium" title="Player Load">Load</th>
                        <th className="px-2 py-2 text-right font-medium" title={is ? "Leikmínútur (MicroPulse)" : "Match minutes (MicroPulse)"}>MMin</th>
                        <th className="px-2 py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.players.map((p) => {
                        const open = expanded.has(p.playerId);
                        const f = p.football, ph = p.physical;
                        const metricEntries = Object.entries(f.metrics).filter(([, v]) => v != null && v !== "");
                        return (
                          <React.Fragment key={p.playerId}>
                            <tr
                              className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/60"
                              onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(p.playerId)) n.delete(p.playerId); else n.add(p.playerId); return n; })}
                            >
                              <td className="px-2 py-1.5 font-medium text-slate-800">
                                {p.name}{p.position ? <span className="ml-1 text-[10px] text-slate-400">{p.position}</span> : null}
                                <span className="ml-1 text-[9px] text-indigo-500">{open ? "▴" : "▾"}</span>
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{fmt(f.minutes)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-900">{fmt(f.goals)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{fmt(f.assists)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{fmt(f.xg, 1)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{fmt(f.shots)}{f.shotsOnTarget != null ? ` (${f.shotsOnTarget})` : ""}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{f.passAccuracyPct != null ? `${fmt(f.passAccuracyPct)}%` : "–"}</td>
                              <td className="px-2 py-1.5 text-center text-slate-200">‖</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{ph.sessions || "–"}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{ph.totalDistanceKm != null ? `${fmt(ph.totalDistanceKm, 1)}` : "–"}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{ph.topSpeed != null ? fmt(ph.topSpeed, 1) : "–"}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{ph.playerLoad != null ? ph.playerLoad.toLocaleString() : "–"}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{ph.matchMinutes != null ? fmt(ph.matchMinutes) : "–"}</td>
                              <td className="px-2 py-1.5" />
                            </tr>
                            {open && (
                              <tr className="border-b border-slate-200 bg-slate-50/50">
                                <td colSpan={14} className="px-3 py-2.5">
                                  <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                                    {is ? "Allir Wyscout-mælar" : "All Wyscout metrics"} ({metricEntries.length})
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3 lg:grid-cols-4">
                                    {metricEntries.map(([k, v]) => (
                                      <div key={k} className="flex items-baseline justify-between gap-2 text-[10px]">
                                        <span className="truncate text-slate-500" title={k}>{k}</span>
                                        <span className="shrink-0 tabular-nums text-slate-700">{typeof v === "number" ? (Math.round(v * 100) / 100) : String(v)}</span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="mt-2 text-[9px] text-slate-400">
                                    {is ? "Uppruni" : "Source"}: {p.source}{p.sourceRef ? ` · ${p.sourceRef}` : ""}{p.syncedAt ? ` · ${new Date(p.syncedAt).toLocaleDateString()}` : ""}. {is ? "Fótbolta-gögn eru árs-samtölur; per-leik samanburður kemur með match-report exporti eða Wyscout API." : "Football data is season totals; per-match side-by-side arrives with a match-report export or the Wyscout API."}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Layered read: how to read the table + the honest limits. */}
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  {is
                    ? "Vinstra megin við ‖ er fótbolti (Wyscout árs-samtölur); hægra megin líkamlegt (MicroPulse GPS/IMA sama tímabil). Smelltu á leikmann til að sjá ALLA Wyscout-mælana (per-90 o.fl.) og upprunann (skrá + sync-dagsetning). Min = keppnismínútur Wyscout; MMin = MicroPulse leikmínútur — þær geta verið ólíkar því þær koma úr sitt hvorri heimildinni. „–“ þýðir engin gögn (t.d. markvörður án pod, eða leikmaður utan Wyscout-skrárinnar), aldrei núll. Lýsandi gögn — hreyfa aldrei readiness-litinn."
                    : "Left of the ‖ is football (Wyscout season totals); right is physical (MicroPulse GPS/IMA, same season). Click a player for ALL Wyscout metrics (per-90 etc.) and the provenance (file + sync date). Min = Wyscout competitive minutes; MMin = MicroPulse match minutes — they can differ because they come from different sources. A “–” means no data (e.g. a keeper with no pod, or a player not in the Wyscout export), never zero. Descriptive data — it never moves the readiness colour."}
                </p>
              </>
            )
          )}
        </div>
      )}

      {view === "matches" && (
        <div className="mt-5">
          {mBusy && <div className="py-6 text-center text-sm text-slate-500">…</div>}
          {matches && !mBusy && (
            matches.rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                <div className="text-sm font-medium text-slate-700">
                  {is ? "Per-leik fótboltatölur þurfa Wyscout Data API — ekki tengt enn." : "Per-match football stats need the Wyscout Data API — not yet connected."}
                </div>
                <div className="mt-1 text-[12px] text-slate-500">
                  {matches.apiConnected
                    ? (is ? "API valið og lykill til staðar — bíð eftir fyrstu samstillingu." : "API selected and secret present — awaiting the first sync.")
                    : (is ? "Wyscout hefur ekkert per-leik Excel; stakur leikur kemur aðeins um Data API viðbótina. Season-tölur eru í Leikmenn-flipanum." : "Wyscout has no per-match Excel; single matches come only via the Data API add-on. Season totals are on the Players tab.")}
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  {is ? "Þegar tengt: fótbolti og GPS/IMA hlið við hlið fyrir sama leik (player_id + leikdagur)." : "When connected: football and GPS/IMA side by side for the same match (player_id + match date)."}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2 font-medium">{is ? "Leikur" : "Match"}</th>
                      <th className="px-2 py-2 font-medium">{is ? "Leikmaður" : "Player"}</th>
                      <th className="px-2 py-2 text-right font-medium">Min</th>
                      <th className="px-2 py-2 text-right font-medium">G</th>
                      <th className="px-2 py-2 text-right font-medium">A</th>
                      <th className="px-2 py-2 text-right font-medium">xG</th>
                      <th className="px-2 py-2 text-center font-medium text-[#2740e6]">‖</th>
                      <th className="px-2 py-2 text-right font-medium">Dist</th>
                      <th className="px-2 py-2 text-right font-medium">Top</th>
                      <th className="px-2 py-2 text-right font-medium">Load</th>
                      <th className="px-2 py-2 text-right font-medium">MMin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.rows.map((m) => (
                      <tr key={`${m.playerId}-${m.matchDate}`} className="border-b border-slate-100">
                        <td className="px-2 py-1.5 text-slate-600">{m.matchDate}{m.opponent ? ` · ${m.opponent}` : ""}{m.homeAway ? ` (${m.homeAway[0].toUpperCase()})` : ""}</td>
                        <td className="px-2 py-1.5 font-medium text-slate-800">{m.name}{m.position ? <span className="ml-1 text-[10px] text-slate-400">{m.position}</span> : null}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmt(m.minutes)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-900">{fmt(m.goals)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmt(m.assists)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmt(m.xg, 1)}</td>
                        <td className="px-2 py-1.5 text-center text-slate-200">‖</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{m.physical.distanceKm != null ? fmt(m.physical.distanceKm, 1) : "–"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{m.physical.topSpeed != null ? fmt(m.physical.topSpeed, 1) : "–"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{m.physical.playerLoad != null ? m.physical.playerLoad.toLocaleString() : "–"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{m.physical.matchMinutes != null ? fmt(m.physical.matchMinutes) : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

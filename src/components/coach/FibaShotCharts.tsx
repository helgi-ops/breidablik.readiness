"use client";

/**
 * FIBA LiveStats shot charts (MVP). Paste a KKÍ game URL → the server fetches the public
 * Genius Sports feed, stores the shots, and returns a half-court shot chart + per-player
 * shooting tendencies for BOTH teams (own player analysis + opponent scouting). Free,
 * public, descriptive — never touches the readiness colour or the daily decision.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { foldShot, type FibaShot, type PlayerTendency } from "@/lib/micropulse/basketballStats/fibaLiveStats";

type Side = { shots: FibaShot[]; tendencies: PlayerTendency[] };
type Pulled = {
  matchId: string; ownTeam: { name: string } | null; oppTeam: { name: string } | null;
  own: Side; opp: Side; ownerTno?: number; rowsUpserted?: number; mappedOwnPlayers?: number;
};
type GameRow = { matchId: string; own: string | null; opp: string | null; shots: number; syncedAt: string | null };

const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);

/** Half-court SVG (basket at the top baseline). Made = filled, missed = hollow ring;
 *  threes tinted. Coordinates folded onto one half. Orientation verified in prod. */
function ShotCourt({ shots }: { shots: FibaShot[] }) {
  // viewBox: 150 wide (court width ~15m), 140 tall (half length ~14m). Basket top-centre.
  const W = 150, H = 140, bx = 75, by = 13;
  const withXY = shots.filter((s) => s.x != null && s.y != null);
  const pt = (s: FibaShot) => {
    const f = foldShot(s.x as number, s.y as number); // x∈[0,50] depth, y∈[0,100] width
    return { cx: (f.y / 100) * W, cy: (f.x / 50) * H, made: s.result === 1, three: s.actionType === "3pt" };
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[420px] rounded-lg border border-orange-100 bg-orange-50/30">
      {/* court outline + key + arc (stylised) */}
      <g fill="none" stroke="#cbb896" strokeWidth={0.8}>
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} />
        <rect x={bx - 24} y={0} width={48} height={58} />
        <circle cx={bx} cy={58} r={18} />
        <path d={`M ${bx - 66} 0 A 66 66 0 0 0 ${bx + 66} 0`} />
        <line x1={bx - 66} y1={0} x2={bx - 66} y2={14} />
        <line x1={bx + 66} y1={0} x2={bx + 66} y2={14} />
      </g>
      <circle cx={bx} cy={by} r={3.2} fill="none" stroke="#a8763c" strokeWidth={1.2} />
      {withXY.map((s, i) => {
        const p = pt(s);
        return p.made
          ? <circle key={i} cx={p.cx} cy={p.cy} r={2.4} fill={p.three ? "#2740e6" : "#1c7a4a"} opacity={0.85} />
          : <g key={i} stroke={p.three ? "#2740e6" : "#a83e28"} strokeWidth={1} opacity={0.7}>
              <line x1={p.cx - 2} y1={p.cy - 2} x2={p.cx + 2} y2={p.cy + 2} />
              <line x1={p.cx - 2} y1={p.cy + 2} x2={p.cx + 2} y2={p.cy - 2} />
            </g>;
      })}
    </svg>
  );
}

export default function FibaShotCharts({ onImported }: { onImported?: () => void }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [data, setData] = React.useState<Pulled | null>(null);
  const [side, setSide] = React.useState<"own" | "opp">("opp");
  const [player, setPlayer] = React.useState<string>("");
  const [games, setGames] = React.useState<GameRow[]>([]);
  const [batchText, setBatchText] = React.useState("");
  const [batchBusy, setBatchBusy] = React.useState(false);
  const [batchRes, setBatchRes] = React.useState<{ imported: number; failed: number; results: Array<{ matchId: string | null; ok: boolean; error?: string; own?: string | null; opp?: string | null; ownShots?: number; oppShots?: number }> } | null>(null);

  const loadGames = React.useCallback(async () => {
    const t = await token(); if (!t) return;
    const r = await fetch("/api/coach/basketball-fiba", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r?.ok) setGames(r.games ?? []);
  }, [token]);
  React.useEffect(() => { void loadGames(); }, [loadGames]);

  async function pull(ownerSide?: number) {
    if (!url.trim()) return;
    setBusy(true); setErr(null);
    try {
      const t = await token(); if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const r = await fetch("/api/coach/basketball-fiba", { method: "POST", headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ url, ownerSide }) }).then((x) => x.json());
      if (!r.ok) { setErr(r.error ?? "Error"); return; }
      setData(r as Pulled); setPlayer(""); setSide("opp");
      onImported?.(); void loadGames();
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  }

  async function pullBatch() {
    const urls = batchText.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!urls.length) return;
    setBatchBusy(true); setBatchRes(null); setErr(null);
    try {
      const t = await token(); if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const r = await fetch("/api/coach/basketball-fiba", { method: "POST", headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ urls }) }).then((x) => x.json());
      if (!r.ok) { setErr(r.error ?? "Error"); return; }
      setBatchRes({ imported: r.imported, failed: r.failed, results: r.results ?? [] });
      onImported?.(); void loadGames();
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBatchBusy(false); }
  }

  async function openGame(matchId: string) {
    setBusy(true); setErr(null);
    try {
      const t = await token(); if (!t) return;
      const r = await fetch(`/api/coach/basketball-fiba?matchId=${matchId}`, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" }).then((x) => x.json());
      if (r?.ok && r.found) { setData({ matchId, ownTeam: r.ownTeam, oppTeam: r.oppTeam, own: r.own, opp: r.opp }); setPlayer(""); setSide("opp"); }
    } finally { setBusy(false); }
  }

  const active = data ? (side === "own" ? data.own : data.opp) : null;
  const teamName = data ? (side === "own" ? data.ownTeam?.name : data.oppTeam?.name) ?? "—" : "—";
  const shownShots = active ? (player ? active.shots.filter((s) => `${s.shirt ?? ""}|${s.playerName}` === player) : active.shots) : [];
  const shownTend = active ? (player ? active.tendencies.filter((t) => t.key === player) : active.tendencies) : [];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
        <div className="text-sm font-semibold text-slate-800">{is ? "Shot charts úr FIBA LiveStats (KKÍ)" : "Shot charts from FIBA LiveStats (KKÍ)"}</div>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
          {is
            ? "Límdu inn slóð á KKÍ-leik úr FIBA LiveStats (t.d. …/u/KKI/<id>/pbp.html). Við sækjum opinbera feed-ið, geymum skotin og sýnum shot chart + skot-tilhneigingar fyrir bæði lið — þitt lið OG andstæðinginn. Frítt og opinbert."
            : "Paste a KKÍ game URL from FIBA LiveStats (e.g. …/u/KKI/<id>/pbp.html). We fetch the public feed, store the shots, and show a shot chart + shooting tendencies for both teams — your team AND the opponent. Free and public."}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://fibalivestats…/u/KKI/2846798/pbp.html"
            className="min-w-[280px] flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <button onClick={() => pull()} disabled={!url.trim() || busy} className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "…" : (is ? "Sækja" : "Fetch")}</button>
        </div>
        {err && <p className="mt-2 text-[12px] font-medium text-red-700">{err}</p>}

        {/* Batch — a season in one paste */}
        <details className="group mt-2 rounded-lg border border-orange-100 bg-white/60">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[12px] font-semibold text-slate-700">
            <span>{is ? "Sækja mörg í einu (tímabil) — líma marga leik-URL" : "Pull many at once (a season) — paste multiple game URLs"}</span>
            <span className="shrink-0 text-[#2740e6] transition-transform group-open:rotate-90">→</span>
          </summary>
          <div className="space-y-2 border-t border-orange-100 px-3 py-3">
            <p className="text-[11px] text-slate-500">
              {is
                ? "Límdu inn leik-URL, einn á línu (allar FIBA LiveStats síður leiksins virka — st/sc/bs/p/pbp/index). Við þekkjum þitt lið sjálfkrafa í hverjum leik. Hámark 40 í einu."
                : "Paste game URLs, one per line (any of the game's FIBA LiveStats pages work — st/sc/bs/p/pbp/index). We auto-detect your team per game. Max 40 at a time."}
            </p>
            <textarea value={batchText} onChange={(e) => setBatchText(e.target.value)} rows={5}
              placeholder={"https://fibalivestats…/u/KKI/2846798/pbp.html\nhttps://fibalivestats…/u/KKI/2843786/pbp.html"}
              className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-[11px]" />
            <button onClick={pullBatch} disabled={batchBusy || !batchText.trim()} className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              {batchBusy ? (is ? "Sæki…" : "Fetching…") : (is ? "Sækja öll" : "Fetch all")}
            </button>
            {batchRes && (
              <div className="mt-1 rounded border border-slate-100 bg-slate-50 px-2.5 py-2 text-[12px]">
                <div className="font-semibold text-slate-700">{batchRes.imported} {is ? "sótt" : "imported"}{batchRes.failed ? ` · ${batchRes.failed} ${is ? "mistókst" : "failed"}` : ""}</div>
                <ul className="mt-1 space-y-0.5">
                  {batchRes.results.map((r, i) => (
                    <li key={i} className={r.ok ? "text-slate-600" : "text-red-700"}>
                      {r.ok ? "✓" : "✕"} {r.matchId ?? "?"}{r.ok ? ` — ${r.own ?? "?"} ${r.ownShots} / ${r.opp ?? "?"} ${r.oppShots} ${is ? "skot" : "shots"}` : ` — ${r.error}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>

        {games.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="text-[11px] text-slate-400">{is ? "Áður sótt:" : "Pulled:"}</span>
            {games.map((g) => (
              <button key={g.matchId} onClick={() => openGame(g.matchId)} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-600 hover:border-orange-300">
                {(g.own ?? "?")}–{(g.opp ?? "?")}
              </button>
            ))}
          </div>
        )}
      </div>

      {data && active && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {/* Side toggle + swap */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button onClick={() => { setSide("own"); setPlayer(""); }} className={`rounded-md px-2.5 py-0.5 text-[12px] font-medium ${side === "own" ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>{data.ownTeam?.name ?? (is ? "Mitt lið" : "Us")}</button>
              <button onClick={() => { setSide("opp"); setPlayer(""); }} className={`rounded-md px-2.5 py-0.5 text-[12px] font-medium ${side === "opp" ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>{data.oppTeam?.name ?? (is ? "Andstæðingur" : "Opp")}</button>
            </div>
            {data.rowsUpserted != null && (
              <button onClick={() => pull(data.ownerTno === 1 ? 2 : 1)} disabled={busy} className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                {is ? "↔ Skipta um lið" : "↔ Swap teams"}
              </button>
            )}
            {active.tendencies.length > 0 && (
              <select value={player} onChange={(e) => setPlayer(e.target.value)} className="ml-auto rounded border border-slate-300 bg-white px-2 py-1 text-[12px]">
                <option value="">{is ? "Allt liðið" : "Whole team"}</option>
                {active.tendencies.map((t) => <option key={t.key} value={t.key}>{t.shirt ? `${t.shirt} ` : ""}{t.name}</option>)}
              </select>
            )}
          </div>

          <div className="mt-3 grid gap-4 md:grid-cols-[auto,1fr]">
            <div>
              <ShotCourt shots={shownShots} />
              <div className="mt-1.5 flex flex-wrap gap-3 text-[10.5px] text-slate-500">
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-600" /> {is ? "hitt 2ja" : "made 2"}</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#2740e6]" /> {is ? "hitt 3ja" : "made 3"}</span>
                <span className="inline-flex items-center gap-1"><span className="text-[#a83e28]">✕</span> {is ? "missti" : "missed"}</span>
                <span>· {teamName} · {shownShots.length} {is ? "skot" : "shots"}</span>
              </div>
            </div>

            {/* Per-player tendencies */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[380px] text-[12px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="py-1 pr-2">{is ? "Leikmaður" : "Player"}</th>
                    <th className="py-1 pr-2 text-right">FG</th>
                    <th className="py-1 pr-2 text-right">FG%</th>
                    <th className="py-1 pr-2 text-right">2P</th>
                    <th className="py-1 pr-2 text-right">3P</th>
                    <th className="py-1 pl-2">{is ? "Mest" : "Top type"}</th>
                  </tr>
                </thead>
                <tbody>
                  {shownTend.map((t) => (
                    <tr key={t.key} className="border-b border-slate-100">
                      <td className="py-1 pr-2 text-slate-700">{t.shirt ? `${t.shirt} ` : ""}{t.name}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{t.fgm}-{t.fga}</td>
                      <td className="py-1 pr-2 text-right tabular-nums font-semibold text-slate-800">{pct(t.fgPct)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-slate-500">{t.twoM}-{t.twoA}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-slate-500">{t.tpm}-{t.tpa}</td>
                      <td className="py-1 pl-2 text-slate-500">{t.byType[0] ? `${t.byType[0].type} (${t.byType[0].made}-${t.byType[0].att})` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-slate-400">
                {is
                  ? "Skotstaðsetningar úr FIBA LiveStats (Genius Sports) — opinbert. Lýsandi njósn; snertir ekki readiness. Stefna vallar staðfest í prod."
                  : "Shot locations from FIBA LiveStats (Genius Sports) — public. Descriptive scouting; never touches readiness. Court orientation verified in prod."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

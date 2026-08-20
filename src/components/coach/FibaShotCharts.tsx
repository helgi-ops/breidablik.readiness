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
import { foldShot, type FibaShot, type PlayerTendency, type FibaPlayerBox, type FibaTeamTotals } from "@/lib/micropulse/basketballStats/fibaLiveStats";
import { shotLabel, zoneLabel } from "@/lib/micropulse/basketballStats/shotLabels";

type Side = { shots: FibaShot[]; tendencies: PlayerTendency[]; box?: FibaPlayerBox[]; totals?: FibaTeamTotals | null };
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

// ── InStat side of the source toggle — play-types + shot zones from the ingested InStat
//    data (own team, season). Complements FIBA's x/y shot charts. Reuses the season read. ──
type ShotTypeAgg = { key: string; made: number; att: number; pct: number | null };
type ZoneAgg = { key: string; made: number; att: number; pct: number | null };
type PlayerZones = { name: string; zones: ZoneAgg[] };

function InstatShotView({ is, token }: { is: boolean; token: () => Promise<string | null> }) {
  const L: "EN" | "IS" = is ? "IS" : "EN";
  const [tactical, setTactical] = React.useState<{ playtypes: ShotTypeAgg[]; efficiency: ShotTypeAgg[]; games: number } | null>(null);
  const [zones, setZones] = React.useState<{ team: ZoneAgg[]; players: PlayerZones[]; games: number } | null>(null);
  const [zonePlayer, setZonePlayer] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => { (async () => {
    const t = await token(); if (!t) return;
    const r = await fetch("/api/coach/basketball-season-insights", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setTactical(r.tacticalShots ?? null); setZones(r.shotZones ?? null); }
    setLoaded(true);
  })(); }, [token]);

  const Bar = ({ label, made, att, pct, barPct }: { label: string; made: number; att: number; pct: number | null; barPct: number }) => (
    <div className="flex items-center gap-2">
      <div className="w-32 shrink-0 truncate text-[12px] text-slate-700" title={label}>{label}</div>
      <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-orange-100/60"><div className="absolute inset-y-0 left-0 rounded bg-orange-500/70" style={{ width: `${Math.min(100, barPct)}%` }} /></div>
      <div className="w-24 shrink-0 text-right text-[11px] tabular-nums text-slate-500">{made}-{att}{pct != null ? ` · ${pct}%` : ""}</div>
    </div>
  );

  const hasTactical = tactical && (tactical.playtypes.length > 0 || tactical.efficiency.length > 0);
  const activeZones = zones ? (zonePlayer ? zones.players.find((p) => p.name === zonePlayer)?.zones ?? zones.team : zones.team) : [];

  if (loaded && !hasTactical && (!zones || zones.team.length === 0)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-500">
        {is
          ? "Engin InStat-gögn enn. Flyttu inn InStat leikskýrslu (PDF) eða per-leikmanns töflu í InStat-upphleðslunni hér fyrir neðan — þá birtast play-types (pick'n'roll / catch-and-shoot / iso) og skotsvæði."
          : "No InStat data yet. Import an InStat Game Report (PDF) or per-player table via the InStat upload below — then play types (pick'n'roll / catch-and-shoot / iso) and shot zones appear here."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hasTactical && (
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <div className="flex items-center gap-2"><span className="text-[13px] font-bold text-slate-800">{is ? "Hvernig við skorum" : "How we score"}</span><span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">InStat</span><span className="text-[11px] text-slate-500">· {tactical!.games} {is ? "leikir" : "games"}</span></div>
          {tactical!.playtypes.length > 0 && (() => { const rows = tactical!.playtypes.slice(0, 8); const max = Math.max(1, ...rows.map((r) => r.att)); return (
            <div className="mt-2.5"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Sóknartegundir" : "Play types"}</div><div className="mt-1.5 space-y-1.5">{rows.map((r) => <Bar key={r.key} label={shotLabel(r.key, L)} made={r.made} att={r.att} pct={r.pct} barPct={(r.att / max) * 100} />)}</div></div>
          ); })()}
          {tactical!.efficiency.length > 0 && (() => { const max = Math.max(1, ...tactical!.efficiency.map((r) => r.att)); return (
            <div className="mt-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Sóknargerð" : "Offensive types"}</div><div className="mt-1.5 space-y-1.5">{tactical!.efficiency.map((r) => <Bar key={r.key} label={shotLabel(r.key, L)} made={r.made} att={r.att} pct={r.pct} barPct={(r.att / max) * 100} />)}</div></div>
          ); })()}
          <p className="mt-2.5 text-[11px] text-slate-500">{is ? "InStat-flokkar skarast, leggjast ekki í 100%. Súlan = magn; „m-t · %“ = hittni." : "InStat categories overlap (don't sum to 100%). Bar = volume; \"m-a · %\" = shooting."}</p>
        </div>
      )}
      {zones && zones.team.length > 0 && (() => { const max = Math.max(1, ...activeZones.map((z) => z.att)); return (
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <div className="flex flex-wrap items-center gap-2"><span className="text-[13px] font-bold text-slate-800">{is ? "Skotsvæði" : "Shot zones"}</span><span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">InStat</span>
            {zones.players.length > 0 && <select value={zonePlayer} onChange={(e) => setZonePlayer(e.target.value)} className="ml-auto rounded border border-orange-200 bg-white px-2 py-1 text-[12px]"><option value="">{is ? "Allt liðið" : "Whole team"}</option>{zones.players.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}</select>}
          </div>
          <div className="mt-2.5 space-y-1.5">{activeZones.map((z) => <Bar key={z.key} label={zoneLabel(z.key, L)} made={z.made} att={z.att} pct={z.pct} barPct={(z.att / max) * 100} />)}</div>
        </div>
      ); })()}
      <p className="text-[11px] text-slate-400">{is ? "Úr innfluttum InStat-gögnum (þitt lið, tímabil). Lýsandi; snertir ekki readiness." : "From imported InStat data (your team, season). Descriptive; never touches readiness."}</p>
    </div>
  );
}

export default function FibaShotCharts({ onImported }: { onImported?: () => void }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const [source, setSource] = React.useState<"fiba" | "instat">("fiba");
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [data, setData] = React.useState<Pulled | null>(null);
  const [side, setSide] = React.useState<"own" | "opp">("opp");
  const [player, setPlayer] = React.useState<string>("");
  const [tableMode, setTableMode] = React.useState<"shooting" | "box">("box");
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
      {/* Source toggle — FIBA (free x/y shot charts + box) vs InStat (play types + zones). */}
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[12px]">
        <button onClick={() => setSource("fiba")} className={`rounded-md px-2.5 py-1 font-medium ${source === "fiba" ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>FIBA LiveStats</button>
        <button onClick={() => setSource("instat")} className={`rounded-md px-2.5 py-1 font-medium ${source === "instat" ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>InStat</button>
      </div>

      {source === "instat" ? <InstatShotView is={is} token={token} /> : (<>
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

            {/* Box + tendencies */}
            <div className="overflow-x-auto">
              {/* Team scoring breakdown (from the feed's team totals) */}
              {active.totals && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {([
                    [is ? "Stig í teig" : "Paint", active.totals.pointsInPaint],
                    [is ? "Hraðaupphlaup" : "Fastbreak", active.totals.fastbreak],
                    [is ? "Af tapi" : "Off TO", active.totals.pointsOffTurnovers],
                    [is ? "2. sókn" : "2nd chance", active.totals.secondChance],
                    [is ? "Bekkur" : "Bench", active.totals.bench],
                  ] as Array<[string, number | null]>).map(([label, v]) => (
                    <span key={label} className="rounded-full border border-orange-100 bg-orange-50/60 px-2 py-0.5 text-[11px] text-slate-600">
                      {label} <b className="tabular-nums text-slate-800">{v ?? "—"}</b>
                    </span>
                  ))}
                </div>
              )}

              {/* Shooting | Box toggle */}
              <div className="mb-1.5 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
                <button onClick={() => setTableMode("box")} className={`rounded-md px-2 py-0.5 font-medium ${tableMode === "box" ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>{is ? "Leikjatölur" : "Box"}</button>
                <button onClick={() => setTableMode("shooting")} className={`rounded-md px-2 py-0.5 font-medium ${tableMode === "shooting" ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>{is ? "Skotnýting" : "Shooting"}</button>
              </div>

              {tableMode === "shooting" ? (
                <table className="w-full min-w-[380px] text-[12px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
                      <th className="py-1 pr-2">{is ? "Leikmaður" : "Player"}</th>
                      <th className="py-1 pr-2 text-right">FG</th><th className="py-1 pr-2 text-right">FG%</th>
                      <th className="py-1 pr-2 text-right">2P</th><th className="py-1 pr-2 text-right">3P</th>
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
              ) : (
                <table className="w-full min-w-[440px] text-[12px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
                      <th className="py-1 pr-2">{is ? "Leikmaður" : "Player"}</th>
                      <th className="py-1 pr-1 text-right">{is ? "Mín" : "Min"}</th>
                      <th className="py-1 pr-1 text-right">{is ? "Stig" : "PTS"}</th>
                      <th className="py-1 pr-1 text-right">{is ? "Frák" : "REB"}</th>
                      <th className="py-1 pr-1 text-right">{is ? "Stoð" : "AST"}</th>
                      <th className="py-1 pr-1 text-right">STL</th><th className="py-1 pr-1 text-right">BLK</th>
                      <th className="py-1 pr-1 text-right">TO</th><th className="py-1 pl-1 text-right">+/-</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(active.box ?? []).map((b, i) => (
                      <tr key={`${b.shirt}-${b.name}-${i}`} className="border-b border-slate-100">
                        <td className="py-1 pr-2 text-slate-700">{b.shirt ? `${b.shirt} ` : ""}{b.name}</td>
                        <td className="py-1 pr-1 text-right tabular-nums text-slate-400">{b.min ?? "—"}</td>
                        <td className="py-1 pr-1 text-right tabular-nums font-semibold text-slate-800">{b.pts ?? 0}</td>
                        <td className="py-1 pr-1 text-right tabular-nums text-slate-600">{b.reb ?? 0}</td>
                        <td className="py-1 pr-1 text-right tabular-nums text-slate-600">{b.ast ?? 0}</td>
                        <td className="py-1 pr-1 text-right tabular-nums text-slate-500">{b.stl ?? 0}</td>
                        <td className="py-1 pr-1 text-right tabular-nums text-slate-500">{b.blk ?? 0}</td>
                        <td className="py-1 pr-1 text-right tabular-nums text-slate-500">{b.tov ?? 0}</td>
                        <td className={`py-1 pl-1 text-right tabular-nums font-medium ${(b.pm ?? 0) > 0 ? "text-emerald-600" : (b.pm ?? 0) < 0 ? "text-red-600" : "text-slate-400"}`}>{b.pm != null ? (b.pm > 0 ? `+${b.pm}` : b.pm) : "—"}</td>
                      </tr>
                    ))}
                    {(active.box ?? []).length === 0 && <tr><td colSpan={9} className="py-2 text-[11px] text-slate-400">{is ? "Engar leikjatölur — sæktu leikinn aftur." : "No box score — re-fetch the game."}</td></tr>}
                  </tbody>
                </table>
              )}
              <p className="mt-2 text-[11px] text-slate-400">
                {is
                  ? "Skot + leikjatölur úr FIBA LiveStats (Genius Sports) — opinbert. Lýsandi njósn; snertir ekki readiness. Stefna vallar staðfest í prod."
                  : "Shots + box from FIBA LiveStats (Genius Sports) — public. Descriptive scouting; never touches readiness. Court orientation verified in prod."}
              </p>
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}

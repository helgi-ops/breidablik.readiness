"use client";

/**
 * PassingNetworkPanel — StatsBomb passing network for one match (Single Match Analysis).
 *
 * From the two StatsBomb OBV exports (per-player Pass network + Passing Combinations): a
 * schematic pitch of who combines with whom (own team, nodes by nominal role since the
 * CSVs carry no coordinates — labelled as schematic), plus top-combination tables and
 * per-player passing-OBV bars for both teams. Opponents have no roster positions, so they
 * get tables/bars only. Descriptive — never touches the readiness colour.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { buildPassingNetwork, type PassingPlayer, type PassingEdge } from "@/lib/micropulse/passingNetwork";
import { roleBandLayout, type PitchNode } from "@/lib/micropulse/passingNetwork/layout";

type Lang = "EN" | "IS";
type SidePlayer = { ref: string; name: string; playerId: string | null; position: string | null; passes: number | null; obv: number | null };
type SideCombo = { passerRef: string; passerName: string; receiverRef: string; receiverName: string; passes: number | null; obv: number | null };
type SideData = { teamName: string | null; players: SidePlayer[]; combos: SideCombo[] };
type Payload = { ok: boolean; hasData: boolean; date: string; own?: SideData; opp?: SideData };

const T = {
  EN: { title: "Passing network", purpose: "Who passes to whom, and the value of each link (StatsBomb OBV). Schematic — own-team nodes are placed by role, not average pitch position. Descriptive — never touches readiness.",
    empty: "No passing network for this match yet. Upload the StatsBomb 'Pass network' and 'Passing Combinations' CSVs below.",
    us: "Us", opp: "Opponent", schematic: "Schematic — nodes by role, not average pitch position",
    topVolume: "Most frequent links", topObv: "Most valuable links (OBV)", passers: "Passing value per player (OBV)",
    passes: "passes", noPitch: "Pitch layout needs squad positions — shown for your own team only. Opponent links are in the tables.",
    upload: "Upload passing file", uploadHint: "StatsBomb 'Pass network' (Team/Player/Passes/OBV) or 'Passing Combinations' (Team/Passer/Receiver/Passes/OBV). Upload each; the match date is this match.",
    uploading: "Uploading…", noDate: "Pick a match first." },
  IS: { title: "Sendinganet", purpose: "Hver sendir á hvern, og virði hverrar tengingar (StatsBomb OBV). Skýringarmynd — leikmenn okkar raðast eftir stöðu, ekki meðalstaðsetningu. Lýsandi — snertir aldrei readiness.",
    empty: "Ekkert sendinganet fyrir þennan leik enn. Hladdu upp StatsBomb 'Pass network' og 'Passing Combinations' CSV-unum hér að neðan.",
    us: "Við", opp: "Andstæðingur", schematic: "Skýringarmynd — eftir stöðu, ekki meðalstaðsetning",
    topVolume: "Tíðustu tengingar", topObv: "Verðmætustu tengingar (OBV)", passers: "Sendingavirði á leikmann (OBV)",
    passes: "sendingar", noPitch: "Vallar-uppsetning þarf stöður leikmanna — sýnd fyrir þitt lið. Tengingar andstæðings eru í töflunum.",
    upload: "Hlaða upp sendingaskrá", uploadHint: "StatsBomb 'Pass network' (Team/Player/Passes/OBV) eða 'Passing Combinations' (Team/Passer/Receiver/Passes/OBV). Hladdu hverri upp; leikdagur er þessi leikur.",
    uploading: "Hleð upp…", noDate: "Veldu leik fyrst." },
} as const;

const fmtObv = (v: number | null): string => (v == null ? "–" : (v >= 0 ? "+" : "") + v.toFixed(2));

// --- colour: OBV diverging red↔slate↔green, scaled to the match's own range ---
function hex(n: number): string { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"); }
function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((c, i) => hex(c + (pb[i] - c) * t)).join("")}`;
}
function obvColor(v: number | null, maxAbs: number): string {
  if (v == null || maxAbs <= 0) return "#cbd5e1";
  const r = Math.max(-1, Math.min(1, v / maxAbs));
  return r >= 0 ? lerpHex("#e2e8f0", "#1c7a4a", r) : lerpHex("#e2e8f0", "#a83e28", -r);
}

/** Schematic pitch SVG for the own team (nodes by role, weighted/coloured edges). */
function PitchNetwork({ players, combos, is }: { players: SidePlayer[]; combos: SideCombo[]; is: boolean }) {
  const net = buildPassingNetwork(
    players.map<PassingPlayer>((p) => ({ ref: p.ref, name: p.name, playerId: p.playerId, passes: p.passes, obv: p.obv })),
    combos.map<PassingEdge>((c) => ({ passerRef: c.passerRef, passerName: c.passerName, receiverRef: c.receiverRef, receiverName: c.receiverName, passes: c.passes, obv: c.obv })),
  );
  const nodes = roleBandLayout(players.map((p) => ({ ref: p.ref, name: p.name, position: p.position })));
  const byRef = new Map<string, PitchNode>(nodes.map((n) => [n.ref, n]));
  const maxAbs = Math.max(Math.abs(net.obvMin), Math.abs(net.obvMax), 1e-6);
  const passesOf = new Map(players.map((p) => [p.ref, p.passes ?? 0]));
  // Draw only meaningful edges (>=2 passes, both endpoints on the pitch) to avoid clutter.
  const edges = combos.filter((c) => (c.passes ?? 0) >= 2 && byRef.has(c.passerRef) && byRef.has(c.receiverRef));

  const lastName = (n: string) => n.split(" ").slice(-1)[0];
  return (
    <div>
      <svg viewBox="-4 -4 108 108" className="block w-full max-w-[520px]" role="img" aria-label={is ? "Sendinganet" : "Passing network"}>
        {/* pitch */}
        <rect x={0} y={0} width={100} height={100} rx={2} fill="#f8faf9" stroke="#cbd5e1" strokeWidth={0.6} />
        <line x1={0} y1={50} x2={100} y2={50} stroke="#cbd5e1" strokeWidth={0.5} />
        <circle cx={50} cy={50} r={9} fill="none" stroke="#cbd5e1" strokeWidth={0.5} />
        <rect x={21} y={84} width={58} height={16} fill="none" stroke="#cbd5e1" strokeWidth={0.5} />
        <rect x={37} y={94} width={26} height={6} fill="none" stroke="#cbd5e1" strokeWidth={0.5} />
        <rect x={21} y={0} width={58} height={16} fill="none" stroke="#cbd5e1" strokeWidth={0.5} />
        <rect x={37} y={0} width={26} height={6} fill="none" stroke="#cbd5e1" strokeWidth={0.5} />
        {/* edges */}
        {edges.map((c, i) => {
          const a = byRef.get(c.passerRef)!, b = byRef.get(c.receiverRef)!;
          const w = 0.5 + 2.6 * ((c.passes ?? 0) / (net.maxEdgePasses || 1));
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={obvColor(c.obv, maxAbs)} strokeWidth={w} strokeOpacity={0.7} strokeLinecap="round" />;
        })}
        {/* nodes */}
        {nodes.map((n) => {
          const r = 2.4 + 3.4 * ((passesOf.get(n.ref) ?? 0) / (net.maxPlayerPasses || 1));
          const p = players.find((x) => x.ref === n.ref);
          return (
            <g key={n.ref}>
              <circle cx={n.x} cy={n.y} r={r} fill={obvColor(p?.obv ?? null, maxAbs)} stroke="#334155" strokeWidth={0.5} />
              <text x={n.x} y={n.y - r - 1} fontSize={2.7} textAnchor="middle" fill="#334155">{lastName(n.name)}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-400">
        <span>{is ? T.IS.schematic : T.EN.schematic}</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: "#a83e28" }} />–OBV</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: "#1c7a4a" }} />+OBV</span>
      </div>
    </div>
  );
}

function CombosTables({ combos, is }: { combos: SideCombo[]; is: boolean }) {
  const t = is ? T.IS : T.EN;
  const net = buildPassingNetwork([], combos.map<PassingEdge>((c) => ({ passerRef: c.passerRef, passerName: c.passerName, receiverRef: c.receiverRef, receiverName: c.receiverName, passes: c.passes, obv: c.obv })), 6);
  const Row = ({ c }: { c: PassingEdge }) => (
    <li className="flex items-center justify-between gap-2 text-[12px]">
      <span className="text-slate-700 truncate">{c.passerName.split(" ").slice(-1)[0]} <span className="text-slate-400">→</span> {c.receiverName.split(" ").slice(-1)[0]}</span>
      <span className="shrink-0 tabular-nums"><b className="text-slate-800">{c.passes ?? 0}</b> <span className={`text-[11px] font-medium ${(c.obv ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtObv(c.obv)}</span></span>
    </li>
  );
  if (!combos.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t.topVolume}</div>
        <ul className="space-y-0.5">{net.topByVolume.map((c, i) => <Row key={i} c={c} />)}</ul>
      </div>
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t.topObv}</div>
        <ul className="space-y-0.5">{net.topByObv.map((c, i) => <Row key={i} c={c} />)}</ul>
      </div>
    </div>
  );
}

function PlayerBars({ players, is }: { players: SidePlayer[]; is: boolean }) {
  const t = is ? T.IS : T.EN;
  const rows = [...players].sort((a, b) => (b.obv ?? 0) - (a.obv ?? 0));
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.obv ?? 0)), 1e-6);
  if (!rows.length) return null;
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t.passers}</div>
      <div className="space-y-1">
        {rows.map((p) => {
          const pct = Math.min(100, (Math.abs(p.obv ?? 0) / maxAbs) * 100);
          const pos = (p.obv ?? 0) >= 0;
          return (
            <div key={p.ref} className="flex items-center gap-2 text-[12px]">
              <span className="w-28 shrink-0 truncate text-slate-700">{p.name.split(" ").slice(-1)[0]}</span>
              <div className="relative h-3 flex-1 overflow-hidden rounded bg-slate-100">
                <div className="absolute top-0 bottom-0 w-px bg-slate-300" style={{ left: "50%" }} />
                <div className="absolute inset-y-0 rounded" style={pos
                  ? { left: "50%", width: `${pct / 2}%`, background: "#1c7a4a" }
                  : { right: "50%", width: `${pct / 2}%`, background: "#a83e28" }} />
              </div>
              <span className={`w-12 shrink-0 text-right tabular-nums text-[11px] font-semibold ${pos ? "text-emerald-600" : "text-red-500"}`}>{fmtObv(p.obv)}</span>
              <span className="w-14 shrink-0 text-right tabular-nums text-[11px] text-slate-400">{p.passes ?? 0} {t.passes}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PassingNetworkPanel({ date }: { date?: string }) {
  const [langRaw] = useLang();
  const is = langRaw === "IS";
  const lang: Lang = is ? "IS" : "EN";
  const t = T[lang];
  const [data, setData] = React.useState<Payload | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [side, setSide] = React.useState<"own" | "opp">("own");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoaded(false);
    const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
    if (!tok || !date) { setLoaded(true); setData(null); return; }
    const res = await fetch(`/api/coach/pass-network?date=${date}`, { headers: { Authorization: `Bearer ${tok}` } })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setData(res as Payload); setLoaded(true);
  }, [date]);

  React.useEffect(() => { void load(); }, [load]);

  async function upload(file: File) {
    if (!date) { setMsg(t.noDate); return; }
    setBusy(true); setMsg(null);
    try {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
      const fd = new FormData();
      fd.set("phase", "commit"); fd.set("match_date", date); fd.set("file", file);
      const r = await fetch("/api/coach/pass-network/upload", { method: "POST", headers: tok ? { Authorization: `Bearer ${tok}` } : {}, body: fd }).then((x) => x.json());
      if (r?.ok) { setMsg(`✓ ${r.kind === "pass_combinations" ? (r.rowsUpserted + " combinations") : (r.rowsUpserted + " players")}`); await load(); }
      else setMsg(r?.error ?? "Failed");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); }
    setBusy(false);
  }

  const cur = data?.hasData ? (side === "own" ? data.own : data.opp) : undefined;
  const teamLabel = (s: "own" | "opp") => (data?.[s]?.teamName) ?? (s === "own" ? t.us : t.opp);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-bold text-slate-900">{t.title}</div>
      <p className="mt-0.5 text-[11px] text-slate-400">{t.purpose}</p>

      {!loaded ? <p className="mt-2 text-sm text-slate-400">…</p> : !data?.hasData ? (
        <p className="mt-2 text-[13px] text-slate-500">{t.empty}</p>
      ) : (
        <>
          <div className="mt-2 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[12px]">
            <button onClick={() => setSide("own")} className={`rounded-md px-2.5 py-0.5 font-medium ${side === "own" ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>{teamLabel("own")}</button>
            <button onClick={() => setSide("opp")} className={`rounded-md px-2.5 py-0.5 font-medium ${side === "opp" ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>{teamLabel("opp")}</button>
          </div>

          {cur && (cur.players.length > 0 || cur.combos.length > 0) ? (
            <div className="mt-3 space-y-4">
              {side === "own" ? (
                <PitchNetwork players={cur.players} combos={cur.combos} is={is} />
              ) : (
                <p className="text-[11px] text-slate-400">{t.noPitch}</p>
              )}
              <CombosTables combos={cur.combos} is={is} />
              <PlayerBars players={cur.players} is={is} />
            </div>
          ) : <p className="mt-2 text-[13px] text-slate-500">{t.empty}</p>}
        </>
      )}

      {/* Uploader */}
      <div className="mt-3 border-t border-slate-100 pt-2">
        <label className="text-[12px] font-medium text-[#2740e6]">
          {busy ? t.uploading : t.upload}
          <input type="file" accept=".csv,.xlsx,.xls" disabled={busy || !date} className="ml-2 text-[11px] text-slate-500"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.currentTarget.value = ""; }} />
        </label>
        <p className="mt-0.5 text-[10px] text-slate-400">{t.uploadHint}</p>
        {msg && <p className="mt-1 text-[11px] text-slate-600">{msg}</p>}
      </div>
    </div>
  );
}

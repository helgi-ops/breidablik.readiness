"use client";

/**
 * PassingNetworkPanel — StatsBomb passing network for one match (Single Match Analysis).
 *
 * From the two StatsBomb OBV exports (per-player Pass network + Passing Combinations):
 * top-combination tables (most frequent + most valuable links by OBV) and per-player
 * passing-OBV bars, for both teams (own/opp toggle). Descriptive — never touches the
 * readiness colour. (A schematic pitch was tried and removed — the CSVs carry no
 * coordinates, so the tables/bars are the honest read.)
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { buildPassingNetwork, type PassingEdge } from "@/lib/micropulse/passingNetwork";

type Lang = "EN" | "IS";
type SidePlayer = { ref: string; name: string; playerId: string | null; position: string | null; passes: number | null; obv: number | null };
type SideCombo = { passerRef: string; passerName: string; receiverRef: string; receiverName: string; passes: number | null; obv: number | null };
type SideData = { teamName: string | null; players: SidePlayer[]; combos: SideCombo[] };
type Payload = { ok: boolean; hasData: boolean; date: string; own?: SideData; opp?: SideData };

const T = {
  EN: { title: "Passing network", purpose: "Who passes to whom, and the value of each link (StatsBomb OBV). Descriptive — never touches readiness.",
    empty: "No passing network for this match yet. Upload the StatsBomb 'Pass network' and 'Passing Combinations' CSVs below.",
    us: "Us", opp: "Opponent",
    topVolume: "Most frequent links", topObv: "Most valuable links (OBV)", passers: "Passing value per player (OBV)",
    passes: "passes",
    upload: "Upload passing file", uploadHint: "StatsBomb 'Pass network' (Team/Player/Passes/OBV) or 'Passing Combinations' (Team/Passer/Receiver/Passes/OBV). Upload each; the match date is this match.",
    uploading: "Uploading…", noDate: "Pick a match first." },
  IS: { title: "Sendinganet", purpose: "Hver sendir á hvern, og virði hverrar tengingar (StatsBomb OBV). Lýsandi — snertir aldrei readiness.",
    empty: "Ekkert sendinganet fyrir þennan leik enn. Hladdu upp StatsBomb 'Pass network' og 'Passing Combinations' CSV-unum hér að neðan.",
    us: "Við", opp: "Andstæðingur",
    topVolume: "Tíðustu tengingar", topObv: "Verðmætustu tengingar (OBV)", passers: "Sendingavirði á leikmann (OBV)",
    passes: "sendingar",
    upload: "Hlaða upp sendingaskrá", uploadHint: "StatsBomb 'Pass network' (Team/Player/Passes/OBV) eða 'Passing Combinations' (Team/Passer/Receiver/Passes/OBV). Hladdu hverri upp; leikdagur er þessi leikur.",
    uploading: "Hleð upp…", noDate: "Veldu leik fyrst." },
} as const;

const fmtObv = (v: number | null): string => (v == null ? "–" : (v >= 0 ? "+" : "") + v.toFixed(2));

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

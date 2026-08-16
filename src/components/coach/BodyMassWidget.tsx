"use client";

/**
 * Body-mass widget — record and read a player's bodyweight (#5 anthropometry input).
 * Shows the resolved mass (coach entry preferred, else VALD CMJ weight) with provenance, and
 * an inline entry to record a new measurement. Enables per-kg figures where mass is known;
 * never assumes a default. Descriptive — never touches readiness.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { BodyMassResolved } from "@/lib/micropulse/load/bodyMass";

type Resp = { ok: boolean; resolved?: BodyMassResolved; valdWeight?: number | null };

export default function BodyMassWidget({ playerId }: { playerId: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [data, setData] = React.useState<Resp | null>(null);
  const [entry, setEntry] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);
  const load = React.useCallback(async () => {
    const tok = await token(); if (!tok || !playerId) return;
    const res = await fetch(`/api/coach/player/${playerId}/body-mass`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
    const j = await res.json().catch(() => null);
    setData(j && j.ok ? j : null);
  }, [playerId, token]);
  React.useEffect(() => { setMsg(null); setEntry(""); void load(); }, [load]);

  async function save() {
    const massKg = Number(entry);
    if (!Number.isFinite(massKg) || massKg <= 20 || massKg >= 200) { setMsg(is ? "Sláðu inn 20–200 kg." : "Enter 20–200 kg."); return; }
    setBusy(true); setMsg(null);
    try {
      const tok = await token(); if (!tok) return;
      const res = await fetch(`/api/coach/player/${playerId}/body-mass`, {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ massKg }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setMsg(j.error ?? "Error"); return; }
      setEntry(""); await load();
    } finally { setBusy(false); }
  }

  const r = data?.resolved;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-slate-800">{is ? "Líkamsþyngd" : "Body mass"}</span>
        {r?.massKg != null ? (
          <>
            <span className="font-[Archivo,sans-serif] text-lg font-bold tabular-nums text-slate-900">{r.massKg} kg</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${r.source === "coach" ? "bg-emerald-100 text-emerald-700" : r.source === "vald" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>
              {r.source === "coach" ? (is ? "skráð" : "recorded") : r.source === "vald" ? "VALD" : r.source}
            </span>
            {r.measuredOn ? <span className="text-[11px] text-slate-400">{r.measuredOn}</span> : null}
          </>
        ) : (
          <span className="text-[12px] text-slate-500">{is ? "Engin þyngd skráð" : "No mass on file"}</span>
        )}
      </div>
      {r?.note ? <p className="mt-0.5 text-[11px] text-slate-400">{r.note}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <input value={entry} onChange={(e) => setEntry(e.target.value)} inputMode="decimal" placeholder={is ? "kg" : "kg"}
          className="w-20 rounded border border-slate-300 px-2 py-1 text-[13px] tabular-nums" />
        <button onClick={() => void save()} disabled={busy || !entry} className="rounded-lg bg-[#2740e6] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40">
          {busy ? "…" : (is ? "Skrá þyngd" : "Record mass")}
        </button>
        {msg ? <span className="text-[11px] font-medium text-red-700">{msg}</span> : null}
      </div>
    </div>
  );
}

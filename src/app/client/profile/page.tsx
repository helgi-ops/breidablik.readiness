"use client";

/**
 * /client/profile — minimal "Me" tab for the PT-client PWA.
 *   - Bodyweight: quick add (today), recent log + sparkline
 *   - Future: measurements, goals
 */

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import LineSpark from "@/components/client/LineSpark";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Log = { id: string; log_date: string; weight_kg: number; notes: string | null };

function todayIso() {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export default function ClientProfilePage() {
  const [lang] = useLang();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Quick-add form
  const [weight, setWeight] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/client/bodyweight?days=180", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) { setErr(json.error ?? "Failed"); return; }
      setLogs((json.logs ?? []) as Log[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    const w = Number(weight);
    if (!Number.isFinite(w) || w <= 0) {
      setErr(lang === "IS" ? "Sláðu inn gilda þyngd" : "Enter a valid weight");
      return;
    }
    setSaving(true); setErr(null); setSavedMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not signed in");
      const res = await fetch("/api/client/bodyweight", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ weight_kg: w, log_date: todayIso() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) { setErr(json.error ?? "Failed"); return; }
      setSavedMsg(lang === "IS" ? "Vistað." : "Saved.");
      setWeight("");
      void load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const latest = logs[logs.length - 1] ?? null;
  const first = logs[0] ?? null;

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xl font-semibold text-slate-900">
          {lang === "IS" ? "Mín gögn" : "Me"}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {lang === "IS"
            ? "Líkamsþyngd & framvinda yfir tíma."
            : "Body weight & progression over time."}
        </div>
      </div>

      {/* Quick add */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
        <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">
          {lang === "IS" ? "Skrá þyngd dagsins" : "Log today's weight"}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number" step="0.1" inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="kg"
            className="flex-1 rounded-lg border bg-white px-3 py-2 text-sm tabular-nums"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving || !weight}
            className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? (lang === "IS" ? "Vista…" : "Saving…") : (lang === "IS" ? "Vista" : "Save")}
          </button>
        </div>
        {savedMsg && <div className="text-xs text-emerald-700">{savedMsg}</div>}
        {err && <div className="text-xs text-red-700">{err}</div>}
      </div>

      {/* Trend */}
      {loading ? (
        <div className="text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {lang === "IS" ? "Engin þyngdarskráning enn." : "No weight logs yet."}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">
                {lang === "IS" ? "Nýjasta" : "Latest"}
              </div>
              <div className="text-xl font-semibold text-slate-900 tabular-nums">
                {latest?.weight_kg.toFixed(1)}
              </div>
              <div className="text-[10px] text-slate-500">{latest?.log_date}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">
                {lang === "IS" ? "Fjöldi" : "Logs"}
              </div>
              <div className="text-xl font-semibold text-slate-900 tabular-nums">
                {logs.length}
              </div>
              <div className="text-[10px] text-slate-500">{lang === "IS" ? "skráningar" : "entries"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">
                Δ {lang === "IS" ? "frá byrjun" : "since start"}
              </div>
              {latest && first && (
                <>
                  <div className={`text-xl font-semibold tabular-nums ${
                    latest.weight_kg - first.weight_kg > 0
                      ? "text-amber-700"
                      : latest.weight_kg - first.weight_kg < 0
                      ? "text-emerald-700"
                      : "text-slate-700"
                  }`}>
                    {latest.weight_kg - first.weight_kg > 0 ? "+" : ""}{(latest.weight_kg - first.weight_kg).toFixed(1)}
                  </div>
                  <div className="text-[10px] text-slate-500">kg</div>
                </>
              )}
            </div>
          </div>

          <LineSpark
            data={logs.map((l) => ({ x: l.log_date, y: l.weight_kg, marker: null }))}
            height={140}
            yLabel="kg"
          />
        </div>
      )}
    </div>
  );
}

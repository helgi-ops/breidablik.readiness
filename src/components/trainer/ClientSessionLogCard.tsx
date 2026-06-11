"use client";

/**
 * ClientSessionLogCard — the trainer's read-only view of how a client logged
 * their sessions. Opens on the LAST session (exactly what the client entered:
 * per-set weight × reps × RPE, plus Foster sRPE × duration) and lets the
 * trainer step back through history one session at a time. Read-only: it shows
 * the client's own entries, it never edits them.
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type SetEntry = { set_number: number; weight_kg: number | null; reps: number | null; rpe: number | null; notes: string | null };
type Exercise = { name: string; sets: SetEntry[] };
type Session = {
  date: string;
  exercises: Exercise[];
  totalSets: number;
  totalExercises: number;
  volume_kg: number;
  session_rpe: number | null;
  duration_minutes: number | null;
  session_load: number | null;
};
type Resp = { ok: boolean; totalSessions: number; sessions: Session[]; error?: string };

const fmtDate = (iso: string, is: boolean) => {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(is ? "is-IS" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

export default function ClientSessionLogCard({ clientId, lang }: { clientId: string; lang: "EN" | "IS" }) {
  const is = lang === "IS";
  const [data, setData] = useState<Resp | null>(null);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`/api/trainer/client/${clientId}/sessions`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const j = (await res.json()) as Resp;
      if (!res.ok) { setErr(j.error ?? "Failed"); return; }
      setData(j); setIdx(0);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  }, [clientId]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-500">{is ? "Hleð skráningum…" : "Loading sessions…"}</div>;
  if (err) return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{err}</div>;
  if (!data || data.sessions.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-500">
        {is ? "Engin skráð æfing enn — birtist hér um leið og viðskiptavinurinn skráir sett." : "No logged sessions yet — appears here as soon as the client logs sets."}
      </div>
    );
  }

  const sessions = data.sessions;
  const s = sessions[idx];
  const atNewest = idx === 0;
  const atOldest = idx === sessions.length - 1;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {is ? "Skráning æfinga" : "Logged sessions"}
        </span>
        {atNewest && <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{is ? "síðasta" : "latest"}</span>}
        {/* Stepper: ◀ older … newer ▶ */}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIdx((i) => Math.min(sessions.length - 1, i + 1))}
            disabled={atOldest}
            title={is ? "Eldri æfing" : "Older session"}
            className="rounded-md border border-slate-200 px-2 py-0.5 text-[12px] font-medium text-slate-600 enabled:hover:bg-slate-50 disabled:opacity-40"
          >◀</button>
          <span className="min-w-[88px] text-center text-[11px] tabular-nums text-slate-500">
            {sessions.length - idx}/{data.totalSessions}
          </span>
          <button
            type="button"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={atNewest}
            title={is ? "Nýrri æfing" : "Newer session"}
            className="rounded-md border border-slate-200 px-2 py-0.5 text-[12px] font-medium text-slate-600 enabled:hover:bg-slate-50 disabled:opacity-40"
          >▶</button>
        </div>
      </div>

      {/* Session header + summary chips */}
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-slate-900">{fmtDate(s.date, is)}</span>
        <span className="text-[10px] text-slate-400">{s.date}</span>
        <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{s.totalExercises} {is ? "æfingar" : "exercises"}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{s.totalSets} {is ? "sett" : "sets"}</span>
        {s.volume_kg > 0 && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{is ? "magn" : "volume"} {n0(s.volume_kg)} kg</span>}
        {s.session_rpe != null && (
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
            sRPE {s.session_rpe}{s.duration_minutes != null ? ` × ${s.duration_minutes}m` : ""}{s.session_load != null ? ` = ${n0(s.session_load)}` : ""}
          </span>
        )}
      </div>

      {/* Per-exercise sets, exactly as logged */}
      <div className="space-y-2">
        {s.exercises.map((ex) => (
          <div key={ex.name} className="rounded-md border border-slate-100 bg-slate-50/50 p-2">
            <div className="mb-1 text-xs font-medium text-slate-800">{ex.name}</div>
            <div className="flex flex-wrap gap-1.5">
              {ex.sets.map((st) => (
                <span key={st.set_number} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] tabular-nums text-slate-700" title={st.notes ?? undefined}>
                  <span className="text-[9px] text-slate-400">{st.set_number}</span>
                  <span className="font-medium">{st.weight_kg != null ? `${st.weight_kg}kg` : "—"}</span>
                  <span className="text-slate-400">×</span>
                  <span className="font-medium">{st.reps ?? "—"}</span>
                  {st.rpe != null && <span className="text-indigo-600">@{st.rpe}</span>}
                  {st.notes && <span className="text-[9px] text-amber-500">✎</span>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
        {is
          ? "Nákvæmlega eins og viðskiptavinurinn skráði: þyngd × reps @ RPE per sett, og sRPE × mínútur = álag. Notaðu ◀ ▶ til að fletta í gegnum fyrri æfingar. Skoðun aðeins — breytir engu."
          : "Exactly as the client logged it: weight × reps @ RPE per set, and sRPE × minutes = load. Use ◀ ▶ to page through past sessions. Read-only — nothing is changed."}
      </p>
    </div>
  );
}

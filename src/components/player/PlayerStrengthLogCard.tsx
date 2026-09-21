"use client";

/**
 * Player quick strength log — log a working set (weight × reps × RPE) for a main lift. Feeds the
 * non-VBT objective loop: the sets become e1RM / working-1RM (server side) → %1RM prescriptions turn
 * into kg, and RPE drives coach-approved autoregulation. Descriptive — the e1RM never sets the
 * readiness colour or the daily decision (session load stays on the gym sRPE path).
 *
 * Fast: pick a lift, enter weight / reps / RPE, Add set. Set index continues after today's logged
 * sets for that lift (fetched once) so re-opening doesn't overwrite. Bilingual.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

// Main barbell lifts (names chosen so canonicalLift resolves them server-side).
const MAIN_LIFTS = ["Back Squat", "Front Squat", "Bench Press", "Deadlift", "Romanian Deadlift", "Overhead Press", "Hip Thrust", "Power Clean", "Pull-up", "Row"] as const;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_");

export default function PlayerStrengthLogCard() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [lift, setLift] = React.useState<string>(MAIN_LIFTS[0]);
  const [weight, setWeight] = React.useState("");
  const [reps, setReps] = React.useState("");
  const [rpe, setRpe] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [nextIndex, setNextIndex] = React.useState<Record<string, number>>({});

  const today = new Date().toISOString().slice(0, 10);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null;
      if (!tok) return;
      const res = await fetch("/api/player/strength-log?days=1", { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!alive || !j?.ok) return;
      const counts: Record<string, number> = {};
      for (const s of (j.sets ?? []) as Array<{ session_date: string; exercise_id: string; set_index: number }>) {
        if (s.session_date !== today) continue;
        counts[s.exercise_id] = Math.max(counts[s.exercise_id] ?? -1, s.set_index);
      }
      setNextIndex(Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v + 1])));
    })();
    return () => { alive = false; };
  }, [today]);

  async function addSet() {
    const w = Number(weight), r = Number(reps), rp = rpe === "" ? null : Number(rpe);
    if (!Number.isFinite(w) || w <= 0) { setMsg(is ? "Sláðu inn þyngd." : "Enter a weight."); return; }
    if (!Number.isFinite(r) || r <= 0) { setMsg(is ? "Sláðu inn endurtekningar." : "Enter reps."); return; }
    if (rp != null && (rp < 0 || rp > 10)) { setMsg(is ? "RPE 0–10." : "RPE 0–10."); return; }
    setBusy(true); setMsg(null);
    try {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null;
      if (!tok) return;
      const exId = slug(lift);
      const setIndex = nextIndex[exId] ?? 0;
      const res = await fetch("/api/player/strength-log", {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ session_date: today, exercise_id: exId, exercise_name: lift, set_index: setIndex, weight_kg: w, reps: r, rpe: rp }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setMsg(j.error ?? "Error"); return; }
      setNextIndex((p) => ({ ...p, [exId]: setIndex + 1 }));
      setMsg(is ? `✓ Sett ${setIndex + 1} skráð` : `✓ Set ${setIndex + 1} logged`);
      setWeight(""); setReps(""); setRpe("");
    } finally { setBusy(false); }
  }

  const inputCls = "w-16 rounded border border-slate-300 px-2 py-1 text-[13px] tabular-nums";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Skrá styrktarsett" : "Log a strength set"}</div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-slate-500">{is ? "Æfing" : "Lift"}
          <select value={lift} onChange={(e) => setLift(e.target.value)} className="mt-0.5 block rounded border border-slate-300 px-2 py-1 text-[13px]">
            {MAIN_LIFTS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-slate-500">{is ? "kg" : "kg"}
          <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" className={`mt-0.5 block ${inputCls}`} />
        </label>
        <label className="text-[11px] text-slate-500">{is ? "endurt." : "reps"}
          <input value={reps} onChange={(e) => setReps(e.target.value)} inputMode="numeric" className={`mt-0.5 block ${inputCls}`} />
        </label>
        <label className="text-[11px] text-slate-500">RPE
          <input value={rpe} onChange={(e) => setRpe(e.target.value)} inputMode="decimal" placeholder="8" className={`mt-0.5 block ${inputCls}`} />
        </label>
        <button onClick={() => void addSet()} disabled={busy} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
          {busy ? "…" : (is ? "+ Sett" : "+ Set")}
        </button>
        {msg ? <span className={`text-[11px] font-medium ${msg.startsWith("✓") ? "text-emerald-600" : "text-red-700"}`}>{msg}</span> : null}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
        {is
          ? "Skráðu vinnusett svo kerfið meti 1RM (úr þyngd × endurt. × RPE) og breyti %1RM í kg. Lýsandi — hefur ekki áhrif á readiness."
          : "Log working sets so the system estimates your 1RM (from weight × reps × RPE) and turns %1RM into kg. Descriptive — no effect on readiness."}
      </p>
    </div>
  );
}

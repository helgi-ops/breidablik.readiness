"use client";

/**
 * Add-exercise admin — a coach/admin adds a club exercise and TAGS it with the
 * compensations it addresses (the routing key). Once saved it flows through the
 * same screen → compensation → corrective-plan pipeline as every built-in, no code
 * change. Screening / training only — never a diagnosis, never the readiness colour.
 */
import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import { CORRECTIVE_PHASE_LABEL, type CorrectivePhase, type CompensationKey } from "@/lib/micropulse/movementScreen/correctives/registry";
import { compensationLabel } from "@/lib/micropulse/movementScreen/correctives/mapping";

const PHASES: CorrectivePhase[] = ["inhibit", "lengthen", "activate", "integrate"];
const COMPENSATIONS: CompensationKey[] = [
  "dynamic_valgus", "hip_abductor_weakness", "forward_trunk_lean", "limited_dorsiflexion",
  "low_reactive_strength", "poor_absorption", "landing_instability", "limb_asymmetry",
];
const GRADES = ["strong", "moderate", "emerging"] as const;

type Item = { slug: string; name?: Bi; phase?: string; target?: Bi; dose?: Bi; addresses?: CompensationKey[]; source?: string };

export default function AddExerciseForm() {
  const [lang] = useLang();
  const is = lang === "IS";
  const T = (en: string, isT: string) => (is ? isT : en);
  const L = (b?: Bi) => (b ? (is ? b.is : b.en) : "");

  const [nameEn, setNameEn] = React.useState(""); const [nameIs, setNameIs] = React.useState("");
  const [targetEn, setTargetEn] = React.useState(""); const [targetIs, setTargetIs] = React.useState("");
  const [doseEn, setDoseEn] = React.useState(""); const [doseIs, setDoseIs] = React.useState("");
  const [cueEn, setCueEn] = React.useState(""); const [cueIs, setCueIs] = React.useState("");
  const [phase, setPhase] = React.useState<CorrectivePhase>("activate");
  const [grade, setGrade] = React.useState<(typeof GRADES)[number]>("moderate");
  const [videoUrl, setVideoUrl] = React.useState("");
  const [addresses, setAddresses] = React.useState<Set<CompensationKey>>(new Set());
  const [items, setItems] = React.useState<Item[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "", []);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/coach/corrective-exercises", { headers: { Authorization: `Bearer ${await token()}` } });
    const j = await res.json().catch(() => ({}));
    setItems(res.ok && Array.isArray(j.items) ? (j.items as Item[]) : []);
  }, [token]);
  React.useEffect(() => { load(); }, [load]);

  const toggle = (k: CompensationKey) => setAddresses((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const submit = async () => {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/coach/corrective-exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({
          name: { en: nameEn, is: nameIs || nameEn },
          target: { en: targetEn, is: targetIs || targetEn },
          dose: { en: doseEn, is: doseIs || doseEn },
          cue: cueEn ? { en: cueEn, is: cueIs || cueEn } : undefined,
          phase, evidenceGrade: grade, videoUrl: videoUrl || undefined,
          addresses: [...addresses],
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setMsg(T("Saved — it now routes from a matching screen finding.", "Vistað — birtist nú út frá samsvarandi skimunar-niðurstöðu."));
      setNameEn(""); setNameIs(""); setTargetEn(""); setTargetIs(""); setDoseEn(""); setDoseIs(""); setCueEn(""); setCueIs(""); setVideoUrl(""); setAddresses(new Set());
      await load();
    } catch (e) { setMsg((T("Save failed", "Vistun brást")) + ": " + (e instanceof Error ? e.message : "error")); }
    finally { setSaving(false); }
  };

  const canSave = nameEn.trim() && targetEn.trim() && doseEn.trim() && addresses.size > 0;
  const field = "mt-0.5 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]";

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">{T("Add a club exercise", "Bæta við æfingu félags")}</h3>
        <p className="mt-1 text-[11px] text-slate-500">{T("Tag the exercise with the compensations it treats — that key routes it to the matching movement-screen finding automatically. Custom exercises are private to your team.", "Merktu æfinguna með þeim uppbótum sem hún vinnur á — sá lykill leiðir hana sjálfkrafa að samsvarandi skimunar-niðurstöðu. Æfingar félags eru einkaeign liðsins.")}</p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-[12px] text-slate-600">{T("Name (EN)", "Heiti (EN)")}<input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={field} /></label>
          <label className="text-[12px] text-slate-600">{T("Name (IS)", "Heiti (IS)")}<input value={nameIs} onChange={(e) => setNameIs(e.target.value)} className={field} /></label>
          <label className="text-[12px] text-slate-600">{T("Target (EN)", "Markmið (EN)")}<input value={targetEn} onChange={(e) => setTargetEn(e.target.value)} placeholder={T("e.g. Gluteus medius", "t.d. Gluteus medius")} className={field} /></label>
          <label className="text-[12px] text-slate-600">{T("Target (IS)", "Markmið (IS)")}<input value={targetIs} onChange={(e) => setTargetIs(e.target.value)} className={field} /></label>
          <label className="text-[12px] text-slate-600">{T("Dose (EN)", "Skammtur (EN)")}<input value={doseEn} onChange={(e) => setDoseEn(e.target.value)} placeholder="3 × 12 / side" className={field} /></label>
          <label className="text-[12px] text-slate-600">{T("Dose (IS)", "Skammtur (IS)")}<input value={doseIs} onChange={(e) => setDoseIs(e.target.value)} className={field} /></label>
          <label className="text-[12px] text-slate-600">{T("Cue (EN, optional)", "Vísbending (EN, valfrjálst)")}<input value={cueEn} onChange={(e) => setCueEn(e.target.value)} className={field} /></label>
          <label className="text-[12px] text-slate-600">{T("Cue (IS, optional)", "Vísbending (IS, valfrjálst)")}<input value={cueIs} onChange={(e) => setCueIs(e.target.value)} className={field} /></label>
          <label className="text-[12px] text-slate-600">{T("Phase", "Fasi")}
            <select value={phase} onChange={(e) => setPhase(e.target.value as CorrectivePhase)} className={field}>
              {PHASES.map((p) => <option key={p} value={p}>{L(CORRECTIVE_PHASE_LABEL[p])}</option>)}
            </select>
          </label>
          <label className="text-[12px] text-slate-600">{T("Evidence grade", "Gæðaflokkur heimilda")}
            <select value={grade} onChange={(e) => setGrade(e.target.value as (typeof GRADES)[number])} className={field}>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label className="text-[12px] text-slate-600 sm:col-span-2">{T("Video URL (optional)", "Myndbands-slóð (valfrjálst)")}<input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…" className={field} /></label>
        </div>

        <div className="mt-3">
          <p className="text-[12px] font-semibold text-slate-700">{T("Addresses (the routing key) — pick ≥ 1", "Vinnur á (leiðar-lykillinn) — veldu ≥ 1")}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {COMPENSATIONS.map((k) => {
              const on = addresses.has(k);
              return (
                <button key={k} type="button" onClick={() => toggle(k)} className={`rounded-lg border px-2 py-1 text-[11px] ${on ? "border-[#2740e6] bg-[#2740e6]/10 font-semibold text-[#2740e6]" : "border-slate-300 text-slate-600"}`}>
                  {L(compensationLabel(k))}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={submit} disabled={!canSave || saving} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
            {saving ? T("Saving…", "Vista…") : T("Add exercise", "Bæta við æfingu")}
          </button>
          {msg && <span className="text-[11px] text-slate-600">{msg}</span>}
        </div>
      </div>

      {/* Existing club exercises */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{T("Club exercises", "Æfingar félags")} ({items.length})</p>
        {items.length === 0 ? (
          <p className="mt-1 text-[12px] text-slate-500">{T("None yet — add your first above.", "Engar enn — bættu þeirri fyrstu við að ofan.")}</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {items.map((it) => (
              <li key={it.slug} className="text-[12px]">
                <span className="font-semibold text-slate-800">{L(it.name)}</span>
                <span className="ml-1 text-[10px] text-slate-400">· {L(it.target)} · {L(it.dose)}</span>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {(it.addresses ?? []).map((a) => <span key={a} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{L(compensationLabel(a))}</span>)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

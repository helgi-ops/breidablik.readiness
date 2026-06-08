"use client";

/**
 * AutoProgressionCard — the trainer's view of the auto-progression engine for a
 * client: per lift, the working 1RM the programme prescribes against, whether it
 * auto-raised from corroborated logged performance, and whether a retest is due.
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Lift = {
  lift: string;
  working_one_rm: number;
  source: "tested" | "auto" | "logged";
  tested: number | null;
  needs_retest: boolean;
  pct_vs_tested: number | null;
  test_date: string | null;
  last_log: { date: string; weight: number; reps: number; e1rm: number } | null;
};
type Resp = { summary: { total: number; autoRaised: number; retests: number; loggedOnly: number }; lifts: Lift[] };

const SRC: Record<string, { label: { EN: string; IS: string }; cls: string }> = {
  tested: { label: { EN: "tested", IS: "prófað" }, cls: "bg-slate-100 text-slate-600" },
  auto: { label: { EN: "auto ↑", IS: "sjálfv. ↑" }, cls: "bg-emerald-100 text-emerald-700" },
  logged: { label: { EN: "from logs", IS: "úr skráningu" }, cls: "bg-sky-100 text-sky-700" },
};
const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function AutoProgressionCard({ clientId, lang }: { clientId: string; lang: "EN" | "IS" }) {
  const is = lang === "IS";
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`/api/trainer/client/${clientId}/auto-progression`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const j = await res.json();
      if (!res.ok) { setErr(j.error ?? "Failed"); return; }
      setData(j as Resp);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  }, [clientId]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-500">{is ? "Hleð auto-progression…" : "Loading auto-progression…"}</div>;
  if (err) return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{err}</div>;
  if (!data || data.lifts.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-500">
        {is
          ? "Engin working-1RM enn — bættu LV-prófi eða skráðu nokkrar æfingar, þá hækkar kerfið load sjálfkrafa."
          : "No working 1RM yet — add an LV test or log a few sessions and the system auto-raises loads."}
      </div>
    );
  }

  const { summary, lifts } = data;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Auto-progression (working 1RM)" : "Auto-progression (working 1RM)"}</span>
        {summary.autoRaised > 0 && <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{summary.autoRaised} {is ? "hækkuð" : "auto-raised"}</span>}
        {summary.retests > 0 && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">{summary.retests} {is ? "endurpróf" : "retest due"}</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">{is ? "Lyfta" : "Lift"}</th>
              <th className="px-2 py-1 text-right">{is ? "Working 1RM" : "Working 1RM"}</th>
              <th className="px-2 py-1 text-left">{is ? "Heimild" : "Source"}</th>
              <th className="px-2 py-1 text-right">{is ? "vs prófað" : "vs tested"}</th>
              <th className="px-2 py-1 text-right">{is ? "Síðasta skráning" : "Last logged"}</th>
            </tr>
          </thead>
          <tbody>
            {lifts.map((l) => (
              <tr key={l.lift} className="border-t border-slate-100">
                <td className="px-2 py-1 font-medium text-slate-800">
                  {titleCase(l.lift)}
                  {l.needs_retest && <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-700">{is ? "endurpróf" : "retest"}</span>}
                </td>
                <td className="px-2 py-1 text-right font-semibold tabular-nums">{l.working_one_rm} kg</td>
                <td className="px-2 py-1 text-left">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SRC[l.source]?.cls ?? "bg-slate-100 text-slate-600"}`}>{SRC[l.source]?.label[lang] ?? l.source}</span>
                </td>
                <td className={`px-2 py-1 text-right tabular-nums ${l.pct_vs_tested != null && l.pct_vs_tested > 0 ? "text-emerald-600 font-medium" : "text-slate-500"}`}>
                  {l.tested != null ? (l.pct_vs_tested != null ? `${l.pct_vs_tested > 0 ? "+" : ""}${l.pct_vs_tested}%` : "—") : (is ? "ekkert próf" : "no test")}
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-slate-500">
                  {l.last_log ? `${l.last_log.weight}×${l.last_log.reps} (e1RM ${l.last_log.e1rm})` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
        {is
          ? "Working 1RM = það sem kerfið skammtar prósentur af. Það byrjar á prófuðu 1RM (LV-prófi) og hækkar SJÁLFKRAFA þegar skráð e1RM slær prófið á ≥2 æfingum (innan +10% þaks). Yfir þakið → læst og „endurpróf“ flaggað. Lækkanir koma frá readiness/endurprófi, ekki hér."
          : "Working 1RM = what the system prescribes %s against. It starts at the tested 1RM (LV test) and auto-raises when logged e1RM beats the test on ≥2 sessions (within a +10% cap). Above the cap it locks and flags a retest. Decreases come from readiness/retest, not here."}
      </p>
    </div>
  );
}

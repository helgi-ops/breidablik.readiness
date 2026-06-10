"use client";

/**
 * UnfamiliarLoadCard — the Driver-layer "what to look at today" surface.
 *
 * Signal-level attention routing (docs/unfamiliar-load.md, Phase 2): instead of
 * the coach hunting across cards, this names the player AND the movement
 * component that drifted from his own norm, in one sentence, with the why, a
 * counterfactual, a suggested action, and a dismiss-with-reason (audited).
 * Players moving like themselves never appear. Explainability-first: plain
 * verdict on top; the z-scores / SD jargon live behind a "Show signals" toggle.
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import MovementNarrativeModal from "@/components/coach/MovementNarrativeModal";

type Driver = { key: string; label: string; z: number | null; today: number; mean: number; sd: number; n: number; groupZ: number | null; groupMean: number | null; groupSd: number | null };
type Item = {
  player_id: string; name: string; refDate: string;
  driftType: "intensity" | "shape" | "mixed" | string; score: number;
  headline: string | null; why: string | null; counterfactual: string | null; suggestedAction: string | null;
  confident: boolean; calibrating: boolean; baselineDays: number; componentsPresent: number;
  totalDistanceZ: number | null; groupLabel: "role" | "squad"; drivers: Driver[];
};
type Resp = { ok: boolean; refDate: string; items: Item[]; summary: { totalPlayers: number; drifting: number; building: number; dismissed?: number }; error?: string };

const IS = (lang?: string) => (lang ?? "").toUpperCase() === "IS";
const DRIFT_TINT: Record<string, string> = {
  shape: "bg-violet-100 text-violet-800",
  intensity: "bg-amber-100 text-amber-800",
  mixed: "bg-rose-100 text-rose-800",
};
const driftWord = (t: string, lang?: string) =>
  IS(lang)
    ? (t === "shape" ? "hreyfir sig öðruvísi" : t === "mixed" ? "meira + öðruvísi" : "gerir meira en venjulega")
    : (t === "shape" ? "moving differently" : t === "mixed" ? "more + differently" : "doing more than usual");

export default function UnfamiliarLoadCard({ lang, date }: { lang?: string; date?: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openSignals, setOpenSignals] = useState<Record<string, boolean>>({});
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`/api/coach/unfamiliar-load${date ? `?date=${date}` : ""}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const j = (await res.json()) as Resp;
      if (!res.ok) { setErr(j.error ?? "Failed"); return; }
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally { setLoading(false); }
  }, [date]);
  useEffect(() => { void load(); }, [load]);

  const dismiss = useCallback(async (it: Item) => {
    setBusy(true);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`/api/coach/unfamiliar-load`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: it.player_id, refDate: it.refDate, reason: reason.trim() || null }),
      });
      if (res.ok) {
        setData((d) => d ? { ...d, items: d.items.filter((x) => x.player_id !== it.player_id) } : d);
        setDismissing(null); setReason("");
      }
    } catch { /* ignore */ }
    finally { setBusy(false); }
  }, [reason]);

  if (loading) return <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">{IS(lang) ? "Hleð hreyfimynstri…" : "Loading movement signals…"}</div>;
  if (err) return null; // non-critical surface — never block the Today view on an error
  if (!data) return null;

  const items = data.items;

  // All-clear: a slim line so the coach knows the check ran, suppressing detail.
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          <span className="font-medium text-slate-800">{IS(lang) ? "Hreyfimynstur" : "Movement check"}</span>
          <span className="text-slate-500">
            {IS(lang)
              ? "allir hreyfa sig innan síns venjulega ramma í dag."
              : "everyone is moving within their usual envelope today."}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-slate-900">{IS(lang) ? "Óvanaleg hreyfing — hvað á að skoða" : "Unfamiliar load — what to look at"}</h3>
        <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">{items.length}</span>
        <span className="ml-auto text-[11px] text-slate-400">
          {IS(lang) ? "Hreyfir hann sig eins og hann sjálfur?" : "Is he still moving like himself?"}
        </span>
      </div>

      <p className="mb-3 text-[11px] leading-snug text-slate-500">
        {IS(lang)
          ? "Frávik frá leikmannsins eigin hreyfinormi (Driver-lag, IMA) — lýsandi hegðunarmerki, ekki meiðslaspá. Aðeins undantekningar birtast."
          : "Drift from each player's own movement norm (Driver layer, IMA) — a descriptive behaviour signal, not an injury prediction. Only exceptions are shown."}
      </p>

      <div className="space-y-2">
        {items.map((it) => {
          const open = !!openSignals[it.player_id];
          const isDis = dismissing === it.player_id;
          return (
            <div key={it.player_id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{it.name}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${DRIFT_TINT[it.driftType] ?? "bg-slate-100 text-slate-600"}`}>{driftWord(it.driftType, lang)}</span>
                <span className="text-[10px] text-slate-400" title={IS(lang) ? "Borið saman við hans eigin venjulegu hreyfingu yfir þetta marga æfingadaga." : "Compared to his own usual movement over this many training days."}>
                  {IS(lang) ? `byggt á ${it.baselineDays} æfingadögum` : `based on ${it.baselineDays} training days`}{it.calibrating ? (IS(lang) ? " · enn að læra hans eðlilega" : " · still learning his normal") : ""}
                </span>
              </div>

              {/* One-sentence verdict, plain language */}
              {it.headline && <p className="mt-1 text-sm text-slate-800">{it.headline}</p>}

              {/* Why this matters */}
              {it.why && <p className="mt-1 text-[12px] leading-snug text-slate-600">{it.why}</p>}

              {/* Counterfactual (when would it NOT flag) */}
              {it.counterfactual && <p className="mt-1 text-[11px] text-slate-500">{it.counterfactual}</p>}
              {it.suggestedAction && (
                <p className="mt-1.5 text-[12px] text-slate-700">
                  <span className="font-semibold">{IS(lang) ? "Tillaga: " : "Suggested: "}</span>{it.suggestedAction}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <button type="button" onClick={() => setOpenSignals((s) => ({ ...s, [it.player_id]: !open }))} className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700">
                  {open ? (IS(lang) ? "Fela merki" : "Hide signals") : (IS(lang) ? "Sýna merki" : "Show signals")}
                </button>
                <button type="button" onClick={() => setProfile({ id: it.player_id, name: it.name })} className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700">
                  {IS(lang) ? "Hreyfi-prófíll" : "Movement profile"}
                </button>
                {!isDis && (
                  <button type="button" onClick={() => { setDismissing(it.player_id); setReason(""); }} className="text-[11px] font-medium text-slate-500 hover:text-slate-700">
                    {IS(lang) ? "Afgreiða" : "Dismiss"}
                  </button>
                )}
              </div>

              {/* Signals (jargon behind the toggle) */}
              {open && (
                <div className="mt-2 overflow-x-auto rounded-md bg-slate-50 p-2">
                  <table className="w-full text-[11px]">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="px-1 py-0.5 text-left">Component</th>
                        <th className="px-1 py-0.5 text-right">{IS(lang) ? "vs hann sjálfur" : "vs himself"}</th>
                        <th className="px-1 py-0.5 text-right">recent</th>
                        <th className="px-1 py-0.5 text-right">usual</th>
                        <th className="px-1 py-0.5 text-right">{IS(lang) ? (it.groupLabel === "role" ? "vs hlutverk" : "vs lið") : `vs ${it.groupLabel}`}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {it.drivers.map((d) => (
                        <tr key={d.key} className="border-t border-slate-200">
                          <td className="px-1 py-0.5 text-slate-700">{d.label}</td>
                          <td className="px-1 py-0.5 text-right font-semibold tabular-nums text-slate-900">{d.z != null && d.z > 0 ? "+" : ""}{d.z}</td>
                          <td className="px-1 py-0.5 text-right tabular-nums text-slate-600">{d.today}</td>
                          <td className="px-1 py-0.5 text-right tabular-nums text-slate-500">{d.mean}±{d.sd}</td>
                          <td className="px-1 py-0.5 text-right tabular-nums text-slate-500">{d.groupZ != null ? `${d.groupZ > 0 ? "+" : ""}${d.groupZ}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="px-1 pt-1 text-[10px] text-slate-400">
                    {IS(lang)
                      ? "„vs hann sjálfur\" = frávik frá hans eigin normi (það sem flaggar). Síðasti dálkur = sama miðað við "
                      : "“vs himself” = drift from his own norm (what flags). Last column = the same vs his "}
                    {it.groupLabel === "role" ? (IS(lang) ? "hlutverk." : "role.") : (IS(lang) ? "lið." : "squad.")}
                  </p>
                  {it.totalDistanceZ != null && (
                    <p className="px-1 pt-1 text-[10px] text-slate-400">
                      {IS(lang) ? "Heildarvegalengd" : "Total distance"} z = {it.totalDistanceZ > 0 ? "+" : ""}{it.totalDistanceZ} SD {IS(lang) ? "(samhengi: er rúmmálið sjálft hátt?)" : "(context: is volume itself up?)"}
                    </p>
                  )}
                </div>
              )}

              {/* Dismiss-with-reason */}
              {isDis && (
                <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={IS(lang) ? "Ástæða (t.d. þekkt hlutverksbreyting)" : "Reason (e.g. known role change)"}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  />
                  <div className="mt-1.5 flex items-center gap-2">
                    <button type="button" disabled={busy} onClick={() => dismiss(it)} className="rounded bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-900 disabled:opacity-50">
                      {busy ? "…" : (IS(lang) ? "Staðfesta" : "Confirm")}
                    </button>
                    <button type="button" onClick={() => { setDismissing(null); setReason(""); }} className="text-[11px] text-slate-500 hover:text-slate-700">
                      {IS(lang) ? "Hætta við" : "Cancel"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {profile && <MovementNarrativeModal playerId={profile.id} lang={lang} onClose={() => setProfile(null)} />}
    </div>
  );
}

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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import MovementNarrativeModal from "@/components/coach/MovementNarrativeModal";
import CoachTutorialButton from "@/components/coach/tutorials/CoachTutorialButton";

type Bi = { EN: string; IS: string };
type Driver = { key: string; label: string; z: number | null; today: number; mean: number; sd: number; n: number; groupZ: number | null; groupMean: number | null; groupSd: number | null };
type Item = {
  player_id: string; name: string; refDate: string;
  driftType: "intensity" | "shape" | "mixed" | string; score: number;
  spike?: boolean; peakZ?: number;
  headline: Bi | null; why: Bi | null; counterfactual: Bi | null; suggestedAction: Bi | null;
  confident: boolean; calibrating: boolean; baselineDays: number; componentsPresent: number;
  totalDistanceZ: number | null; groupLabel: "role" | "squad"; drivers: Driver[];
};
type Resp = { ok: boolean; refDate: string; items: Item[]; summary: { totalPlayers: number; drifting: number; spikes?: number; building: number; dismissed?: number }; error?: string };

const IS = (lang?: string) => (lang ?? "").toUpperCase() === "IS";
const DRIFT_TINT: Record<string, string> = {
  shape: "bg-violet-100 text-violet-800",
  intensity: "bg-amber-100 text-amber-800",
  mixed: "bg-rose-100 text-rose-800",
};
// IS names for the signals-table component column (keyed by driver.key).
const TABLE_LABEL_IS: Record<string, string> = {
  multidirectional: "Hlið-til-hliðar hlaup",
  explosive: "Sprengikraftur",
  multidirectional_share: "Hlutfall hlið-til-hliðar",
  decel_share: "Hemlunar-hlutfall",
  high_speed_share: "Háhraða-hlutfall",
  metabolic_share: "Efnaskipta-álags-hlutfall",
};
const driftWord = (t: string, lang?: string) =>
  IS(lang)
    ? (t === "shape" ? "hreyfir sig öðruvísi" : t === "mixed" ? "meira + öðruvísi" : "gerir meira en venjulega")
    : (t === "shape" ? "moving differently" : t === "mixed" ? "more + differently" : "doing more than usual");

// Plain-language magnitude for a z-score, so a coach reads the signals table at a
// glance without knowing what an SD is. The number stays alongside for S&C.
function mag(z: number | null, lang?: string): { word: string; tone: string } {
  if (z == null) return { word: "—", tone: "text-slate-400" };
  const a = Math.abs(z), is = IS(lang);
  if (a >= 2) return { word: z > 0 ? (is ? "langt yfir venju" : "well above usual") : (is ? "langt undir venju" : "well below usual"), tone: "text-rose-700" };
  if (a >= 1) return { word: z > 0 ? (is ? "yfir venju" : "above usual") : (is ? "undir venju" : "below usual"), tone: "text-amber-700" };
  return { word: is ? "um venju" : "about usual", tone: "text-slate-500" };
}

export default function UnfamiliarLoadCard({ lang, date }: { lang?: string; date?: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openSignals, setOpenSignals] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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

  const tBi = (b: Bi | null) => (b ? (IS(lang) ? b.IS : b.EN) : null);
  const items = data.items;

  // All-clear: a slim line so the coach knows the check ran, suppressing detail.
  // Matches the Today house style (Card + uppercase tracking header).
  if (items.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-lg font-semibold uppercase tracking-[0.18em] text-slate-900">
                {IS(lang) ? "Óvanaleg hreyfing" : "Unfamiliar load"}
              </CardTitle>
              <CardDescription className="mt-1 text-sm text-slate-500">
                {IS(lang) ? "Hreyfir hann sig eins og hann sjálfur?" : "Is he still moving like himself?"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <CoachTutorialButton slug="unfamiliar-load" label={{ en: "How to read", is: "Hvernig á að lesa" }} />
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                🟢 {IS(lang) ? "allir innan venju" : "all within range"}
              </span>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-lg font-semibold uppercase tracking-[0.18em] text-slate-900">
              {IS(lang) ? "Óvanaleg hreyfing" : "Unfamiliar load"}
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-slate-500">
              {IS(lang)
                ? "Hverjir hreyfa sig öðruvísi en venjulega (úr GPS/IMA) — lýsandi merki, ekki meiðslaspá."
                : "Who's moving differently than usual (from GPS/IMA) — a descriptive signal, not an injury prediction."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <CoachTutorialButton slug="unfamiliar-load" label={{ en: "How to read", is: "Hvernig á að lesa" }} />
            {(data.summary.spikes ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                ⚡ {data.summary.spikes} {IS(lang) ? "skörp frávik" : (data.summary.spikes === 1 ? "spike" : "spikes")}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800">
              {items.length} {IS(lang) ? "að skoða" : "to look at"}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Per-player cards in a responsive grid — matches the Decision Summary
            card layout so the two Today surfaces read the same. items-start so a
            card expanding in place (Details / Show signals) doesn't stretch its
            row-mates. */}
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((it) => {
          const open = !!openSignals[it.player_id];
          const isExpanded = !!expanded[it.player_id];
          const isDis = dismissing === it.player_id;
          return (
            <div key={it.player_id} className={`rounded-lg border p-3 ${it.spike ? "border-rose-300 bg-rose-50/40 ring-1 ring-rose-200" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{it.name}</span>
                {it.spike && (
                  <span className="inline-flex items-center gap-1 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white" title={IS(lang) ? `Skarpt frávik: ${it.peakZ} SD yfir hans venju` : `Sharp spike: ${it.peakZ} SD above his norm`}>
                    ⚡ {IS(lang) ? "Skarpt" : "Spike"}
                  </span>
                )}
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${DRIFT_TINT[it.driftType] ?? "bg-slate-100 text-slate-600"}`}>{driftWord(it.driftType, lang)}</span>
                <span className="text-[10px] text-slate-400" title={IS(lang) ? "Borið saman við hans eigin venjulegu hreyfingu yfir þetta marga æfingadaga." : "Compared to his own usual movement over this many training days."}>
                  {IS(lang) ? `byggt á ${it.baselineDays} æfingadögum` : `based on ${it.baselineDays} training days`}{it.calibrating ? (IS(lang) ? " · enn að læra hans eðlilega" : " · still learning his normal") : ""}
                </span>
              </div>

              {/* One-sentence verdict, plain language — the only thing shown by
                  default so the section stays scannable (4 tight rows, not 4
                  walls of text). Everything else is a click away. */}
              {it.headline && <p className="mt-1 text-sm text-slate-800">{tBi(it.headline)}</p>}

              {/* Why / counterfactual / suggested — collapsed behind "Details"
                  so the head-coach surface shows the verdict first, the reasoning
                  on demand (explainability manifesto). */}
              {isExpanded && (
                <>
                  {it.why && <p className="mt-1 text-[12px] leading-snug text-slate-600">{tBi(it.why)}</p>}
                  {it.counterfactual && <p className="mt-1 text-[11px] text-slate-500">{tBi(it.counterfactual)}</p>}
                  {it.suggestedAction && (
                    <p className="mt-1.5 text-[12px] text-slate-700">
                      <span className="font-semibold">{IS(lang) ? "Tillaga: " : "Suggested: "}</span>{tBi(it.suggestedAction)}
                    </p>
                  )}
                </>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                {(it.why || it.counterfactual || it.suggestedAction) && (
                  <button type="button" onClick={() => setExpanded((s) => ({ ...s, [it.player_id]: !isExpanded }))} className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700">
                    {isExpanded ? (IS(lang) ? "Fela skýringu" : "Hide details") : (IS(lang) ? "Skýring" : "Details")}
                  </button>
                )}
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
                        <th className="px-1 py-0.5 text-left">{IS(lang) ? "Hvað" : "What"}</th>
                        <th className="px-1 py-0.5 text-right">{IS(lang) ? "breyting (vs venja)" : "change vs his normal"}</th>
                        <th className="px-1 py-0.5 text-right">{IS(lang) ? "þessa viku" : "this week"}</th>
                        <th className="px-1 py-0.5 text-right">{IS(lang) ? "hans venja" : "his normal"}</th>
                        <th className="px-1 py-0.5 text-right">{IS(lang) ? (it.groupLabel === "role" ? "vs hlutverk" : "vs lið") : `vs ${it.groupLabel}`}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {it.drivers.map((d) => {
                        const m = mag(d.z, lang), gm = mag(d.groupZ, lang);
                        return (
                          <tr key={d.key} className="border-t border-slate-200">
                            <td className="px-1 py-0.5 text-slate-700">{IS(lang) ? (TABLE_LABEL_IS[d.key] ?? d.label) : d.label}</td>
                            <td className="px-1 py-0.5 text-right">
                              <span className={`font-semibold ${m.tone}`}>{m.word}</span>
                              {d.z != null && <span className="ml-1 text-[10px] tabular-nums text-slate-400">{d.z > 0 ? "+" : ""}{d.z}</span>}
                            </td>
                            <td className="px-1 py-0.5 text-right tabular-nums text-slate-600">{d.today}</td>
                            <td className="px-1 py-0.5 text-right tabular-nums text-slate-500">{d.mean}±{d.sd}</td>
                            <td className="px-1 py-0.5 text-right">
                              {d.groupZ != null
                                ? <><span className={gm.tone}>{gm.word}</span><span className="ml-1 text-[10px] tabular-nums text-slate-400">{d.groupZ > 0 ? "+" : ""}{d.groupZ}</span></>
                                : <span className="text-slate-400">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="px-1 pt-1 text-[10px] leading-snug text-slate-400">
                    {IS(lang)
                      ? "Hver lína: hvernig hann hreyfði sig þessa viku borið saman við hans eigin venju — breytingin er það sem flaggar hann. Síðasti dálkur ber hann saman við "
                      : "Each row: how he moved this week vs his own normal — the change is what flags him. The last column compares him to his "}
                    {it.groupLabel === "role" ? (IS(lang) ? "hlutverk í staðinn." : "role instead.") : (IS(lang) ? "lið í staðinn." : "squad instead.")}
                  </p>
                  {it.totalDistanceZ != null && (
                    <p className="px-1 pt-1 text-[10px] leading-snug text-slate-400">
                      {(() => {
                        const td = it.totalDistanceZ as number, up = td >= 0.75, down = td <= -0.75;
                        return IS(lang)
                          ? (up ? "Heildarhlaup hans er líka upp þessa viku — eitthvað af þessu er einfaldlega meira magn."
                              : down ? "Heildarhlaup hans er reyndar niður þessa viku — svo breytingin í hreyfingu sker sig enn meira úr."
                                : "Heildarhlaup hans þessa viku er um venju — svo þetta snýst um HVERNIG hann hreyfir sig, ekki bara meira hlaup.")
                          : (up ? "His total running is also up this week — some of this is simply more volume."
                              : down ? "His total running is actually down this week — so the change in how he moves stands out even more."
                                : "His total running this week is about normal — so this is about HOW he moves, not just more running.");
                      })()}
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
      </CardContent>
    </Card>
  );
}

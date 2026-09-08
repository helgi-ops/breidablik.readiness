"use client";

/**
 * Correctives tab — the coach reviews the player's MERGED corrective plan
 * (latest movement screen + latest region assessment + recent VALD force data),
 * TICKS the exercises to send, and sends only those to the player's Today card.
 * The plan is built server-side; the coach only chooses which prescribed
 * exercises go. Screening / training only — never the readiness colour.
 */
import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { CorrectivePrescription } from "@/lib/micropulse/movementScreen/correctives/mapping";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import CorrectivePlan from "@/components/movement/CorrectivePlan";
import RehabTrackCard, { type RehabTrackView } from "@/components/movement/RehabTrackCard";
import KingProgramCard from "@/components/movement/KingProgramCard";
import OrthopedicTestsCard from "@/components/movement/OrthopedicTestsCard";
import TendonLoadingCard from "@/components/movement/TendonLoadingCard";
import RehabProtocolLinkCard from "@/components/movement/RehabProtocolLinkCard";
import type { RehabProtocolLink } from "@/lib/micropulse/movementScreen/correctives/rehabProtocolLinks";
import type { CompensationKey } from "@/lib/micropulse/movementScreen/correctives/registry";

type Player = { id: string; full_name: string | null };
type SummaryEntry = { kind: "screen" | "region"; title: Bi; items: Bi[] };
type TrendVar = { label: Bi; leg: string | null; verdict: string; points: Array<{ date: string; severity: string }> };
type TrendEntry = { test: Bi; variables: TrendVar[] };
type ReScreenDue = { date: string; dueInDays: number };
const VERDICT: Record<string, { en: string; is: string; color: string }> = {
  improving: { en: "improving ↓", is: "batnar ↓", color: "#1c7a4a" },
  worse: { en: "worse ↑", is: "versnar ↑", color: "#a83e28" },
  unchanged: { en: "unchanged", is: "óbreytt", color: "#de9328" },
  single: { en: "single screen — re-screen to trend", is: "stök skimun — endurskima fyrir þróun", color: "#94a3b8" },
};

export default function CorrectiveTab({ playerId: playerIdProp, onPlayerChange }: { playerId?: string; onPlayerChange?: (id: string) => void } = {}) {
  const [lang] = useLang();
  const is = lang === "IS";
  const T = (en: string, isT: string) => (is ? isT : en);

  const [players, setPlayers] = React.useState<Player[]>([]);
  const [playerIdInternal, setPlayerIdInternal] = React.useState("");
  const playerId = playerIdProp ?? playerIdInternal;
  const setPlayerId = onPlayerChange ?? setPlayerIdInternal;
  const [prescription, setPrescription] = React.useState<CorrectivePrescription | null>(null);
  const [summary, setSummary] = React.useState<SummaryEntry[]>([]);
  const [valdFlags, setValdFlags] = React.useState<Array<{ source: string; detail: Bi; ageDays: number; compensationLabel: Bi }>>([]);
  const [trend, setTrend] = React.useState<TrendEntry[]>([]);
  const [rehabTrack, setRehabTrack] = React.useState<RehabTrackView | null>(null);
  const [assessmentComps, setAssessmentComps] = React.useState<CompensationKey[]>([]);
  const [rehabProtocols, setRehabProtocols] = React.useState<RehabProtocolLink[]>([]);
  const [reScreenDue, setReScreenDue] = React.useState<ReScreenDue | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [sentMsg, setSentMsg] = React.useState<string | null>(null);
  const [showDetail, setShowDetail] = React.useState(false); // rehab + clinician context (layered read)

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "", []);
  const playerName = React.useMemo(() => players.find((p) => p.id === playerId)?.full_name ?? "", [players, playerId]);

  React.useEffect(() => {
    (async () => {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;
      const { data: prof } = await sb.from("profiles").select("team_id").eq("id", uid).maybeSingle();
      const tid = (prof as { team_id?: string } | null)?.team_id ?? "";
      const { data } = await sb.from("players").select("id, full_name").eq("team_id", tid).eq("is_active", true).order("full_name");
      setPlayers((data ?? []) as Player[]);
    })();
  }, []);

  React.useEffect(() => {
    let alive = true;
    if (!playerId) { setPrescription(null); setSummary([]); setValdFlags([]); setTrend([]); setRehabTrack(null); setAssessmentComps([]); setRehabProtocols([]); setReScreenDue(null); setLoaded(false); setSentMsg(null); setShowDetail(false); return; }
    setLoading(true); setSentMsg(null); setShowDetail(false);
    (async () => {
      try {
        const res = await fetch(`/api/coach/movement-screen/corrective?player_id=${encodeURIComponent(playerId)}`, { headers: { Authorization: `Bearer ${await token()}` } });
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        const p = (res.ok ? (j.prescription as CorrectivePrescription | null) : null) ?? null;
        setPrescription(p);
        setSummary(res.ok && Array.isArray(j.summary) ? (j.summary as SummaryEntry[]) : []);
        setValdFlags(res.ok && Array.isArray(j.valdFlags) ? j.valdFlags : []);
        setTrend(res.ok && Array.isArray(j.trend) ? (j.trend as TrendEntry[]) : []);
        setRehabTrack(res.ok ? ((j.rehabTrack as RehabTrackView | null) ?? null) : null);
        setAssessmentComps(res.ok && Array.isArray(j.assessmentCompensations) ? (j.assessmentCompensations as CompensationKey[]) : []);
        setRehabProtocols(res.ok && Array.isArray(j.rehabProtocols) ? (j.rehabProtocols as RehabProtocolLink[]) : []);
        setReScreenDue(res.ok ? ((j.reScreenDue as ReScreenDue | null) ?? null) : null);
        // Default checked = ONE primary per phase (the lead exercise). Secondary
        // alternatives show unticked behind a per-phase toggle — a coach-manageable
        // send, not 30+ pre-loaded exercises for a rehab-track player.
        setSelected(new Set(p ? p.phases.flatMap((g) => g.items.filter((e) => e.tier !== "secondary").map((e) => e.slug)) : []));
        setLoaded(true);
      } catch { if (alive) { setPrescription(null); setLoaded(true); } }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [playerId, token]);

  const toggle = (slug: string) => setSelected((s) => { const n = new Set(s); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });

  const sendSelected = async () => {
    if (!playerId || selected.size === 0) return;
    setSending(true); setSentMsg(null);
    try {
      const res = await fetch("/api/coach/movement-screen/corrective", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ player_id: playerId, lang: is ? "IS" : "EN", source: "merged", selected_slugs: [...selected] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setSentMsg(T(`Sent ${j.blocks} block(s) to ${playerName || "player"}'s Today.`, `Sendi ${j.blocks} blokk(ir) á Today hjá ${playerName || "leikmanni"}.`));
    } catch (e) {
      setSentMsg(T("Send failed", "Sending brást") + ": " + (e instanceof Error ? e.message : "error"));
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-[12px] text-slate-600">{T("Player", "Leikmaður")}
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="mt-0.5 block w-full max-w-sm rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]">
            <option value="">{T("— pick a player —", "— veldu leikmann —")}</option>
            {players.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? "—"}</option>)}
          </select>
        </label>
        <p className="mt-1 text-[11px] text-slate-500">{T("The plan is anchored in the player's movement screen (+ region assessment); recent VALD force data (last 8 weeks) strengthens it, never replaces it. One primary exercise per phase is ticked by default; open “alternatives” for secondary options. Tick what you want, then send.", "Áætlunin er byggð á hreyfiskimun leikmannsins (+ svæðismati); nýleg VALD-kraftpróf (síðustu 8 vikur) styrkja hana, koma aldrei í staðinn. Ein aðal-æfing á hvern fasa er hökuð sjálfgefið; opnaðu „valkosti“ fyrir auka-æfingar. Hakaðu við það sem þú vilt og sendu.")}</p>
      </div>

      {loading && <p className="text-[12px] text-slate-500">{T("Building the plan…", "Bygg áætlunina…")}</p>}

      {/* No screen/region anchor yet: show VALD as objective flags to confirm with a screen. */}
      {loaded && !loading && !prescription && playerId && valdFlags.length > 0 && (
        <div className="rounded-xl border border-[#2740e6]/20 bg-[#2740e6]/5 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2740e6]">{T("Objective flags (VALD) — no screen yet", "Hlutlæg flögg (VALD) — engin skimun enn")}</p>
          <p className="mt-1 text-[12px] text-slate-700">{T("These force-test flags are waiting for a movement screen. Run one in “Analyse & measure” to build the corrective plan — VALD then confirms it. A plan is always anchored in a screen, never VALD alone.", "Þessi kraftprófs-flögg bíða eftir hreyfiskimun. Keyrðu eina í „Greina & mæla“ til að búa til leiðréttingar-planið — VALD staðfestir það þá. Plan er alltaf byggt á skimun, aldrei VALD einu.")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {valdFlags.map((s, i) => <span key={i} className="rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] text-[#2740e6]">{s.source} · {is ? s.detail.is : s.detail.en} · {s.ageDays}{T("d", "d")}</span>)}
          </div>
        </div>
      )}
      {loaded && !loading && !prescription && playerId && valdFlags.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-500">{T("Nothing to prescribe yet — record a movement screen or a region assessment first.", "Ekkert að ávísa enn — skráðu hreyfiskimun eða svæðismat fyrst.")}</p>
      )}
      {summary.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{T("From the assessment", "Úr matinu")}</p>
          <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
            {summary.map((s, i) => (
              <div key={i}>
                <p className="text-[11px] font-semibold text-slate-700">{s.kind === "screen" ? T("Screen", "Skimun") : T("Region", "Svæði")} · {is ? s.title.is : s.title.en}</p>
                <ul className="mt-0.5 space-y-0.5">{s.items.map((it, j) => <li key={j} className="text-[12px] text-slate-600">· {is ? it.is : it.en}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      )}
      {prescription && (
        <CorrectivePlan prescription={prescription} isEN={!is} selectable selected={selected} onToggle={toggle} onSendSelected={sendSelected} sending={sending} sentMsg={sentMsg} />
      )}

      {/* Layered read: the plan to send is the whole default view. Rehab context and
          clinician drill-downs live behind ONE toggle, so a coach screening 20
          players isn't buried — they read the findings, tick, send, move on. */}
      {playerId && loaded && !loading && (prescription || rehabTrack) && (
        <button
          onClick={() => setShowDetail((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          <span>{T("Rehab & clinician detail", "Rehab- og klíník-smáatriði")}
            {rehabTrack ? <span className="ml-1.5 rounded bg-[#7a5cc4]/12 px-1.5 py-0.5 text-[9px] font-semibold text-[#5a3ea4]">{T("rehab track", "rehab-ferill")}</span> : null}
          </span>
          <span className="text-[11px] font-normal text-slate-400">{showDetail ? T("Hide ▾", "Fela ▾") : T("Show ▸", "Sýna ▸")}</span>
        </button>
      )}

      {showDetail && (<>
      {/* Rehab track — the phased movement-quality continuum (Enda King's spirit)
          the findings map into. Clinician-gated; never the readiness colour. */}
      {rehabTrack && <RehabTrackCard track={rehabTrack} isEN={!is} />}

      {/* Enda King program template — real named exercises + doses (3 parallel
          tracks) + the Initial Ax assessment schema the tracks draw from. Shown
          once a rehab track is active. Reference template; clinician-gated. */}
      {rehabTrack && <KingProgramCard isEN={!is} />}

      {/* Tendon-adaptation layer (Baar) — loading dose + isometric entry +
          collagen-nutrition timing, when a tendon-relevant finding is in play. */}
      {rehabTrack && <TendonLoadingCard compensations={assessmentComps} isEN={!is} />}

      {/* Bridge to the DB staged-loading rehab protocol the findings point to
          (jumper's knee / Achilles / adductor) — carries the clinical exercises. */}
      {rehabProtocols.length > 0 && <RehabProtocolLinkCard protocols={rehabProtocols} isEN={!is} playerId={playerId} />}

      {/* Clinical assessment ideas — screen-driven (flagged findings) + a region
          picker. A clinician referral aid; available once a player is selected. */}
      {playerId && loaded && !loading && <OrthopedicTestsCard compensations={assessmentComps} isEN={!is} />}

      {/* Re-screen loop — due date + did the flagged variables close? (Bell 2013) */}
      {prescription && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{T("Re-screen & trend", "Endurskimun & þróun")}</p>
            {reScreenDue && (
              <span className={`text-[11px] font-semibold ${reScreenDue.dueInDays <= 0 ? "text-[#a83e28]" : "text-slate-500"}`}>
                {reScreenDue.dueInDays <= 0
                  ? T(`Re-screen due (${-reScreenDue.dueInDays}d overdue)`, `Endurskimun komin (${-reScreenDue.dueInDays}d yfir)`)
                  : T(`Re-screen due ${reScreenDue.date} (in ${reScreenDue.dueInDays}d)`, `Endurskimun ${reScreenDue.date} (eftir ${reScreenDue.dueInDays}d)`)}
              </span>
            )}
          </div>
          {trend.length === 0 ? (
            <p className="mt-1 text-[12px] text-slate-500">{T("No saved movement screens yet — run one to start the re-screen clock and track whether the compensation closes.", "Engar vistaðar hreyfiskimanir enn — keyrðu eina til að ræsa endurskimunar-klukkuna og fylgjast með hvort uppbótin lokast.")}</p>
          ) : (
            <div className="mt-2 space-y-2">
              {trend.map((te, i) => (
                <div key={i}>
                  <p className="text-[11px] font-semibold text-slate-700">{is ? te.test.is : te.test.en}</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {te.variables.map((v, j) => {
                      const verdict = VERDICT[v.verdict] ?? VERDICT.single;
                      return (
                        <li key={j} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                          <span className="text-slate-700">{is ? v.label.is : v.label.en}{v.leg && v.leg !== "both" ? ` (${v.leg})` : ""}:</span>
                          <span className="text-slate-500">{v.points.map((p) => p.severity).join(" → ")}</span>
                          <span className="font-semibold" style={{ color: verdict.color }}>{is ? verdict.is : verdict.en}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[9px] text-slate-400">{T("A trainable compensation should close on re-screen (Bell 2013). Movement quality — not an injury-risk claim.", "Þjálfanleg uppbót á að lokast við endurskimun (Bell 2013). Hreyfigæði — ekki fullyrðing um meiðsla-áhættu.")}</p>
        </div>
      )}
      </>)}
    </div>
  );
}

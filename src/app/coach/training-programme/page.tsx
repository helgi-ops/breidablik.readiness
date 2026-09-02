"use client";

/**
 * Coach view — MD-periodised training programme ("Æfingavika").
 *
 * Pick a player → generate his microcycle (MD-4 … MD-1, MD, MD+1) with load
 * tapering toward the match, each day colour-coded (planned load band; readiness
 * eases the day only), the per-day session, and the movement/capacity emphasis
 * blended in. Coach reviews and Saves; the player then sees the saved week.
 * Descriptive — never writes the readiness verdict colour.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";

type Bi = { en: string; is: string };
type DayColour = "green" | "yellow" | "red" | "none";
type Block = { id: string; titleEN: string; titleIS: string; exercises?: Array<Record<string, unknown>> };
type Adaptation = { ruleId: string; triggerEN: string; triggerIS: string; actionEN: string; actionIS: string; evidence: string };
type Session = { templateId: string; durationMin: number; blocks: Block[]; appliedAdaptations: Adaptation[]; summaryEN: string; summaryIS: string } | null;
type Day = {
  date: string; mdTag: string; plannedBand: string; colour: DayColour; readinessAdjusted: boolean;
  session: Session; emphasis: Array<{ quality: string; text: Bi }>; facts: Bi[]; confidence: number; provenance: string[];
};
type Programme = { playerId: string; playerName?: string; weekStart: string; days: Day[]; topGaps: Array<{ quality: string; label: Bi; preferredMd: string }> };
type PlayerLite = { id: string; name: string };

const DOT: Record<DayColour, string> = { green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-rose-500", none: "bg-slate-300" };
const RING: Record<DayColour, string> = { green: "border-emerald-200", yellow: "border-amber-200", red: "border-rose-200", none: "border-slate-200" };

export default function TrainingProgrammePage() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const [players, setPlayers] = React.useState<PlayerLite[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [prog, setProg] = React.useState<Programme | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState("");
  const [error, setError] = React.useState("");
  const [openDetail, setOpenDetail] = React.useState<Record<string, boolean>>({});

  const authHeaders = React.useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data?.session?.access_token ?? ""}` };
  }, [supabase]);

  // Load the active roster once.
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;
      const { data: prof } = await supabase.from("profiles").select("team_id").eq("id", uid).maybeSingle();
      const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
      if (!teamId) return;
      const { data: pl } = await supabase.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true).order("full_name");
      if (!alive) return;
      setPlayers(((pl ?? []) as Array<{ id: string; full_name?: string }>).map((p) => ({ id: String(p.id), name: String(p.full_name ?? "") })));
    })();
    return () => { alive = false; };
  }, [supabase]);

  React.useEffect(() => { if (!selectedId && players.length) setSelectedId(players[0].id); }, [players, selectedId]);

  const generate = React.useCallback(async (playerId: string) => {
    if (!playerId) return;
    setLoading(true); setError(""); setToast(""); setProg(null);
    try {
      const res = await fetch(`/api/coach/training-programme/${playerId}`, { headers: await authHeaders() });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Failed");
      setProg(j.programme as Programme);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [authHeaders]);

  React.useEffect(() => { if (selectedId) void generate(selectedId); }, [selectedId, generate]);

  const save = React.useCallback(async () => {
    if (!prog) return;
    setSaving(true); setError(""); setToast("");
    try {
      const res = await fetch(`/api/coach/training-programme/${prog.playerId}`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ weekStart: prog.weekStart, days: prog.days }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Failed");
      setToast(isEN ? "Saved — the player now sees this week ✓" : "Vistað — leikmaðurinn sér þessa viku núna ✓");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }, [prog, authHeaders, isEN]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{isEN ? "Training programme" : "Æfingavika"}</h1>
        <PagePurpose
          en="auto-build a player's MD-periodised week — load tapering to the match, colour-coded, movement gaps blended in"
          is="búa til MD-skipta viku leikmanns sjálfvirkt — álag lækkar að leik, litakóðað, hreyfi-veikleikar blandaðir inn"
        />
        <p className="mt-1 text-sm text-slate-600">
          {isEN
            ? "Each day's colour is its PLANNED load (green = hard, red = light near the match). On the day, the player's readiness can ease it — never make it harder. Descriptive; it never changes the readiness verdict."
            : "Litur hvers dags er ÁÆTLAÐ álag (grænn = þungt, rauður = létt nálægt leik). Á deginum getur readiness leikmannsins minnkað það — aldrei aukið. Lýsandi; breytir aldrei readiness-dómnum."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-600">{isEN ? "Player" : "Leikmaður"}</span>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm">
          {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => generate(selectedId)} disabled={loading} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50">
          {loading ? (isEN ? "Generating…" : "Reikna…") : (isEN ? "Regenerate" : "Endurreikna")}
        </button>
        {prog && prog.days.length > 0 && (
          <button onClick={save} disabled={saving} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {saving ? (isEN ? "Saving…" : "Vista…") : (isEN ? "Save → player sees it" : "Vista → leikmaður sér")}
          </button>
        )}
      </div>

      {toast && <p className="text-sm font-medium text-emerald-700">{toast}</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}

      {prog && prog.topGaps.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {isEN ? "This week emphasises: " : "Vikan leggur áherslu á: "}
          {prog.topGaps.map((g, i) => (
            <span key={g.quality}>{i > 0 ? ", " : ""}<strong>{isEN ? g.label.en : g.label.is}</strong> ({g.preferredMd})</span>
          ))}
        </div>
      )}

      {!loading && prog && prog.days.length === 0 && (
        <div className="rounded-md border bg-white p-6 text-center text-sm text-slate-500">
          {isEN ? "No match within the coming week — no MD microcycle to lay out yet." : "Enginn leikur í næstu viku — engin MD-vika til að setja upp enn."}
        </div>
      )}

      <div className="space-y-3">
        {prog?.days.map((d) => {
          const key = d.date;
          const open = !!openDetail[key];
          return (
            <div key={key} className={`rounded-xl border-2 bg-white p-4 ${RING[d.colour]}`}>
              <div className="flex items-center gap-3">
                <span className={`h-3 w-3 shrink-0 rounded-full ${DOT[d.colour]}`} />
                <span className="font-semibold text-slate-900">{d.mdTag}</span>
                <span className="text-xs text-slate-500">{d.date}</span>
                <span className="ml-auto text-xs font-medium uppercase tracking-wide text-slate-400">
                  {isEN ? "planned" : "áætlað"}: {d.plannedBand}{d.readinessAdjusted ? (isEN ? " · eased today" : " · minnkað í dag") : ""}
                </span>
              </div>

              <ul className="mt-2 space-y-1">
                {d.facts.map((f, i) => <li key={i} className="text-sm text-slate-700">• {isEN ? f.en : f.is}</li>)}
              </ul>

              {d.emphasis.map((e) => (
                <div key={e.quality} className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
                  ★ {isEN ? e.text.en : e.text.is}
                </div>
              ))}

              {d.session && d.session.blocks.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm italic text-slate-600">{isEN ? d.session.summaryEN : d.session.summaryIS}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {d.session.blocks.map((b) => (
                      <span key={b.id} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{isEN ? b.titleEN : b.titleIS}</span>
                    ))}
                  </div>
                  <button onClick={() => setOpenDetail((s) => ({ ...s, [key]: !open }))} className="mt-2 text-xs font-medium text-[#2740e6] hover:underline">
                    {open ? (isEN ? "Hide details" : "Fela smáatriði") : (isEN ? "Show details" : "Sýna smáatriði")}
                  </button>
                  {open && (
                    <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
                      {d.session.appliedAdaptations.length > 0 && (
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{isEN ? "Why these swaps" : "Af hverju þessar breytingar"}</div>
                          <ul className="mt-1 space-y-1">
                            {d.session.appliedAdaptations.map((a, i) => (
                              <li key={i} className="text-xs text-slate-600">{isEN ? a.actionEN : a.actionIS} <span className="text-slate-400">— {a.evidence}</span></li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="text-[10px] text-slate-400">{d.provenance.join(" · ")}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

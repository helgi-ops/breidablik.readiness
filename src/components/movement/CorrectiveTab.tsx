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

type Player = { id: string; full_name: string | null };
type SummaryEntry = { kind: "screen" | "region"; title: Bi; items: Bi[] };

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
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [sentMsg, setSentMsg] = React.useState<string | null>(null);

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
    if (!playerId) { setPrescription(null); setSummary([]); setLoaded(false); setSentMsg(null); return; }
    setLoading(true); setSentMsg(null);
    (async () => {
      try {
        const res = await fetch(`/api/coach/movement-screen/corrective?player_id=${encodeURIComponent(playerId)}`, { headers: { Authorization: `Bearer ${await token()}` } });
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        const p = (res.ok ? (j.prescription as CorrectivePrescription | null) : null) ?? null;
        setPrescription(p);
        setSummary(res.ok && Array.isArray(j.summary) ? (j.summary as SummaryEntry[]) : []);
        setSelected(new Set(p ? p.phases.flatMap((g) => g.items.map((e) => e.slug)) : [])); // default: all checked
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
        <p className="mt-1 text-[11px] text-slate-500">{T("The plan merges the player's latest movement screen, region assessment and recent VALD force data (last 8 weeks). Tick the exercises to send.", "Áætlunin sameinar nýjustu skimun, svæðismat og nýleg VALD-kraftpróf (síðustu 8 vikur). Hakaðu við æfingar til að senda.")}</p>
      </div>

      {loading && <p className="text-[12px] text-slate-500">{T("Building the plan…", "Bygg áætlunina…")}</p>}
      {loaded && !loading && !prescription && playerId && (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-500">{T("No grounded correctives for this player yet — record a screen, a region assessment, or a VALD test first.", "Engar grundaðar correctives fyrir þennan leikmann enn — skráðu skimun, svæðismat eða VALD-próf fyrst.")}</p>
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
    </div>
  );
}

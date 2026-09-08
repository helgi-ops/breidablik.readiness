"use client";

/**
 * Clinical assessment form — the King "Initial Ax". A clinician records ROM /
 * strength (0-5) / global movement per field, R/L + a pain score + an
 * "abnormal / reduced" flag. Flagged fields write CONFIRMED deficits into the
 * unified ledger (highest authority). Consent-gated. Screening / rehab-support
 * only — never the readiness colour; pain / red flags stay with the clinician.
 */
import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import { KING_ASSESSMENT_SCHEMA, KING_ASSESSMENT_CAVEAT } from "@/lib/micropulse/movementScreen/king/assessment";

type Player = { id: string; full_name: string | null };
type Entry = { scoreR?: number | null; scoreL?: number | null; pain?: number | null; flag?: boolean };

export default function ClinicalAxForm({ playerId: playerIdProp, onPlayerChange }: { playerId?: string; onPlayerChange?: (id: string) => void } = {}) {
  const [lang] = useLang();
  const is = lang === "IS";
  const L = (b: Bi) => (is ? b.is : b.en);
  const T = (en: string, isT: string) => (is ? isT : en);

  const [players, setPlayers] = React.useState<Player[]>([]);
  const [playerIdInternal, setPlayerIdInternal] = React.useState("");
  const playerId = playerIdProp ?? playerIdInternal;
  const setPlayerId = onPlayerChange ?? setPlayerIdInternal;
  const [entries, setEntries] = React.useState<Record<string, Entry>>({});
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "", []);

  React.useEffect(() => {
    (async () => {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const uid = session?.user?.id; if (!uid) return;
      const { data: prof } = await sb.from("profiles").select("team_id").eq("id", uid).maybeSingle();
      const tid = (prof as { team_id?: string } | null)?.team_id ?? "";
      const { data } = await sb.from("players").select("id, full_name").eq("team_id", tid).eq("is_active", true).order("full_name");
      setPlayers((data ?? []) as Player[]);
    })();
  }, []);

  React.useEffect(() => {
    setEntries({}); setMsg(null); setSavedAt(null);
    if (!playerId) return;
    let alive = true;
    (async () => {
      const res = await fetch(`/api/coach/clinical-assessment?player_id=${encodeURIComponent(playerId)}`, { headers: { Authorization: `Bearer ${await token()}` } });
      const j = await res.json().catch(() => ({}));
      if (!alive || !res.ok || !j.assessment) return;
      const next: Record<string, Entry> = {};
      for (const f of (j.assessment.fields ?? []) as Array<Entry & { fieldId: string }>) next[f.fieldId] = { scoreR: f.scoreR, scoreL: f.scoreL, pain: f.pain, flag: f.flag };
      setEntries(next); setSavedAt(j.assessment.assessment_date ?? null);
    })();
    return () => { alive = false; };
  }, [playerId, token]);

  const set = (id: string, patch: Entry) => setEntries((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  const numFields = Object.values(entries).filter((e) => e.scoreR != null || e.scoreL != null || e.pain != null || e.flag).length;

  const save = async () => {
    if (!playerId) return;
    setSaving(true); setMsg(null);
    try {
      const fields = Object.entries(entries).map(([fieldId, e]) => ({ fieldId, ...e }));
      const res = await fetch("/api/coach/clinical-assessment", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ player_id: playerId, fields }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setMsg(T(`Saved ${j.saved} field(s) — flagged fields feed the deficit ledger.`, `Vistaði ${j.saved} reit(i) — merktir reitir fæða halla-bókina.`));
      setSavedAt(new Date().toISOString().slice(0, 10));
    } catch (e) { setMsg(T("Save failed", "Vistun brást") + ": " + (e instanceof Error ? e.message : "error")); }
    finally { setSaving(false); }
  };

  const numInput = "w-14 rounded border border-slate-300 px-1.5 py-0.5 text-[12px]";

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-[12px] text-slate-600">{T("Player", "Leikmaður")}
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="mt-0.5 block w-full max-w-sm rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]">
            <option value="">{T("— pick a player —", "— veldu leikmann —")}</option>
            {players.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? "—"}</option>)}
          </select>
        </label>
        <p className="mt-1 text-[11px] text-slate-500">{T("Clinician assessment. Strength on 0–5 (Oxford); ROM as a value; a pain score (0–10); tick “abnormal/reduced”. Flagged fields become CONFIRMED deficits in the ledger; pain routes to the clinician.", "Klínískt mat. Styrkur 0–5 (Oxford); ROM sem gildi; verkjaskor (0–10); hakaðu „óeðlilegt/skert“. Merktir reitir verða STAÐFEST hölla í bókinni; verkur fer til klíníkers.")}</p>
        {savedAt && <p className="mt-1 text-[10px] text-slate-400">{T("Last saved:", "Síðast vistað:")} {savedAt}</p>}
      </div>

      {playerId && KING_ASSESSMENT_SCHEMA.map((g) => (
        <div key={g.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[12px] font-semibold text-slate-800">{L(g.label)}</p>
          <ul className="mt-2 space-y-1.5">
            {g.fields.map((f) => {
              const e = entries[f.id] ?? {};
              return (
                <li key={f.id} className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="min-w-[180px] text-slate-700">{L(f.label)}</span>
                  {f.bilateral ? (
                    <>
                      <label className="text-[10px] text-slate-500">R<input type="number" value={e.scoreR ?? ""} onChange={(ev) => set(f.id, { scoreR: ev.target.value === "" ? null : Number(ev.target.value) })} className={`ml-1 ${numInput}`} /></label>
                      <label className="text-[10px] text-slate-500">L<input type="number" value={e.scoreL ?? ""} onChange={(ev) => set(f.id, { scoreL: ev.target.value === "" ? null : Number(ev.target.value) })} className={`ml-1 ${numInput}`} /></label>
                    </>
                  ) : (
                    <label className="text-[10px] text-slate-500">{T("value", "gildi")}<input type="number" value={e.scoreR ?? ""} onChange={(ev) => set(f.id, { scoreR: ev.target.value === "" ? null : Number(ev.target.value) })} className={`ml-1 ${numInput}`} /></label>
                  )}
                  {f.painFlag && <label className="text-[10px] text-slate-500">{T("pain", "verkur")}<input type="number" min={0} max={10} value={e.pain ?? ""} onChange={(ev) => set(f.id, { pain: ev.target.value === "" ? null : Number(ev.target.value) })} className={`ml-1 ${numInput}`} /></label>}
                  <label className="inline-flex items-center gap-1 text-[10px] text-slate-600"><input type="checkbox" checked={!!e.flag} onChange={(ev) => set(f.id, { flag: ev.target.checked })} />{T("abnormal", "óeðlilegt")}</label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {playerId && (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={save} disabled={saving || numFields === 0} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
            {saving ? T("Saving…", "Vista…") : T(`Save clinical assessment (${numFields})`, `Vista klínískt mat (${numFields})`)}
          </button>
          {msg && <span className="text-[11px] text-slate-600">{msg}</span>}
        </div>
      )}
      {playerId && <p className="text-[9px] text-slate-500">{L(KING_ASSESSMENT_CAVEAT)}</p>}
    </div>
  );
}

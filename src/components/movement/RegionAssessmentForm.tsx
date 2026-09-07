"use client";

/**
 * Region assessment (OsteoSport-style, step 2b). The coach records each
 * assessable field of a body region; the region + priority fields are seeded by
 * the AI analysis carry-over (starred ★). Flagged fields (moderate+) feed the
 * corrective loop — the same prescribe → send-to-player path as the test screen,
 * rebuilt server-side from the saved assessment. Screening / training only —
 * never a diagnosis, never the readiness colour; pain / red flags → clinician.
 */
import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { REGIONS, REGION_BY_KEY, type RegionKey } from "@/lib/micropulse/movementScreen/vision/regions";
import { MOVEMENT_CARRYOVER_KEY, MOVEMENT_CARRYOVER_EVENT } from "@/lib/micropulse/movementScreen/vision/carryover";
import type { Severity } from "@/lib/micropulse/movementScreen/registry";

const SEVERITIES: Severity[] = ["ok", "mild", "moderate", "marked"];
type Player = { id: string; full_name: string | null };
type FieldState = { severity: Severity; note: string };

export default function RegionAssessmentForm({ playerId: playerIdProp, onPlayerChange }: { playerId?: string; onPlayerChange?: (id: string) => void } = {}) {
  const [lang] = useLang();
  const is = lang === "IS";
  const T = (en: string, isT: string) => (is ? isT : en);

  const [players, setPlayers] = React.useState<Player[]>([]);
  const [teamId, setTeamId] = React.useState("");
  const [playerIdInternal, setPlayerIdInternal] = React.useState("");
  const playerId = playerIdProp ?? playerIdInternal;
  const setPlayerId = onPlayerChange ?? setPlayerIdInternal;
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [region, setRegion] = React.useState<RegionKey>("knee");
  const [priority, setPriority] = React.useState<string[]>([]);
  const [fromCarryover, setFromCarryover] = React.useState(false);
  const [fields, setFields] = React.useState<Record<string, FieldState>>({});
  const [pain, setPain] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "", []);

  React.useEffect(() => {
    (async () => {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;
      const { data: prof } = await sb.from("profiles").select("team_id").eq("id", uid).maybeSingle();
      const tid = (prof as { team_id?: string } | null)?.team_id ?? "";
      setTeamId(tid);
      const { data } = await sb.from("players").select("id, full_name").eq("team_id", tid).eq("is_active", true).order("full_name");
      setPlayers((data ?? []) as Player[]);
    })();
  }, []);

  // Reset the field grid whenever the region changes.
  React.useEffect(() => {
    const next: Record<string, FieldState> = {};
    for (const f of REGION_BY_KEY[region]?.fields ?? []) next[f.id] = { severity: "ok", note: "" };
    setFields(next);
    setSaved(false);
  }, [region]);

  // Carry-over from the AI analysis: jump to the region + star its priority fields.
  React.useEffect(() => {
    const apply = (r: RegionKey, pri: string[]) => { setRegion(r); setPriority(pri); setFromCarryover(true); };
    try {
      const raw = sessionStorage.getItem(MOVEMENT_CARRYOVER_KEY);
      if (raw) { const c = JSON.parse(raw) as { region?: RegionKey; priorityFieldIds?: string[] }; if (c.region) apply(c.region, c.priorityFieldIds ?? []); }
    } catch { /* private mode */ }
    const onEvent = (e: Event) => { const d = (e as CustomEvent).detail as { region?: RegionKey; priorityFieldIds?: string[] } | undefined; if (d?.region) apply(d.region, d.priorityFieldIds ?? []); };
    window.addEventListener(MOVEMENT_CARRYOVER_EVENT, onEvent);
    return () => window.removeEventListener(MOVEMENT_CARRYOVER_EVENT, onEvent);
  }, []);

  const setField = (id: string, patch: Partial<FieldState>) => setFields((f) => ({ ...f, [id]: { ...f[id], ...patch } }));

  const save = async () => {
    setBusy(true); setMsg(null); setSaved(false);
    try {
      const fieldArr = Object.entries(fields).map(([fieldId, f]) => ({ fieldId, severity: f.severity, note: f.note.trim() || null }));
      const res = await fetch("/api/coach/movement-region-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ team_id: teamId, player_id: playerId || null, assessment_date: date, region, fields: fieldArr, pain_reported: pain, from_carryover: fromCarryover }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setSaved(true);
      setMsg(T("Assessment saved.", "Mat vistað."));
    } catch (e) {
      setMsg(T("Could not save", "Náði ekki að vista") + ": " + (e instanceof Error ? e.message : "error"));
    } finally { setBusy(false); }
  };

  const regionFields = REGION_BY_KEY[region]?.fields ?? [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-[12px] text-slate-600">{T("Region", "Svæði")}
          <select value={region} onChange={(e) => { setRegion(e.target.value as RegionKey); setPriority([]); setFromCarryover(false); }} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]">
            {REGIONS.map((r) => <option key={r.key} value={r.key}>{is ? r.label.is : r.label.en}</option>)}
          </select>
        </label>
        <label className="text-[12px] text-slate-600">{T("Player", "Leikmaður")}
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]">
            <option value="">{T("— pick a player —", "— veldu leikmann —")}</option>
            {players.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? "—"}</option>)}
          </select>
        </label>
        <label className="text-[12px] text-slate-600">{T("Date", "Dagsetning")}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
        </label>
      </div>

      {fromCarryover && priority.length > 0 && (
        <p className="mt-2 text-[11px] text-[#2740e6]">★ {T("Priority fields from the analysis are starred below.", "Forgangsreitir úr greiningunni eru stjörnumerktir að neðan.")}</p>
      )}

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {regionFields.map((f) => {
          const starred = priority.includes(f.id);
          return (
            <div key={f.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 ${starred ? "border-[#2740e6]/40 bg-[#2740e6]/5" : "border-slate-100"}`}>
              <div className="w-56 shrink-0 text-[12px] text-slate-800">
                {starred && <span className="mr-1 text-[#2740e6]">★</span>}
                {is ? f.label.is : f.label.en}
                {f.note && <span className="ml-1 text-[9px] text-slate-400">{is ? f.note.is : f.note.en}</span>}
              </div>
              <select value={fields[f.id]?.severity ?? "ok"} onChange={(e) => setField(f.id, { severity: e.target.value as Severity })} className="rounded border border-slate-300 px-1.5 py-1 text-[12px]">
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input value={fields[f.id]?.note ?? ""} onChange={(e) => setField(f.id, { note: e.target.value })} placeholder={T("note", "athugasemd")} className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1 text-[12px]" />
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1 text-[12px] text-slate-600"><input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} />{T("Pain / red flag", "Verkur / rautt flagg")}</label>
        <button onClick={save} disabled={busy} className="rounded-lg bg-[#2740e6] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
          {busy ? T("Saving…", "Vista…") : T("Save assessment", "Vista mat")}
        </button>
        {msg && <span className="text-[12px] text-slate-600">{msg}</span>}
      </div>

      {pain && saved && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">⚑ {T("Pain reported — no corrective interpretation offered. Route to a clinician.", "Verkur skráður — engin leiðréttingar-túlkun. Vísaðu til klíníkers.")}</p>
      )}

      {saved && !pain && (
        <p className="mt-3 rounded-lg border border-[#7a5cc4]/30 bg-[#7a5cc4]/5 px-3 py-2 text-[12px] text-slate-600">
          {T("Saved. Open the ", "Vistað. Opnaðu ")}<span className="font-semibold text-[#5a3ea4]">{T("Correctives", "Corrective æfingar")}</span>{T(" tab to review & send the corrective exercises (merged with the screen + VALD).", " flipann til að fara yfir & senda corrective æfingar (sameinað við skimun + VALD).")}</p>
      )}
    </div>
  );
}

"use client";

/**
 * ClinicalReportsClient — upload a physio/clinical PDF, let AI READ it into a
 * structured proposal, then a human reviews every field against the original
 * text (cite-the-source) and confirms. Only on confirm is anything written to
 * the player's injury / risk data. AI proposes, the human commits. Health/PHI:
 * coach/medical staff only, team-scoped, private-bucket signed URLs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Side = "left" | "right" | "bilateral" | null;
type ExtractedInjury = { body_part: string; side: Side; type: string | null; approx_duration: string | null; status: string | null };
type ExtractedFinding = { finding: string; side: Side; location: string | null };
type Extracted = {
  player_name: string | null;
  report_date: string | null;
  clinician: { name: string | null; licence: string | null; clinic: string | null; email: string | null } | null;
  injury_history: ExtractedInjury[];
  current_status: string | null;
  clinical_findings: ExtractedFinding[];
  prevention_targets: string[];
  return_to_play: { status: string | null; match_fitness: string | null } | null;
};
type Report = {
  id: string;
  player_id: string | null;
  player_name_raw: string | null;
  report_date: string | null;
  clinician_name: string | null;
  file_name: string;
  extracted_json: Extracted | null;
  raw_text: string | null;
  status: "uploaded" | "extracted" | "confirmed";
  confirmed_at: string | null;
  created_at: string;
  url: string | null;
};
type Player = { id: string; full_name: string };

const EMPTY: Extracted = {
  player_name: null, report_date: null, clinician: { name: null, licence: null, clinic: null, email: null },
  injury_history: [], current_status: null, clinical_findings: [], prevention_targets: [], return_to_play: { status: null, match_fitness: null },
};

const SIDE_OPTS: { v: Side; en: string; is: string }[] = [
  { v: null, en: "—", is: "—" },
  { v: "left", en: "Left", is: "Vinstri" },
  { v: "right", en: "Right", is: "Hægri" },
  { v: "bilateral", en: "Bilateral", is: "Báðum megin" },
];

export default function ClinicalReportsClient() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [teamId, setTeamId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [upPlayer, setUpPlayer] = useState("");
  const [upName, setUpName] = useState("");
  const [upDate, setUpDate] = useState("");

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? "", []);

  // Coach team + roster (for linking a report to a player).
  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from("profiles").select("team_id").eq("id", user.id).maybeSingle();
      const tid = (prof as { team_id?: string | null } | null)?.team_id ?? null;
      setTeamId(tid);
      if (tid) {
        const { data: pl } = await supabase.from("players").select("id, full_name").eq("team_id", tid).eq("is_active", true).order("full_name");
        setPlayers((pl ?? []) as Player[]);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = teamId ? `?team_id=${teamId}` : "";
      const res = await fetch(`/api/coach/clinical-reports${qs}`, { headers: { Authorization: `Bearer ${await token()}` } });
      const j = await res.json();
      setReports(res.ok ? (j.reports ?? []) : []);
    } catch { setReports([]); }
    finally { setLoading(false); }
  }, [teamId, token]);
  useEffect(() => { if (teamId !== null || !loading) void load(); }, [load, teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p.full_name])), [players]);

  const onPick = async (file: File) => {
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (upPlayer) fd.append("player_id", upPlayer);
      else fd.append("player_name_raw", (upName.trim() || file.name.replace(/\.[^.]+$/, "")));
      if (!upPlayer && teamId) fd.append("team_id", teamId);
      if (upDate) fd.append("report_date", upDate);
      const res = await fetch(`/api/coach/clinical-reports`, { method: "POST", headers: { Authorization: `Bearer ${await token()}` }, body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Upload failed"); return; }
      setUpName(""); setUpDate(""); setUpPlayer("");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const extract = async (id: string) => {
    setWorking(id); setErr(null);
    try {
      const res = await fetch(`/api/coach/clinical-reports/${id}/extract`, { method: "POST", headers: { Authorization: `Bearer ${await token()}` } });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "AI extraction failed"); return; }
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setWorking(null); }
  };

  const confirm = async (id: string, extracted: Extracted, playerId: string | null) => {
    setWorking(id); setErr(null);
    try {
      const res = await fetch(`/api/coach/clinical-reports/${id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ extracted, player_id: playerId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Confirm failed"); return; }
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setWorking(null); }
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(is ? "is-IS" : "en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{is ? "Klínískar skýrslur" : "Clinical reports"}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {is
            ? "Hladdu upp sjúkraþjálfara-/læknaskýrslu (PDF). AI les hana í uppkast — þú yfirferð hvert atriði á móti frumtextanum og staðfestir. Ekkert er skráð fyrr en þú staðfestir."
            : "Upload a physio / clinical report (PDF). AI reads it into a draft — you review every field against the original text and confirm. Nothing is written until you confirm."}
        </p>
        <p className="mt-1 text-[11px] text-slate-400">
          {is ? "Heilsugögn — aðgangur er bundinn við þjálfara/læknateymi liðsins." : "Health data — access is restricted to the team's coach / medical staff."}
        </p>
      </div>

      {/* Upload */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Ný skýrsla" : "New report"}</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-slate-600">
            {is ? "Leikmaður" : "Player"}
            <select value={upPlayer} onChange={(e) => setUpPlayer(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm">
              <option value="">{is ? "— tengja síðar (nafn) —" : "— link later (by name) —"}</option>
              {players.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </label>
          {!upPlayer && (
            <label className="text-xs text-slate-600">
              {is ? "Nafn á skýrslu" : "Name on report"}
              <input value={upName} onChange={(e) => setUpName(e.target.value)} placeholder={is ? "t.d. Jón Jónsson" : "e.g. John Smith"} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
            </label>
          )}
          <label className="text-xs text-slate-600">
            {is ? "Dagsetning (valfrjáls)" : "Report date (optional)"}
            <input type="date" value={upDate} onChange={(e) => setUpDate(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
          </label>
        </div>
        <div className="mt-3">
          <label className="inline-flex cursor-pointer items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
            {busy ? "…" : (is ? "Veldu PDF og hladdu upp" : "Choose PDF & upload")}
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPick(f); }} />
          </label>
        </div>
      </div>

      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      {/* List */}
      <div className="space-y-3">
        {loading && <div className="text-sm text-slate-400">{is ? "Hleð…" : "Loading…"}</div>}
        {!loading && reports.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            {is ? "Engar skýrslur enn." : "No reports yet."}
          </div>
        )}
        {reports.map((r) => (
          <ReportRow
            key={r.id}
            report={r}
            players={players}
            playerName={r.player_id ? nameById.get(r.player_id) ?? r.player_name_raw : r.player_name_raw}
            is={is}
            working={working === r.id}
            onExtract={() => extract(r.id)}
            onConfirm={(ex, pid) => confirm(r.id, ex, pid)}
            fmtDate={fmtDate}
          />
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status, is }: { status: Report["status"]; is: boolean }) {
  const map = {
    uploaded: { c: "bg-slate-100 text-slate-600", en: "uploaded", is: "hlaðið upp" },
    extracted: { c: "bg-amber-100 text-amber-700", en: "review", is: "yfirferð" },
    confirmed: { c: "bg-emerald-100 text-emerald-700", en: "confirmed ✓", is: "staðfest ✓" },
  }[status];
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${map.c}`}>{is ? map.is : map.en}</span>;
}

function ReportRow({
  report, players, playerName, is, working, onExtract, onConfirm, fmtDate,
}: {
  report: Report;
  players: Player[];
  playerName: string | null | undefined;
  is: boolean;
  working: boolean;
  onExtract: () => void;
  onConfirm: (ex: Extracted, playerId: string | null) => void;
  fmtDate: (iso: string) => string;
}) {
  const [open, setOpen] = useState(report.status === "extracted");
  const [showSource, setShowSource] = useState(false);
  const [draft, setDraft] = useState<Extracted>(report.extracted_json ?? EMPTY);
  const [linkPlayer, setLinkPlayer] = useState(report.player_id ?? "");
  // Re-seed the draft when a fresh extraction arrives (re-read returns a new
  // object). React-recommended "adjust state during render" — not an effect.
  const [seededFrom, setSeededFrom] = useState(report.extracted_json);
  if (report.extracted_json !== seededFrom) {
    setSeededFrom(report.extracted_json);
    setDraft(report.extracted_json ?? EMPTY);
  }

  const set = <K extends keyof Extracted>(k: K, v: Extracted[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setClin = (k: keyof NonNullable<Extracted["clinician"]>, v: string) =>
    setDraft((d) => ({ ...d, clinician: { name: null, licence: null, clinic: null, email: null, ...(d.clinician ?? {}), [k]: v || null } }));
  const setRtp = (k: "status" | "match_fitness", v: string) =>
    setDraft((d) => ({ ...d, return_to_play: { status: null, match_fitness: null, ...(d.return_to_play ?? {}), [k]: v || null } }));

  const needsPlayer = !report.player_id && !linkPlayer;
  const confirmed = report.status === "confirmed";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-800">{playerName || report.file_name}</span>
            <StatusPill status={report.status} is={is} />
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {report.report_date ? fmtDate(report.report_date) : fmtDate(report.created_at)}
            {report.clinician_name ? ` · ${report.clinician_name}` : ""}
            {!report.player_id && report.player_name_raw ? ` · ${is ? "ótengt" : "unlinked"}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {report.status === "uploaded" && (
            <button type="button" disabled={working} onClick={onExtract} className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {working ? (is ? "Les…" : "Reading…") : (is ? "Lesa með AI" : "Read with AI")}
            </button>
          )}
          {report.status !== "uploaded" && (
            <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              {open ? (is ? "Loka" : "Close") : (is ? "Yfirferð" : "Review")}
            </button>
          )}
          {report.url && (
            <a href={report.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">{is ? "PDF" : "PDF"}</a>
          )}
        </div>
      </div>

      {open && report.status !== "uploaded" && (
        <div className="border-t border-slate-100 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {is ? "Lesið úr skýrslu (AI) — yfirfarið" : "Read from report (AI) — reviewed"}
            </span>
            {report.raw_text && (
              <button type="button" onClick={() => setShowSource((v) => !v)} className="text-[11px] font-medium text-slate-500 hover:text-slate-700">
                {showSource ? (is ? "Fela frumtexta" : "Hide source text") : (is ? "Sýna frumtexta" : "Show source text")}
              </button>
            )}
          </div>

          {showSource && report.raw_text && (
            <pre className="mb-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] leading-snug text-slate-600">{report.raw_text}</pre>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={is ? "Nafn" : "Name"} value={draft.player_name} onChange={(v) => set("player_name", v || null)} disabled={confirmed} />
            <Field label={is ? "Dagsetning" : "Report date"} value={draft.report_date} onChange={(v) => set("report_date", v || null)} disabled={confirmed} placeholder="YYYY-MM-DD" />
            <Field label={is ? "Sjúkraþjálfari" : "Clinician"} value={draft.clinician?.name ?? null} onChange={(v) => setClin("name", v)} disabled={confirmed} />
            <Field label={is ? "Stofa" : "Clinic"} value={draft.clinician?.clinic ?? null} onChange={(v) => setClin("clinic", v)} disabled={confirmed} />
          </div>

          {/* Current status */}
          <div className="mt-3">
            <Field label={is ? "Staða núna" : "Current status"} value={draft.current_status} onChange={(v) => set("current_status", v || null)} disabled={confirmed} textarea />
          </div>

          {/* Injury history */}
          <ListSection
            title={is ? "Meiðslasaga → færist í meiðslaskrá" : "Injury history → files to injury log"}
            is={is} disabled={confirmed}
            items={draft.injury_history}
            onAdd={() => set("injury_history", [...draft.injury_history, { body_part: "", side: null, type: null, approx_duration: null, status: null }])}
            onRemove={(i) => set("injury_history", draft.injury_history.filter((_, ix) => ix !== i))}
            render={(it, i) => (
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label={is ? "Líkamshluti" : "Body part"} value={it.body_part} onChange={(v) => set("injury_history", draft.injury_history.map((x, ix) => ix === i ? { ...x, body_part: v } : x))} disabled={confirmed} />
                <SideField label={is ? "Hlið" : "Side"} value={it.side} onChange={(v) => set("injury_history", draft.injury_history.map((x, ix) => ix === i ? { ...x, side: v } : x))} disabled={confirmed} is={is} />
                <Field label={is ? "Tegund" : "Type"} value={it.type} onChange={(v) => set("injury_history", draft.injury_history.map((x, ix) => ix === i ? { ...x, type: v || null } : x))} disabled={confirmed} />
                <Field label={is ? "Staða" : "Status"} value={it.status} onChange={(v) => set("injury_history", draft.injury_history.map((x, ix) => ix === i ? { ...x, status: v || null } : x))} disabled={confirmed} />
              </div>
            )}
          />

          {/* Clinical findings */}
          <ListSection
            title={is ? "Klínísk atriði → áhættu-/varúðarmerki" : "Clinical findings → risk / watch flags"}
            is={is} disabled={confirmed}
            items={draft.clinical_findings}
            onAdd={() => set("clinical_findings", [...draft.clinical_findings, { finding: "", side: null, location: null }])}
            onRemove={(i) => set("clinical_findings", draft.clinical_findings.filter((_, ix) => ix !== i))}
            render={(it, i) => (
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label={is ? "Atriði" : "Finding"} value={it.finding} onChange={(v) => set("clinical_findings", draft.clinical_findings.map((x, ix) => ix === i ? { ...x, finding: v } : x))} disabled={confirmed} />
                <SideField label={is ? "Hlið" : "Side"} value={it.side} onChange={(v) => set("clinical_findings", draft.clinical_findings.map((x, ix) => ix === i ? { ...x, side: v } : x))} disabled={confirmed} is={is} />
                <Field label={is ? "Staðsetning" : "Location"} value={it.location} onChange={(v) => set("clinical_findings", draft.clinical_findings.map((x, ix) => ix === i ? { ...x, location: v || null } : x))} disabled={confirmed} />
              </div>
            )}
          />

          {/* Prevention targets (string list) */}
          <ListSection
            title={is ? "Forvarnir → varúðarmerki" : "Prevention targets → prevention flags"}
            is={is} disabled={confirmed}
            items={draft.prevention_targets}
            onAdd={() => set("prevention_targets", [...draft.prevention_targets, ""])}
            onRemove={(i) => set("prevention_targets", draft.prevention_targets.filter((_, ix) => ix !== i))}
            render={(it, i) => (
              <Field label={is ? "Forvörn" : "Prevention"} value={it} onChange={(v) => set("prevention_targets", draft.prevention_targets.map((x, ix) => ix === i ? v : x))} disabled={confirmed} />
            )}
          />

          {/* Return to play */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Field label={is ? "Endurkoma — staða" : "Return to play — status"} value={draft.return_to_play?.status ?? null} onChange={(v) => setRtp("status", v)} disabled={confirmed} />
            <Field label={is ? "Leikhæfni" : "Match fitness"} value={draft.return_to_play?.match_fitness ?? null} onChange={(v) => setRtp("match_fitness", v)} disabled={confirmed} />
          </div>

          {/* Confirm bar */}
          {!confirmed && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <div className="flex items-center gap-2">
                {!report.player_id && (
                  <label className="text-xs text-slate-600">
                    {is ? "Tengja við leikmann" : "Link to player"}
                    <select value={linkPlayer} onChange={(e) => setLinkPlayer(e.target.value)} className="ml-2 h-8 rounded-lg border border-slate-300 px-2 text-sm">
                      <option value="">{is ? "— veldu —" : "— select —"}</option>
                      {players.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" disabled={working} onClick={onExtract} className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50">{is ? "Lesa aftur" : "Re-read"}</button>
                <button
                  type="button"
                  disabled={working || needsPlayer}
                  onClick={() => onConfirm(draft, report.player_id ?? (linkPlayer || null))}
                  title={needsPlayer ? (is ? "Tengdu skýrsluna við leikmann fyrst" : "Link the report to a player first") : undefined}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  {working ? "…" : (is ? "Staðfesta og skrá" : "Confirm & file")}
                </button>
              </div>
            </div>
          )}

          <p className="mt-3 text-[10px] text-slate-400">
            {is
              ? "AI las þetta úr skjalinu og getur haft rangt fyrir sér. Athugasemd sjúkraþjálfarans er heimildin — yfirfarðu á móti frumtextanum áður en þú staðfestir."
              : "AI read this from the document and can be wrong. The clinician's note is authoritative — check it against the source text before confirming."}
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, disabled, placeholder, textarea }: {
  label: string; value: string | null; onChange: (v: string) => void; disabled?: boolean; placeholder?: string; textarea?: boolean;
}) {
  return (
    <label className="block text-[11px] font-medium text-slate-500">
      {label}
      {textarea ? (
        <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder}
          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-50 disabled:text-slate-500" rows={2} />
      ) : (
        <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder}
          className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm text-slate-800 disabled:bg-slate-50 disabled:text-slate-500" />
      )}
    </label>
  );
}

function SideField({ label, value, onChange, disabled, is }: { label: string; value: Side; onChange: (v: Side) => void; disabled?: boolean; is: boolean }) {
  return (
    <label className="block text-[11px] font-medium text-slate-500">
      {label}
      <select value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as Side)} disabled={disabled}
        className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm text-slate-800 disabled:bg-slate-50 disabled:text-slate-500">
        {SIDE_OPTS.map((o) => <option key={o.en} value={o.v ?? ""}>{is ? o.is : o.en}</option>)}
      </select>
    </label>
  );
}

function ListSection<T>({ title, items, render, onAdd, onRemove, disabled, is }: {
  title: string; items: T[]; render: (it: T, i: number) => React.ReactNode; onAdd: () => void; onRemove: (i: number) => void; disabled?: boolean; is: boolean;
}) {
  return (
    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</span>
        {!disabled && <button type="button" onClick={onAdd} className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700">+ {is ? "Bæta við" : "Add"}</button>}
      </div>
      {items.length === 0 && <div className="text-[11px] text-slate-400">{is ? "Ekkert skráð." : "None."}</div>}
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="rounded-md border border-slate-200 bg-white p-2">
            {render(it, i)}
            {!disabled && <button type="button" onClick={() => onRemove(i)} className="mt-1 text-[10px] text-slate-400 hover:text-red-600">{is ? "Fjarlægja" : "Remove"}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

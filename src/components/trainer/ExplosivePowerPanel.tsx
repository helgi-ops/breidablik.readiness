"use client";

/**
 * ExplosivePowerPanel — 12-week explosive-power programme browser + assignment.
 *
 * Lives inside the TrainerDashboard (PT side only). Coach picks a level,
 * expands a phase, sees the full PUSH/PULL/COMBO prescription tables with
 * a YELLOW and RED daily-readiness sub-column on every row, and can assign
 * the programme to a client.
 *
 * Reads from /api/coach/pt-explosive (system-wide library, per-trainer
 * assignments). Library is the same dataset for every trainer; assignments
 * are scoped to the calling trainer.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { SEASON_PHASES, SEASON_PHASE_SPEC, type SeasonPhase } from "@/lib/client/seasonPhase";
import ExerciseInfo from "@/components/exercise/ExerciseInfo";
import { buildExerciseIndex, resolveExercise, type ExerciseIndex } from "@/lib/exercise/matchLibrary";

type Row = {
  num: string;
  exercise: string;
  reps: string;
  sets: number;
  velocity: string | number;
  pct1rm: number | null;
  dropoff: number | string | null;
  cluster_rest: string;
  set_rest: string;
  method: string;
  yellow_sub: string;
  red_sub: string;
};
type Block = { name: string; rows: Row[] };
type Programme = {
  id: string;
  programme_key: string;
  programme_name: string;
  level: "beginner" | "intermediate" | "advanced";
  phase: number;
  phase_name: string;
  weeks_label: string;
  focus: string;
  methods: string[];
  blocks: Block[];
  owner_user_id?: string | null;
  is_system?: boolean;
};
type Assignment = {
  id: string;
  client_id: string;
  level: "beginner" | "intermediate" | "advanced";
  start_date: string;
  current_phase: number;
  status: string;
  notes: string | null;
  season_phase: SeasonPhase | null;
  sessions_per_week: number | null;
};
type Client = { id: string; name: string };

const METHOD_TINT: Record<string, string> = {
  "WL Derivative":   "bg-orange-100 text-orange-800",
  "Cluster":         "bg-blue-100 text-blue-800",
  "Contrast":        "bg-pink-100 text-pink-800",
  "French Contrast": "bg-purple-100 text-purple-800",
  "Plyo":            "bg-teal-100 text-teal-800",
  "VBT":             "bg-blue-100 text-blue-800",
  "Isometric":       "bg-rose-100 text-rose-800",
  "RFD":             "bg-orange-100 text-orange-800",
  "Resistance":      "bg-slate-100 text-slate-700",
  "Accessory":       "bg-slate-50 text-slate-600",
};

// Map "Day 1/2/3/4" prefixes to weekdays for the research_3_4day variant.
// Pattern keeps a built-in rest mid-week:
//   4 days/week → Mon, Tue, Thu, Fri (skip Wednesday)
//   3 days/week → Mon, Wed, Fri (every-other-day)
// Only the leading "Day N — " prefix is replaced — the descriptor after
// the em-dash ("Lower Strength", etc.) is preserved unchanged.
const WEEKDAY_LABEL: Record<"IS" | "EN", { four: string[]; three: string[] }> = {
  IS: {
    four:  ["Mánudagur", "Þriðjudagur", "Fimmtudagur", "Föstudagur"],
    three: ["Mánudagur", "Miðvikudagur", "Föstudagur"],
  },
  EN: {
    four:  ["Monday", "Tuesday", "Thursday", "Friday"],
    three: ["Monday", "Wednesday", "Friday"],
  },
};

function applyWeekdayPrefix(blockName: string, dayCount: number, lang: "IS" | "EN"): string {
  const m = blockName.match(/^Day\s+(\d+)\s*[—–-]\s*(.+)$/);
  if (!m) return blockName;
  const idx = Number(m[1]) - 1;
  const rest = m[2];
  const pick = dayCount === 4 ? WEEKDAY_LABEL[lang].four
            : dayCount === 3 ? WEEKDAY_LABEL[lang].three
            : null;
  if (!pick || idx < 0 || idx >= pick.length) return blockName;
  return `${pick[idx]} — ${rest}`;
}

interface Props {
  clients: Client[];
  lang: "IS" | "EN";
}

export default function ExplosivePowerPanel({ clients, lang }: Props) {
  const [library, setLibrary] = useState<Programme[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [activeProgramme, setActiveProgramme] = useState<string>("phase_based");
  const [activeLevel, setActiveLevel] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [openPhase, setOpenPhase] = useState<number | null>(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [assignClientId, setAssignClientId] = useState<string>(clients[0]?.id ?? "");
  const [assignLevel, setAssignLevel] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [assignDate, setAssignDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [assignSeason, setAssignSeason] = useState<SeasonPhase | "">("");
  // "" = run at the programme's native weekly frequency; 2-5 = override.
  const [assignFreq, setAssignFreq] = useState<string>("");
  const [assignBusy, setAssignBusy] = useState(false);

  // Exercise glossary index — used to attach bilingual explanations (info icon)
  // to the free-text exercise names where a confident library match exists.
  const [exerciseIdx, setExerciseIdx] = useState<ExerciseIndex | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error(lang === "IS" ? "Ekki innskráð(ur)" : "Not signed in");
      const res = await fetch("/api/coach/pt-explosive", { headers: { Authorization: `Bearer ${token}` } });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to load");
      setLibrary(j.library);
      setMe(j.me ?? null);
      setAssignments(j.assignments);
      // Best-effort glossary load — non-fatal if it fails (icons simply absent).
      try {
        const gRes = await fetch("/api/coach/exercise-glossary", { headers: { Authorization: `Bearer ${token}` } });
        if (gRes.ok) {
          const gJson = await gRes.json();
          setExerciseIdx(buildExerciseIndex(gJson.exercises ?? []));
        }
      } catch { /* ignore */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { refresh(); }, [refresh]);

  // Programme variants available (unique keys). Sorted so phase_based shows first.
  const programmeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of library) map.set(p.programme_key, p.programme_name);
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [library]);

  // Ownership per programme_key (rows for a key share owner / is_system).
  const programmeMeta = useMemo(() => {
    const map = new Map<string, { ownerUserId: string | null; isSystem: boolean }>();
    for (const p of library) {
      if (!map.has(p.programme_key)) {
        map.set(p.programme_key, { ownerUserId: p.owner_user_id ?? null, isSystem: !!p.is_system });
      }
    }
    return map;
  }, [library]);

  async function toggleOwnership(programmeKey: string, ownership: "mine" | "shared") {
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/coach/pt-explosive", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ programmeKey, ownership }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const phasesForLevel = useMemo(
    () => library
      .filter((p) => p.programme_key === activeProgramme && p.level === activeLevel)
      .sort((a, b) => a.phase - b.phase),
    [library, activeProgramme, activeLevel],
  );

  async function assign() {
    if (!assignClientId) return;
    setAssignBusy(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/coach/pt-explosive", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId: assignClientId, level: assignLevel, startDate: assignDate, programmeKey: activeProgramme, seasonPhase: assignSeason || undefined, sessionsPerWeek: assignFreq ? Number(assignFreq) : undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Assign failed");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAssignBusy(false);
    }
  }

  async function patchAssign(id: string, body: Record<string, unknown>) {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    await fetch("/api/coach/pt-explosive", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ assignmentId: id, ...body }),
    });
    await refresh();
  }

  async function deleteAssign(id: string) {
    if (!confirm(lang === "IS" ? "Eyða þessari úthlutun?" : "Delete this assignment?")) return;
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    await fetch(`/api/coach/pt-explosive?assignmentId=${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    await refresh();
  }

  const clientName = (id: string) => clients.find((p) => p.id === id)?.name ?? id.slice(0, 6);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-900">
          {lang === "IS" ? "12 vikna sprengikrafta-prógramm" : "12-Week Explosive-Power Programme"}
        </h2>
        <p className="text-sm text-slate-600">
          {lang === "IS"
            ? "4 fasar × 3 vikur. Veldu stig — sjáðu pörun heavy + plyó, cluster-set, French Contrast og daglega Green/Yellow/Red aðlögun fyrir hverja æfingu."
            : "4 phases × 3 weeks. Pick a level — see heavy + plyo pairings, cluster sets, French Contrast, and the daily Green/Yellow/Red readiness adaptation for every exercise."}
        </p>
      </header>

      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {/* Programme picker */}
      {programmeOptions.length > 1 ? (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {lang === "IS" ? "Prógramm" : "Programme"}
          </div>
          <div className="flex flex-wrap gap-2">
            {programmeOptions.map(([key, name]) => {
              const mine = !!me && programmeMeta.get(key)?.ownerUserId === me;
              return (
                <button
                  key={key}
                  onClick={() => { setActiveProgramme(key); setOpenPhase(1); }}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${
                    activeProgramme === key
                      ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {name}
                  {mine ? (
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-indigo-700">
                      {lang === "IS" ? "Mitt" : "Mine"}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {/* Ownership toggle — only for trainer-authored (non-system) programmes. */}
          {(() => {
            const meta = programmeMeta.get(activeProgramme);
            if (!meta || meta.isSystem) return null;
            const mine = !!me && meta.ownerUserId === me;
            return (
              <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
                <span>
                  {mine
                    ? (lang === "IS" ? "Þetta kerfi er merkt þér (aðrir þjálfarar sjá það ekki)." : "This programme is private to you (other trainers can't see it).")
                    : (lang === "IS" ? "Þetta kerfi er sameiginlegt öllum þjálfurum." : "This programme is shared with all trainers.")}
                </span>
                <button
                  type="button"
                  onClick={() => toggleOwnership(activeProgramme, mine ? "shared" : "mine")}
                  className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  {mine
                    ? (lang === "IS" ? "Gera sameiginlegt" : "Make shared")
                    : (lang === "IS" ? "Merkja mér" : "Make mine")}
                </button>
              </div>
            );
          })()}
        </div>
      ) : null}

      <div className="flex gap-2">
        {(["beginner", "intermediate", "advanced"] as const).map((lv) => (
          <button
            key={lv}
            onClick={() => setActiveLevel(lv)}
            className={`rounded-full border px-4 py-2 text-sm font-medium ${
              activeLevel === lv
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {lv === "beginner" ? (lang === "IS" ? "Byrjandi" : "Beginner") :
             lv === "intermediate" ? (lang === "IS" ? "Vanur" : "Intermediate") :
             (lang === "IS" ? "Vönduður" : "Advanced")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>
      ) : (
        <div className="space-y-3">
          {phasesForLevel.map((p) => (
            <section key={p.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <button
                onClick={() => setOpenPhase(openPhase === p.phase ? null : p.phase)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {lang === "IS" ? `Fasi ${p.phase} · ${p.phase_name}` : `Phase ${p.phase} · ${p.phase_name}`}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{p.weeks_label} · {p.focus}</div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {p.methods.slice(0, 4).map((m) => (
                    <span key={m} className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${METHOD_TINT[m] ?? "bg-slate-100 text-slate-700"}`}>{m}</span>
                  ))}
                  {p.methods.length > 4 ? <span className="text-[10px] text-slate-500">+{p.methods.length - 4}</span> : null}
                </div>
              </button>

              {openPhase === p.phase ? (
                <div className="border-t border-slate-200 bg-slate-50/30 px-4 py-3 space-y-4">
                  {p.blocks.map((blk) => {
                    // Swap "Day 1/2/3/4 — …" for weekday labels in the
                    // research_3_4day variant. 4d → Mon/Tue/Thu/Fri,
                    // 3d → Mon/Wed/Fri (skips a mid-week recovery day).
                    // phase_based blocks (PUSH/PULL/COMBO) are unaffected.
                    const displayName = p.programme_key === "research_3_4day"
                      ? applyWeekdayPrefix(blk.name, p.blocks.length, lang)
                      : blk.name;
                    return (
                    <div key={blk.name}>
                      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">{displayName}</div>
                      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                        <table className="min-w-full text-xs">
                          <thead className="bg-slate-900 text-white">
                            <tr>
                              <th className="px-2 py-1.5 text-left">#</th>
                              <th className="px-2 py-1.5 text-left">{lang === "IS" ? "Æfing" : "Exercise"}</th>
                              <th className="px-2 py-1.5 text-center">{lang === "IS" ? "Endurt." : "Reps"}</th>
                              <th className="px-2 py-1.5 text-center">Sets</th>
                              <th className="px-2 py-1.5 text-center">{lang === "IS" ? "Hraði" : "Velocity"}</th>
                              <th className="px-2 py-1.5 text-center">%1RM</th>
                              <th className="px-2 py-1.5 text-center">Drop-off</th>
                              <th className="px-2 py-1.5 text-center">Cluster</th>
                              <th className="px-2 py-1.5 text-center">{lang === "IS" ? "Hvíld" : "Rest"}</th>
                              <th className="px-2 py-1.5 text-center">{lang === "IS" ? "Aðferð" : "Method"}</th>
                              <th className="px-2 py-1.5 text-left bg-yellow-700">YELLOW</th>
                              <th className="px-2 py-1.5 text-left bg-red-700">RED</th>
                            </tr>
                          </thead>
                          <tbody>
                            {blk.rows.map((r, i) => (
                              <tr key={i} className="border-t border-slate-100">
                                <td className="px-2 py-1.5">{r.num}</td>
                                <td className="px-2 py-1.5 font-medium text-slate-900">
                                  {(() => {
                                    const m = exerciseIdx ? resolveExercise(r.exercise, exerciseIdx) : null;
                                    return (
                                      <span className="inline-flex items-center gap-1">
                                        {r.exercise}
                                        {m && <ExerciseInfo name={r.exercise} description={m.description} descriptionIs={m.description_is} videoUrl={m.video_url} />}
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td className="px-2 py-1.5 text-center tabular-nums">{r.reps}</td>
                                <td className="px-2 py-1.5 text-center tabular-nums">{r.sets}</td>
                                <td className="px-2 py-1.5 text-center">{typeof r.velocity === "number" ? `${r.velocity} m/s` : r.velocity}</td>
                                <td className="px-2 py-1.5 text-center">{r.pct1rm != null ? `${Math.round(r.pct1rm * 100)}%` : "—"}</td>
                                <td className="px-2 py-1.5 text-center">{r.dropoff == null ? "—" : typeof r.dropoff === "number" ? `−${r.dropoff.toFixed(2)} m/s` : r.dropoff}</td>
                                <td className="px-2 py-1.5 text-center">{r.cluster_rest}</td>
                                <td className="px-2 py-1.5 text-center">{r.set_rest}</td>
                                <td className="px-2 py-1.5 text-center">
                                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${METHOD_TINT[r.method] ?? "bg-slate-100 text-slate-700"}`}>{r.method}</span>
                                </td>
                                <td className="px-2 py-1.5 bg-yellow-50 text-yellow-900">{r.yellow_sub}</td>
                                <td className="px-2 py-1.5 bg-red-50 text-red-900">{r.red_sub}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">
          {lang === "IS" ? "Úthluta prógrammi" : "Assign programme"}
        </h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-5">
          <select value={assignClientId} onChange={(e) => setAssignClientId(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">
            {clients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={assignLevel} onChange={(e) => setAssignLevel(e.target.value as "beginner" | "intermediate" | "advanced")}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">
            <option value="beginner">{lang === "IS" ? "Byrjandi" : "Beginner"}</option>
            <option value="intermediate">{lang === "IS" ? "Vanur" : "Intermediate"}</option>
            <option value="advanced">{lang === "IS" ? "Vönduður" : "Advanced"}</option>
          </select>
          <select value={assignSeason} onChange={(e) => setAssignSeason(e.target.value as SeasonPhase | "")}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">
            <option value="">{lang === "IS" ? "Tímabil (valfrjálst)" : "Season (optional)"}</option>
            {SEASON_PHASES.map((s) => <option key={s} value={s}>{SEASON_PHASE_SPEC[s].label[lang]}</option>)}
          </select>
          <select value={assignFreq} onChange={(e) => setAssignFreq(e.target.value)}
            title={lang === "IS" ? "Æfingar á viku (sjálfgefið = eins og prógrammið er hannað)" : "Sessions per week (default = the programme's native frequency)"}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">
            <option value="">{lang === "IS" ? "Tíðni: sjálfgefin" : "Frequency: default"}</option>
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}× {lang === "IS" ? "í viku" : "per week"}</option>
            ))}
          </select>
          <input type="date" value={assignDate} onChange={(e) => setAssignDate(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
          <button onClick={assign} disabled={assignBusy || !assignClientId}
            className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {assignBusy ? "…" : (lang === "IS" ? "Úthluta" : "Assign")}
          </button>
        </div>
        {assignSeason && (
          <p className="mt-2 text-[11px] text-slate-500">{SEASON_PHASE_SPEC[assignSeason].note[lang]}</p>
        )}

        {assignments.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-2 py-1.5 text-left">{lang === "IS" ? "Skjólstæðingur" : "Client"}</th>
                  <th className="px-2 py-1.5 text-center">Level</th>
                  <th className="px-2 py-1.5 text-center">{lang === "IS" ? "Byrjar" : "Starts"}</th>
                  <th className="px-2 py-1.5 text-center">{lang === "IS" ? "Tímabil" : "Season"}</th>
                  <th className="px-2 py-1.5 text-center">{lang === "IS" ? "Tíðni" : "Freq"}</th>
                  <th className="px-2 py-1.5 text-center">{lang === "IS" ? "Fasi" : "Phase"}</th>
                  <th className="px-2 py-1.5 text-center">{lang === "IS" ? "Staða" : "Status"}</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 font-medium">{clientName(a.client_id)}</td>
                    <td className="px-2 py-1.5 text-center capitalize">{a.level}</td>
                    <td className="px-2 py-1.5 text-center tabular-nums">{a.start_date}</td>
                    <td className="px-2 py-1.5 text-center">
                      <select value={a.season_phase ?? ""} onChange={(e) => patchAssign(a.id, { seasonPhase: e.target.value || null })}
                        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs">
                        <option value="">—</option>
                        {SEASON_PHASES.map((s) => <option key={s} value={s}>{SEASON_PHASE_SPEC[s].label[lang]}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <select value={a.sessions_per_week ?? ""} onChange={(e) => patchAssign(a.id, { sessionsPerWeek: e.target.value ? Number(e.target.value) : null })}
                        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs">
                        <option value="">{lang === "IS" ? "Sjálfg." : "Default"}</option>
                        {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}×</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <select value={a.current_phase} onChange={(e) => patchAssign(a.id, { currentPhase: Number(e.target.value) })}
                        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs">
                        {[1, 2, 3, 4].map((p) => <option key={p} value={p}>P{p}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <select value={a.status} onChange={(e) => patchAssign(a.id, { status: e.target.value })}
                        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs">
                        <option value="active">active</option>
                        <option value="paused">paused</option>
                        <option value="completed">completed</option>
                        <option value="cancelled">cancelled</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button onClick={() => deleteAssign(a.id)} className="text-red-600 hover:underline">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

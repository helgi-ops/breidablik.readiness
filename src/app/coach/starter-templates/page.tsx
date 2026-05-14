"use client";

/**
 * /coach/starter-templates
 *
 * Browse + assign system-seeded starter programmes. Visible to every PT
 * trainer (no admin gate) — the whole point is to give new trainers
 * something ready to use on day 1.
 *
 * Layout: cards by programme (one per programme_key), expand to see phases.
 * "Use with client" button opens a tiny assignment form (client picker +
 * start date) → POST /api/trainer/starter-templates → adds to assignments
 * list, which renders on the same page so the trainer sees what's active.
 */

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Row = {
  num: string; exercise: string; reps: string; sets: number;
  velocity: string | number; pct1rm: number | null;
  dropoff: number | string | null;
  cluster_rest: string; set_rest: string; method: string;
  yellow_sub: string; red_sub: string;
};
type Block = { name: string; rows: Row[] };
type Reference = {
  citation: string;
  year?: number;
  journal?: string;
  doi?: string;
  focus?: string;
};
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
  audience: string | null;
  short_blurb: string | null;
  weeks_per_phase: number | null;
  references?: Reference[] | null;
};
type Assignment = {
  id: string;
  client_id: string;
  programme_key: string;
  level: "beginner" | "intermediate" | "advanced";
  start_date: string;
  current_phase: number;
  status: string;
  notes: string | null;
};
type Client = { id: string; name: string };

const LEVEL_LABEL: Record<string, { IS: string; EN: string }> = {
  beginner:     { IS: "Byrjandi",  EN: "Beginner" },
  intermediate: { IS: "Vanur",     EN: "Intermediate" },
  advanced:     { IS: "Lengra kominn", EN: "Advanced" },
};

export default function StarterTemplatesPage() {
  const [lang] = useLang();
  const isIS = lang === "IS";
  const t = {
    title:      isIS ? "Tilbúin kerfi" : "Starter templates",
    subtitle:   isIS
      ? "Rannsóknarmiðuð byrjunarkerfi sem þú getur úthlutað skjólstæðingi strax."
      : "Research-backed starter programmes you can assign to a client right away.",
    use:        isIS ? "Nota með skjólstæðingi" : "Use with client",
    pickClient: isIS ? "Veldu skjólstæðing" : "Select client",
    startDate:  isIS ? "Byrjunardagur"   : "Start date",
    assign:     isIS ? "Úthluta"         : "Assign",
    cancel:     isIS ? "Hætta við"       : "Cancel",
    active:     isIS ? "Virk úthlutun"   : "Active assignment",
    weeks:      isIS ? "vikna kerfi"     : "week programme",
    phases:     isIS ? "fasar"           : "phases",
    expand:     isIS ? "Skoða fasa"      : "Show phases",
    collapse:   isIS ? "Loka"            : "Hide",
    loading:    isIS ? "Hleð…"           : "Loading…",
    noTemplates:isIS ? "Engin kerfi til staðar enn." : "No templates yet.",
    assigned:   isIS ? "Úthlutað"        : "Assigned",
    removeAssign: isIS ? "Fjarlægja"     : "Remove",
  };

  const [library, setLibrary] = useState<Programme[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Per-programme expanded-phase state
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openPhase, setOpenPhase] = useState<Record<string, number>>({});

  // Assignment form state (open one at a time)
  const [assignForKey, setAssignForKey] = useState<string | null>(null);
  const [assignLevel, setAssignLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [assignClientId, setAssignClientId] = useState("");
  const [assignDate, setAssignDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const auth = { Authorization: `Bearer ${session.access_token}` };

      // Library + assignments
      const r = await fetch("/api/trainer/starter-templates", { headers: auth });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Failed");
      setLibrary(j.library as Programme[]);
      setAssignments(j.assignments as Assignment[]);

      // Clients — get trainer's primary team players for the picker
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase
          .from("profiles").select("team_id").eq("id", user.id).maybeSingle();
        const teamId = (prof as { team_id?: string | null } | null)?.team_id;
        if (teamId) {
          const { data: players } = await supabase
            .from("players").select("id, full_name").eq("team_id", teamId)
            .order("full_name", { ascending: true });
          setClients(((players ?? []) as Array<{ id: string; full_name: string }>).map((p) => ({
            id: p.id, name: p.full_name,
          })));
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Group library by programme_key — one card per programme, all levels + phases inside.
  const grouped = useMemo(() => {
    const map = new Map<string, Programme[]>();
    for (const p of library) {
      if (!map.has(p.programme_key)) map.set(p.programme_key, []);
      map.get(p.programme_key)!.push(p);
    }
    return Array.from(map.entries()).map(([key, rows]) => {
      const sorted = rows.sort((a, b) => a.phase - b.phase || a.level.localeCompare(b.level));
      const firstRow = sorted[0];
      const levels = Array.from(new Set(sorted.map((r) => r.level))) as Array<"beginner" | "intermediate" | "advanced">;
      const phases = Array.from(new Set(sorted.map((r) => r.phase))).sort();
      // References live on phase-1 row (programme-level metadata). Take the
      // first non-null array we find across the rows for robustness.
      const references = sorted.find((r) => Array.isArray(r.references) && r.references.length > 0)?.references ?? null;
      return {
        programmeKey: key,
        programmeName: firstRow.programme_name,
        audience: firstRow.audience,
        shortBlurb: firstRow.short_blurb,
        levels,
        phases,
        rows: sorted,
        references,
      };
    });
  }, [library]);

  const [showRefs, setShowRefs] = useState<Record<string, boolean>>({});

  async function handleAssign() {
    if (!assignForKey || !assignClientId) return;
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/trainer/starter-templates", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          clientId: assignClientId,
          programmeKey: assignForKey,
          level: assignLevel,
          startDate: assignDate,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "Failed to assign");
        return;
      }
      setAssignForKey(null);
      setAssignClientId("");
      void load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnassign(id: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch(`/api/trainer/starter-templates?assignmentId=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    void load();
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">{t.title}</h1>
        <p className="text-sm text-slate-600 mt-0.5">{t.subtitle}</p>
      </header>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">{t.loading}</div>
      ) : grouped.length === 0 ? (
        <div className="text-sm text-slate-500">{t.noTemplates}</div>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => {
            const isExpanded = !!expanded[g.programmeKey];
            const activeAssignment = assignments.find(
              (a) => a.programme_key === g.programmeKey && a.status === "active",
            );
            const wpp = g.rows[0]?.weeks_per_phase ?? 3;
            const programmeWeeks = Math.max(...g.phases) * wpp;

            return (
              <div key={g.programmeKey} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-slate-900">{g.programmeName}</div>
                    {g.shortBlurb && <div className="text-xs text-slate-600 mt-0.5">{g.shortBlurb}</div>}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {programmeWeeks}-{t.weeks}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {g.phases.length} {t.phases}
                      </span>
                      {g.levels.map((lv) => (
                        <span key={lv} className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                          {isIS ? LEVEL_LABEL[lv].IS : LEVEL_LABEL[lv].EN}
                        </span>
                      ))}
                      {activeAssignment && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          {t.assigned}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        // Toggle form open/closed AND reset level to first available
                        // for this programme. Default state is "beginner" but new
                        // research-driven templates (long-length hypertrophy,
                        // pulling-derivative, etc.) only have intermediate/advanced.
                        // Without this reset, submit would POST level="beginner"
                        // → server replies "Unknown starter template" → silent fail
                        // for most users.
                        const opening = assignForKey !== g.programmeKey;
                        setAssignForKey(opening ? g.programmeKey : null);
                        if (opening && g.levels.length > 0 && !g.levels.includes(assignLevel)) {
                          setAssignLevel(g.levels[0]);
                        }
                      }}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                    >
                      {t.use}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpanded((e) => ({ ...e, [g.programmeKey]: !isExpanded }))}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {isExpanded ? t.collapse : t.expand}
                    </button>
                  </div>
                </div>

                {/* Active assignment row */}
                {activeAssignment && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs flex items-center justify-between gap-3">
                    <span className="text-emerald-800">
                      {t.active}: {clients.find((c) => c.id === activeAssignment.client_id)?.name ?? "—"}
                      {" · "}{LEVEL_LABEL[activeAssignment.level][isIS ? "IS" : "EN"]}
                      {" · "}{isIS ? "byrjað" : "started"} {activeAssignment.start_date}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUnassign(activeAssignment.id)}
                      className="text-emerald-700 hover:text-red-600 font-medium"
                    >
                      {t.removeAssign}
                    </button>
                  </div>
                )}

                {/* Inline assignment form */}
                {assignForKey === g.programmeKey && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select
                        value={assignClientId}
                        onChange={(e) => setAssignClientId(e.target.value)}
                        className="rounded-lg border bg-white px-2 py-1.5 text-sm"
                      >
                        <option value="">{t.pickClient}</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <select
                        value={assignLevel}
                        onChange={(e) => setAssignLevel(e.target.value as typeof assignLevel)}
                        className="rounded-lg border bg-white px-2 py-1.5 text-sm"
                      >
                        {g.levels.map((lv) => (
                          <option key={lv} value={lv}>{isIS ? LEVEL_LABEL[lv].IS : LEVEL_LABEL[lv].EN}</option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={assignDate}
                        onChange={(e) => setAssignDate(e.target.value)}
                        className="rounded-lg border bg-white px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleAssign}
                        disabled={submitting || !assignClientId}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        {submitting ? "…" : t.assign}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssignForKey(null)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {t.cancel}
                      </button>
                    </div>
                  </div>
                )}

                {/* Evidence — collapsible references panel */}
                {g.references && g.references.length > 0 && (
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/50">
                    <button
                      type="button"
                      onClick={() => setShowRefs((s) => ({ ...s, [g.programmeKey]: !s[g.programmeKey] }))}
                      className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-indigo-50"
                    >
                      <span className="text-[11px] uppercase tracking-wide font-semibold text-indigo-800">
                        📚 {isIS ? "Vísindagrunnur" : "Evidence"} ({g.references.length})
                      </span>
                      <span className="text-xs text-indigo-700">
                        {showRefs[g.programmeKey] ? (isIS ? "Loka" : "Hide") : (isIS ? "Sýna" : "Show")}
                      </span>
                    </button>
                    {showRefs[g.programmeKey] && (
                      <div className="border-t border-indigo-100 px-3 py-2 space-y-2">
                        {g.references.map((r, i) => (
                          <div key={i} className="text-xs">
                            <div className="font-medium text-slate-800">{r.citation}</div>
                            {r.journal && (
                              <div className="text-slate-500 italic">{r.journal}{r.year ? ` · ${r.year}` : ""}</div>
                            )}
                            {r.focus && (
                              <div className="text-slate-600 mt-0.5 leading-snug">→ {r.focus}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Expanded phase view — accordion */}
                {isExpanded && (
                  <div className="space-y-2">
                    {g.phases.map((ph) => {
                      const phaseRow = g.rows.find((r) => r.phase === ph);
                      if (!phaseRow) return null;
                      const isOpen = openPhase[g.programmeKey] === ph;
                      return (
                        <div key={ph} className="rounded-lg border border-slate-200 bg-slate-50">
                          <button
                            type="button"
                            onClick={() => setOpenPhase((p) => ({ ...p, [g.programmeKey]: isOpen ? -1 : ph }))}
                            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-100"
                          >
                            <div className="text-sm font-semibold text-slate-800">
                              Phase {ph} · {phaseRow.phase_name}
                            </div>
                            <div className="text-xs text-slate-500">{phaseRow.weeks_label}</div>
                          </button>
                          {isOpen && (
                            <div className="border-t border-slate-200 bg-white p-3 space-y-3">
                              {phaseRow.blocks.map((b) => (
                                <div key={b.name}>
                                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">{b.name}</div>
                                  <div className="overflow-x-auto rounded border border-slate-200">
                                    <table className="min-w-full text-xs">
                                      <thead className="bg-slate-100 text-slate-700">
                                        <tr>
                                          <th className="px-2 py-1 text-left">#</th>
                                          <th className="px-2 py-1 text-left">{isIS ? "Æfing" : "Exercise"}</th>
                                          <th className="px-2 py-1 text-center">{isIS ? "Reps" : "Reps"}</th>
                                          <th className="px-2 py-1 text-center">Sets</th>
                                          <th className="px-2 py-1 text-center">%1RM</th>
                                          <th className="px-2 py-1 text-center">{isIS ? "Hvíld" : "Rest"}</th>
                                          <th className="px-2 py-1 text-left bg-yellow-700 text-white">YELLOW</th>
                                          <th className="px-2 py-1 text-left bg-red-700 text-white">RED</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {b.rows.map((r, i) => (
                                          <tr key={i} className="border-t border-slate-100">
                                            <td className="px-2 py-1">{r.num}</td>
                                            <td className="px-2 py-1 font-medium text-slate-900">{r.exercise}</td>
                                            <td className="px-2 py-1 text-center tabular-nums">{r.reps}</td>
                                            <td className="px-2 py-1 text-center tabular-nums">{r.sets}</td>
                                            <td className="px-2 py-1 text-center">{r.pct1rm != null ? `${Math.round(r.pct1rm * 100)}%` : "—"}</td>
                                            <td className="px-2 py-1 text-center">{r.set_rest}</td>
                                            <td className="px-2 py-1 bg-yellow-50 text-yellow-900">{r.yellow_sub}</td>
                                            <td className="px-2 py-1 bg-red-50 text-red-900">{r.red_sub}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

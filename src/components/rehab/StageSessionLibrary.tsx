"use client";

/**
 * StageSessionLibrary — the bridge between a staged-loading module stage and the
 * detailed `workout_templates` sessions that make up that stage.
 *
 * Given the library `code`s for one module stage (from STAGE_CODES), it lists the
 * matching sessions and lets the coach assign one to the selected player through
 * the existing AssignRehabModal (→ player_template_assignments). The module page
 * decides the STAGE; this surfaces the concrete session CONTENT to assign.
 *
 * Descriptive/training-load only — never touches the readiness verdict.
 */

import React from "react";
import { supabase } from "@/lib/supabaseClient";
import AssignRehabModal from "@/components/coach/AssignRehabModal";

type SessionRow = { id: string; title: string | null; code: string | null; structure: { duration_min?: number } | null };

export function StageSessionLibrary({
  isEN, teamId, codes, playerId, playerName, programLabel,
}: {
  isEN: boolean;
  teamId: string | null;
  codes: string[];
  playerId?: string;
  playerName?: string | null;
  /** Pre-fills the assignment's program name, e.g. "Achilles Tendinopathy — Stage 2". */
  programLabel: string;
}) {
  const [rows, setRows] = React.useState<SessionRow[] | null>(null);
  const [assign, setAssign] = React.useState<{ id: string; title: string } | null>(null);

  React.useEffect(() => {
    if (codes.length === 0) { setRows([]); return; }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("workout_templates")
        .select("id, title, code, structure")
        .in("code", codes)
        .eq("is_active", true);
      if (!active) return;
      const list = (data ?? []) as SessionRow[];
      // Keep the STAGE_CODES order (A before B, etc.).
      list.sort((a, b) => codes.indexOf(a.code ?? "") - codes.indexOf(b.code ?? ""));
      setRows(list);
    })();
    return () => { active = false; };
  }, [codes]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{isEN ? "Session content for this stage" : "Æfingar fyrir þennan fasa"}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{isEN ? "from the programme library" : "úr æfingasafninu"}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {isEN
          ? "The concrete gym sessions that make up this stage. Assign one to the selected player — it lands on their training days."
          : "Raunverulegu ræktar-æturnar sem mynda þennan fasa. Úthlutaðu einni á valinn leikmann — hún lendir á æfingadögum hans."}
      </p>

      {rows === null ? (
        <div className="mt-3 text-sm text-slate-400">{isEN ? "Loading…" : "Sæki…"}</div>
      ) : rows.length === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
          {isEN ? "No session templates in the library for this stage yet." : "Engar æfingar í safninu fyrir þennan fasa enn."}
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 p-2.5">
              <span className="flex-1 text-sm">
                <span className="font-medium text-slate-900">{r.title ?? r.code}</span>
                {r.structure?.duration_min ? <span className="ml-2 text-xs text-slate-500">{r.structure.duration_min} min</span> : null}
              </span>
              <button
                type="button"
                onClick={() => setAssign({ id: r.id, title: r.title ?? r.code ?? "" })}
                className="rounded-md bg-[#1c7a4a] px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
              >
                {isEN ? "Assign session" : "Úthluta lotu"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {assign && teamId && (
        <AssignRehabModal
          open
          onClose={() => setAssign(null)}
          lang={isEN ? "EN" : "IS"}
          teamId={teamId}
          presetTemplateId={assign.id}
          presetTemplateTitle={assign.title}
          presetPlayerId={playerId || null}
          presetPlayerName={playerName ?? null}
          presetProgramLabel={programLabel}
          onSaved={() => setAssign(null)}
        />
      )}
    </div>
  );
}

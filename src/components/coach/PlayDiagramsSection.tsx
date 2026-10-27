"use client";

/**
 * PlayDiagramsSection — the opponent's set plays on the scouting page. Lists the saved
 * diagrams (thumbnail + name + play type), with add / edit / delete, and opens the
 * half-court editor. Keyed to the scouted opponent. Descriptive — never a readiness signal.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PlayDiagramSvg from "@/components/coach/PlayDiagramSvg";
import PlayDiagramEditor, { type SavedDiagram } from "@/components/coach/PlayDiagramEditor";
import { playTypeLabel } from "@/lib/micropulse/basketballStats/playDiagram";

export default function PlayDiagramsSection({ opponent }: { opponent: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [plays, setPlays] = React.useState<SavedDiagram[] | null>(null);
  const [editing, setEditing] = React.useState<null | "new" | SavedDiagram>(null);
  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const load = React.useCallback(async () => {
    if (!opponent) return;
    const t = await token(); if (!t) return;
    const res = await fetch(`/api/coach/scouting/play-diagrams?opponent=${encodeURIComponent(opponent)}`, { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
    const j = await res.json();
    if (j.ok) setPlays(j.diagrams ?? []);
  }, [opponent, token]);
  React.useEffect(() => { setEditing(null); void load(); }, [load]);

  async function del(id: string) {
    const t = await token(); if (!t) return;
    await fetch(`/api/coach/scouting/play-diagrams?id=${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
    void load();
  }

  return (
    <div className="rounded-xl border border-[#e3e1d9] bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold text-slate-800">{is ? "Leikkerfi (teiknuð)" : "Set plays"}</span>
        <span className="rounded bg-[#2740e6] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">{is ? "Lýsandi" : "Scouting"}</span>
        {editing === null && (
          <button type="button" onClick={() => setEditing("new")} className="ml-auto rounded-lg border border-[#2740e6] px-2.5 py-1 text-[12px] font-semibold text-[#2740e6] hover:bg-[#eef0fb]">
            {is ? "+ Teikna leik" : "+ Draw a play"}
          </button>
        )}
      </div>

      {editing !== null ? (
        <PlayDiagramEditor opponent={opponent} initial={editing === "new" ? null : editing}
          onSaved={() => { setEditing(null); void load(); }} onCancel={() => setEditing(null)} />
      ) : plays && plays.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plays.map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-2">
              <div className="rounded-lg border border-slate-200 bg-white p-1">
                <PlayDiagramSvg diagram={p.diagram} />
              </div>
              <div className="mt-1.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-slate-900">{p.name}</div>
                  <div className="text-[11px] text-slate-500">{playTypeLabel(p.play_type, is ? "IS" : "EN")}{p.source === "ai_draft" ? ` · ${is ? "AI-uppkast" : "AI draft"}${!p.confirmed ? (is ? " (óstaðfest)" : " (unconfirmed)") : ""}` : ""}</div>
                </div>
                <div className="flex shrink-0 gap-1.5 text-[11px] font-semibold">
                  <button type="button" onClick={() => setEditing(p)} className="text-[#2740e6] hover:underline">{is ? "Breyta" : "Edit"}</button>
                  <button type="button" onClick={() => void del(p.id)} className="text-red-600 hover:underline">{is ? "Eyða" : "Delete"}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-slate-500">
          {is ? "Engin leikkerfi enn — teiknaðu mest notuðu sóknir andstæðingsins á hálfan völl. Þau rata í scouting-PDF-ið." : "No set plays yet — draw the opponent's most-used sets on a half court. They carry into the scouting PDF."}
        </p>
      )}
    </div>
  );
}

"use client";

export const dynamic = "force-dynamic";

/**
 * /coach/plan-builder — flexible multi-week strength-plan builder, available in
 * the Strength training section (any team). Unlike the curated Starter templates
 * (fixed frequency) and the match-day Custom programmes, this opens the full
 * PlanBuilder where you choose sessions per week (1–6), duration, method, etc.,
 * then assign the plan to a client/player.
 */

import { useCallback, useEffect, useState } from "react";
import PlanBuilder from "@/components/trainer/PlanBuilder";
import PlanAssigner from "@/components/trainer/PlanAssigner";
import ProgramOverviewModal from "@/components/trainer/ProgramOverviewModal";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Template = {
  id: string;
  name: string;
  plan_type: "strength" | "endurance" | "mixed";
  duration_weeks: number;
  sessions_per_week: number;
  readiness_enabled: boolean;
};

export default function PlanBuilderPage() {
  const [lang] = useLang();
  const isIS = lang === "IS";
  const [teamId, setTeamId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<{ id: string; name: string } | null>(null);
  const [viewing, setViewing] = useState<{ id: string; name: string } | null>(null);

  // Active team = profiles.team_id (the team switcher persists here).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { if (alive) setErr(isIS ? "Ekki innskráð(ur)" : "Not signed in"); return; }
        const { data: prof } = await sb.from("profiles").select("team_id").eq("id", user.id).maybeSingle();
        if (alive) setTeamId((prof?.team_id as string | null) ?? null);
      } finally {
        if (alive) setResolved(true);
      }
    })();
    return () => { alive = false; };
  }, [isIS]);

  const fetchTemplates = useCallback(async () => {
    if (!teamId) { setLoading(false); return; }
    setLoading(true); setErr(null);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`/api/trainer/templates?team_id=${encodeURIComponent(teamId)}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "Failed"); return; }
      setTemplates((json.templates ?? []) as Template[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { if (resolved) void fetchTemplates(); }, [resolved, fetchTemplates]);

  const planTypeLabel = (t: Template["plan_type"]) =>
    isIS ? ({ strength: "Styrkur", endurance: "Þol", mixed: "Blandað" }[t]) : ({ strength: "Strength", endurance: "Endurance", mixed: "Mixed" }[t]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{isIS ? "Kerfasmiður" : "Plan builder"}</h1>
          <p className="text-xs text-slate-500">
            {isIS
              ? "Búðu til fjölvikna æfingakerfi með völdum fjölda lota á viku (1–6), aðferð per lotu og readiness-stýringu — og úthlutaðu á viðskiptavin."
              : "Build a multi-week training plan with your chosen sessions per week (1–6), method per session and readiness rules — then assign it to a client."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setEditingId(null); setShowBuilder(true); }}
          disabled={!teamId}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isIS ? "Nýtt kerfi" : "Create new"}
        </button>
      </div>

      {err && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      {loading ? (
        <div className="text-sm text-slate-500">{isIS ? "Hleð…" : "Loading…"}</div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
          {isIS ? "Engin kerfi enn. Ýttu á „Nýtt kerfi“ til að byrja." : "No plans yet. Click “Create new” to start."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {templates.map((tpl) => (
            <div key={tpl.id} className="rounded-xl border border-slate-200 bg-white p-4">
              {/* Click the name to see a read-only overview — no need to enter Edit. */}
              <button type="button" onClick={() => setViewing({ id: tpl.id, name: tpl.name })}
                className="text-left font-medium text-slate-900 hover:text-indigo-600 hover:underline">
                {tpl.name}
              </button>
              <div className="mt-1 text-xs text-slate-500">
                {planTypeLabel(tpl.plan_type)} · {tpl.duration_weeks} {isIS ? "vikur" : "weeks"} · {tpl.sessions_per_week}× {isIS ? "í viku" : "per week"}
                {tpl.readiness_enabled ? ` · ${isIS ? "readiness virkt" : "readiness on"}` : ""}
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setViewing({ id: tpl.id, name: tpl.name })}
                  className="flex-1 rounded border px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
                  {isIS ? "Skoða" : "View"}
                </button>
                <button type="button" onClick={() => { setEditingId(tpl.id); setShowBuilder(true); }}
                  className="flex-1 rounded border px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
                  {isIS ? "Breyta" : "Edit"}
                </button>
                <button type="button" onClick={() => setAssigning({ id: tpl.id, name: tpl.name })}
                  className="flex-1 rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700">
                  {isIS ? "Úthluta" : "Assign"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showBuilder && teamId && (
        <PlanBuilder
          teamId={teamId}
          templateId={editingId ?? undefined}
          onClose={() => { setShowBuilder(false); setEditingId(null); }}
          onSaved={() => { setShowBuilder(false); setEditingId(null); void fetchTemplates(); }}
        />
      )}

      {viewing && teamId && (
        <ProgramOverviewModal
          teamId={teamId}
          templateId={viewing.id}
          templateName={viewing.name}
          lang={isIS ? "IS" : "EN"}
          onClose={() => setViewing(null)}
        />
      )}

      {assigning && teamId && (
        <PlanAssigner
          teamId={teamId}
          templateId={assigning.id}
          templateName={assigning.name}
          onClose={() => setAssigning(null)}
          onAssigned={() => setAssigning(null)}
        />
      )}
    </div>
  );
}

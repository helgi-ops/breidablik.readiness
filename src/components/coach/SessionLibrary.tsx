"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

const SL_COPY = {
  IS: {
    title: "Vistaðar æfingar",
    loading: "Hleð…",
    empty: "Engar vistaðar æfingar ennþá.",
    deleteConfirm: "Eyða þessari æfingu?",
    deleted: "Eytt",
    errorFetch: "Villa við að sækja æfingar",
    errorDelete: "Villa við að eyða",
    by: "eftir",
    drills: "drillur",
    drill: "drilla",
    noName: "Ónefnd æfing",
  },
  EN: {
    title: "Saved sessions",
    loading: "Loading…",
    empty: "No saved sessions yet.",
    deleteConfirm: "Delete this session?",
    deleted: "Deleted",
    errorFetch: "Error fetching sessions",
    errorDelete: "Error deleting",
    by: "by",
    drills: "drills",
    drill: "drill",
    noName: "Untitled session",
  },
} as const;

type SavedSession = {
  id: string;
  session_name: string;
  md_day: string;
  target_pl: number | null;
  items: Array<{ drill_id: string; drill_name: string; sets: number }>;
  totals: {
    duration_min?: number;
    distance_m?: number;
    player_load?: number;
    vel_b5?: number;
    vel_b6?: number;
    accel_b23?: number;
    decel_b23?: number;
  } | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

function n(v: number | null | undefined, digits = 0) {
  if (v == null || Number.isNaN(Number(v))) return "–";
  return Number(v).toFixed(digits);
}

async function getAuthToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function SessionLibrary({ teamId }: { teamId: string }) {
  const [lang] = useLang();
  const t = SL_COPY[lang];
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Missing auth");
      const res = await fetch(`/api/coach/saved-sessions?team_id=${encodeURIComponent(teamId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || t.errorFetch);
      setSessions(json.sessions ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [teamId, t.errorFetch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDelete(id: string) {
    if (!confirm(t.deleteConfirm)) return;
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(`/api/coach/saved-sessions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || t.errorDelete);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      alert(t.errorDelete + ": " + (e instanceof Error ? e.message : String(e)));
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-slate-500">{t.loading}</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-sm text-slate-500">
        {t.empty}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((s) => {
        const drillCount = s.items?.length ?? 0;
        const totals = s.totals;
        const dateStr = new Date(s.created_at).toLocaleDateString("is-IS", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        return (
          <div
            key={s.id}
            className="rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-slate-900">
                    {s.session_name || t.noName}
                  </h3>
                  {s.md_day && (
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                      {s.md_day}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {dateStr} · {drillCount} {drillCount === 1 ? t.drill : t.drills}
                </div>
                {/* Drill names list */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(s.items ?? []).map((item, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 ring-1 ring-slate-200"
                    >
                      {item.sets > 1 && (
                        <span className="mr-0.5 font-semibold text-slate-800">{item.sets}×</span>
                      )}
                      {item.drill_name}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => handleDelete(s.id)}
                className="shrink-0 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                title={t.deleteConfirm}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
            {/* Totals strip */}
            {totals && (
              <div className="grid grid-cols-4 gap-px border-t border-slate-100 bg-slate-100 text-center sm:grid-cols-7">
                <MiniStat label="PL" value={n(totals.player_load)} />
                <MiniStat label="Dur" value={n(totals.duration_min)} suffix={lang === "IS" ? "mín" : "min"} />
                <MiniStat label="Dist" value={n(totals.distance_m)} suffix="m" />
                <MiniStat label="V5" value={n(totals.vel_b5)} />
                <MiniStat label="V6" value={n(totals.vel_b6)} className="hidden sm:block" />
                <MiniStat label="Acc" value={n(totals.accel_b23)} className="hidden sm:block" />
                <MiniStat label="Dec" value={n(totals.decel_b23)} className="hidden sm:block" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MiniStat({
  label,
  value,
  suffix,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
  className?: string;
}) {
  return (
    <div className={`bg-white px-2 py-1.5 ${className}`}>
      <div className="text-[8px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-xs font-bold tabular-nums text-slate-800">
        {value}
        {suffix && <span className="ml-0.5 text-[9px] font-normal text-slate-400">{suffix}</span>}
      </div>
    </div>
  );
}

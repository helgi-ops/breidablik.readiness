"use client";

/**
 * TrainerAttentionList — "who needs attention" banner at the top of the PT
 * dashboard. Flagged clients only, most severe first, with plain-language
 * reasons. Clicking a client expands it in the list below.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Lang = "IS" | "EN";
type Flag = { severity: 1 | 2; code: string; label: string };
type Client = { id: string; name: string; flags: Flag[]; topSeverity: number };

export default function TrainerAttentionList({
  teamId, lang, onSelect,
}: { teamId: string | null; lang: Lang; onSelect: (id: string) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loaded, setLoaded] = useState(false);

  const t = lang === "IS"
    ? { title: "Þarf athygli", none: "Allir viðskiptavinir í góðu standi 👍", today: "í dag" }
    : { title: "Needs attention", none: "All clients look good 👍", today: "today" };

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const qs = teamId ? `?team_id=${encodeURIComponent(teamId)}` : "";
      const res = await fetch(`/api/trainer/attention${qs}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.ok) setClients(json.clients as Client[]);
    } catch { /* soft */ } finally { setLoaded(true); }
  }, [teamId]);

  useEffect(() => { void load(); }, [load]);

  if (!loaded) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm mb-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">⚠️ {t.title}</h3>
        {clients.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{clients.length}</span>
        )}
      </div>

      {clients.length === 0 ? (
        <div className="mt-2 text-sm text-slate-500">{t.none}</div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {clients.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className="flex w-full items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-left hover:bg-slate-100"
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.topSeverity >= 2 ? "bg-red-500" : "bg-amber-500"}`} />
                <span className="font-medium text-sm text-slate-800 shrink-0">{c.name}</span>
                <span className="flex flex-wrap gap-1 justify-end ml-auto">
                  {c.flags.map((f) => (
                    <span key={f.code} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${f.severity >= 2 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                      {f.label}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

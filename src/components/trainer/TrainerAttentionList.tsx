"use client";

/**
 * TrainerAttentionList — "who needs you" cards at the top of the PT dashboard.
 * Each card follows the layered read: what happened in plain language, what
 * would clear it, and how much data it rests on. Flags that don't change the
 * training (no check-in yet, strength test due) stay as notes on the client row.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Lang = "IS" | "EN";
type Bi = { EN: string; IS: string };
export type AttentionFlag = {
  severity: 1 | 2;
  code: string;
  label: string;
  title: Bi;
  why: Bi;
  ifThen?: Bi;
  confidence?: Bi;
};
export type AttentionClient = { id: string; name: string; flags: AttentionFlag[]; topSeverity: number };

const ROW_NOTE_CODES = new Set(["no_checkin", "retest_due"]);
export const isCardFlag = (code: string) => !ROW_NOTE_CODES.has(code);

export default function TrainerAttentionList({
  teamId, lang, title, onSelect, onLoaded,
}: {
  teamId: string | null;
  lang: Lang;
  title: string;
  onSelect: (id: string, code: string) => void;
  onLoaded?: (clients: AttentionClient[]) => void;
}) {
  const [clients, setClients] = useState<AttentionClient[]>([]);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const qs = teamId ? `?team_id=${encodeURIComponent(teamId)}` : "";
      const res = await fetch(`/api/trainer/attention${qs}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.ok) {
        setClients(json.clients as AttentionClient[]);
        onLoaded?.(json.clients as AttentionClient[]);
      }
    } catch { /* soft */ }
  }, [teamId, onLoaded]);

  useEffect(() => { void load(); }, [load]);

  const cards = clients
    .map((c) => ({ client: c, flag: c.flags.find((f) => isCardFlag(f.code)) }))
    .filter((x): x is { client: AttentionClient; flag: AttentionFlag } => !!x.flag);

  if (cards.length === 0) return null;

  return (
    <section aria-labelledby="attention-heading" className="mb-7">
      <h2 id="attention-heading" className="mb-3 font-display text-lg font-bold text-slate-900">{title}</h2>
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ client, flag }) => {
          const urgent = flag.severity >= 2;
          const quiet = flag.code === "gone_quiet" || flag.code === "corrective_pain";
          return (
            <article key={client.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <div className={`flex items-center gap-2 text-[13px] font-semibold ${urgent ? "text-red-700" : "text-amber-800"}`}>
                <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${urgent ? "bg-red-600" : "bg-amber-500"}`} />
                <span>{flag.title[lang]}</span>
              </div>
              <h3 className="font-display text-xl font-bold leading-tight text-slate-900">{client.name}</h3>
              <p className="text-[15px] text-slate-900">{flag.why[lang]}</p>
              {flag.ifThen && (
                <p className="rounded-[10px] bg-slate-100 px-3 py-2.5 text-[13px] text-slate-700">{flag.ifThen[lang]}</p>
              )}
              <div className="flex-1" />
              {flag.confidence && <div className="text-xs text-slate-500">{flag.confidence[lang]}</div>}
              <button
                type="button"
                onClick={() => onSelect(client.id, flag.code)}
                className="min-h-11 rounded-[10px] bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                {quiet
                  ? (lang === "IS" ? "Opna skjólstæðing" : "Open client")
                  : (lang === "IS" ? "Aðlaga æfingar" : "Adjust training")}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

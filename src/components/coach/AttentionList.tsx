"use client";

/**
 * AttentionList — Fasi 2's single, prioritised "who needs attention today" list.
 *
 * It replaces the stack of separate banners (unfamiliar-spike, recovery-watch,
 * volatility…) with ONE ranked read: ALERT before MONITOR, each row carrying the
 * player, their status, the plain reason (attentionReason[0]), any signal badges
 * (e.g. UNFAMILIAR LOAD, HAMSTRING) and the recommended action. Clicking a row
 * opens the player decision drawer.
 *
 * Presentational only — no data derivation here. The dashboard maps its already
 * computed flagged players into `items` (ALERT first). Explainability-first: the
 * verdict/attention is the primary read; detail is one click away.
 */

import { Card, CardContent, CardHeader } from "@/components/ui/card";

export type AttentionItem = {
  playerId: string;
  name: string;
  initials: string;
  flag: "ALERT" | "MONITOR";
  /** Availability / plan, e.g. "Recovery", "Reduced" — optional. */
  status?: string | null;
  /** The plain, single-line reason (attentionReason[0]). */
  reason: string;
  /** Short signal tags rendered as chips, e.g. ["UNFAMILIAR LOAD", "HAMSTRING"]. */
  badges?: string[];
  /** Recommended action for the coach, e.g. "Reduced session". */
  action?: string | null;
};

function initialsColor(flag: AttentionItem["flag"]): string {
  return flag === "ALERT" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
}

export default function AttentionList({
  lang,
  items,
  onOpenPlayer,
}: {
  lang: "IS" | "EN";
  items: AttentionItem[];
  onOpenPlayer: (playerId: string) => void;
}) {
  const is = lang === "IS";
  // ALERT before MONITOR (stable within group — caller ranks within, e.g. by ACWR).
  const ranked = [...items].sort((a, b) => (a.flag === b.flag ? 0 : a.flag === "ALERT" ? -1 : 1));
  const alertCount = ranked.filter((i) => i.flag === "ALERT").length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">
            {is ? "Þarfnast athygli í dag" : "Needs attention today"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {ranked.length === 0
              ? (is ? "enginn" : "none")
              : `${ranked.length} · ${alertCount} ${is ? "áríðandi" : "alert"}`}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {ranked.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 10.7a1 1 0 011.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
            {is ? "Enginn leikmaður þarf sérstaka athygli í dag." : "No players need special attention today."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {ranked.map((it) => (
              <li key={it.playerId}>
                <button
                  type="button"
                  onClick={() => onOpenPlayer(it.playerId)}
                  className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-muted/40"
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${initialsColor(it.flag)}`}>
                    {it.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-foreground">{it.name}</span>
                      {it.status && <span className="shrink-0 text-[11px] text-muted-foreground">· {it.status}</span>}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[12px] text-muted-foreground">{it.reason}</span>
                      {(it.badges ?? []).map((b) => (
                        <span key={b} className="rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-700">{b}</span>
                      ))}
                    </span>
                  </span>
                  {it.action && <span className="hidden shrink-0 text-[11px] font-medium text-foreground sm:block">{it.action}</span>}
                  <svg className="h-4 w-4 shrink-0 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.3 5.3a1 1 0 011.4 0l4 4a1 1 0 010 1.4l-4 4a1 1 0 01-1.4-1.4L10.6 10 7.3 6.7a1 1 0 010-1.4z" clipRule="evenodd" /></svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

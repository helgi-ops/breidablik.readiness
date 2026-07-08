"use client";

/**
 * AttentionList — Lota B / Fasi 2, step B2.
 *
 * One prioritized list that replaces the separate banners (unfamiliar-spike,
 * recovery-watch, volatility): ALERT before MONITOR, then ACWR descending. Each
 * row shows the player, their reason (attentionReason[0]) and any small flags
 * (e.g. UNFAMILIAR LOAD, HAMSTRING), and opens the player drawer on click.
 *
 * Presentational only — the coach dashboard maps its already-computed flagged
 * players onto these props in step B3 (no new data / no new API). Sorting is
 * done here so the caller can pass the flagged set in any order.
 */

export type AttentionFlag = "ALERT" | "MONITOR";

export type AttentionItem = {
  playerId: string;
  name: string;
  flag: AttentionFlag;
  /** Short status label, e.g. "Recovery" / "Modified". Optional. */
  status?: string | null;
  /** The primary reason — attentionReason[0]. */
  reason: string;
  /** Small badges, e.g. ["UNFAMILIAR LOAD", "HAMSTRING"]. */
  badges?: string[];
  /** Recommended action (one short line). Optional. */
  action?: string | null;
  /** Used only for sorting within a flag group (ACWR desc). */
  acwr?: number | null;
  /** Status colour for the dot / accents. */
  color?: "RED" | "YELLOW" | "GRAY";
};

export type AttentionListProps = {
  lang: "IS" | "EN";
  items: AttentionItem[];
  onOpenPlayer: (playerId: string) => void;
};

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const DOT: Record<NonNullable<AttentionItem["color"]>, string> = {
  RED: "#a83e28",
  YELLOW: "#de9328",
  GRAY: "#8a8f8c",
};

function flagRank(f: AttentionFlag): number {
  return f === "ALERT" ? 0 : 1;
}

export default function AttentionList({ lang, items, onOpenPlayer }: AttentionListProps) {
  const isIS = lang === "IS";

  const sorted = [...items].sort((a, b) => {
    const r = flagRank(a.flag) - flagRank(b.flag);
    if (r !== 0) return r;
    return (b.acwr ?? 0) - (a.acwr ?? 0);
  });

  if (!sorted.length) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-card">
        <div className="text-sm font-medium text-zinc-500">
          {isIS ? "Allir klárir — enginn þarf athygli í dag." : "Everyone ready — no one needs attention today."}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-card">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
        <div className="text-sm font-bold text-zinc-900">{isIS ? "Þarfnast athygli" : "Needs attention"}</div>
        <div className="text-[11px] font-semibold text-zinc-400">{sorted.length}</div>
      </div>
      <div className="divide-y divide-zinc-100">
        {sorted.map((it) => {
          const dot = DOT[it.color ?? "GRAY"];
          const isAlert = it.flag === "ALERT";
          return (
            <button
              key={it.playerId}
              type="button"
              onClick={() => onOpenPlayer(it.playerId)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-zinc-50 active:bg-zinc-100"
            >
              {/* Avatar */}
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ background: `${dot}1a`, color: dot }}
              >
                {initials(it.name)}
              </span>

              {/* Body */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
                  <span className="truncate text-sm font-semibold text-zinc-900">{it.name}</span>
                  {isAlert ? (
                    <span className="shrink-0 rounded-full bg-[#f8e9e3] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#a83e28]">
                      {isIS ? "Áríðandi" : "Alert"}
                    </span>
                  ) : null}
                  {it.status ? <span className="shrink-0 text-[11px] font-medium text-zinc-400">{it.status}</span> : null}
                </div>
                <div className="mt-0.5 truncate text-xs text-zinc-500">{it.reason}</div>
                {it.badges?.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {it.badges.map((b, i) => (
                      <span
                        key={i}
                        className="rounded-full border border-[#ead9b4] bg-[#faf1de] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#9a6410]"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                ) : null}
                {it.action ? <div className="mt-1 text-xs font-medium text-zinc-700">{it.action}</div> : null}
              </div>

              {/* Chevron */}
              <span className="shrink-0 text-zinc-300" aria-hidden>→</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

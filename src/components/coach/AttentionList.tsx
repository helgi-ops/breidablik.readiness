"use client";

/**
 * AttentionList — "Needs attention", design turn 24b (grouped by status).
 *
 * Players are grouped into status categories (In rehabilitation / Injured —
 * not training / Watch today / Alert). Each group is a collapsible section
 * with a count; the coach reads "3 in rehab, 1 injured, 2 to watch" at a
 * glance without scanning every row. Less-urgent groups are collapsed by
 * default so the panel height stays short no matter how many players are on
 * the lists (a collapsed group still shows its members' names on the right).
 *
 * Rows are deliberately minimal — avatar + name + ONE right-side signal
 * (day-over-day delta, or the status/stage) + chevron. The status lives on
 * the GROUP, not repeated per row: that removes the old "triple information"
 * (name + ALERT badge + repeated status + tag) that made each row ~80px.
 *
 * Presentational only — the coach dashboard maps its already-computed flagged
 * players onto these props (no new data / no new API). Clicking a row opens
 * the player decision drawer.
 */

import { useState } from "react";

export type AttentionFlag = "ALERT" | "MONITOR";

/** Status category — drives which collapsible group the row lands in. */
export type AttentionCategory = "ALERT" | "REHAB" | "INJURED" | "WATCH";

/** Right-side day-over-day signal on a row (↑↑ better / ↓↓ worse / ● new). */
export type AttentionDelta = {
  dir: "up" | "down" | "new" | "same";
  /** Full localized summary — shown as a tooltip. */
  full?: string;
} | null;

export type AttentionItem = {
  playerId: string;
  name: string;
  flag: AttentionFlag;
  /** Status group. When absent, derived from color/flag (WATCH fallback). */
  category?: AttentionCategory;
  /** Short status / stage label, e.g. "Recovery", "RTP 1/5". Optional. */
  status?: string | null;
  /** The primary reason — kept for the drawer; not shown on the compact row. */
  reason?: string;
  /** Small badges — kept for compatibility; not shown on the compact row. */
  badges?: string[];
  action?: string | null;
  /** Used only for sorting within a group (ACWR / spike desc). */
  acwr?: number | null;
  /** Status colour for the dot / accents. */
  color?: "RED" | "YELLOW" | "GREEN" | "GRAY";
  /** Day-over-day change — the row's right-side signal when present. */
  delta?: AttentionDelta;
  /** Verdict is an estimate (no check-in today) — shown as an "estimated" chip
   *  so it never reads as a measured flag. Takes precedence over provisional. */
  estimated?: boolean;
  /** Measured, but the flag rests on low confidence / an immature baseline —
   *  shown as a "provisional" chip. */
  provisional?: boolean;
  /** Today's row is older than today (no fresh check-in) — "not today" chip. */
  stale?: boolean;
};

/** Bilingual copy for the provenance/confidence chip on a row. */
const MARKER_COPY = {
  estimated:   { is: "áætlað",      en: "estimated",    tip_is: "Leikmaðurinn skráði sig ekki í dag — niðurstaðan er áætluð.", tip_en: "Player did not check in today — this verdict is an estimate." },
  provisional: { is: "bráðabirgða", en: "provisional",  tip_is: "Byggt á takmörkuðum gögnum eða óþroskaðri viðmiðslínu.",      tip_en: "Rests on limited data or an immature baseline." },
  stale:       { is: "ekki í dag",  en: "not today",    tip_is: "Ekki nýtt checkin í dag — eldri gögn.",                       tip_en: "No fresh check-in today — older data." },
} as const;

export type AttentionListProps = {
  lang: "IS" | "EN";
  items: AttentionItem[];
  onOpenPlayer: (playerId: string) => void;
};

const DOT: Record<NonNullable<AttentionItem["color"]>, string> = {
  RED: "#a83e28",
  YELLOW: "#de9328",
  GREEN: "#1c7a4a",
  GRAY: "#8a8f8c",
};

const GROUP_ORDER: AttentionCategory[] = ["ALERT", "REHAB", "INJURED", "WATCH"];

const GROUP_META: Record<
  AttentionCategory,
  { is: string; en: string; accent: string; dot: string; defaultOpen: boolean }
> = {
  // Non-injury red readiness — most urgent, expanded.
  ALERT:   { is: "Áríðandi í dag",       en: "Alert today",            accent: "#a83e28", dot: DOT.RED,    defaultOpen: true },
  // Actively managed today (graded return / stage progression) — expanded.
  REHAB:   { is: "Í endurhæfingu",       en: "In rehabilitation",      accent: "#a83e28", dot: DOT.RED,    defaultOpen: true },
  // Out, not training — nothing to action today, so collapsed.
  INJURED: { is: "Meiddir — ekki æfing", en: "Injured — not training", accent: "#a83e28", dot: DOT.RED,    defaultOpen: false },
  // Minor readiness watch — collapsed.
  WATCH:   { is: "Fylgjast með í dag",   en: "Watch today",            accent: "#9a6410", dot: DOT.YELLOW, defaultOpen: false },
};

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** First two given-name tokens — keeps the collapsed-group summary short. */
function shortName(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(" ") || name;
}

function categoryOf(it: AttentionItem): AttentionCategory {
  if (it.category) return it.category;
  if (it.color === "YELLOW") return "WATCH";
  return it.flag === "ALERT" ? "ALERT" : "WATCH";
}

function deltaLabel(dir: NonNullable<AttentionDelta>["dir"], isIS: boolean): { arrow: string; word: string; color: string } | null {
  switch (dir) {
    case "up":   return { arrow: "↑↑", word: isIS ? "skárra" : "better", color: "#1c7a4a" };
    case "down": return { arrow: "↓↓", word: isIS ? "verra" : "worse",  color: "#a83e28" };
    case "new":  return { arrow: "●",  word: isIS ? "nýtt" : "new",      color: "#a83e28" };
    default:     return null; // "same" → no delta chip
  }
}

export default function AttentionList({ lang, items, onOpenPlayer }: AttentionListProps) {
  const isIS = lang === "IS";

  // Group + sort (within a group: ALERT flag first, then spike desc).
  const grouped: Record<AttentionCategory, AttentionItem[]> = { ALERT: [], REHAB: [], INJURED: [], WATCH: [] };
  for (const it of items) grouped[categoryOf(it)].push(it);
  for (const k of GROUP_ORDER) {
    grouped[k].sort((a, b) => {
      const r = (a.flag === "ALERT" ? 0 : 1) - (b.flag === "ALERT" ? 0 : 1);
      if (r !== 0) return r;
      const acwr = (b.acwr ?? 0) - (a.acwr ?? 0);
      if (acwr !== 0) return acwr;
      // Stable final tiebreak — ordering can't jitter day-to-day on ACWR ties.
      return a.playerId.localeCompare(b.playerId);
    });
  }
  const present = GROUP_ORDER.filter((k) => grouped[k].length > 0);
  const total = items.length;

  // Default-open per category, with a safeguard: if no present group is
  // open-by-default, open the first one so the panel is never fully collapsed.
  const anyDefaultOpen = present.some((k) => GROUP_META[k].defaultOpen);
  const defaultOpenFor = (k: AttentionCategory) =>
    GROUP_META[k].defaultOpen || (!anyDefaultOpen && k === present[0]);

  const [openMap, setOpenMap] = useState<Partial<Record<AttentionCategory, boolean>>>({});
  const isOpen = (k: AttentionCategory) => openMap[k] ?? defaultOpenFor(k);
  const toggle = (k: AttentionCategory) => setOpenMap((prev) => ({ ...prev, [k]: !(prev[k] ?? defaultOpenFor(k)) }));

  if (!total) {
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
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <div className="text-sm font-bold text-zinc-900">{isIS ? "Þarfnast athygli" : "Needs attention"}</div>
        <div className="text-[11px] font-semibold text-zinc-400">{total}</div>
      </div>

      <div className="divide-y divide-zinc-100 border-t border-zinc-100">
        {present.map((k) => {
          const meta = GROUP_META[k];
          const rows = grouped[k];
          const open = isOpen(k);
          const panelId = `attn-group-${k}`;
          const summary = rows.map((r) => shortName(r.name)).join(" · ");
          return (
            <section key={k}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(k)}
                className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left transition-colors hover:bg-zinc-50"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.dot }} />
                  <span
                    className="shrink-0 text-[11px] font-bold uppercase tracking-wide"
                    style={{ color: meta.accent }}
                  >
                    {isIS ? meta.is : meta.en}
                  </span>
                  <span className="shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-600">
                    {rows.length}
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  {!open ? (
                    <span className="truncate text-[12px] font-medium text-zinc-400">{summary}</span>
                  ) : null}
                  <span
                    className={`shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
                    aria-hidden
                  >
                    ▾
                  </span>
                </div>
              </button>

              {open ? (
                <div id={panelId} className="divide-y divide-zinc-100/70">
                  {rows.map((it) => {
                    const dot = DOT[it.color ?? "GRAY"];
                    const dl = it.delta && it.delta.dir !== "same" ? deltaLabel(it.delta.dir, isIS) : null;
                    return (
                      <button
                        key={it.playerId}
                        type="button"
                        onClick={() => onOpenPlayer(it.playerId)}
                        className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-zinc-50 active:bg-zinc-100"
                      >
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                          style={{ background: `${dot}1a`, color: dot }}
                        >
                          {initials(it.name)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">
                          {it.name}
                        </span>
                        {(() => {
                          const m = it.estimated ? MARKER_COPY.estimated
                            : it.provisional ? MARKER_COPY.provisional
                            : it.stale ? MARKER_COPY.stale
                            : null;
                          if (!m) return null;
                          return (
                            <span
                              className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              style={{ borderColor: "#de932855", background: "#de93281a", color: "#9a6410" }}
                              title={isIS ? m.tip_is : m.tip_en}
                            >
                              {isIS ? m.is : m.en}
                            </span>
                          );
                        })()}
                        {dl ? (
                          <span
                            className="shrink-0 text-[12px] font-semibold tabular-nums"
                            style={{ color: dl.color }}
                            title={it.delta?.full ?? undefined}
                          >
                            {dl.arrow} {dl.word}
                          </span>
                        ) : it.status ? (
                          <span className="shrink-0 text-[12px] font-medium text-zinc-500">{it.status}</span>
                        ) : null}
                        <span className="shrink-0 text-zinc-300" aria-hidden>→</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

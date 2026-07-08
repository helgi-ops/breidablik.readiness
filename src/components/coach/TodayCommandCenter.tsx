"use client";

/**
 * TodayCommandCenter — Lota B / Fasi 2, step B1.
 *
 * The "Í dag" hero: a verdict masthead + a plain AI-style summary + the
 * Ready/Modified/Recovery/Tomorrow counts. Presentational only — it takes clean
 * props so it can never disagree with the dashboard's own numbers; the coach
 * dashboard maps its existing data onto these props in step B3 (no new data,
 * no new API). Deterministic template summary today (same as the app does now);
 * an LLM summary can replace `aiSummary` later.
 *
 * Explainability-first: verdict + confidence on top, the plain "why" right
 * under it, raw counts last.
 */

export type CommandZone = "READY" | "CAUTION" | "HIGH";

export type TodayCommandCenterProps = {
  lang: "IS" | "EN";
  /** Squad verdict zone, derived from the recovery (red) count by the caller. */
  zone: CommandZone;
  /** Ready / Modified / Recovery counts = data.summary.green / yellow / red. */
  counts: { ready: number; modified: number; recovery: number };
  /** Optional forecast for tomorrow's session load (already computed upstream). */
  tomorrow?: { label: string; band?: string | null } | null;
  /** Check-in coverage → confidence. */
  checkedIn: number;
  total: number;
  /** Players needing a changed plan (flagged count). */
  flaggedCount: number;
  /** Verdict headline + 2–3 actions, taken from the existing briefing strings. */
  headline: string;
  actions?: string[];
  /** Optional pre-built summary; falls back to a deterministic template. */
  aiSummary?: string | null;
};

const ZONE_STYLE: Record<CommandZone, { bg: string; fg: string; en: string; is: string }> = {
  READY: { bg: "#eaf3ec", fg: "#1c7a4a", en: "READY", is: "KLÁRT" },
  CAUTION: { bg: "#faf1de", fg: "#9a6410", en: "CAUTION", is: "VARÚÐ" },
  HIGH: { bg: "#f8e9e3", fg: "#a83e28", en: "HIGH RISK", is: "HÁ ÁHÆTTA" },
};

function confidenceLevel(checkedIn: number, total: number): { key: "HIGH" | "MEDIUM" | "LOW"; en: string; is: string } {
  const ratio = total > 0 ? checkedIn / total : 0;
  if (ratio >= 0.8) return { key: "HIGH", en: "High confidence", is: "Hátt traust" };
  if (ratio >= 0.5) return { key: "MEDIUM", en: "Medium confidence", is: "Miðlungs traust" };
  return { key: "LOW", en: "Low confidence", is: "Lágt traust" };
}

function buildSummary(p: TodayCommandCenterProps, isIS: boolean): string {
  const total = p.total || p.counts.ready + p.counts.modified + p.counts.recovery;
  if (isIS) {
    const s1 = `Liðið er að mestu klárt — ${p.counts.ready} af ${total} í fullri æfingu.`;
    const s2 = p.flaggedCount > 0
      ? `${p.flaggedCount} ${p.flaggedCount === 1 ? "þarf" : "þurfa"} breytt plan í dag.`
      : `Enginn þarf breytt plan í dag.`;
    return `${s1} ${s2}`;
  }
  const s1 = `The squad is mostly ready — ${p.counts.ready} of ${total} on full training.`;
  const s2 = p.flaggedCount > 0
    ? `${p.flaggedCount} ${p.flaggedCount === 1 ? "player needs" : "players need"} a changed plan today.`
    : `No one needs a changed plan today.`;
  return `${s1} ${s2}`;
}

function Count({ value, label, bg, fg }: { value: number | string; label: string; bg: string; fg: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl px-3 py-2.5" style={{ background: bg }}>
      <div className="stat-number text-2xl font-bold leading-none" style={{ color: fg }}>{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: fg, opacity: 0.8 }}>{label}</div>
    </div>
  );
}

export default function TodayCommandCenter(props: TodayCommandCenterProps) {
  const isIS = props.lang === "IS";
  const zone = ZONE_STYLE[props.zone];
  const conf = confidenceLevel(props.checkedIn, props.total);
  const summary = props.aiSummary ?? buildSummary(props, isIS);
  const actions = props.actions ?? [];

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-card">
      {/* Verdict masthead */}
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide" style={{ background: zone.bg, color: zone.fg }}>
              {isIS ? zone.is : zone.en}
            </span>
            <span className="text-[11px] font-semibold text-zinc-400">
              {isIS ? conf.is : conf.en} · {props.checkedIn}/{props.total} {isIS ? "innskráð" : "checked in"}
            </span>
          </div>
          <h2 className="stat-number mt-2 text-2xl font-bold leading-tight text-zinc-900">{props.headline}</h2>
        </div>
      </div>

      {/* Plain AI-style summary */}
      <div className="mx-5 mt-3 rounded-xl border border-[#d4dcfb] bg-[#eef1fe] px-4 py-3">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2740e6]">
          <span aria-hidden>✦</span>{isIS ? "SAMANTEKT" : "SUMMARY"}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-zinc-700">{summary}</p>
      </div>

      {/* Actions */}
      {actions.length ? (
        <ul className="mx-5 mt-3 space-y-1.5">
          {actions.slice(0, 3).map((a, i) => (
            <li key={i} className="flex gap-2 text-sm text-zinc-700">
              <span className="mt-0.5 shrink-0 text-zinc-400" aria-hidden>→</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Counts */}
      <div className="mt-4 grid grid-cols-2 gap-2 px-5 pb-5 sm:grid-cols-4">
        <Count value={props.counts.ready} label={isIS ? "Klárir" : "Ready"} bg="#eaf3ec" fg="#1c7a4a" />
        <Count value={props.counts.modified} label={isIS ? "Breytt" : "Modified"} bg="#faf1de" fg="#9a6410" />
        <Count value={props.counts.recovery} label={isIS ? "Hvíld" : "Recovery"} bg="#f8e9e3" fg="#a83e28" />
        <Count
          value={props.tomorrow?.label ?? "—"}
          label={isIS ? "Á morgun" : "Tomorrow"}
          bg="#eef1fe"
          fg="#2740e6"
        />
      </div>
    </div>
  );
}

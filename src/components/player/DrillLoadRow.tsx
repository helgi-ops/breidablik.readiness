"use client";

/**
 * One drill's worth of the player's OWN actual load, rendered as the layered
 * read: a plain green "your load" headline (distance + hard-running) with the
 * full Engine (GPS) / Driver (IMA) breakdown behind a per-row toggle. Shared by
 * the sessions view (`SessionDrillList`) and the Dashboard "load per drill" card
 * (`PlayerDrillLoadCard`) so the two can never drift.
 */

/** The player's own per-drill actual load for a single drill/period. */
export type DrillLoadEntry = {
  drill_name: string;
  matched: boolean;
  engine: { distance_m: number | null; hir_total: number | null; sprint_m: number | null; player_load: number | null } | null;
  driver: { cod: number | null; high_ima: number | null } | null;
  duration_min: number | null;
};

function MiniStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-md bg-white px-2 py-1.5 text-center">
      <div className="text-sm font-bold tabular-nums text-zinc-900">{value}<span className="ml-0.5 text-[9px] font-medium text-zinc-400">{unit}</span></div>
      <div className="mt-0.5 truncate text-[9px] text-zinc-500">{label}</div>
    </div>
  );
}

export default function DrillLoadRow({ entry, lang, open, onToggle }: {
  entry: DrillLoadEntry;
  lang: "IS" | "EN";
  open: boolean;
  onToggle: () => void;
}) {
  const is = lang === "IS";
  const locale = is ? "is-IS" : "en-GB";
  const fmt = (v: number | null | undefined) => (v == null ? "–" : Math.round(v).toLocaleString(locale));
  const dl = entry;
  return (
    <div className="rounded-lg border border-[#d9ece2] bg-[#f4faf6] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 text-[13px] text-zinc-700">
          <span className="mr-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-[#1c7a4a]">{is ? "Þitt álag" : "Your load"}</span>
          {dl.engine?.distance_m != null && <span className="font-bold tabular-nums text-zinc-900">{fmt(dl.engine.distance_m)} m</span>}
          {dl.engine?.hir_total != null && <span className="text-zinc-500"> · {fmt(dl.engine.hir_total)} m {is ? "hraðahlaup" : "hard running"}</span>}
        </div>
        <button type="button" onClick={onToggle} className="shrink-0 text-[11px] font-semibold text-[#2740e6]">
          {open ? (is ? "Fela" : "Hide") : (is ? "Nánar" : "Details")}
        </button>
      </div>
      {open && (
        <div className="mt-2.5 space-y-2.5">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#1c7a4a]">{is ? "Vél — hlaup" : "Engine — running"}</div>
            <div className="mt-1 grid grid-cols-4 gap-1.5">
              <MiniStat label={is ? "Vegalengd" : "Distance"} value={fmt(dl.engine?.distance_m)} unit="m" />
              <MiniStat label={is ? "Hraðahlaup" : "High-speed"} value={fmt(dl.engine?.hir_total)} unit="m" />
              <MiniStat label={is ? "Sprettur" : "Sprint"} value={fmt(dl.engine?.sprint_m)} unit="m" />
              <MiniStat label={is ? "Álag" : "Load"} value={fmt(dl.engine?.player_load)} unit="" />
            </div>
          </div>
          {dl.driver && (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#2740e6]">{is ? "Drifkraftur — IMA" : "Driver — IMA"}</div>
              <div className="mt-1 grid grid-cols-4 gap-1.5">
                <MiniStat label={is ? "Stefnubr." : "Change of dir."} value={fmt(dl.driver.cod)} unit="" />
                <MiniStat label={is ? "Hátt IMA" : "High-IMA"} value={fmt(dl.driver.high_ima)} unit="" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

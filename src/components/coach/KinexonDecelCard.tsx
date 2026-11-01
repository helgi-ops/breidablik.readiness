"use client";

/**
 * Kinexon Deceleration Intelligence card.
 *
 * The McBurnie decel page runs on Catapult Band-3 accel/decel COUNTS; a real
 * indoor Kinexon config reports the braking signal as LOAD + high-intensity
 * EFFORT instead. This card reads those signals (Decels/Accels Load, Exertions
 * high, Mechanical Load) from the player's Kinexon history and runs the same
 * McBurnie dimensions against the player's own 28-day baseline. Descriptive
 * external load — never a readiness verdict.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { KINEXON_CATALOG, readKinexonMetric, type KinexonMetric } from "@/lib/integrations/kinexon/metricCatalog";
import { computeKinexonDecel, type KinexonDecelDay, type KxDecelFlag } from "@/lib/micropulse/kinexonDecel";

const metric = (key: string): KinexonMetric => KINEXON_CATALOG.flatMap((g) => g.metrics).find((m) => m.key === key)!;
const M_DECELS = metric("decels_load");
const M_ACCELS = metric("accels_load");
const M_EXER_HI = metric("exertions_hi");
const M_MECH = metric("mech_load");
const M_COD = metric("cod");
const M_ORIENT = metric("coo");

function flagDot(flag: KxDecelFlag): string {
  return flag === "red" ? "bg-rose-500" : flag === "yellow" ? "bg-amber-500" : flag === "green" ? "bg-emerald-500" : "bg-slate-300";
}
function verdictTone(flag: KxDecelFlag): string {
  return flag === "red" ? "text-rose-700" : flag === "yellow" ? "text-amber-700" : flag === "green" ? "text-emerald-700" : "text-slate-500";
}

export default function KinexonDecelCard({
  playerId,
  lang = "EN",
  className = "",
}: {
  playerId: string;
  lang?: "EN" | "IS";
  className?: string;
}) {
  const isEN = lang === "EN";
  const [rows, setRows] = React.useState<KinexonDecelDay[] | null>(null);
  const supabase = React.useMemo(() => getSupabaseClient(), []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const since = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 35); return d.toISOString().slice(0, 10); })();
      const { data } = await supabase
        .from("player_external_load_daily")
        .select("date, source, total_player_load, ima_cod, raw_payload_json")
        .eq("player_id", playerId)
        .eq("source", "kinexon")
        .gte("date", since)
        .order("date");
      if (!alive) return;
      const mapped: KinexonDecelDay[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        date: String(r.date),
        decelsLoad: readKinexonMetric(r, M_DECELS),
        accelsLoad: readKinexonMetric(r, M_ACCELS),
        exertionsHigh: readKinexonMetric(r, M_EXER_HI),
        mechLoad: readKinexonMetric(r, M_MECH),
        playerLoad: typeof r.total_player_load === "number" ? r.total_player_load : null,
        changesOfDirection: readKinexonMetric(r, M_COD),
        changesOfOrientation: readKinexonMetric(r, M_ORIENT),
      }));
      setRows(mapped);
    })();
    return () => { alive = false; };
  }, [playerId, supabase]);

  if (rows == null) {
    return <div className={`rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 ${className}`}>Loading Kinexon decel read…</div>;
  }

  const status = computeKinexonDecel(rows);
  if (status.overall === "no_data") {
    return (
      <div className={`rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs ${className}`}>
        <div className="font-semibold uppercase tracking-wide text-slate-500">
          {isEN ? "Deceleration Intelligence · Kinexon" : "Hemlunargreining · Kinexon"}
        </div>
        <p className="mt-1 text-slate-600">
          {isEN
            ? "Not enough Kinexon braking data (Decels Load / Exertions) yet to read deceleration load."
            : "Ekki næg Kinexon-hemlunargögn (Decels Load / Exertions) til að lesa hemlunarálag enn."}
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border-2 border-slate-200 bg-white p-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-violet-700">{isEN ? "Measured by Kinexon" : "Mælt af Kinexon"}</div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">
            {isEN ? "Deceleration Intelligence" : "Hemlunargreining"}
          </h3>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
          {isEN ? `${status.confidence} confidence · ${status.baselineDays}d` : `${status.confidence} vissa · ${status.baselineDays}d`}
        </span>
      </div>

      {/* Layer 0 — verdict, first and boldest */}
      <p className={`mt-2 text-sm font-semibold ${verdictTone(status.overall)}`}>
        {isEN ? status.headlineEN : status.headlineIS}
      </p>

      {/* Layer 1 — the dimensions, each read against the player's own norm */}
      <div className="mt-3 space-y-2">
        {status.dims.map((d) => (
          <div key={d.key} className="flex items-start gap-2 text-xs">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${flagDot(d.flag)}`} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold text-slate-700">{isEN ? d.labelEN : d.labelIS}</span>
                <span className="tabular-nums text-slate-500">{d.valueText}</span>
              </div>
              <div className="text-slate-500">{isEN ? d.coachEN : d.coachIS}</div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[10px] leading-snug text-slate-400">
        {isEN
          ? "Kinexon load/effort signals (Decels Load, Accels Load, Exertions, Mechanical Load) vs the player's own 28-day norm — McBurnie 2022 dimensions on measured load, not event counts. Directional work shows both Changes of Direction (CoD) and Changes of Orientation (CoO), flagged on CoD. L/R CoD asymmetry (per-intensity-tier split) and decel:sprint coupling aren't available here. Descriptive — never the readiness verdict."
          : "Kinexon álags/átaks-merki (Decels Load, Accels Load, Exertions, Mechanical Load) á móti eigin 28-daga viðmiði — McBurnie 2022 víddir á mældu álagi, ekki atburðatalningu. Stefnuvinna sýnir bæði Changes of Direction (CoD) og Changes of Orientation (CoO), flöggað á CoD. L/R CoD ósamhverfa (eftir ákefðarþrepum) og hemlun:sprettur eru ekki í boði hér. Lýsandi — aldrei readiness-dómur."}
      </p>
    </div>
  );
}

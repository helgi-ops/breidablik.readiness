"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Props = {
  teamId: string | null;
  date: string;
};

type ValdAlertRow = {
  playerId: string;
  playerName: string;
  neuromuscularFlag?: string | null;
  hamstringFlag?: string | null;
  groinFlag?: string | null;
  latestCmjAt?: string | null;
};

export default function ValdAlertsPanel({ teamId, date }: Props) {
  const [rows, setRows] = useState<ValdAlertRow[]>([]);

  useEffect(() => {
    if (!teamId) {
      setRows([]);
      return;
    }

    const supabase = getSupabaseClient();
    void supabase
      .from("vald_daily_player_snapshot")
      .select("microplayer_id, neuromuscular_flag, hamstring_flag, groin_flag, latest_cmj_at, players!inner(full_name)")
      .eq("team_id", teamId)
      .eq("snapshot_date", date)
      .then(({ data, error }) => {
        if (error) {
          setRows([]);
          return;
        }
        const mapped = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
          const player = (row.players as Record<string, unknown> | null) ?? null;
          return {
            playerId: String(row.microplayer_id ?? ""),
            playerName: String(player?.full_name ?? "Player"),
            neuromuscularFlag: row.neuromuscular_flag ? String(row.neuromuscular_flag) : null,
            hamstringFlag: row.hamstring_flag ? String(row.hamstring_flag) : null,
            groinFlag: row.groin_flag ? String(row.groin_flag) : null,
            latestCmjAt: row.latest_cmj_at ? String(row.latest_cmj_at) : null,
          };
        });
        setRows(mapped);
      });
  }, [date, teamId]);

  const redNeuromuscular = rows.filter((row) => row.neuromuscularFlag === "red");
  const hamstringConcern = rows.filter((row) => row.hamstringFlag === "red" || row.hamstringFlag === "yellow");
  const groinConcern = rows.filter((row) => row.groinFlag === "red" || row.groinFlag === "yellow");

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">VALD alerts</div>
      <div className="mt-1 text-base font-semibold text-zinc-950">Today</div>
      <div className="mt-3 space-y-2 text-sm text-zinc-700">
        {!teamId ? <AlertLine title="Coverage" names={["No team context available."]} /> : null}
        <AlertLine title="Neuromuscular red" names={redNeuromuscular.map((row) => row.playerName)} />
        <AlertLine title="Hamstring concern" names={hamstringConcern.map((row) => row.playerName)} />
        <AlertLine title="Groin concern" names={groinConcern.map((row) => row.playerName)} />
      </div>
    </div>
  );
}

function AlertLine({ title, names }: { title: string; names: string[] }) {
  return (
    <div className="rounded-lg border bg-zinc-50 px-3 py-2">
      <div className="font-medium text-zinc-900">{title}</div>
      <div className="mt-1 text-xs text-zinc-600">{names.length ? names.join(", ") : "None today."}</div>
    </div>
  );
}

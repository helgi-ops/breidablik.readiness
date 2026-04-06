"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type ValdSnapshotRow = {
  overall_vald_status: string | null;
  neuromuscular_flag: string | null;
  hamstring_flag: string | null;
  groin_flag: string | null;
  latest_cmj_at: string | null;
  latest_nordbord_at: string | null;
  latest_forceframe_at: string | null;
  explanation: Record<string, unknown> | null;
};

function formatAgo(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  return days === 0 ? "today" : `${days}d ago`;
}

export default function ValdStatusCard({ playerId, date }: { playerId: string; date: string }) {
  const [row, setRow] = useState<ValdSnapshotRow | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    void supabase
      .from("vald_daily_player_snapshot")
      .select("overall_vald_status, neuromuscular_flag, hamstring_flag, groin_flag, latest_cmj_at, latest_nordbord_at, latest_forceframe_at, explanation")
      .eq("microplayer_id", playerId)
      .eq("snapshot_date", date)
      .maybeSingle()
      .then(({ data }) => setRow((data as ValdSnapshotRow | null) ?? null));
  }, [date, playerId]);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">VALD</div>
      <div className="mt-1 text-base font-semibold text-zinc-950">Status</div>
      <div className="mt-3 space-y-1 text-sm text-zinc-700">
        <div>Overall: {row?.overall_vald_status ?? "No recent data"}</div>
        <div>Neuromuscular status: {row?.neuromuscular_flag ?? "No recent data"}</div>
        <div>Hamstring status: {row?.hamstring_flag ?? "No recent data"}</div>
        <div>Groin status: {row?.groin_flag ?? "No recent data"}</div>
      </div>
      <div className="mt-3 text-xs text-zinc-600">
        VALD data freshness: CMJ {formatAgo(row?.latest_cmj_at ?? null)} · NordBord {formatAgo(row?.latest_nordbord_at ?? null)} · ForceFrame {formatAgo(row?.latest_forceframe_at ?? null)}
      </div>
      <div className="mt-3 text-xs text-zinc-600">
        {typeof row?.explanation?.cmj === "object" ? String((row.explanation.cmj as Record<string, unknown>).message ?? "No recent VALD data available; confidence reduced.") : "No recent VALD data available; confidence reduced."}
      </div>
    </div>
  );
}

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

type ExplanationPart = { message?: string; retest_needed?: boolean; test_age_days?: number | null; return_read?: { message?: { en?: string; is?: string } } | null };

export default function ValdStatusCard({ playerId, date, lang = "EN" }: { playerId: string; date: string; lang?: "EN" | "IS" }) {
  const [row, setRow] = useState<ValdSnapshotRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const supabase = getSupabaseClient();
    void supabase
      .from("vald_daily_player_snapshot")
      .select("overall_vald_status, neuromuscular_flag, hamstring_flag, groin_flag, latest_cmj_at, latest_nordbord_at, latest_forceframe_at, explanation")
      .eq("microplayer_id", playerId)
      .eq("snapshot_date", date)
      .maybeSingle()
      .then(({ data }) => { setRow((data as ValdSnapshotRow | null) ?? null); setLoaded(true); });
  }, [date, playerId]);

  // Self-hide when there's no VALD snapshot — VALD is optional lab kit (force plates / dynamometer);
  // a team that doesn't use it (e.g. an indoor basketball team) should see nothing, not an empty card.
  if (!loaded || !row) return null;

  const is = lang === "IS";
  const none = is ? "Engin nýleg gögn" : "No recent data";
  const expl = (row.explanation ?? {}) as { cmj?: ExplanationPart; nordbord?: ExplanationPart; forceframe?: ExplanationPart };
  const returnMessage = expl.cmj?.return_read?.message?.[is ? "is" : "en"];
  const cmjMessage = returnMessage ?? expl.cmj?.message ?? (is ? "Engin nýleg VALD gögn." : "No recent VALD data available; confidence reduced.");
  const retest = [
    expl.nordbord?.retest_needed ? (is ? `aftanlæri (${expl.nordbord.test_age_days} dagar)` : `hamstring (${expl.nordbord.test_age_days}d ago)`) : null,
    expl.forceframe?.retest_needed ? (is ? `nári (${expl.forceframe.test_age_days} dagar)` : `groin (${expl.forceframe.test_age_days}d ago)`) : null,
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">VALD</div>
      <div className="mt-1 text-base font-semibold text-zinc-950">Status</div>
      <div className="mt-3 space-y-1 text-sm text-zinc-700">
        <div>{is ? "Heild" : "Overall"}: {row.overall_vald_status ?? none}</div>
        <div>{is ? "Hopp" : "Neuromuscular status"}: {row.neuromuscular_flag ?? none}</div>
        <div>{is ? "Aftanlæri" : "Hamstring status"}: {row.hamstring_flag ?? none}</div>
        <div>{is ? "Nári" : "Groin status"}: {row.groin_flag ?? none}</div>
      </div>
      <div className="mt-3 text-xs text-zinc-600">
        {is ? "Síðustu próf" : "VALD data freshness"}: CMJ {formatAgo(row.latest_cmj_at)} · NordBord {formatAgo(row.latest_nordbord_at)} · ForceFrame {formatAgo(row.latest_forceframe_at)}
      </div>
      <div className="mt-3 text-xs text-zinc-600">
        {cmjMessage}
      </div>
      {retest.length > 0 && (
        <div className="mt-2 text-xs text-zinc-600">
          {is ? "Þarf að prófa aftur, síðasta próf of gamalt" : "Needs a new test, the last one is too old"}: {retest.join(", ")}
        </div>
      )}
    </div>
  );
}

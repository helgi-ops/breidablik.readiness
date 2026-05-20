"use client";

/**
 * src/components/coach/SprintCadenceBandsCard.tsx
 *
 * IMA Free Running Bands 7 + 8 — the two highest stride-cadence bands, i.e.
 * the strides taken at true sprint cadence. Sits in the Decel Intelligence
 * card stack next to Decel:Sprint Coupling because B7-8 stride volume is the
 * cleanest read on how much genuine sprint-cadence work a player is doing.
 *
 * Mode-agnostic: IMA Free Running is an inertial signal — Catapult captures
 * it whether the vest has a GPS lock or not — so this works for outdoor
 * pitch sessions exactly as it does for indoor hall sessions. The data lives
 * in player_external_load_daily.ima_fr_band7/8_stride_count regardless of
 * the team's indoor/outdoor mode.
 *
 * Reads player_external_load_daily directly (RLS lets a coach see their own
 * team's players) — no API route needed.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type DayRow = {
  date: string;
  band7: number;
  band8: number;
};

type Loaded = {
  days: DayRow[];
  sum7dB7: number;
  sum7dB8: number;
  sum28dB7: number;
  sum28dB8: number;
  daysWithData7d: number;
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function SprintCadenceBandsCard({ playerId }: { playerId: string }) {
  const [lang] = useLang();
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const today = new Date();
        const from28 = new Date(today);
        from28.setUTCDate(from28.getUTCDate() - 27);
        const from7 = new Date(today);
        from7.setUTCDate(from7.getUTCDate() - 6);
        const from7Str = toDateStr(from7);

        const { data: rows, error } = await supabase
          .from("player_external_load_daily")
          .select("date, ima_fr_band7_stride_count, ima_fr_band8_stride_count")
          .eq("player_id", playerId)
          .gte("date", toDateStr(from28))
          .lte("date", toDateStr(today))
          .in("source", ["catapult", "manual"])
          .order("date", { ascending: true });

        if (!alive) return;
        if (error) {
          setLoading(false);
          return;
        }

        const days: DayRow[] = ((rows ?? []) as Array<{
          date: string;
          ima_fr_band7_stride_count: number | null;
          ima_fr_band8_stride_count: number | null;
        }>).map((r) => ({
          date: r.date,
          band7: Number(r.ima_fr_band7_stride_count ?? 0) || 0,
          band8: Number(r.ima_fr_band8_stride_count ?? 0) || 0,
        }));

        let sum7dB7 = 0, sum7dB8 = 0, sum28dB7 = 0, sum28dB8 = 0, daysWithData7d = 0;
        for (const d of days) {
          sum28dB7 += d.band7;
          sum28dB8 += d.band8;
          if (d.date >= from7Str) {
            sum7dB7 += d.band7;
            sum7dB8 += d.band8;
            if (d.band7 > 0 || d.band8 > 0) daysWithData7d += 1;
          }
        }

        setData({ days, sum7dB7, sum7dB8, sum28dB7, sum28dB8, daysWithData7d });
      } catch {
        /* silent — card just won't render */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [playerId]);

  if (loading) return null;
  if (!data) return null;

  // Nothing captured at all in 28 days — hide rather than show an empty card.
  if (data.sum28dB7 === 0 && data.sum28dB8 === 0) return null;

  const total7d = data.sum7dB7 + data.sum7dB8;
  const total28d = data.sum28dB7 + data.sum28dB8;
  const fmt = (n: number) => Math.round(n).toLocaleString("is-IS");

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-900">
            {lang === "IS" ? "Sprint-skref (IMA FR Bands 7-8)" : "Sprint Cadence Strides (IMA FR B7-8)"}
          </div>
          <div className="text-[11px] text-slate-500">
            {lang === "IS"
              ? "Hæstu cadence-bönd — raunveruleg sprett-skref. Virkar indoor og outdoor."
              : "Highest cadence bands — true sprint-cadence strides. Works indoor and outdoor."}
          </div>
        </div>
      </div>

      {/* B7 / B8 / total split */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-slate-500">Band 7 · 7d</div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{fmt(data.sum7dB7)}</div>
          <div className="text-[9px] text-slate-500">{lang === "IS" ? "skref" : "strides"}</div>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-slate-500">Band 8 · 7d</div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{fmt(data.sum7dB8)}</div>
          <div className="text-[9px] text-slate-500">{lang === "IS" ? "skref" : "strides"}</div>
        </div>
        <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-emerald-700">B7+8 · 7d</div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-emerald-800">{fmt(total7d)}</div>
          <div className="text-[9px] text-emerald-700">{lang === "IS" ? "sprett-skref" : "sprint strides"}</div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
        <span>
          {lang === "IS"
            ? `28 daga samtals: ${fmt(total28d)} skref (B7 ${fmt(data.sum28dB7)} · B8 ${fmt(data.sum28dB8)})`
            : `28-day total: ${fmt(total28d)} strides (B7 ${fmt(data.sum28dB7)} · B8 ${fmt(data.sum28dB8)})`}
        </span>
        <span>{data.daysWithData7d} / 7 {lang === "IS" ? "dagar" : "days"}</span>
      </div>

      <p className="mt-2 text-[10px] text-slate-500 leading-snug">
        {lang === "IS"
          ? "IMA Free Running bands 7-8 eru hæstu stride-cadence bönd Catapult — skrefin sem tekin eru á raunverulegum spretthraða. Hærra band 7+8 magn = meiri ósvikin sprett-útsetning, sem parast við Decel:Sprint Coupling hér fyrir ofan."
          : "IMA Free Running bands 7-8 are Catapult's highest stride-cadence bands — strides taken at genuine sprint cadence. Higher B7+8 volume means more true sprint exposure, which pairs with the Decel:Sprint Coupling tile above."}
      </p>
    </div>
  );
}

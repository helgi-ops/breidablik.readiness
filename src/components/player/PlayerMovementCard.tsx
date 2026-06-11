"use client";

/**
 * PlayerMovementCard — a PLAYER-facing, motivating view of their own IMA
 * movement for a day: jumps, high-intensity actions, direction changes (cuts),
 * and high-speed running — each vs the player's OWN recent normal. Plain
 * language, personal-norm framing. Deliberately NOT the coach/S&C signals
 * (no L/R asymmetry, no movement-drift, no clock fingerprint).
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Metric = { key: string; unit: string; today: number | null; usual: number | null; pct: number | null; tone: "up" | "steady" | "down" | "na"; baselineDays: number };
type Resp = { ok: boolean; date: string; hasData: boolean; metrics: Metric[]; error?: string };

const LABEL: Record<string, { en: string; is: string }> = {
  jumps: { en: "Jumps", is: "Stökk" },
  high_intensity: { en: "High-intensity actions", is: "Háákefðar hreyfingar" },
  cuts: { en: "Direction changes", is: "Stefnubreytingar" },
  ima_run: { en: "High-speed running", is: "Háhraðahlaup" },
};

const fmt = (v: number | null, unit: string) =>
  v == null ? "—" : unit === "m" ? `${v.toLocaleString("en-US")} m` : v.toLocaleString("en-US");

export default function PlayerMovementCard({ date, lang }: { date: string; lang: "IS" | "EN" }) {
  const is = lang === "IS";
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`/api/player/movement?date=${date}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const j = (await res.json()) as Resp;
      setData(res.ok ? j : null);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [date]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return null;
  if (!data || !data.hasData) return null;

  const usualWord = (m: Metric) =>
    m.tone === "up" ? (is ? "meira en venjulega" : "more than usual")
    : m.tone === "down" ? (is ? "minna en venjulega" : "less than usual")
    : (is ? "eins og venjulega" : "about usual");
  const arrow = (t: Metric["tone"]) => (t === "up" ? "↑" : t === "down" ? "↓" : "→");
  const toneCls = (t: Metric["tone"]) =>
    t === "up" ? "text-emerald-600" : t === "down" ? "text-slate-500" : "text-slate-400";

  const tiles = data.metrics.filter((m) => (m.today ?? 0) > 0);
  if (tiles.length === 0) return null;

  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {is ? "Hreyfing í dag" : "Your movement today"}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tiles.map((m) => (
          <div key={m.key} className="rounded-xl border border-zinc-200 bg-white px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {is ? LABEL[m.key]?.is : LABEL[m.key]?.en}
            </div>
            <div className="mt-2 text-lg font-semibold tabular-nums text-zinc-800">{fmt(m.today, m.unit)}</div>
            <div className="mt-1 text-[11px]">
              {m.pct == null ? (
                <span className="text-zinc-400">{is ? "byggi upp viðmið" : "building your normal"}</span>
              ) : (
                <span className={toneCls(m.tone)}>
                  {arrow(m.tone)} {m.pct > 0 ? "+" : ""}{m.pct}% · {usualWord(m)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-zinc-400">
        {is
          ? "Borið saman við þitt eigið meðaltal síðustu vikna — til gamans og hvatningar, ekki áhættumat."
          : "Compared to your own recent average — for motivation, not a risk score."}
      </p>
    </div>
  );
}

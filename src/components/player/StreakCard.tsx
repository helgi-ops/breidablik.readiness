"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Lang } from "@/lib/lang";

type StreakData = {
  checkin: { currentStreak: number; days28: number; rate28: number };
  rpe: { currentStreak: number; days28: number; rate28: number };
};

const COPY = {
  IS: {
    checkin: "Check-in",
    rpe: "RPE",
    streak: "í röð",
    days: "d",
    rate28: "28d",
    loading: "Hleð...",
  },
  EN: {
    checkin: "Check-in",
    rpe: "RPE",
    streak: "streak",
    days: "d",
    rate28: "28d",
    loading: "Loading...",
  },
} as const;

function rateColor(rate: number): string {
  if (rate >= 80) return "text-emerald-600";
  if (rate >= 50) return "text-amber-600";
  return "text-red-500";
}

function rateBg(rate: number): string {
  if (rate >= 80) return "bg-emerald-50 border-emerald-200";
  if (rate >= 50) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

function streakIcon(streak: number): string {
  if (streak >= 14) return "🔥";
  if (streak >= 7) return "⚡";
  if (streak >= 3) return "✅";
  return "📊";
}

export default function StreakCard({ lang = "IS" }: { lang?: Lang }) {
  const [data, setData] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);
  const ct = COPY[lang];

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const { data: auth } = await supabase.auth.getSession();
        const token = auth?.session?.access_token;
        if (!token) return;

        const res = await fetch("/api/player/streak", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (alive && json.ok) setData(json.data);
      } catch {
        // Silently fail — streak card is non-critical
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, []);

  if (loading) return null; // Don't show loading skeleton — card appears when ready
  if (!data) return null;

  const { checkin, rpe } = data;

  // Don't show card if player has no data at all
  if (checkin.days28 === 0 && rpe.days28 === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3">
        {/* Check-in streak */}
        <StreakBlock
          label={ct.checkin}
          streak={checkin.currentStreak}
          streakSuffix={ct.streak}
          days28={checkin.days28}
          rate28={checkin.rate28}
          rate28Label={ct.rate28}
        />
        {/* RPE streak */}
        <StreakBlock
          label={ct.rpe}
          streak={rpe.currentStreak}
          streakSuffix={ct.streak}
          days28={rpe.days28}
          rate28={rpe.rate28}
          rate28Label={ct.rate28}
        />
      </div>
    </div>
  );
}

function StreakBlock({
  label,
  streak,
  streakSuffix,
  days28,
  rate28,
  rate28Label,
}: {
  label: string;
  streak: number;
  streakSuffix: string;
  days28: number;
  rate28: number;
  rate28Label: string;
}) {
  return (
    <div className={`rounded-xl border p-3 ${rateBg(rate28)}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-lg">{streakIcon(streak)}</span>
        <span className="text-2xl font-bold tabular-nums text-zinc-900">
          {streak}
        </span>
        <span className="text-xs text-zinc-500">{streakSuffix}</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className={`text-sm font-semibold tabular-nums ${rateColor(rate28)}`}>
          {rate28}%
        </span>
        <span className="text-[10px] text-zinc-400">
          {rate28Label} ({days28}/28)
        </span>
      </div>
    </div>
  );
}

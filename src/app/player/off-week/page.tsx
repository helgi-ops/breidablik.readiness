"use client";

/**
 * Dedicated player OFF-WEEK page — the coach-sent holiday maintenance plan on its own route, isolated
 * from the Today dashboard's MutationObserver-managed DOM (so it can never drive the observer loop that
 * froze Today). Reachable from the break banner. Self-guided, works offline once loaded. Descriptive.
 */

import Link from "next/link";
import { useLang } from "@/lib/lang";
import PlayerOffWeek from "@/app/player/dev-player-dashboard/PlayerOffWeek";

export const dynamic = "force-dynamic";

export default function PlayerOffWeekPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-4">
      <Link href="/player" className="text-[13px] font-semibold text-[#2740e6] hover:underline">← {is ? "Til baka" : "Back"}</Link>
      <h1 className="mt-2 text-xl font-bold text-zinc-900">{is ? "Frívika — æfingakerfi" : "Off-week — training plan"}</h1>
      <p className="mt-0.5 mb-3 text-[13px] text-zinc-500">
        {is ? "Viðhalds-prógramm frá þjálfara fyrir fríið. Sjálf-leiðbeint (RPE/tími/vegalengd) — virkar án nets." : "Your coach's maintenance plan for the break. Self-guided (RPE/time/distance) — works offline."}
      </p>
      <PlayerOffWeek />
    </div>
  );
}

"use client";

import Link from "next/link";
import { SEND_MODE_TEXT } from "@/lib/micropulse/strengthProgramming/sendMode";
import { goalsLine, sendModeChip, type GoalSeason, type StrengthDelivery } from "@/lib/micropulse/strengthProgramming/deliveryView";

/**
 * The team's strength send mode on Meso and Micro (deliveryView.ts): one chip + one plain line, and for the goals mode
 * what the goals do in this part of the season. The mode is changed on Daily session (link). Renders nothing until read.
 */
export default function StrengthDeliveryNote({ delivery, season, is, className = "" }: {
  delivery: StrengthDelivery | null;
  season: GoalSeason;
  is: boolean;
  className?: string;
}) {
  if (!delivery) return null;
  const line = SEND_MODE_TEXT[delivery.mode].line;
  return (
    <div className={`rounded-md border border-[#7a5cc4]/20 bg-[#7a5cc4]/[0.04] px-2.5 py-1.5 text-[12px] text-slate-700 ${className}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="rounded-full bg-[#7a5cc4]/10 px-2 py-0.5 text-[11px] font-semibold text-[#55389e]">{sendModeChip(delivery.mode, is)}</span>
        <span>{is ? line.is : line.en}</span>
        <Link href="/coach/strength-hub?tab=send" className="ml-auto text-[11.5px] font-semibold text-[#2740e6] hover:underline">{is ? "Breyta á Æfing dagsins →" : "Change on Daily session →"}</Link>
      </div>
      {delivery.mode === "individualised_goals" && <p className="mt-0.5 text-[11.5px] text-slate-600">{goalsLine(season, is)}</p>}
    </div>
  );
}

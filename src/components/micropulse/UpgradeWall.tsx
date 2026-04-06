"use client";

import Link from "next/link";
import type { MicroPulsePlanKey } from "@/lib/micropulse/product/types";

type UpgradeWallProps = {
  /** The plan required to access this feature */
  requiredPlan?: MicroPulsePlanKey;
  /** Feature name shown in the heading */
  featureName?: string;
  /** Optional short description of what the user is missing */
  description?: string;
  /** Whether to show as a full-page overlay vs. inline block */
  variant?: "overlay" | "inline";
};

const PLAN_LABELS: Record<MicroPulsePlanKey, string> = {
  FREE: "Free",
  PRO: "Pro",
  ELITE: "Elite",
};

const PLAN_COLORS: Record<MicroPulsePlanKey, { badge: string; btn: string }> = {
  FREE:  { badge: "bg-slate-100 text-slate-600",  btn: "bg-slate-700 hover:bg-slate-800" },
  PRO:   { badge: "bg-blue-100 text-blue-700",    btn: "bg-blue-600 hover:bg-blue-700" },
  ELITE: { badge: "bg-violet-100 text-violet-700", btn: "bg-violet-600 hover:bg-violet-700" },
};

export default function UpgradeWall({
  requiredPlan = "PRO",
  featureName,
  description,
  variant = "inline",
}: UpgradeWallProps) {
  const planLabel = PLAN_LABELS[requiredPlan];
  const colors = PLAN_COLORS[requiredPlan];

  const content = (
    <div className="flex flex-col items-center justify-center text-center gap-4 py-12 px-6">
      {/* Lock icon */}
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
        <svg
          className="h-7 w-7 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
      </div>

      {/* Plan badge */}
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${colors.badge}`}>
        {planLabel} feature
      </span>

      {/* Heading */}
      <div>
        <h3 className="text-lg font-semibold text-slate-800">
          {featureName ? `${featureName} requires ${planLabel}` : `Upgrade to ${planLabel} to unlock this`}
        </h3>
        {description ? (
          <p className="mt-1 text-sm text-slate-500 max-w-xs">{description}</p>
        ) : (
          <p className="mt-1 text-sm text-slate-500 max-w-xs">
            This feature is available on the {planLabel} plan and above.
          </p>
        )}
      </div>

      {/* CTA */}
      <Link
        href="/pricing"
        className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition ${colors.btn}`}
      >
        View {planLabel} plan
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </Link>
    </div>
  );

  if (variant === "overlay") {
    return (
      <div className="relative min-h-[320px] w-full">
        {/* Blurred background hint */}
        <div className="absolute inset-0 rounded-2xl bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50/60">
      {content}
    </div>
  );
}

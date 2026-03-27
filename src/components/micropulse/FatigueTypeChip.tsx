"use client";

/**
 * FatigueTypeChip
 *
 * Small status chip that displays the composite fatigue type.
 * Supports both the existing FatigueType (neural/tissue/systemic)
 * and the new CompositeFatigueType (mechanical/metabolic/global).
 *
 * Usage:
 *   <FatigueTypeChip type="metabolic_fatigue" />
 *   <FatigueTypeChip type="global_fatigue" size="lg" />
 */

import type { CompositeFatigueType } from "@/lib/micropulse/metabolicLoad";

// ─── Types ─────────────────────────────────────────────────────────────────

type FatigueTypeChipProps = {
  type: CompositeFatigueType | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
};

// ─── Config ─────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  CompositeFatigueType,
  { label: string; bg: string; text: string; dot: string }
> = {
  normal: {
    label: "Normal",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-400",
  },
  mechanical_fatigue: {
    label: "Mechanical fatigue",
    bg: "bg-orange-50",
    text: "text-orange-700",
    dot: "bg-orange-400",
  },
  metabolic_fatigue: {
    label: "Metabolic fatigue",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-400",
  },
  global_fatigue: {
    label: "Global fatigue",
    bg: "bg-rose-50",
    text: "text-rose-700",
    dot: "bg-rose-500",
  },
  recovery_mismatch: {
    label: "Recovery mismatch",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-400",
  },
};

const SIZE_CLASSES = {
  sm: "px-2 py-0.5 text-xs gap-1",
  md: "px-2.5 py-1 text-xs gap-1.5",
  lg: "px-3 py-1.5 text-sm gap-2",
};

const DOT_SIZES = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
  lg: "h-2.5 w-2.5",
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function FatigueTypeChip({
  type,
  size = "md",
  className = "",
}: FatigueTypeChipProps) {
  if (!type) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-400 ${className}`}
      >
        <span className="h-2 w-2 rounded-full bg-slate-300" />
        Unknown
      </span>
    );
  }

  const config = TYPE_CONFIG[type];
  const sizeClass = SIZE_CLASSES[size];
  const dotSize = DOT_SIZES[size];

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${config.bg} ${config.text} ${sizeClass} ${className}`}
      title={config.label}
    >
      <span className={`rounded-full ${config.dot} ${dotSize} flex-shrink-0`} />
      {config.label}
    </span>
  );
}

"use client";

import type { DevPlayerTab } from "@/lib/micropulse/playerDashboard/devPlayerViewModel";
import { useLang } from "@/lib/lang";
import { PLAYER_COPY } from "../playerCopy";

type PlanTier = "FREE" | "PRO" | "ELITE";
type MinTier = "free" | "pro" | "elite";

type Props = {
  activeTab: DevPlayerTab;
  onChange: (tab: DevPlayerTab) => void;
  planTier?: PlanTier;
};

const TABS_BASE: Array<{ key: DevPlayerTab; labelKey: "today" | "rpe" | "dashboard" | "history" | "vald"; fullLabelIS: string; fullLabelEN: string; minTier: MinTier }> = [
  { key: "today",     labelKey: "today",     fullLabelIS: "Í dag",                   fullLabelEN: "Today",                   minTier: "free"  },
  { key: "rpe",       labelKey: "rpe",       fullLabelIS: "RPE skráning",             fullLabelEN: "Post Session RPE",         minTier: "pro"   },
  { key: "dashboard", labelKey: "dashboard", fullLabelIS: "Yfirlit",                  fullLabelEN: "Dashboard",                minTier: "pro"   },
  { key: "risk",      labelKey: "today",     fullLabelIS: "Áhætta",                   fullLabelEN: "Risk",                     minTier: "pro"   },
  { key: "vald",      labelKey: "vald",      fullLabelIS: "Taugavöðvaprófun",         fullLabelEN: "Neuromuscular Testing",    minTier: "elite" },
  { key: "strength",  labelKey: "today",     fullLabelIS: "Styrkur / VBT",            fullLabelEN: "Strength / VBT",           minTier: "pro"   },
  { key: "gamereport", labelKey: "history",  fullLabelIS: "Leikjaskýrsla",            fullLabelEN: "Game report",              minTier: "free"  },
  { key: "stats",     labelKey: "history",   fullLabelIS: "Tölfræði",                 fullLabelEN: "Stats",                    minTier: "free"  },
  { key: "movement",  labelKey: "history",   fullLabelIS: "Hreyfing",                 fullLabelEN: "Movement",                 minTier: "free"  },
  { key: "history",   labelKey: "history",   fullLabelIS: "Saga",                     fullLabelEN: "History",                  minTier: "free"  },
  { key: "privacy",   labelKey: "today",     fullLabelIS: "Friðhelgi",                fullLabelEN: "Privacy",                  minTier: "free"  },
];

function tierRank(t: PlanTier): number {
  if (t === "ELITE") return 2;
  if (t === "PRO") return 1;
  return 0;
}
function minTierRank(t: MinTier): number {
  if (t === "elite") return 2;
  if (t === "pro") return 1;
  return 0;
}

export default function DevPlayerTabs({ activeTab, onChange, planTier = "FREE" }: Props) {
  const rank = tierRank(planTier);
  const [lang] = useLang();

  return (
    <div className="mt-3 border-b border-zinc-200 overflow-x-auto">
      <div className="flex min-w-max">
        {TABS_BASE.map((tab) => {
          const label = lang === "IS" ? tab.fullLabelIS : tab.fullLabelEN;
          const active = tab.key === activeTab;
          const locked = rank < minTierRank(tab.minTier);
          const lockLabel = tab.minTier === "elite" ? "ELITE" : "PRO";

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => !locked && onChange(tab.key)}
              aria-pressed={active}
              disabled={locked}
              title={locked ? `Krefst ${lockLabel} áskriftar` : undefined}
              style={active ? { borderBottomColor: "#005a2b", color: "#005a2b" } : {}}
              className={
                locked
                  ? "border-b-2 border-transparent px-6 py-3.5 text-sm font-medium text-zinc-300 cursor-not-allowed whitespace-nowrap select-none flex items-center gap-1.5"
                  : active
                  ? "border-b-2 px-6 py-3.5 text-sm font-semibold whitespace-nowrap"
                  : "border-b-2 border-transparent px-6 py-3.5 text-sm font-medium text-zinc-500 hover:text-zinc-700 hover:border-zinc-300 whitespace-nowrap"
              }
            >
              {label}
              {locked && (
                <span
                  className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide"
                  style={{ background: tab.minTier === "elite" ? "#f3e0b4" : "#DBEAFE", color: tab.minTier === "elite" ? "#7c5210" : "#1E40AF" }}
                  aria-hidden="true"
                >
                  {lockLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

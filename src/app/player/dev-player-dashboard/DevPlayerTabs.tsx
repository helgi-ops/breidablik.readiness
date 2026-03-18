"use client";

import type { DevPlayerTab } from "@/lib/micropulse/playerDashboard/devPlayerViewModel";

type Props = {
  activeTab: DevPlayerTab;
  onChange: (tab: DevPlayerTab) => void;
};

const TABS: Array<{ key: DevPlayerTab; label: string }> = [
  { key: "today", label: "Today" },
  { key: "dashboard", label: "Dashboard" },
  { key: "risk", label: "Risk" },
];

export default function DevPlayerTabs({ activeTab, onChange }: Props) {
  return (
    <div className="mt-3 border-b border-zinc-200">
      <div className="flex">
        {TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              aria-pressed={active}
              style={active ? { borderBottomColor: "#005a2b", color: "#005a2b" } : {}}
              className={
                active
                  ? "border-b-2 px-8 py-3.5 text-base font-semibold whitespace-nowrap"
                  : "border-b-2 border-transparent px-8 py-3.5 text-base font-medium text-zinc-500 hover:text-zinc-700 hover:border-zinc-300 whitespace-nowrap"
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

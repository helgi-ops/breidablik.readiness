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
    <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-1 shadow-sm">
      <div className="grid grid-cols-3 gap-1">
        {TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              aria-pressed={active}
              className={
                active
                  ? "rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
                  : "rounded-xl px-3 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100"
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

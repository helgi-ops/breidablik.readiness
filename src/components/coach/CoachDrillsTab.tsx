"use client";

import { useState } from "react";
import CoachDrillLibrary from "./CoachDrillLibrary";
import DrillAnalytics from "./DrillAnalytics";
import PublicDrillTemplates from "./PublicDrillTemplates";
import SessionBuilder from "./SessionBuilder";
import SessionLibrary from "./SessionLibrary";
import { useLang } from "@/lib/lang";

const DRILLS_TAB_COPY = {
  IS: {
    selectTeam: "Veldu lið til að skoða drillur.",
    buildSession: "Búa til æfingu",
    savedSessions: "Æfingar",
    myLibrary: "Mitt Library",
    generalLibrary: "General Library",
    researchLibrary: "Research Library",
    analytics: "Yfirlit",
  },
  EN: {
    selectTeam: "Select a team to view drills.",
    buildSession: "Build session",
    savedSessions: "Sessions",
    myLibrary: "My Library",
    generalLibrary: "General Library",
    researchLibrary: "Research Library",
    analytics: "Analytics",
  },
} as const;

type SubTab = "general" | "research" | "mine" | "session" | "saved" | "analytics";

export default function CoachDrillsTab({ teamId, teamSport = null }: { teamId: string; teamSport?: string | null }) {
  const [lang] = useLang();
  const t = DRILLS_TAB_COPY[lang];
  const [subTab, setSubTab] = useState<SubTab>("session");
  const [refreshKey, setRefreshKey] = useState(0);

  if (!teamId) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        {t.selectTeam}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200">
        <SubTabBtn active={subTab === "session"} onClick={() => setSubTab("session")}>
          {t.buildSession}
        </SubTabBtn>
        <SubTabBtn active={subTab === "saved"} onClick={() => setSubTab("saved")}>
          {t.savedSessions}
        </SubTabBtn>
        <SubTabBtn active={subTab === "mine"} onClick={() => setSubTab("mine")}>
          {t.myLibrary}
        </SubTabBtn>
        <SubTabBtn active={subTab === "general"} onClick={() => setSubTab("general")}>
          {t.generalLibrary}
        </SubTabBtn>
        <SubTabBtn active={subTab === "research"} onClick={() => setSubTab("research")}>
          {t.researchLibrary}
        </SubTabBtn>
        <SubTabBtn active={subTab === "analytics"} onClick={() => setSubTab("analytics")}>
          {t.analytics}
        </SubTabBtn>
      </div>

      {subTab === "general" && (
        <CoachDrillLibrary key={`general-${refreshKey}`} teamId={teamId} teamSport={teamSport} />
      )}
      {subTab === "research" && (
        <PublicDrillTemplates
          teamId={teamId}
          sport={teamSport ?? "football"}
          onCopied={() => setRefreshKey((k) => k + 1)}
        />
      )}
      {subTab === "mine" && (
        <CoachDrillLibrary key={`mine-${refreshKey}`} teamId={teamId} mineOnly teamSport={teamSport} />
      )}
      {subTab === "session" && <SessionBuilder teamId={teamId} />}
      {subTab === "saved" && <SessionLibrary key={`saved-${refreshKey}`} teamId={teamId} />}
      {subTab === "analytics" && <DrillAnalytics teamId={teamId} />}
    </div>
  );
}

function SubTabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-slate-900 text-slate-900"
          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

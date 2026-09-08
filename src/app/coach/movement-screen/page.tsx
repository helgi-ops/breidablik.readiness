"use client";

export const dynamic = "force-dynamic";

import * as React from "react";
import { useLang } from "@/lib/lang";
import MovementScreenClient from "@/components/movement/MovementScreenClient";
import RegionAssessmentForm from "@/components/movement/RegionAssessmentForm";
import CorrectiveTab from "@/components/movement/CorrectiveTab";
import AddExerciseForm from "@/components/movement/AddExerciseForm";
import TestCatalogueBrowser from "@/components/movement/TestCatalogueBrowser";
import MovementAssessmentForm from "@/components/movement/MovementAssessmentForm";

type Tab = "measure" | "region" | "correctives" | "library" | "catalogue" | "form";

export default function MovementScreenPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  const T = (en: string, isT: string) => (is ? isT : en);
  const [tab, setTab] = React.useState<Tab>("measure");
  const [playerId, setPlayerId] = React.useState("");

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "measure", label: T("Analyse & measure", "Greina & mæla") },
    { key: "region", label: T("Region assessment", "Svæðismat") },
    { key: "correctives", label: T("Correctives", "Corrective æfingar") },
    { key: "library", label: T("Exercise library", "Æfingasafn") },
    { key: "form", label: T("Screening form", "Skimunar-form") },
    { key: "catalogue", label: T("Test catalogue", "Prófasafn") },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{T("Movement Screen", "Hreyfiskimun")}</h1>
        <p className="mt-0.5 text-[12px] text-slate-500">
          {T(
            "Analyse & measure a movement (AI read + pose), record a region assessment, then pick the corrective exercises to send the player. Screening & training only — not a diagnosis; pain / red flags route to a clinician. Never the readiness colour.",
            "Greindu & mældu hreyfingu (AI-lestur + pose), skráðu svæðismat, veldu svo corrective æfingar til að senda leikmanni. Aðeins skimun & þjálfun — ekki greining; verkur / rauð flögg fara til klíníkers. Aldrei readiness-liturinn.",
          )}
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold ${tab === t.key ? "border-[#2740e6] text-[#2740e6]" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div hidden={tab !== "measure"}><MovementScreenClient hideHeader playerId={playerId} onPlayerChange={setPlayerId} /></div>
      {tab === "region" && <RegionAssessmentForm playerId={playerId} onPlayerChange={setPlayerId} />}
      {tab === "correctives" && <CorrectiveTab playerId={playerId} onPlayerChange={setPlayerId} />}
      {tab === "library" && <AddExerciseForm />}
      {tab === "form" && <MovementAssessmentForm playerId={playerId} onPlayerChange={setPlayerId} />}
      {tab === "catalogue" && <TestCatalogueBrowser />}
    </div>
  );
}

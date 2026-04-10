"use client";

import { useMemo, useState } from "react";
import {
  ISO_PROTOCOLS,
  ISO_CATEGORY_LABELS,
  ISO_INTENSITY_LABELS,
  formatRange,
  type IsoCategory,
  type IsoProtocol,
  type IsoPhase,
} from "@/lib/micropulse/isometrics/protocols";

type Lang = "IS" | "EN";

interface Props {
  lang: Lang;
  onPick: (protocol: IsoProtocol, phaseIdx: number) => void;
  onClose: () => void;
}

const COPY = {
  IS: {
    title: "Veldu ísómetrískt prótocol",
    subtitle: "Smelltu á prótocol til að sjá fasa og velja fasa til að bæta við.",
    searchPlaceholder: "Leita…",
    all: "Öll",
    back: "Til baka",
    pickPhase: "Veldu fasa",
    pickThis: "Nota þennan fasa",
    close: "Loka",
    frequency: "Tíðni",
    exercises: "æfingar",
    phase: "Fasi",
    phases: "Fasar",
    rationale: "Rökstuðningur",
  },
  EN: {
    title: "Pick an isometric protocol",
    subtitle: "Click a protocol to see its phases and select one to add.",
    searchPlaceholder: "Search…",
    all: "All",
    back: "Back",
    pickPhase: "Pick a phase",
    pickThis: "Use this phase",
    close: "Close",
    frequency: "Frequency",
    exercises: "exercises",
    phase: "Phase",
    phases: "Phases",
    rationale: "Rationale",
  },
} as const;

const CATEGORIES: (IsoCategory | "all")[] = [
  "all",
  "rehab",
  "performance",
  "prevention",
  "longevity",
  "sport_specific",
];

export default function IsoProtocolPickerModal({ lang, onPick, onClose }: Props) {
  const t = COPY[lang];
  const [selected, setSelected] = useState<IsoProtocol | null>(null);
  const [category, setCategory] = useState<IsoCategory | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ISO_PROTOCOLS.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (!q) return true;
      return (
        p.titleIS.toLowerCase().includes(q) ||
        p.titleEN.toLowerCase().includes(q) ||
        p.goalIS.toLowerCase().includes(q) ||
        p.goalEN.toLowerCase().includes(q)
      );
    });
  }, [category, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-lg font-semibold">{t.title}</h2>
            <p className="text-xs text-gray-500 mt-1">{t.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label={t.close}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {selected ? (
            <PhasePicker
              protocol={selected}
              lang={lang}
              copy={t}
              onBack={() => setSelected(null)}
              onPick={(phaseIdx) => onPick(selected, phaseIdx)}
            />
          ) : (
            <>
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <input
                  type="text"
                  placeholder={t.searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                <div className="flex gap-1 flex-wrap">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        category === c
                          ? "bg-black text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {c === "all" ? t.all : ISO_CATEGORY_LABELS[c][lang]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-400 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h3 className="font-semibold text-sm leading-tight">
                        {lang === "IS" ? p.titleIS : p.titleEN}
                      </h3>
                      <span
                        className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${ISO_INTENSITY_LABELS[p.intensity].color}`}
                      >
                        {ISO_INTENSITY_LABELS[p.intensity][lang]}
                      </span>
                    </div>
                    <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                      {ISO_CATEGORY_LABELS[p.category][lang]}
                    </div>
                    <p className="text-xs text-gray-600 leading-snug line-clamp-2">
                      {lang === "IS" ? p.goalIS : p.goalEN}
                    </p>
                    <div className="mt-2 text-[11px] text-gray-500">
                      {p.phases.length}{" "}
                      {p.phases.length > 1 ? t.phases.toLowerCase() : t.phase.toLowerCase()}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PhasePicker({
  protocol,
  lang,
  copy,
  onBack,
  onPick,
}: {
  protocol: IsoProtocol;
  lang: Lang;
  copy: typeof COPY.IS | typeof COPY.EN;
  onBack: () => void;
  onPick: (phaseIdx: number) => void;
}) {
  return (
    <div>
      <button
        onClick={onBack}
        className="text-sm text-gray-500 hover:text-gray-900 mb-3 inline-flex items-center gap-1"
      >
        ← {copy.back}
      </button>

      <h3 className="text-xl font-bold mb-1">
        {lang === "IS" ? protocol.titleIS : protocol.titleEN}
      </h3>
      <p className="text-sm text-gray-600 mb-4">
        {lang === "IS" ? protocol.goalIS : protocol.goalEN}
      </p>

      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 mb-4">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
          {copy.rationale}
        </div>
        <p className="text-xs text-gray-700">
          {lang === "IS" ? protocol.rationaleIS : protocol.rationaleEN}
        </p>
      </div>

      <div className="text-sm font-semibold mb-2">{copy.pickPhase}:</div>
      <div className="space-y-2">
        {protocol.phases.map((phase, idx) => (
          <PhaseCard
            key={idx}
            phase={phase}
            lang={lang}
            copy={copy}
            onPick={() => onPick(idx)}
          />
        ))}
      </div>
    </div>
  );
}

function PhaseCard({
  phase,
  lang,
  copy,
  onPick,
}: {
  phase: IsoPhase;
  lang: Lang;
  copy: typeof COPY.IS | typeof COPY.EN;
  onPick: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="font-semibold text-sm">{phase.name}</div>
          {phase.timeline && (
            <div className="text-xs text-gray-500 mt-0.5">{phase.timeline}</div>
          )}
          <div className="text-xs text-gray-600 mt-1">
            <span className="font-medium">{copy.frequency}:</span> {phase.frequency}
          </div>
        </div>
        <button
          onClick={onPick}
          className="px-3 py-1.5 bg-black text-white rounded-lg text-xs font-medium hover:bg-gray-800"
        >
          {copy.pickThis}
        </button>
      </div>
      <div className="mt-2 space-y-1">
        {phase.exercises.map((ex, i) => (
          <div key={i} className="text-xs text-gray-700 flex flex-wrap gap-x-2">
            <span className="font-medium">• {ex.name}</span>
            <span className="text-gray-500">
              {ex.sets} × {formatRange(ex.holdSeconds, "s")}
              {ex.mvcPercent !== undefined
                ? ` @ ${formatRange(ex.mvcPercent, "% MVC")}`
                : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  ISO_PROTOCOLS,
  ISO_CATEGORY_LABELS,
  ISO_INTENSITY_LABELS,
  formatRange,
  type IsoCategory,
  type IsoProtocol,
  type IsoExercise,
  type IsoPhase,
} from "@/lib/micropulse/isometrics/protocols";

type Lang = "IS" | "EN";

interface Props {
  lang: Lang;
}

const COPY = {
  IS: {
    title: "Ísómetrísk prótocol",
    subtitle:
      "Evidence-based ísómetrísk þjálfunarprótocol fyrir endurhæfingu, forvarnir og frammistöðu.",
    searchPlaceholder: "Leita að prótokolli…",
    all: "Öll",
    intensity: "Ákefð",
    audience: "Markhópur",
    rationale: "Rökstuðningur",
    phases: "Fasar",
    timeline: "Tímabil",
    frequency: "Tíðni",
    progression: "Framvinda",
    exercises: "Æfingar",
    sets: "Set",
    hold: "Hold",
    reps: "Rep",
    mvc: "%MVC",
    rest: "Hvíld",
    angle: "Horn",
    target: "Markmið",
    cautions: "Varúð",
    references: "Heimildir",
    back: "Til baka",
    seconds: "s",
    copyExercises: "Afrita æfingar í klemmuspjald",
    copied: "Afritað!",
    noResults: "Engin prótocol fundust.",
    setup: "Uppsetning",
  },
  EN: {
    title: "Isometric Protocols",
    subtitle:
      "Evidence-based isometric training protocols for rehab, prevention and performance.",
    searchPlaceholder: "Search protocols…",
    all: "All",
    intensity: "Intensity",
    audience: "Audience",
    rationale: "Rationale",
    phases: "Phases",
    timeline: "Timeline",
    frequency: "Frequency",
    progression: "Progression",
    exercises: "Exercises",
    sets: "Sets",
    hold: "Hold",
    reps: "Reps",
    mvc: "%MVC",
    rest: "Rest",
    angle: "Angle",
    target: "Target",
    cautions: "Cautions",
    references: "References",
    back: "Back",
    seconds: "s",
    copyExercises: "Copy exercises to clipboard",
    copied: "Copied!",
    noResults: "No protocols found.",
    setup: "Setup",
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

export default function IsometricProtocolLibrary({ lang }: Props) {
  const t = COPY[lang];
  const [selected, setSelected] = useState<IsoProtocol | null>(null);
  const [category, setCategory] = useState<IsoCategory | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ISO_PROTOCOLS.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (!q) return true;
      const hay = [
        p.titleIS,
        p.titleEN,
        p.goalIS,
        p.goalEN,
        p.audienceIS,
        p.audienceEN,
        ...p.phases.flatMap((ph) => ph.exercises.map((e) => e.name)),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [category, search]);

  if (selected) {
    return (
      <ProtocolDetail
        protocol={selected}
        lang={lang}
        copy={t}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{t.title}</h2>
        <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
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
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-500">
          {t.noResults}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-400 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-sm leading-tight">
                  {lang === "IS" ? p.titleIS : p.titleEN}
                </h3>
                <span
                  className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${ISO_INTENSITY_LABELS[p.intensity].color}`}
                >
                  {ISO_INTENSITY_LABELS[p.intensity][lang]}
                </span>
              </div>
              <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-2">
                {ISO_CATEGORY_LABELS[p.category][lang]}
              </div>
              <p className="text-xs text-gray-600 leading-snug line-clamp-3">
                {lang === "IS" ? p.goalIS : p.goalEN}
              </p>
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                <span>
                  {p.phases.length} {lang === "IS" ? "fasi" : "phase"}
                  {p.phases.length > 1 ? (lang === "IS" ? "r" : "s") : ""}
                </span>
                <span>
                  {p.phases.reduce(
                    (sum, ph) => sum + ph.exercises.length,
                    0
                  )}{" "}
                  {lang === "IS" ? "æfingar" : "exercises"}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Detail view ──────────────────────────────────────────────────────────

interface DetailProps {
  protocol: IsoProtocol;
  lang: Lang;
  copy: typeof COPY.IS | typeof COPY.EN;
  onBack: () => void;
}

function ProtocolDetail({ protocol, lang, copy, onBack }: DetailProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const lines: string[] = [];
    lines.push(lang === "IS" ? protocol.titleIS : protocol.titleEN);
    lines.push("");
    protocol.phases.forEach((phase) => {
      lines.push(`## ${phase.name}${phase.timeline ? ` (${phase.timeline})` : ""}`);
      lines.push(`${copy.frequency}: ${phase.frequency}`);
      lines.push("");
      phase.exercises.forEach((ex, i) => {
        lines.push(`${i + 1}. ${ex.name}`);
        const parts: string[] = [`${ex.sets} × ${formatRange(ex.holdSeconds, copy.seconds)}`];
        if (ex.mvcPercent !== undefined)
          parts.push(formatRange(ex.mvcPercent, "% MVC"));
        if (ex.restSeconds !== undefined)
          parts.push(`${copy.rest} ${formatRange(ex.restSeconds, copy.seconds)}`);
        lines.push(`   ${parts.join(" • ")}`);
        if (ex.jointAngle) lines.push(`   ${copy.angle}: ${ex.jointAngle}`);
        if (ex.setup) lines.push(`   ${copy.setup}: ${ex.setup}`);
      });
      lines.push("");
    });
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div>
      <button
        onClick={onBack}
        className="text-sm text-gray-500 hover:text-gray-900 mb-4 inline-flex items-center gap-1"
      >
        ← {copy.back}
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h2 className="text-2xl font-bold tracking-tight">
            {lang === "IS" ? protocol.titleIS : protocol.titleEN}
          </h2>
          <span
            className={`shrink-0 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${ISO_INTENSITY_LABELS[protocol.intensity].color}`}
          >
            {ISO_INTENSITY_LABELS[protocol.intensity][lang]}
          </span>
        </div>
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
          {ISO_CATEGORY_LABELS[protocol.category][lang]}
        </div>
        <p className="text-sm text-gray-700">
          {lang === "IS" ? protocol.goalIS : protocol.goalEN}
        </p>
      </div>

      {/* Audience + Rationale */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            {copy.audience}
          </div>
          <p className="text-sm text-gray-800">
            {lang === "IS" ? protocol.audienceIS : protocol.audienceEN}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            {copy.rationale}
          </div>
          <p className="text-sm text-gray-800">
            {lang === "IS" ? protocol.rationaleIS : protocol.rationaleEN}
          </p>
        </div>
      </div>

      {/* Copy button */}
      <div className="mb-6">
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          {copied ? copy.copied : copy.copyExercises}
        </button>
      </div>

      {/* Phases */}
      <div className="space-y-5">
        {protocol.phases.map((phase, idx) => (
          <PhaseBlock key={idx} phase={phase} lang={lang} copy={copy} />
        ))}
      </div>

      {/* Cautions */}
      {(protocol.cautionsIS || protocol.cautionsEN) && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 mb-1.5">
            {copy.cautions}
          </div>
          <p className="text-sm text-amber-900">
            {lang === "IS" ? protocol.cautionsIS : protocol.cautionsEN}
          </p>
        </div>
      )}

      {/* References */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
          {copy.references}
        </div>
        <ul className="text-xs text-gray-600 space-y-1">
          {protocol.references.map((ref, i) => (
            <li key={i}>• {ref}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PhaseBlock({
  phase,
  lang,
  copy,
}: {
  phase: IsoPhase;
  lang: Lang;
  copy: typeof COPY.IS | typeof COPY.EN;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-sm">{phase.name}</h3>
            {phase.timeline && (
              <div className="text-xs text-gray-500 mt-0.5">{phase.timeline}</div>
            )}
          </div>
          <div className="text-xs text-gray-600">
            <span className="font-medium">{copy.frequency}:</span> {phase.frequency}
          </div>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {phase.exercises.map((ex, i) => (
          <ExerciseRow key={i} ex={ex} lang={lang} copy={copy} />
        ))}
      </div>
      {phase.progression && (
        <div className="px-4 py-2.5 bg-blue-50 border-t border-blue-100">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
            {copy.progression}:
          </span>{" "}
          <span className="text-xs text-blue-900">{phase.progression}</span>
        </div>
      )}
    </div>
  );
}

function ExerciseRow({
  ex,
  lang,
  copy,
}: {
  ex: IsoExercise;
  lang: Lang;
  copy: typeof COPY.IS | typeof COPY.EN;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
      <div className="font-medium text-sm text-gray-900 mb-1.5">{ex.name}</div>
      {ex.setup && (
        <div className="text-xs text-gray-600 mb-2 italic">
          <span className="font-medium not-italic">{copy.setup}:</span> {ex.setup}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Stat label={copy.sets} value={String(ex.sets)} />
        <Stat label={copy.hold} value={formatRange(ex.holdSeconds, copy.seconds)} />
        {ex.reps !== undefined && ex.reps !== 1 && (
          <Stat label={copy.reps} value={String(ex.reps)} />
        )}
        {ex.mvcPercent !== undefined && (
          <Stat label={copy.mvc} value={formatRange(ex.mvcPercent, "%")} />
        )}
        {ex.restSeconds !== undefined && (
          <Stat label={copy.rest} value={formatRange(ex.restSeconds, copy.seconds)} />
        )}
        {ex.jointAngle && <Stat label={copy.angle} value={ex.jointAngle} />}
        {ex.target && <Stat label={copy.target} value={ex.target} />}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-gray-500">{label}:</span>{" "}
      <span className="font-medium text-gray-900">{value}</span>
    </span>
  );
}

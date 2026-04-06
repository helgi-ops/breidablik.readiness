"use client";

import * as React from "react";

// ── Muscle group definitions ────────────────────────────────────────────────

export type MuscleGroupId =
  | "hamstrings"
  | "quadriceps"
  | "adductors"
  | "hip_flexors"
  | "calves"
  | "glutes"
  | "lower_back"
  | "upper_back"
  | "shoulders"
  | "neck";

export interface MuscleGroupDef {
  id: MuscleGroupId;
  labelIS: string;
  labelEN: string;
  emoji: string;
  cx: number;
  cy: number;
}

export const MUSCLE_GROUPS: MuscleGroupDef[] = [
  { id: "hamstrings", labelIS: "Hamstrings", labelEN: "Hamstrings", emoji: "🦵", cx: 100, cy: 310 },
  { id: "quadriceps", labelIS: "Lærismögl.", labelEN: "Quadriceps", emoji: "🦿", cx: 100, cy: 260 },
  { id: "adductors", labelIS: "Nærfærsluvöðv.", labelEN: "Adductors", emoji: "🔻", cx: 100, cy: 280 },
  { id: "hip_flexors", labelIS: "Mjaðmabeygj.", labelEN: "Hip flexors", emoji: "🏃", cx: 100, cy: 230 },
  { id: "calves", labelIS: "Kálfar", labelEN: "Calves", emoji: "🦶", cx: 100, cy: 370 },
  { id: "glutes", labelIS: "Rassv.", labelEN: "Glutes", emoji: "🍑", cx: 100, cy: 210 },
  { id: "lower_back", labelIS: "Mjóbak", labelEN: "Lower back", emoji: "⬇", cx: 100, cy: 180 },
  { id: "upper_back", labelIS: "Efri bak", labelEN: "Upper back", emoji: "⬆", cx: 100, cy: 130 },
  { id: "shoulders", labelIS: "Herðar", labelEN: "Shoulders", emoji: "💪", cx: 100, cy: 100 },
  { id: "neck", labelIS: "Háls", labelEN: "Neck", emoji: "🔘", cx: 100, cy: 75 },
];

// ── Recommendation mapping ─────────────────────────────────────────────────

export interface SorenessRecommendation {
  exerciseIS: string;
  exerciseEN: string;
  descIS: string;
  descEN: string;
  videoUrl?: string;
}

export const SORENESS_RECOMMENDATIONS: Record<MuscleGroupId, SorenessRecommendation> = {
  hip_flexors: {
    exerciseIS: "Hip Flexor MET",
    exerciseEN: "Hip Flexor MET",
    descIS: "Losa um mjaðmabeygjur með MET — 3×5 sek á hvora hlið",
    descEN: "Release hip flexors with MET — 3×5 sec per side",
    videoUrl: "https://vimeo.com/706049903/8ec966ac36",
  },
  hamstrings: {
    exerciseIS: "Hamstring MET",
    exerciseEN: "Hamstring MET",
    descIS: "Auka teygjuþol í hamstrings — 3×5 sek á hvora hlið",
    descEN: "Increase hamstring stretch tolerance — 3×5 sec per side",
  },
  adductors: {
    exerciseIS: "Adductor MET",
    exerciseEN: "Adductor MET",
    descIS: "Losa um nærfærsluvöðva — 3×5 sek á hvora hlið",
    descEN: "Release adductors — 3×5 sec per side",
  },
  quadriceps: {
    exerciseIS: "Quad teygjuæfing",
    exerciseEN: "Quad stretch",
    descIS: "Teygja á lærismöglum — 30 sek á hvora hlið, 2 umferðir",
    descEN: "Quad stretch — 30 sec per side, 2 rounds",
  },
  calves: {
    exerciseIS: "Calf teygjuæfing",
    exerciseEN: "Calf stretch",
    descIS: "Teygja á kálfum — gastrocnemius + soleus, 30 sek á hvora hlið",
    descEN: "Calf stretch — gastrocnemius + soleus, 30 sec per side",
  },
  glutes: {
    exerciseIS: "Piriformis MET",
    exerciseEN: "Piriformis MET",
    descIS: "Losa um rassv. og piriformis með MET — 3×5 sek á hvora hlið",
    descEN: "Release glutes and piriformis with MET — 3×5 sec per side",
  },
  lower_back: {
    exerciseIS: "QL MET",
    exerciseEN: "QL MET",
    descIS: "Losa um quadratus lumborum — 3×5 sek á hvora hlið",
    descEN: "Release quadratus lumborum — 3×5 sec per side",
  },
  upper_back: {
    exerciseIS: "Thoracic rotation",
    exerciseEN: "Thoracic rotation",
    descIS: "Thoracic snúningar — 10 á hvora hlið",
    descEN: "Thoracic rotations — 10 per side",
  },
  shoulders: {
    exerciseIS: "Shoulder CARs",
    exerciseEN: "Shoulder CARs",
    descIS: "Controlled Articular Rotations — 5 hringi á hvora hlið",
    descEN: "Controlled Articular Rotations — 5 circles per side",
  },
  neck: {
    exerciseIS: "Neck mobility",
    exerciseEN: "Neck mobility",
    descIS: "Mjúk hálshreyfing — beygja, snúa, hliðarhallar",
    descEN: "Gentle neck mobility — flexion, rotation, lateral flexion",
  },
};

// ── Interactive anatomical body map ───────────────────────────────────────────

/**
 * Clickable zone definition — an SVG path region mapped to a muscle group.
 * The SVG viewBox is 200×440. The body outline is drawn separately;
 * these paths are overlaid as transparent tap targets that fill on selection.
 */
interface BodyZone {
  id: MuscleGroupId;
  label: string;
  /** SVG path d attribute — clickable region */
  d: string;
  /** Label anchor position */
  lx: number;
  ly: number;
}

const BODY_ZONES: BodyZone[] = [
  // ─── Head & Neck ───
  {
    id: "neck",
    label: "Háls",
    d: "M91,62 L109,62 L112,78 L88,78 Z",
    lx: 100, ly: 71,
  },
  // ─── Shoulders (both sides) ───
  {
    id: "shoulders",
    label: "Herðar",
    d: "M62,82 L88,78 L88,100 L68,105 L58,95 Z M112,78 L138,82 L142,95 L132,105 L112,100 Z",
    lx: 100, ly: 90,
  },
  // ─── Upper back (between shoulder blades) ───
  {
    id: "upper_back",
    label: "Efri bak",
    d: "M88,100 L112,100 L112,135 L88,135 Z",
    lx: 100, ly: 118,
  },
  // ─── Lower back ───
  {
    id: "lower_back",
    label: "Mjóbak",
    d: "M88,135 L112,135 L114,175 L86,175 Z",
    lx: 100, ly: 155,
  },
  // ─── Hip flexors (front of hip, both sides) ───
  {
    id: "hip_flexors",
    label: "Mjaðmabeygj.",
    d: "M78,175 L86,175 L86,200 L76,205 Z M114,175 L122,175 L124,205 L114,200 Z",
    lx: 100, ly: 190,
  },
  // ─── Glutes (back of hip, both sides) ───
  {
    id: "glutes",
    label: "Rassv.",
    d: "M76,175 L86,175 L86,210 L72,210 Z M114,175 L124,175 L128,210 L114,210 Z",
    lx: 100, ly: 193,
  },
  // ─── Quadriceps (front thigh) ───
  {
    id: "quadriceps",
    label: "Lærismögl.",
    d: "M76,210 L92,210 L90,280 L78,280 Z M108,210 L124,210 L122,280 L110,280 Z",
    lx: 100, ly: 245,
  },
  // ─── Hamstrings (back thigh) — overlapping with quads for dual-tap ───
  {
    id: "hamstrings",
    label: "Hamstrings",
    d: "M76,210 L92,210 L90,280 L78,280 Z M108,210 L124,210 L122,280 L110,280 Z",
    lx: 100, ly: 245,
  },
  // ─── Adductors (inner thigh) ───
  {
    id: "adductors",
    label: "Nærfærsluvöðv.",
    d: "M88,210 L100,210 L100,265 L90,265 Z M100,210 L112,210 L110,265 L100,265 Z",
    lx: 100, ly: 238,
  },
  // ─── Calves (lower leg) ───
  {
    id: "calves",
    label: "Kálfar",
    d: "M78,285 L90,285 L88,360 L80,360 Z M110,285 L122,285 L120,360 L112,360 Z",
    lx: 100, ly: 323,
  },
];

// The actual body outline — just a visual reference, not clickable
function BodyOutlineSVG() {
  return (
    <>
      {/* Head */}
      <ellipse cx="100" cy="42" rx="18" ry="22"
        fill="#f0f0f0" stroke="#d4d4d8" strokeWidth="1.2" />
      {/* Neck */}
      <path d="M93,62 L107,62 L109,78 L91,78 Z"
        fill="#f0f0f0" stroke="#d4d4d8" strokeWidth="1" />
      {/* Torso */}
      <path d="M62,82 L88,78 L91,78 L100,76 L109,78 L112,78 L138,82
              L142,95 L136,120 L132,155 L128,175 L124,205 L124,210
              L112,210 L108,210 L100,210 L92,210 L88,210
              L76,210 L76,205 L72,175 L68,155 L64,120 L58,95 Z"
        fill="#f0f0f0" stroke="#d4d4d8" strokeWidth="1.2" />
      {/* Left arm */}
      <path d="M58,95 L52,130 L48,170 L44,200 L38,220
              L42,222 L48,205 L54,175 L58,140 L62,110"
        fill="none" stroke="#d4d4d8" strokeWidth="1.2" />
      <path d="M62,82 L58,95 L62,110 L64,120"
        fill="none" stroke="#d4d4d8" strokeWidth="1.2" />
      {/* Right arm */}
      <path d="M142,95 L148,130 L152,170 L156,200 L162,220
              L158,222 L152,205 L146,175 L142,140 L138,110"
        fill="none" stroke="#d4d4d8" strokeWidth="1.2" />
      <path d="M138,82 L142,95 L138,110 L136,120"
        fill="none" stroke="#d4d4d8" strokeWidth="1.2" />
      {/* Left leg */}
      <path d="M76,210 L74,250 L76,285 L78,320 L80,360 L82,390 L78,410
              L84,412 L90,395 L88,360 L86,320 L88,285 L90,260 L92,210"
        fill="#f0f0f0" stroke="#d4d4d8" strokeWidth="1.2" />
      {/* Right leg */}
      <path d="M108,210 L106,250 L110,285 L112,320 L112,360 L116,390 L122,410
              L116,412 L110,395 L112,360 L114,320 L122,285 L120,260 L118,210"
        fill="#f0f0f0" stroke="#d4d4d8" strokeWidth="1.2" />
      {/* Inner leg divide */}
      <line x1="100" y1="210" x2="100" y2="215"
        stroke="#d4d4d8" strokeWidth="0.8" />
    </>
  );
}

// ── Main selector component ─────────────────────────────────────────────────

export default function MuscleGroupSelector({
  selected,
  onToggle,
}: {
  selected: Set<MuscleGroupId>;
  onToggle: (id: MuscleGroupId) => void;
}) {
  const [activeTouch, setActiveTouch] = React.useState<MuscleGroupId | null>(null);

  // We show FRONT and BACK as two separate views with a tab toggle
  const [view, setView] = React.useState<"front" | "back">("front");

  // Define which zones are on front vs back
  const FRONT_ZONES: MuscleGroupId[] = [
    "neck", "shoulders", "hip_flexors", "quadriceps", "adductors", "calves",
  ];
  const BACK_ZONES: MuscleGroupId[] = [
    "neck", "shoulders", "upper_back", "lower_back", "glutes", "hamstrings", "calves",
  ];

  const visibleZoneIds = view === "front" ? FRONT_ZONES : BACK_ZONES;

  // Front-view specific zone paths
  const FRONT_ZONE_PATHS: Record<string, BodyZone> = {
    neck: {
      id: "neck", label: "Háls",
      d: "M91,60 Q91,70 88,78 L112,78 Q109,70 109,60 Z",
      lx: 100, ly: 70,
    },
    shoulders: {
      id: "shoulders", label: "Herðar",
      d: "M60,84 L88,78 L88,105 L66,108 L56,96 Z M112,78 L140,84 L144,96 L134,108 L112,105 Z",
      lx: 100, ly: 93,
    },
    hip_flexors: {
      id: "hip_flexors", label: "Mjaðmabeygj.",
      d: "M80,172 L92,172 L92,212 L78,212 Z M108,172 L120,172 L122,212 L108,212 Z",
      lx: 100, ly: 192,
    },
    quadriceps: {
      id: "quadriceps", label: "Lærismögl.",
      d: "M78,215 L92,215 L90,282 L80,282 Z M108,215 L122,215 L120,282 L110,282 Z",
      lx: 100, ly: 248,
    },
    adductors: {
      id: "adductors", label: "Nærfærsluvöðv.",
      d: "M90,212 L100,208 L110,212 L110,260 L100,270 L90,260 Z",
      lx: 100, ly: 240,
    },
    calves: {
      id: "calves", label: "Kálfar",
      d: "M80,288 L90,288 L88,365 L82,365 Z M110,288 L120,288 L118,365 L112,365 Z",
      lx: 100, ly: 326,
    },
  };

  // Back-view specific zone paths
  const BACK_ZONE_PATHS: Record<string, BodyZone> = {
    neck: {
      id: "neck", label: "Háls",
      d: "M91,60 Q91,70 88,78 L112,78 Q109,70 109,60 Z",
      lx: 100, ly: 70,
    },
    shoulders: {
      id: "shoulders", label: "Herðar",
      d: "M60,84 L88,78 L88,105 L66,108 L56,96 Z M112,78 L140,84 L144,96 L134,108 L112,105 Z",
      lx: 100, ly: 93,
    },
    upper_back: {
      id: "upper_back", label: "Efri bak",
      d: "M86,105 L114,105 L116,142 L84,142 Z",
      lx: 100, ly: 124,
    },
    lower_back: {
      id: "lower_back", label: "Mjóbak",
      d: "M84,144 L116,144 L118,178 L82,178 Z",
      lx: 100, ly: 161,
    },
    glutes: {
      id: "glutes", label: "Rassv.",
      d: "M78,180 L100,178 L122,180 L124,214 L108,216 L100,218 L92,216 L76,214 Z",
      lx: 100, ly: 198,
    },
    hamstrings: {
      id: "hamstrings", label: "Hamstrings",
      d: "M78,218 L92,218 L90,282 L80,282 Z M108,218 L122,218 L120,282 L110,282 Z",
      lx: 100, ly: 250,
    },
    calves: {
      id: "calves", label: "Kálfar",
      d: "M80,288 L90,288 L88,365 L82,365 Z M110,288 L120,288 L118,365 L112,365 Z",
      lx: 100, ly: 326,
    },
  };

  const zonePaths = view === "front" ? FRONT_ZONE_PATHS : BACK_ZONE_PATHS;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Front / Back toggle */}
      <div className="flex rounded-full bg-zinc-100 p-0.5 gap-0.5">
        <button
          type="button"
          onClick={() => setView("front")}
          className={[
            "px-5 py-1.5 rounded-full text-xs font-semibold transition-all",
            view === "front"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-700",
          ].join(" ")}
        >
          Framan
        </button>
        <button
          type="button"
          onClick={() => setView("back")}
          className={[
            "px-5 py-1.5 rounded-full text-xs font-semibold transition-all",
            view === "back"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-700",
          ].join(" ")}
        >
          Aftan
        </button>
      </div>

      {/* SVG body map */}
      <div className="relative w-full" style={{ maxWidth: 260 }}>
        <svg
          viewBox="0 0 200 430"
          className="w-full h-auto"
          style={{ touchAction: "manipulation" }}
        >
          {/* Background body silhouette */}
          <BodySilhouette view={view} />

          {/* Clickable muscle zones */}
          {visibleZoneIds.map((zoneId) => {
            const zone = zonePaths[zoneId];
            if (!zone) return null;
            const isActive = selected.has(zoneId);
            const isTouching = activeTouch === zoneId;

            return (
              <g key={zoneId + view}>
                {/* Hit zone */}
                <path
                  d={zone.d}
                  fill={isActive ? "rgba(239, 68, 68, 0.35)" : isTouching ? "rgba(161, 161, 170, 0.15)" : "transparent"}
                  stroke={isActive ? "rgba(239, 68, 68, 0.7)" : "transparent"}
                  strokeWidth={isActive ? 1.5 : 0}
                  style={{ cursor: "pointer", transition: "fill 0.15s, stroke 0.15s" }}
                  onClick={() => onToggle(zoneId)}
                  onPointerDown={() => setActiveTouch(zoneId)}
                  onPointerUp={() => setActiveTouch(null)}
                  onPointerLeave={() => setActiveTouch(null)}
                />
                {/* Label */}
                <text
                  x={zone.lx}
                  y={zone.ly}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="7"
                  fontWeight={isActive ? "700" : "500"}
                  fill={isActive ? "#dc2626" : "#71717a"}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {zone.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected areas chips */}
      {selected.size > 0 ? (
        <div className="flex flex-wrap justify-center gap-1.5 px-2">
          {Array.from(selected).map((id) => {
            const g = MUSCLE_GROUPS.find((m) => m.id === id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onToggle(id)}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors active:bg-red-100"
              >
                {g?.labelIS ?? id}
                <span className="ml-0.5 text-red-400">&times;</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-center text-xs text-zinc-400 px-4">
          Smelltu á svæði á líkamanum sem eru sár eða stíf
        </div>
      )}
    </div>
  );
}

// ── Clean body silhouette for front & back views ─────────────────────────────

function BodySilhouette({ view }: { view: "front" | "back" }) {
  // A clean, minimal human silhouette — same outline for front and back,
  // with subtle internal lines to indicate muscle group boundaries.
  return (
    <g>
      {/* ── Outer body shape ── */}
      {/* Head */}
      <ellipse cx="100" cy="40" rx="17" ry="21"
        fill="#f5f5f5" stroke="#d4d4d8" strokeWidth="1.2" />

      {/* Neck */}
      <rect x="93" y="59" width="14" height="19" rx="3"
        fill="#f5f5f5" stroke="#d4d4d8" strokeWidth="1" />

      {/* Torso */}
      <path
        d={`M88,78 L60,84 L56,96 L58,110 L62,130 L66,150 L70,170
            L74,180 L78,195 L78,214
            L122,214
            L122,195 L126,180 L130,170
            L134,150 L138,130 L142,110 L144,96 L140,84 L112,78 Z`}
        fill="#f5f5f5" stroke="#d4d4d8" strokeWidth="1.2"
      />

      {/* Left arm */}
      <path
        d={`M56,96 L50,120 L46,150 L42,180 L40,200 L36,218
            L40,220 L44,205 L48,180 L52,150 L56,120 L60,105`}
        fill="none" stroke="#d4d4d8" strokeWidth="1.2" strokeLinecap="round"
      />
      {/* Left hand */}
      <ellipse cx="37" cy="222" rx="5" ry="6" fill="#f5f5f5" stroke="#d4d4d8" strokeWidth="1" />

      {/* Right arm */}
      <path
        d={`M144,96 L150,120 L154,150 L158,180 L160,200 L164,218
            L160,220 L156,205 L152,180 L148,150 L144,120 L140,105`}
        fill="none" stroke="#d4d4d8" strokeWidth="1.2" strokeLinecap="round"
      />
      {/* Right hand */}
      <ellipse cx="163" cy="222" rx="5" ry="6" fill="#f5f5f5" stroke="#d4d4d8" strokeWidth="1" />

      {/* Left leg */}
      <path
        d={`M78,214 L76,240 L78,270 L80,288 L80,320 L82,350 L82,370
            L80,390 L78,405 L82,412 L88,408 L88,395 L88,370
            L88,350 L88,320 L90,288 L90,270 L92,240 L92,214`}
        fill="#f5f5f5" stroke="#d4d4d8" strokeWidth="1.2" strokeLinecap="round"
      />

      {/* Right leg */}
      <path
        d={`M108,214 L106,240 L110,270 L110,288 L110,320 L112,350 L112,370
            L114,390 L118,405 L118,412 L112,408 L112,395 L112,370
            L112,350 L112,320 L120,288 L118,270 L116,240 L108,214`}
        fill="#f5f5f5" stroke="#d4d4d8" strokeWidth="1.2" strokeLinecap="round"
      />

      {/* ── Internal muscle group guide lines ── */}
      {view === "front" ? (
        <>
          {/* Chest/shoulder divide */}
          <line x1="88" y1="105" x2="112" y2="105" stroke="#e4e4e7" strokeWidth="0.6" strokeDasharray="2,2" />
          {/* Hip crease */}
          <path d="M78,212 Q100,220 122,212" fill="none" stroke="#e4e4e7" strokeWidth="0.6" strokeDasharray="2,2" />
          {/* Knee line */}
          <line x1="78" y1="285" x2="92" y2="285" stroke="#e4e4e7" strokeWidth="0.6" strokeDasharray="2,2" />
          <line x1="108" y1="285" x2="122" y2="285" stroke="#e4e4e7" strokeWidth="0.6" strokeDasharray="2,2" />
          {/* Waist */}
          <path d="M70,172 Q100,168 130,172" fill="none" stroke="#e4e4e7" strokeWidth="0.6" strokeDasharray="2,2" />
        </>
      ) : (
        <>
          {/* Upper/lower back divide */}
          <line x1="84" y1="142" x2="116" y2="142" stroke="#e4e4e7" strokeWidth="0.6" strokeDasharray="2,2" />
          {/* Spine line */}
          <line x1="100" y1="78" x2="100" y2="178" stroke="#e4e4e7" strokeWidth="0.5" strokeDasharray="3,3" />
          {/* Glute crease */}
          <path d="M78,214 Q100,220 122,214" fill="none" stroke="#e4e4e7" strokeWidth="0.6" strokeDasharray="2,2" />
          {/* Knee line */}
          <line x1="78" y1="285" x2="92" y2="285" stroke="#e4e4e7" strokeWidth="0.6" strokeDasharray="2,2" />
          <line x1="108" y1="285" x2="122" y2="285" stroke="#e4e4e7" strokeWidth="0.6" strokeDasharray="2,2" />
          {/* Waist/lower back line */}
          <path d="M70,178 Q100,174 130,178" fill="none" stroke="#e4e4e7" strokeWidth="0.6" strokeDasharray="2,2" />
        </>
      )}

      {/* View indicator */}
      <text x="100" y="425" textAnchor="middle" fontSize="8" fill="#a1a1aa" fontWeight="500" style={{ userSelect: "none" }}>
        {view === "front" ? "FRAMAN" : "AFTAN"}
      </text>
    </g>
  );
}

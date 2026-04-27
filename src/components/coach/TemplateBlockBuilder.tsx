"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TemplateBlockBuilder
// ─────────────────────────────────────────────────────────────────────────────
//
// Visual builder for workout_templates.structure JSONB. Coaches and
// physios should never have to write JSON — they want to add a "warm-up"
// block, drop in some exercises with sets/reps/tempo, and save.
//
// This component is fully controlled (value/onChange) so the parent
// page can toggle between visual-builder mode and raw-JSON mode without
// losing state.
//
// Output shape matches the existing workout_templates structure used
// by every consumer (PlayerClient daily template view, AssignRehabModal,
// etc.):
//   {
//     duration_min: number,
//     category: string,
//     blocks: [
//       {
//         type: string,
//         title: string,
//         exercises: [{ name, sets, reps, tempo?, note? }],
//         protocol?: { ... }   // single-exercise high-volume block
//       }
//     ],
//     reference_document?: {
//       filename: string, content_type: string, data_base64: string,
//       size_bytes: number, uploaded_at: string
//     }
//   }
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type TemplateExercise = {
  name: string;
  sets?: number | string;
  reps?: number | string;
  tempo?: string;
  note?: string;
};

export type TemplateBlock = {
  type: string;
  title: string;
  exercises?: TemplateExercise[];
  protocol?: {
    sets?: number;
    exercise?: string;
    hold_seconds?: number;
    rest_seconds?: number;
    intensity_note?: string;
  };
};

export type TemplateStructure = {
  duration_min?: number;
  category?: string;
  blocks?: TemplateBlock[];
  reference_document?: {
    filename: string;
    content_type: string;
    data_base64: string;
    size_bytes: number;
    uploaded_at: string;
  } | null;
  // Allow any other top-level fields the existing templates carry
  // (icd_target, evidence_base, stage, rtp_criteria, etc.) — we
  // pass them through unchanged.
  [extra: string]: unknown;
};

const BLOCK_TYPE_OPTIONS = [
  { value: "warm_up", label: "Warm-up / upphitun" },
  { value: "mobility", label: "Mobility / hreyfanleiki" },
  { value: "activation", label: "Activation / virkjun" },
  { value: "strength", label: "Strength / styrktarþjálfun" },
  { value: "isometric", label: "Isometric / isometrísk" },
  { value: "power", label: "Power / kraftur" },
  { value: "plyometric", label: "Plyometric / plýometric" },
  { value: "proprioception", label: "Proprioception / jafnvægi" },
  { value: "balance", label: "Balance / jafnvægi" },
  { value: "running", label: "Running / hlaup" },
  { value: "agility", label: "Agility / lipurð" },
  { value: "sport_specific", label: "Sport-specific / sport-sérhæft" },
  { value: "cool_down", label: "Cool-down / niðurkæling" },
  { value: "manual_therapy", label: "Manual therapy / handvirk meðferð" },
  { value: "support", label: "Support / stuðningur (brace etc.)" },
  { value: "medication", label: "Medication / lyf" },
  { value: "other", label: "Other / annað" },
];

const CATEGORY_OPTIONS = [
  "rehab", "prehab", "recovery", "activation", "strength", "power", "matchday", "microdose", "uncategorized",
];

// 5MB limit — keeps reference docs small. Larger files would need
// Supabase Storage bucket which is V2 work.
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
]);

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:...;base64," prefix
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export type TemplateBlockBuilderProps = {
  value: TemplateStructure;
  onChange: (next: TemplateStructure) => void;
};

export default function TemplateBlockBuilder({ value, onChange }: TemplateBlockBuilderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string>("");

  const blocks: TemplateBlock[] = Array.isArray(value.blocks) ? value.blocks : [];

  function update(patch: Partial<TemplateStructure>) {
    onChange({ ...value, ...patch });
  }

  function updateBlocks(next: TemplateBlock[]) {
    update({ blocks: next });
  }

  function addBlock() {
    updateBlocks([
      ...blocks,
      { type: "strength", title: "", exercises: [{ name: "", sets: 3, reps: 10 }] },
    ]);
  }

  function removeBlock(idx: number) {
    updateBlocks(blocks.filter((_, i) => i !== idx));
  }

  function moveBlock(idx: number, dir: -1 | 1) {
    const next = [...blocks];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    updateBlocks(next);
  }

  function patchBlock(idx: number, patch: Partial<TemplateBlock>) {
    updateBlocks(blocks.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  }

  function addExercise(blockIdx: number) {
    const b = blocks[blockIdx];
    const ex = b.exercises ?? [];
    patchBlock(blockIdx, { exercises: [...ex, { name: "", sets: 3, reps: 10 }] });
  }

  function removeExercise(blockIdx: number, exIdx: number) {
    const b = blocks[blockIdx];
    const ex = b.exercises ?? [];
    patchBlock(blockIdx, { exercises: ex.filter((_, i) => i !== exIdx) });
  }

  function patchExercise(blockIdx: number, exIdx: number, patch: Partial<TemplateExercise>) {
    const b = blocks[blockIdx];
    const ex = b.exercises ?? [];
    patchBlock(blockIdx, { exercises: ex.map((e, i) => (i === exIdx ? { ...e, ...patch } : e)) });
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type)) {
      setUploadError(`Skráartegund ekki leyfileg (${file.type}). Leyfilegar: PDF, Word, Excel, PNG, JPEG.`);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setUploadError(`Skrá of stór (${fmtBytes(file.size)}). Hámark ${fmtBytes(MAX_FILE_BYTES)}.`);
      return;
    }
    try {
      const data_base64 = await fileToBase64(file);
      update({
        reference_document: {
          filename: file.name,
          content_type: file.type,
          data_base64,
          size_bytes: file.size,
          uploaded_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error(err);
      setUploadError("Tókst ekki að lesa skrá.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeReferenceDoc() {
    update({ reference_document: null });
  }

  return (
    <div className="space-y-4">
      {/* Top-level fields */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label className="text-xs">Lengd (mín)</Label>
          <Input
            type="number"
            value={value.duration_min ?? ""}
            onChange={(e) => update({ duration_min: e.target.value === "" ? undefined : Number(e.target.value) })}
            placeholder="25"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Flokkur</Label>
          <select
            value={String(value.category ?? "")}
            onChange={(e) => update({ category: e.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">— veldu —</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button type="button" onClick={addBlock} variant="outline" className="w-full">
            + Bæta við blokk
          </Button>
        </div>
      </div>

      {/* Reference document upload */}
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label className="text-xs font-semibold">Tengt skjal (valkvætt)</Label>
            <p className="mt-0.5 text-[11px] text-slate-500">
              PDF, Word, Excel, eða mynd — geymd með templateinu og hægt að hlaða niður frá player view.
              Hámark 5 MB.
            </p>
          </div>
          {!value.reference_document && (
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              onChange={handleFileUpload}
              className="text-xs"
            />
          )}
        </div>
        {value.reference_document && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-base">📄</span>
              <span className="font-medium text-slate-800">{value.reference_document.filename}</span>
              <span className="text-slate-500">{fmtBytes(value.reference_document.size_bytes)}</span>
            </div>
            <button
              type="button"
              onClick={removeReferenceDoc}
              className="text-xs font-medium text-red-600 hover:text-red-800"
            >
              Fjarlægja
            </button>
          </div>
        )}
        {uploadError && (
          <div className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
            {uploadError}
          </div>
        )}
      </div>

      {/* Blocks */}
      {blocks.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
          Engar blokkir ennþá. Smelltu &quot;+ Bæta við blokk&quot; til að byrja.
        </div>
      )}

      {blocks.map((block, blockIdx) => (
        <div key={`block-${blockIdx}`} className="rounded-lg border border-slate-200 bg-white p-3">
          {/* Block header */}
          <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-end">
            <div>
              <Label className="text-xs">Tegund</Label>
              <select
                value={block.type}
                onChange={(e) => patchBlock(blockIdx, { type: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
              >
                {BLOCK_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Heiti blokk</Label>
              <Input
                value={block.title}
                onChange={(e) => patchBlock(blockIdx, { title: e.target.value })}
                placeholder="t.d. Warm-up + dynamic mobility"
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveBlock(blockIdx, -1)}
                disabled={blockIdx === 0}
                className="rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                aria-label="Move up"
              >▲</button>
              <button
                type="button"
                onClick={() => moveBlock(blockIdx, 1)}
                disabled={blockIdx === blocks.length - 1}
                className="rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                aria-label="Move down"
              >▼</button>
              <button
                type="button"
                onClick={() => removeBlock(blockIdx)}
                className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 hover:bg-red-100"
              >Eyða</button>
            </div>
          </div>

          {/* Exercises */}
          <div className="mt-3 space-y-2">
            {(block.exercises ?? []).map((ex, exIdx) => (
              <div key={`ex-${blockIdx}-${exIdx}`} className="grid gap-2 rounded border border-slate-100 bg-slate-50 p-2 sm:grid-cols-[2fr_60px_80px_80px_2fr_auto]">
                <Input
                  value={ex.name}
                  onChange={(e) => patchExercise(blockIdx, exIdx, { name: e.target.value })}
                  placeholder="Æfing — t.d. Bench Press"
                  className="text-sm"
                />
                <Input
                  value={String(ex.sets ?? "")}
                  onChange={(e) => patchExercise(blockIdx, exIdx, { sets: e.target.value })}
                  placeholder="Sett"
                  className="text-sm"
                />
                <Input
                  value={String(ex.reps ?? "")}
                  onChange={(e) => patchExercise(blockIdx, exIdx, { reps: e.target.value })}
                  placeholder="Reps"
                  className="text-sm"
                />
                <Input
                  value={ex.tempo ?? ""}
                  onChange={(e) => patchExercise(blockIdx, exIdx, { tempo: e.target.value })}
                  placeholder="Tempo (2-1-2)"
                  className="text-sm"
                />
                <Input
                  value={ex.note ?? ""}
                  onChange={(e) => patchExercise(blockIdx, exIdx, { note: e.target.value })}
                  placeholder="Athugasemd / cue (valkvætt)"
                  className="text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeExercise(blockIdx, exIdx)}
                  className="rounded border border-red-200 bg-red-50 px-2 text-xs text-red-700 hover:bg-red-100"
                >✕</button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => addExercise(blockIdx)}
              className="w-full text-xs"
            >
              + Bæta við æfingu
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

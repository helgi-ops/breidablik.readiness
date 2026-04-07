"use client";

import { useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang, type Lang } from "@/lib/lang";
import {
  parseCatapultDrillPdfClient,
  type ParsedDrillClient,
} from "@/lib/catapult-pdf-parser-client";

type ApiResponse = {
  parsed: ParsedDrillClient[];
  errors: string[];
};

function n(v: number | null | undefined, digits = 1) {
  if (v == null || Number.isNaN(Number(v))) return "–";
  return Number(v).toFixed(digits);
}

async function getAuthToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

function determineDrillCategory(drillName: string): string {
  const name = drillName.toLowerCase();
  if (name.includes("possession") || name.includes("keep")) return "possession";
  if (name.includes("ssg") || name.includes("game")) return "ssg";
  if (name.includes("transition") || name.includes("quick")) return "transition";
  if (name.includes("running") || name.includes("sprint")) return "running";
  if (name.includes("finish") || name.includes("shoot")) return "finishing";
  if (name.includes("warm") || name.includes("upphitun")) return "warmup";
  if (name.includes("reitur")) return "possession";
  return "other";
}

const copy: Record<Lang, Record<string, string>> = {
  IS: {
    title: "Flytja inn PDF drillur",
    uploadZone: "Dragðu PDF hér eða smelltu til að velja",
    analyzing: "Greini PDF…",
    selectDrills: "Velja drillur",
    drillName: "Nafn",
    distance: "Fjarlægð (m)",
    playerLoad: "PL",
    velB5: "VB5",
    velB6: "VB6",
    accelTot: "Hröð sam",
    decelTot: "Hæg sam",
    accelAvg: "Hröð meðal",
    decelAvg: "Hæg meðal",
    maxVel: "Hámarks hraði",
    save: "Vista valdar drillur",
    saving: "Vista…",
    success: "drillur fluttu inn",
    parseErrors: "Villur",
    noFile: "Engin skrá valin",
    invalidFormat: "Einungis PDF skrár eru leyfðar",
    uploadFailed: "Villa við að flytja inn",
    selectAtLeast: "Veldu að minnsta kosti eina drillu",
    noDrillsFound: "Engar drillur fundust í PDF",
    cancel: "Hætta",
  },
  EN: {
    title: "Import PDF Drills",
    uploadZone: "Drag PDF here or click to select",
    analyzing: "Analyzing PDF…",
    selectDrills: "Select drills",
    drillName: "Name",
    distance: "Distance (m)",
    playerLoad: "PL",
    velB5: "VB5",
    velB6: "VB6",
    accelTot: "Acc Tot",
    decelTot: "Dec Tot",
    accelAvg: "Acc Avg",
    decelAvg: "Dec Avg",
    maxVel: "Max Vel",
    save: "Save selected drills",
    saving: "Saving…",
    success: "drills imported",
    parseErrors: "Errors",
    noFile: "No file selected",
    invalidFormat: "Only PDF files are allowed",
    uploadFailed: "Error importing",
    selectAtLeast: "Please select at least one drill",
    noDrillsFound: "No drills found in PDF",
    cancel: "Cancel",
  },
};

export default function DrillPdfImporter({
  teamId,
  onImported,
}: {
  teamId: string;
  onImported: () => void;
}) {
  const [lang] = useLang();
  const t = copy[lang];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [parsedResult, setParsedResult] = useState<ApiResponse | null>(null);
  const [selectedDrills, setSelectedDrills] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);

  function handleFileSelect(newFile: File | null) {
    if (!newFile) {
      setError(t.noFile);
      return;
    }
    if (newFile.type !== "application/pdf") {
      setError(t.invalidFormat);
      return;
    }
    setFile(newFile);
    setError(null);
    setParsedResult(null);
    parsePdf(newFile);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.add("bg-blue-50", "border-blue-300");
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.remove("bg-blue-50", "border-blue-300");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.remove("bg-blue-50", "border-blue-300");
    }
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }

  /** Parse the PDF client-side using pdf.js */
  async function parsePdf(pdfFile: File) {
    setIsLoading(true);
    setError(null);
    try {
      const drills = await parseCatapultDrillPdfClient(pdfFile);

      if (drills.length === 0) {
        setError(t.noDrillsFound);
        setParsedResult(null);
        return;
      }

      setParsedResult({ parsed: drills, errors: [] });
      // Select all drills by default
      const initialSelected = new Set<number>();
      drills.forEach((_: unknown, idx: number) => initialSelected.add(idx));
      setSelectedDrills(initialSelected);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }

  /** Save selected drills to the database via API */
  async function handleSave() {
    if (selectedDrills.size === 0) {
      setError(t.selectAtLeast);
      return;
    }
    if (!parsedResult) return;

    setIsSaving(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Vantar auðkenningu");

      const selectedDrillsList = Array.from(selectedDrills)
        .sort()
        .map((idx) => parsedResult.parsed[idx])
        .filter((d) => d !== undefined);

      const res = await fetch("/api/coach/import-drills", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          team_id: teamId,
          drills: selectedDrillsList.map((d) => ({
            drill_name: d.drill_name,
            category: determineDrillCategory(d.drill_name),
            distance_m: d.distance_m,
            vel_b5: d.vel_b5,
            vel_b6: d.vel_b6,
            hir_total: d.hir_dist_m,
            player_load: d.player_load,
            accel_b23: d.accel_b23_total,
            decel_b23: d.decel_b23_total,
            accel_b23_avg: d.accel_b23_avg,
            decel_b23_avg: d.decel_b23_avg,
            accel_total: d.accel_total,
            decel_total: d.decel_total,
            max_velocity: d.max_velocity,
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || t.uploadFailed);

      setSuccessCount(selectedDrillsList.length);
      setParsedResult(null);
      setFile(null);
      setTimeout(() => {
        onImported();
        setSuccessCount(0);
      }, 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  }

  // Success state
  if (successCount > 0) {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 p-4">
        <p className="text-sm text-green-700">
          {successCount} {t.success}
        </p>
      </div>
    );
  }

  // Results state — show parsed drills for selection
  if (parsedResult) {
    return (
      <div className="space-y-4 rounded-lg border bg-white p-4">
        <h3 className="font-semibold text-gray-900">{t.selectDrills}</h3>

        {parsedResult.parsed.length > 0 && (
          <div className="space-y-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-2 py-1 text-left">
                      <input
                        type="checkbox"
                        checked={selectedDrills.size === parsedResult.parsed.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const all = new Set<number>();
                            parsedResult.parsed.forEach((_: unknown, idx: number) =>
                              all.add(idx)
                            );
                            setSelectedDrills(all);
                          } else {
                            setSelectedDrills(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="px-2 py-1 text-left font-medium text-gray-700">
                      {t.drillName}
                    </th>
                    <th className="px-2 py-1 text-left font-medium text-gray-700">
                      {t.distance}
                    </th>
                    <th className="px-2 py-1 text-left font-medium text-gray-700">
                      {t.playerLoad}
                    </th>
                    <th className="px-2 py-1 text-left font-medium text-gray-700">
                      {t.velB5}
                    </th>
                    <th className="px-2 py-1 text-left font-medium text-gray-700">
                      {t.velB6}
                    </th>
                    <th className="px-2 py-1 text-left font-medium text-gray-700">
                      {t.accelAvg}
                    </th>
                    <th className="px-2 py-1 text-left font-medium text-gray-700">
                      {t.decelAvg}
                    </th>
                    <th className="px-2 py-1 text-left font-medium text-gray-700">
                      {t.accelTot}
                    </th>
                    <th className="px-2 py-1 text-left font-medium text-gray-700">
                      {t.decelTot}
                    </th>
                    <th className="px-2 py-1 text-left font-medium text-gray-700">
                      {t.maxVel}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {parsedResult.parsed.map((drill, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          checked={selectedDrills.has(idx)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedDrills);
                            if (e.target.checked) {
                              newSelected.add(idx);
                            } else {
                              newSelected.delete(idx);
                            }
                            setSelectedDrills(newSelected);
                          }}
                        />
                      </td>
                      <td className="max-w-xs truncate px-2 py-1 font-medium">
                        {drill.drill_name}
                      </td>
                      <td className="px-2 py-1">{n(drill.distance_m, 0)}</td>
                      <td className="px-2 py-1">{n(drill.player_load, 0)}</td>
                      <td className="px-2 py-1">{n(drill.vel_b5, 0)}</td>
                      <td className="px-2 py-1">{n(drill.vel_b6, 0)}</td>
                      <td className="px-2 py-1">{n(drill.accel_b23_avg, 0)}</td>
                      <td className="px-2 py-1">{n(drill.decel_b23_avg, 0)}</td>
                      <td className="px-2 py-1">{n(drill.accel_total, 0)}</td>
                      <td className="px-2 py-1">{n(drill.decel_total, 0)}</td>
                      <td className="px-2 py-1">{n(drill.max_velocity, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {parsedResult.errors.length > 0 && (
          <div className="space-y-2 rounded border border-red-300 bg-red-50 p-2">
            <h4 className="text-sm font-medium text-red-900">{t.parseErrors}</h4>
            <div className="space-y-1">
              {parsedResult.errors.map((err, idx) => (
                <div key={idx} className="text-xs text-red-700">
                  {err}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving || selectedDrills.size === 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? t.saving : t.save}
          </button>
          <button
            onClick={() => {
              setParsedResult(null);
              setFile(null);
              setSelectedDrills(new Set());
            }}
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    );
  }

  // Upload state
  return (
    <div className="space-y-4 rounded-lg border bg-white p-4">
      <h3 className="font-semibold text-gray-900">{t.title}</h3>

      <div
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-6 text-center transition hover:border-blue-400 hover:bg-blue-50"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">{t.uploadZone}</p>
          {file && (
            <p className="text-xs text-gray-500">
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
            </p>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
          <p className="text-sm text-gray-600">{t.analyzing}</p>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

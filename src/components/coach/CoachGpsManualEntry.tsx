"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
interface Player {
  id: string;
  name: string;
}

interface GpsValues {
  totalDistance: number;
  playerLoad: number;
  vb5: number;
  vb6: number;
  accelerations: number;
  decelerations: number;
  accelB23: number;
  decelB23: number;
}

const EMPTY: GpsValues = {
  totalDistance: 0,
  playerLoad: 0,
  vb5: 0,
  vb6: 0,
  accelerations: 0,
  decelerations: 0,
  accelB23: 0,
  decelB23: 0,
};

interface Props {
  teamId: string | null;
  date: string; // YYYY-MM-DD
  getAuthHeaders: () => Promise<Record<string, string>>;
}

const FIELDS: Array<{ key: keyof GpsValues; label: string; unit: string; step: string }> = [
  { key: "totalDistance", label: "Total Distance", unit: "m", step: "1" },
  { key: "playerLoad", label: "Player Load", unit: "AU", step: "0.01" },
  { key: "vb5", label: "Velocity Band 5", unit: "m", step: "0.01" },
  { key: "vb6", label: "Velocity Band 6", unit: "m", step: "0.01" },
  { key: "accelerations", label: "Total Accelerations", unit: "#", step: "1" },
  { key: "decelerations", label: "Total Decelerations", unit: "#", step: "1" },
  { key: "accelB23", label: "Accel Band 2-3", unit: "#", step: "1" },
  { key: "decelB23", label: "Decel Band 2-3", unit: "#", step: "1" },
];

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */
export default function CoachGpsManualEntry({ teamId, date, getAuthHeaders }: Props) {
  const [roster, setRoster] = useState<Player[]>([]);
  const [entries, setEntries] = useState<Record<string, GpsValues & { source: string }>>({});
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [form, setForm] = useState<GpsValues>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);
  // Per-entry date — defaults to the prop (today) but the coach can pick
  // any past date. Critical because matches/sessions are often only
  // logged the morning AFTER they happened. Without this control the
  // form silently wrote every entry into today's row, so a Sunday-morning
  // entry of Saturday's match data would be stored on Sunday.
  const [editDate, setEditDate] = useState<string>(date);
  // Keep editDate in sync if the prop changes (e.g. date navigator on
  // a parent page) AND the coach hasn't manually overridden yet.
  useEffect(() => {
    setEditDate(date);
  }, [date]);

  /* Load roster + existing entries */
  const loadData = useCallback(async () => {
    if (!teamId || !editDate) return;
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/coach/gps-entry?teamId=${teamId}&date=${editDate}`,
        { headers }
      );
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setRoster(json.roster ?? []);
      setEntries(json.entries ?? {});
    } catch {
      /* ignore — empty roster */
    } finally {
      setLoading(false);
    }
  }, [teamId, editDate, getAuthHeaders]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* When player changes, pre-fill form if entry exists */
  useEffect(() => {
    if (!selectedPlayerId) {
      setForm({ ...EMPTY });
      return;
    }
    const existing = entries[selectedPlayerId];
    if (existing) {
      setForm({
        totalDistance: existing.totalDistance,
        playerLoad: existing.playerLoad,
        vb5: existing.vb5,
        vb6: existing.vb6,
        accelerations: existing.accelerations,
        decelerations: existing.decelerations,
        accelB23: existing.accelB23,
        decelB23: existing.decelB23,
      });
    } else {
      setForm({ ...EMPTY });
    }
  }, [selectedPlayerId, entries]);

  const existingEntry = selectedPlayerId ? entries[selectedPlayerId] : null;

  /* Save */
  const handleSave = async () => {
    if (!selectedPlayerId) return;
    try {
      setSaving(true);
      setFeedback(null);
      const headers = await getAuthHeaders();
      const res = await fetch("/api/coach/gps-entry", {
        method: "POST",
        headers,
        body: JSON.stringify({
          playerId: selectedPlayerId,
          date: editDate,
          ...form,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errBody.error ?? "Save failed");
      }
      setFeedback({ type: "ok", msg: "Vistað!" });
      await loadData(); // refresh
    } catch (err: unknown) {
      setFeedback({ type: "err", msg: err instanceof Error ? err.message : "Villa" });
    } finally {
      setSaving(false);
    }
  };

  const playerName = roster.find((p) => p.id === selectedPlayerId)?.name ?? "";

  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <span className="text-xl">✏️</span> Handvirk GPS skráning
        </CardTitle>
        <p className="text-sm text-slate-500">
          Skráðu GPS tölur handvirkt ef leikmaður gleymdi að kveikja á kubbnum.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date picker — always visible so coach can switch days even
            while the roster is loading. Defaults to today (the prop) but
            can be set to any past date. Cannot be set in the future. */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Dagsetning æfingar / leiks</label>
            <input
              type="date"
              max={date}
              value={editDate}
              onChange={(e) => {
                if (e.target.value) {
                  setEditDate(e.target.value);
                  setSelectedPlayerId("");
                  setFeedback(null);
                }
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {editDate !== date && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              Skráir gögn fyrir <strong>{editDate}</strong> — ekki í dag ({date}).
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Hleð leikmannalista...</p>
        ) : (
          <>
            {/* Player selector */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Leikmaður</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
              >
                <option value="">— Veldu leikmann —</option>
                {roster.map((p) => {
                  const entry = entries[p.id];
                  const tag = entry
                    ? entry.source === "manual"
                      ? " ✏️"
                      : " ✅"
                    : "";
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name}{tag}
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedPlayerId && (
              <>
                {/* Existing data warning */}
                {existingEntry && existingEntry.source !== "manual" && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                    ⚠️ Þessi leikmaður er nú þegar með GPS gögn frá <strong>{existingEntry.source}</strong> fyrir {editDate}.
                    Ef þú vistar munu þessi gögn yfirskrifast.
                  </div>
                )}

                {existingEntry && existingEntry.source === "manual" && (
                  <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
                    ✏️ Handvirk skráning er til staðar — þú getur uppfært tölurnar.
                  </div>
                )}

                {/* Form fields */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        {f.label} <span className="text-slate-400">({f.unit})</span>
                      </label>
                      <input
                        type="number"
                        step={f.step}
                        min={0}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={form[f.key] || ""}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            [f.key]: e.target.value === "" ? 0 : Number(e.target.value),
                          }))
                        }
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>

                {/* Save button */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-md bg-blue-600 text-white px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Vista..." : `Vista GPS gögn fyrir ${playerName}`}
                  </button>

                  {feedback && (
                    <span
                      className={`text-sm font-medium ${
                        feedback.type === "ok" ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {feedback.msg}
                    </span>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

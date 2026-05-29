"use client";

/**
 * PtSportSessionForm
 *
 * Log a sport / other session as Foster sRPE (RPE × duration) — e.g. football,
 * basketball, a run. Feeds the same total-load / ACWR machinery as gym work via
 * session_rpe_entries (source 'client'). Shows the day's already-logged sport
 * sessions so the client can see and remove them.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Lang = "IS" | "EN";

interface Props {
  lang?: Lang;
  date?: string;
}

type Activity = { key: string; label: string; type: string };

const ACTIVITIES: Record<Lang, Activity[]> = {
  IS: [
    { key: "football", label: "Fótbolti", type: "team_training" },
    { key: "basketball", label: "Karfa", type: "team_training" },
    { key: "running", label: "Hlaup", type: "other" },
    { key: "padel", label: "Padel / tennis", type: "other" },
    { key: "other", label: "Annað", type: "other" },
  ],
  EN: [
    { key: "football", label: "Football", type: "team_training" },
    { key: "basketball", label: "Basketball", type: "team_training" },
    { key: "running", label: "Running", type: "other" },
    { key: "padel", label: "Padel / tennis", type: "other" },
    { key: "other", label: "Other", type: "other" },
  ],
};

const COPY = {
  IS: {
    title: "🏀 Skrá íþróttaæfingu",
    subtitle: "RPE × lengd. Telst með í heildarálagi þínu.",
    date: "Dagsetning",
    activity: "Íþrótt / æfing",
    customName: "Heiti æfingar",
    customPlaceholder: "t.d. Sund",
    duration: "Lengd (mín)",
    durationPlaceholder: "t.d. 60",
    rpe: "RPE (1–10)",
    load: "Álag",
    save: "Skrá æfingu",
    saving: "Vista…",
    saved: "Skráð.",
    todays: "Skráðar íþróttaæfingar í dag",
    none: "Engin íþróttaæfing skráð í dag.",
    remove: "Eyða",
    error: "Ekki tókst að vista. Reyndu aftur.",
    minShort: "mín",
  },
  EN: {
    title: "🏀 Log sport session",
    subtitle: "RPE × duration. Counts toward your total load.",
    date: "Date",
    activity: "Sport / activity",
    customName: "Activity name",
    customPlaceholder: "e.g. Swimming",
    duration: "Duration (min)",
    durationPlaceholder: "e.g. 60",
    rpe: "RPE (1–10)",
    load: "Load",
    save: "Log session",
    saving: "Saving…",
    saved: "Logged.",
    todays: "Sport sessions logged today",
    none: "No sport session logged today.",
    remove: "Delete",
    error: "Failed to save. Try again.",
    minShort: "min",
  },
} as const;

function todayIso(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

type LoggedSession = {
  id?: string;
  session_date: string;
  session_type: string | null;
  session_name: string | null;
  duration_minutes: number | null;
  rpe: number | null;
  session_load: number | null;
};

export default function PtSportSessionForm({ lang = "IS", date: dateProp }: Props) {
  const t = COPY[lang];
  const activities = ACTIVITIES[lang];
  const [sessionDate, setSessionDate] = useState<string>(dateProp ?? todayIso());
  const [activityKey, setActivityKey] = useState<string>(activities[0].key);
  const [customName, setCustomName] = useState<string>("");
  const [durationMin, setDurationMin] = useState<number | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [todays, setTodays] = useState<LoggedSession[]>([]);

  const selected = activities.find((a) => a.key === activityKey) ?? activities[0];
  const isCustom = selected.key === "other";
  const load = (rpe != null && durationMin != null && durationMin > 0) ? Math.round(rpe * durationMin) : null;

  const loadTodays = useCallback(async (forDate: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/player/exercise-sets?days=14`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      const rows = ((json.session_loads ?? []) as LoggedSession[])
        .filter((l) => l.session_date === forDate && (l.session_type ?? "individual") !== "individual" && l.session_name);
      setTodays(rows);
    } catch {
      setTodays([]);
    }
  }, []);

  useEffect(() => { void loadTodays(sessionDate); }, [loadTodays, sessionDate]);

  async function save() {
    const name = isCustom ? customName.trim() : selected.label;
    if (!name) { setErr(t.customName); return; }
    if (durationMin == null || rpe == null) { setErr(t.error); return; }
    setSaving(true);
    setErr(null);
    setSavedAt(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not signed in");
      const res = await fetch(`/api/client/sport-session`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          session_date: sessionDate,
          session_name: name,
          session_type: selected.type,
          duration_minutes: durationMin,
          rpe,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) { setErr(json.error ?? t.error); return; }
      setSavedAt(new Date().toLocaleTimeString(lang === "IS" ? "is-IS" : "en-GB", { hour: "2-digit", minute: "2-digit" }));
      setDurationMin(null);
      setRpe(null);
      setCustomName("");
      await loadTodays(sessionDate);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t.error);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id?: string) {
    if (!id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch(`/api/client/sport-session?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      await loadTodays(sessionDate);
    } catch { /* soft */ }
  }

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">{t.title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{t.subtitle}</p>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-slate-600">{t.date}</label>
        <input
          type="date"
          value={sessionDate}
          onChange={(e) => setSessionDate(e.target.value)}
          className="rounded-lg border px-2 py-1 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 col-span-2">
          <label className="text-xs font-medium text-slate-600">{t.activity}</label>
          <select
            value={activityKey}
            onChange={(e) => setActivityKey(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-sm"
          >
            {activities.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </div>

        {isCustom && (
          <div className="flex flex-col gap-1 col-span-2">
            <label className="text-xs font-medium text-slate-600">{t.customName}</label>
            <input
              type="text"
              value={customName}
              placeholder={t.customPlaceholder}
              onChange={(e) => setCustomName(e.target.value)}
              className="rounded-lg border px-2 py-1.5 text-sm"
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">{t.duration}</label>
          <input
            type="number" inputMode="numeric" min={1} max={300}
            value={durationMin ?? ""}
            placeholder={t.durationPlaceholder}
            onChange={(e) => setDurationMin(e.target.value === "" ? null : Number(e.target.value))}
            className="rounded-lg border px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">{t.rpe}</label>
          <input
            type="number" inputMode="decimal" min={0} max={10} step={0.5}
            value={rpe ?? ""}
            onChange={(e) => setRpe(e.target.value === "" ? null : Number(e.target.value))}
            className="rounded-lg border px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      {load != null && (
        <div className="text-xs text-slate-600">
          {t.load}: <span className="font-semibold text-slate-900">{load} AU</span> · {rpe} × {durationMin} {t.minShort}
        </div>
      )}

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {saving ? t.saving : t.save}
        </button>
        {savedAt && <span className="text-xs text-emerald-700">{t.saved} {savedAt}</span>}
      </div>

      <div className="border-t pt-3 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.todays}</div>
        {todays.length === 0 ? (
          <div className="text-sm text-slate-500">{t.none}</div>
        ) : (
          <ul className="space-y-1.5">
            {todays.map((s) => (
              <li key={s.id ?? s.session_name} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{s.session_name}</span>
                <span className="flex items-center gap-3 text-slate-600">
                  <span>{s.rpe} × {s.duration_minutes} {t.minShort} · <span className="font-semibold text-slate-900">{s.session_load} AU</span></span>
                  <button type="button" onClick={() => remove(s.id)} className="text-xs text-red-600 hover:text-red-800">{t.remove}</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

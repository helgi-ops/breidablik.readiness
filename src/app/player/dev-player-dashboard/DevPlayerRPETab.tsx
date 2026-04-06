"use client";

import { useEffect, useState, useCallback } from "react";
import { SESSION_TYPES, type SessionType, type SessionRpeEntry } from "@/lib/session-rpe/types";
import { formatSessionTypeLabel, formatLoadBandClass, getSessionLoadBand } from "@/lib/session-rpe/formatters";
import { supabase } from "@/lib/supabaseClient";

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Unauthorized");
  return { Authorization: `Bearer ${token}` };
}

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type RpeStatus = {
  state: "SUBMITTED_TODAY" | "NOT_EXPECTED_TODAY" | "PENDING";
  latestSubmissionAt: string | null;
  todayEntriesCount: number;
};

type AcwrData = {
  acute7: number;
  chronic28: number;
  acwr: number | null;
  zone: "undertrain" | "optimal" | "caution" | "high_risk" | "insufficient";
};

type FormState = {
  session_date: string;
  session_type: SessionType;
  session_name: string;
  duration_minutes: string;
  rpe: string;
  notes: string;
};

const DEFAULT_FORM: FormState = {
  session_date: todayISO(),
  session_type: "team_training",
  session_name: "",
  duration_minutes: "",
  rpe: "",
  notes: "",
};

export default function DevPlayerRPETab() {
  // Status
  const [status, setStatus] = useState<RpeStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  // History
  const [history, setHistory] = useState<SessionRpeEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // ACWR
  const [acwr, setAcwr] = useState<AcwrData | null>(null);
  const [acwrLoading, setAcwrLoading] = useState(true);

  // Form
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Derived
  const durationNum = Number(form.duration_minutes);
  const rpeNum = Number(form.rpe);
  const valid = durationNum >= 1 && durationNum <= 300 && rpeNum >= 0 && rpeNum <= 10;
  const loadPreview = valid ? Math.round(durationNum * rpeNum) : null;

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/player/session-rpe/status", { headers });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load status.");
      setStatus(json);
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : "Failed to load status.");
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/player/session-rpe/history", { headers });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load history.");
      setHistory(json.entries ?? []);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadAcwr = useCallback(async () => {
    setAcwrLoading(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/player/session-rpe/acwr", { headers });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load ACWR.");
      setAcwr({ acute7: json.acute7, chronic28: json.chronic28, acwr: json.acwr, zone: json.zone });
    } catch {
      // Non-critical — fail silently, show placeholder
      setAcwr(null);
    } finally {
      setAcwrLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadHistory();
    loadAcwr();
  }, [loadStatus, loadHistory, loadAcwr]);

  async function handleSubmit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const authHeaders = await getAuthHeader();
      const res = await fetch("/api/player/session-rpe", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          session_date: form.session_date,
          session_type: form.session_type,
          session_name: form.session_name.trim() || undefined,
          duration_minutes: durationNum,
          rpe: rpeNum,
          notes: form.notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not submit Session RPE.");
      setSubmitSuccess("Session RPE submitted.");
      setForm(DEFAULT_FORM);
      await Promise.all([loadStatus(), loadHistory(), loadAcwr()]);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not submit Session RPE.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="py-4">
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="p-4 sm:p-5">
          {/* Header */}
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Eftir æfingu</div>
          <div className="text-base font-semibold text-zinc-900">Post-Session RPE</div>
          <div className="text-sm text-zinc-500">Rate how hard the full session felt overall.</div>

          {/* Status banner */}
          <div className="mt-3 rounded-xl border bg-zinc-50 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-zinc-900">RPE compliance today</div>
              {status && (
                <span
                  className={cx(
                    "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    status.state === "SUBMITTED_TODAY"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : status.state === "NOT_EXPECTED_TODAY"
                      ? "border-slate-200 bg-slate-100 text-slate-700"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  )}
                >
                  {status.state === "SUBMITTED_TODAY"
                    ? "Submitted today"
                    : status.state === "NOT_EXPECTED_TODAY"
                    ? "No submission expected"
                    : "Not yet submitted"}
                </span>
              )}
            </div>
            <div className="mt-1 text-zinc-600">
              {status?.state === "SUBMITTED_TODAY"
                ? "You have already submitted post-session RPE for today."
                : status?.state === "NOT_EXPECTED_TODAY"
                ? "No RPE submission is expected today."
                : "Please submit your post-session RPE after training."}
            </div>
            {status?.latestSubmissionAt && (
              <div className="mt-1 text-zinc-500">
                Latest submission:{" "}
                {new Date(status.latestSubmissionAt).toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" })}
                {(status.todayEntriesCount ?? 0) > 1 ? ` · ${status.todayEntriesCount} sessions today` : ""}
              </div>
            )}
            {statusLoading && <div className="mt-1 text-zinc-500">Loading status...</div>}
            {statusError && <div className="mt-1 text-rose-700">{statusError}</div>}
          </div>

          {/* ── Training Load / ACWR ─────────────────────────────── */}
          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Training Load</div>
            {acwrLoading ? (
              <div className="text-xs text-zinc-400">Hleð æfingaálag...</div>
            ) : (
              <>
                {/* Three stat tiles */}
                <div className="grid grid-cols-3 gap-3">
                  {/* Acute */}
                  <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Acute</div>
                    <div className="text-[10px] text-zinc-400 mb-1">7 dagar</div>
                    <div className="text-xl font-bold tabular-nums text-zinc-900">
                      {acwr ? acwr.acute7 : <span className="text-zinc-300">—</span>}
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">AU</div>
                  </div>
                  {/* Chronic */}
                  <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Chronic</div>
                    <div className="text-[10px] text-zinc-400 mb-1">28 dagar avg/viku</div>
                    <div className="text-xl font-bold tabular-nums text-zinc-900">
                      {acwr ? acwr.chronic28 : <span className="text-zinc-300">—</span>}
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">AU</div>
                  </div>
                  {/* ACWR */}
                  <div className={cx(
                    "rounded-lg border px-3 py-3 text-center",
                    acwr?.zone === "optimal"    ? "border-emerald-200 bg-emerald-50" :
                    acwr?.zone === "caution"    ? "border-amber-200 bg-amber-50" :
                    acwr?.zone === "high_risk"  ? "border-red-200 bg-red-50" :
                    acwr?.zone === "undertrain" ? "border-blue-200 bg-blue-50" :
                    "border-zinc-200 bg-white"
                  )}>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">ACWR</div>
                    <div className="text-[10px] text-zinc-400 mb-1">Acute / Chronic</div>
                    <div className={cx(
                      "text-xl font-bold tabular-nums",
                      acwr?.zone === "optimal"    ? "text-emerald-700" :
                      acwr?.zone === "caution"    ? "text-amber-700" :
                      acwr?.zone === "high_risk"  ? "text-red-700" :
                      acwr?.zone === "undertrain" ? "text-blue-700" :
                      "text-zinc-400"
                    )}>
                      {acwr?.acwr != null ? acwr.acwr.toFixed(2) : "—"}
                    </div>
                    <div className={cx(
                      "text-[10px] font-semibold mt-0.5",
                      acwr?.zone === "optimal"    ? "text-emerald-600" :
                      acwr?.zone === "caution"    ? "text-amber-600" :
                      acwr?.zone === "high_risk"  ? "text-red-600" :
                      acwr?.zone === "undertrain" ? "text-blue-600" :
                      "text-zinc-400"
                    )}>
                      {acwr?.zone === "optimal"    ? "✓ Sweet spot" :
                       acwr?.zone === "caution"    ? "⚠ Gæta sér" :
                       acwr?.zone === "high_risk"  ? "⛔ Há áhætta" :
                       acwr?.zone === "undertrain" ? "↓ Of lítið" :
                       "—"}
                    </div>
                  </div>
                </div>

                {/* ACWR zone legend */}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500">
                  <span><span className="font-semibold text-blue-600">&lt;0.80</span> Of lítið</span>
                  <span><span className="font-semibold text-emerald-600">0.80–1.30</span> Sweet spot</span>
                  <span><span className="font-semibold text-amber-600">1.30–1.50</span> Gæta sér</span>
                  <span><span className="font-semibold text-red-600">&gt;1.50</span> Há áhætta</span>
                </div>
              </>
            )}
          </div>

          {/* Form */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Date</label>
              <input
                type="date"
                value={form.session_date}
                onChange={(e) => setForm((p) => ({ ...p, session_date: e.target.value }))}
                className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Session type</label>
              <select
                value={form.session_type}
                onChange={(e) => setForm((p) => ({ ...p, session_type: e.target.value as SessionType }))}
                className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm"
              >
                {SESSION_TYPES.map((t) => (
                  <option key={t} value={t}>{formatSessionTypeLabel(t)}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Session name (optional)</label>
              <input
                type="text"
                value={form.session_name}
                onChange={(e) => setForm((p) => ({ ...p, session_name: e.target.value }))}
                placeholder="e.g. Team tactical + small sided games"
                className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Duration (minutes)</label>
              <input
                type="number"
                min={1}
                max={300}
                value={form.duration_minutes}
                onChange={(e) => setForm((p) => ({ ...p, duration_minutes: e.target.value }))}
                className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">RPE (0–10)</label>
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={form.rpe}
                onChange={(e) => setForm((p) => ({ ...p, rpe: e.target.value }))}
                className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Notes (optional)</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional context (travel, individual work, etc.)"
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* RPE guide */}
          <div className="mt-3 rounded-xl border bg-zinc-50 p-3 text-xs text-zinc-700">
            <div className="font-semibold text-zinc-900">RPE guide</div>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              <div>0–2 = very easy</div>
              <div>3–4 = easy</div>
              <div>5–6 = moderate</div>
              <div>7–8 = hard</div>
              <div>9 = very hard</div>
              <div>10 = maximal</div>
            </div>
          </div>

          {/* Load preview */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-zinc-700">
              Session load preview:{" "}
              <span className="tabular-nums text-zinc-900">{loadPreview == null ? "—" : loadPreview}</span>
            </div>
            {loadPreview != null && (
              <div className={cx("rounded-full border px-3 py-1 text-xs font-semibold", formatLoadBandClass(getSessionLoadBand(loadPreview)))}>
                {getSessionLoadBand(loadPreview)}
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={!valid || submitting}
              onClick={handleSubmit}
              className="rounded-lg border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Session RPE"}
            </button>
            {!valid && <div className="text-xs text-zinc-500">Enter valid duration (1–300) and RPE (0–10).</div>}
          </div>
          {submitSuccess && <div className="mt-2 text-xs text-emerald-700">{submitSuccess}</div>}
          {submitError && <div className="mt-2 text-xs text-rose-700">{submitError}</div>}

          {/* Recent submissions */}
          <div className="mt-4 rounded-xl border bg-white p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Recent submissions</div>
            {historyLoading ? (
              <div className="mt-2 text-xs text-zinc-500">Loading...</div>
            ) : historyError ? (
              <div className="mt-2 text-xs text-rose-700">{historyError}</div>
            ) : history.length === 0 ? (
              <div className="mt-2 text-xs text-zinc-500">No Session RPE entries yet.</div>
            ) : (
              <div className="mt-2 space-y-2">
                {history.map((entry) => (
                  <div key={entry.id} className="rounded-lg border bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-zinc-900">{entry.session_date}</span>
                      <span>{formatSessionTypeLabel(entry.session_type)}</span>
                      <span>{entry.duration_minutes} min</span>
                      <span>RPE {entry.rpe}</span>
                      <span className="font-semibold">Load {entry.session_load}</span>
                    </div>
                    {entry.session_name ? <div className="mt-1 text-zinc-600">{entry.session_name}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

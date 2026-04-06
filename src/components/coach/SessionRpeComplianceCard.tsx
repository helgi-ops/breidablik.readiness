"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type ComplianceSummary = {
  dateKey: string;
  expectedCount: number;
  submittedCount: number;
  missingCount: number;
  notExpectedCount: number;
  compliancePct: number | null;
  remindersSent: number;
  remindersSkipped: number;
  remindersFailed: number;
  latestReminderAt: string | null;
};

type MissingPlayer = {
  player_id: string;
  player_name: string;
  reminder_status: "sent" | "skipped_no_token" | "failed" | "not_sent_yet";
  latest_submission_date: string | null;
};

type SubmittedPlayer = {
  player_id: string;
  player_name: string;
  submitted_at: string | null;
  total_sessions: number;
  total_load: number;
};

type ComplianceResponse = {
  ok: boolean;
  error?: string;
  summary: ComplianceSummary;
  missingPlayers: MissingPlayer[];
  submittedPlayers: SubmittedPlayer[];
};

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function badgeClass(status: MissingPlayer["reminder_status"]) {
  if (status === "sent") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "skipped_no_token") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function SessionRpeComplianceCard({ teamId }: { teamId?: string | null }) {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [dateKey, setDateKey] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [data, setData] = useState<ComplianceResponse | null>(null);

  const load = async (targetDate = dateKey) => {
    setLoading(true);
    setError("");
    try {
      const { data: authData, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw new Error(authErr.message);
      const token = authData?.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const qs = new URLSearchParams({ date: targetDate });
      if (teamId) qs.set("teamId", teamId);
      const res = await fetch(`/api/coach/session-rpe/compliance?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as ComplianceResponse;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not load RPE compliance.");
      setData(json);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not load RPE compliance.";
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const sendManual = async () => {
    setSending(true);
    setActionMsg("");
    setError("");
    try {
      const { data: authData, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw new Error(authErr.message);
      const token = authData?.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const res = await fetch("/api/notifications/manual-rpe-reminder", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId: teamId ?? null,
          date: dateKey,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        result?: {
          missing_count?: number;
          attempted_count?: number;
          sent_count?: number;
          skipped_count?: number;
          failed_count?: number;
        };
      };

      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not send RPE reminders.");

      const r = json.result ?? {};
      setActionMsg(
        `RPE reminder: missing ${r.missing_count ?? 0}, attempted ${r.attempted_count ?? 0}, sent ${r.sent_count ?? 0}, skipped ${r.skipped_count ?? 0}, failed ${
          r.failed_count ?? 0
        }.`
      );
      await load(dateKey);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not send RPE reminders.";
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Session RPE</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">RPE Compliance</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateKey}
            onChange={(e) => {
              const next = e.target.value;
              setDateKey(next);
              if (/^\d{4}-\d{2}-\d{2}$/.test(next)) void load(next);
            }}
            className="h-8 rounded-md border border-slate-300 px-2 text-xs"
          />
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
            onClick={() => void load(dateKey)}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md border border-black bg-black px-3 text-xs font-semibold text-white disabled:opacity-50"
            onClick={sendManual}
            disabled={sending || loading}
          >
            {sending ? "Sending..." : "Send reminder to missing players"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Expected</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{loading ? "—" : data?.summary.expectedCount ?? 0}</div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-emerald-700">Submitted</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-emerald-800">{loading ? "—" : data?.summary.submittedCount ?? 0}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-amber-700">Missing</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-amber-800">{loading ? "—" : data?.summary.missingCount ?? 0}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Compliance</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{loading ? "—" : data?.summary.compliancePct != null ? `${data.summary.compliancePct}%` : "—"}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Reminders sent</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{loading ? "—" : data?.summary.remindersSent ?? 0}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Latest reminder</div>
          <div className="mt-1 text-xs font-medium text-slate-700">{loading ? "—" : data?.summary.latestReminderAt ?? "—"}</div>
        </div>
      </div>

      {actionMsg ? <div className="mt-2 text-xs text-slate-600">{actionMsg}</div> : null}
      {error ? <div className="mt-2 text-xs text-rose-700">{error}</div> : null}

      {!loading && !error ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold text-slate-700">Missing players</div>
            {data?.missingPlayers?.length ? (
              <div className="mt-2 space-y-1.5">
                {data.missingPlayers.map((p) => (
                  <div key={p.player_id} className="flex items-center justify-between rounded-md border bg-slate-50 px-2 py-1.5 text-xs">
                    <div>
                      <div className="font-medium text-slate-800">{p.player_name}</div>
                      <div className="text-slate-500">latest submission: {p.latest_submission_date ?? "—"}</div>
                    </div>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClass(p.reminder_status)}`}>
                      {p.reminder_status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-xs text-slate-500">No missing players for this date.</div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold text-slate-700">Submitted players</div>
            {data?.submittedPlayers?.length ? (
              <div className="mt-2 space-y-1.5">
                {data.submittedPlayers.map((p) => (
                  <div key={p.player_id} className="flex items-center justify-between rounded-md border bg-slate-50 px-2 py-1.5 text-xs">
                    <div>
                      <div className="font-medium text-slate-800">{p.player_name}</div>
                      <div className="text-slate-500">
                        {p.total_sessions} sessions · load {p.total_load}
                      </div>
                    </div>
                    <span className="text-slate-600">{p.submitted_at ? new Date(p.submitted_at).toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-xs text-slate-500">No submissions yet for this date.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}


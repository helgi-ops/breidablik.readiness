"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type ReminderSummary = {
  dateKey: string;
  totalActivePlayers: number;
  checkedInToday: number;
  missingToday: number;
  lastReminderSentAt: string | null;
  nextScheduledReminderLabel: string;
};

export default function CheckinReminderStatusCard() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<ReminderSummary | null>(null);
  const [lastActionMsg, setLastActionMsg] = useState("");

  const loadStatus = async () => {
    setError("");
    setLoading(true);

    try {
      const { data: authData, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw new Error(authErr.message);

      const token = authData?.session?.access_token;
      if (!token) {
        setSummary(null);
        setLoading(false);
        return;
      }

      const res = await fetch("/api/notifications/status", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        summary?: ReminderSummary;
      };

      if (!res.ok || !json?.ok || !json?.summary) {
        throw new Error(json?.error || "Could not load reminder status.");
      }

      setSummary(json.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const sendManualReminder = async () => {
    setSending(true);
    setLastActionMsg("");
    setError("");

    try {
      const { data: authData, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw new Error(authErr.message);

      const token = authData?.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const res = await fetch("/api/notifications/manual-reminder", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        result?: {
          sent?: number;
          failed?: number;
          skipped?: number;
          targetedPlayers?: number;
        };
      };

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Could not send manual reminder.");
      }

      const targeted = json.result?.targetedPlayers ?? 0;
      const sent = json.result?.sent ?? 0;
      const failed = json.result?.failed ?? 0;
      const skipped = json.result?.skipped ?? 0;

      setLastActionMsg(`Manual reminder: targeted ${targeted}, sent ${sent}, skipped ${skipped}, failed ${failed}.`);
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Check-in reminders</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">Daily compliance status</div>
        </div>

        <button
          type="button"
          onClick={sendManualReminder}
          disabled={sending || loading}
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send reminder to missing players"}
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Active players</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{loading ? "—" : summary?.totalActivePlayers ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-emerald-700">Checked in</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-emerald-800">{loading ? "—" : summary?.checkedInToday ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-amber-700">Missing</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-amber-800">{loading ? "—" : summary?.missingToday ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Last reminder</div>
          <div className="mt-1 text-xs font-medium text-slate-700">{loading ? "—" : summary?.lastReminderSentAt ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Next slot</div>
          <div className="mt-1 text-xs font-medium text-slate-700">{loading ? "—" : summary?.nextScheduledReminderLabel ?? "—"}</div>
        </div>
      </div>

      {lastActionMsg ? <div className="mt-2 text-xs text-slate-600">{lastActionMsg}</div> : null}
      {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}
    </div>
  );
}

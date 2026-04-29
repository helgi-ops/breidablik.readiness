"use client";
export const dynamic = "force-dynamic";

/**
 * /coach/notifications — event-stream view of threshold-crossings.
 *
 * Each row = one moment a player TRANSITIONED into a concerning state on
 * a specific parameter. Different from Daily Briefing (which shows status):
 * this page tells the coach what CHANGED since they last looked.
 */

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type NotificationRow = {
  id: string;
  parameter: string;
  direction: "overload" | "underload" | "wellness_drop";
  severity: "info" | "warning" | "urgent";
  threshold: number | null;
  value_now: number | null;
  value_prev: number | null;
  summary: string;
  summary_is: string | null;
  is_post_match: boolean;
  fired_at: string;
  acknowledged_at: string | null;
  player_id: string;
  players: { full_name: string | null } | null;
};

const SEVERITY_STYLES: Record<NotificationRow["severity"], { bg: string; border: string; text: string; icon: string }> = {
  urgent:  { bg: "bg-rose-50",   border: "border-rose-300",   text: "text-rose-900",   icon: "🚨" },
  warning: { bg: "bg-amber-50",  border: "border-amber-300",  text: "text-amber-900",  icon: "⚠️" },
  info:    { bg: "bg-sky-50",    border: "border-sky-300",    text: "text-sky-900",    icon: "ℹ️" },
};

const PARAMETER_LABELS: Record<string, { en: string; is: string }> = {
  acwr:               { en: "Training load ratio",        is: "Æfingaálag (ACWR)" },
  hsr:                { en: "High-speed running",          is: "Hraðir hlauptímar" },
  sharp_cut:          { en: "Sharp braking",               is: "Skarp bremsa" },
  wellness_sleep:     { en: "Sleep",                       is: "Svefn" },
  wellness_soreness:  { en: "Soreness",                    is: "Eymsl" },
  wellness_energy:    { en: "Energy / fatigue",            is: "Orka / þreyta" },
  wellness_readiness: { en: "Readiness",                   is: "Readiness" },
};

// Direction badge so the coach can see at a glance whether a player is being
// over-trained or under-trained. Wellness drops use a separate badge style.
const DIRECTION_LABELS: Record<string, { en: string; is: string; cls: string }> = {
  overload:     { en: "↑ OVER",  is: "↑ YFIR",  cls: "bg-rose-100 text-rose-800 border-rose-300" },
  underload:    { en: "↓ UNDER", is: "↓ UNDIR", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  wellness_drop:{ en: "↓ DROP",  is: "↓ FALL",  cls: "bg-slate-100 text-slate-700 border-slate-300" },
};

export default function CoachNotificationsPage() {
  const [lang] = useLang();
  const [rows, setRows] = React.useState<NotificationRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [includeAcked, setIncludeAcked] = React.useState(false);
  const [detecting, setDetecting] = React.useState(false);
  const [ackingId, setAckingId] = React.useState<string | null>(null);

  const fetchNotifications = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setError("Not signed in"); return; }
      const url = `/api/coach/notifications${includeAcked ? "?include_acknowledged=1" : ""}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? `HTTP ${res.status}`); return; }
      setRows((json.notifications ?? []) as NotificationRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [includeAcked]);

  React.useEffect(() => { void fetchNotifications(); }, [fetchNotifications]);

  async function handleAcknowledge(id: string) {
    setAckingId(id);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      await fetch(`/api/coach/notifications/${id}/acknowledge`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      await fetchNotifications();
    } finally {
      setAckingId(null);
    }
  }

  async function handleDetect() {
    setDetecting(true);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      await fetch("/api/coach/notifications", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      await fetchNotifications();
    } finally {
      setDetecting(false);
    }
  }

  const en = lang === "EN";
  const unacked = rows.filter((r) => !r.acknowledged_at);
  const acked = rows.filter((r) => r.acknowledged_at);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {en ? "Notifications" : "Tilkynningar"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {en
              ? "Players who crossed a threshold since yesterday — what changed, not what's flagged today."
              : "Leikmenn sem fóru yfir mörk síðan í gær — hvað breyttist, ekki bara hver er flaggaður í dag."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDetect}
          disabled={detecting}
          className="rounded-md border bg-white px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
        >
          {detecting ? (en ? "Checking…" : "Athugar…") : (en ? "↻ Re-check" : "↻ Endur-athuga")}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      {loading && rows.length === 0 && (
        <div className="rounded-md border bg-white p-6 text-center text-sm text-slate-500">
          {en ? "Loading…" : "Hleður…"}
        </div>
      )}

      {!loading && unacked.length === 0 && !includeAcked && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-6 text-center text-sm text-emerald-900">
          ✅ {en ? "All clear — no new threshold crossings today." : "Allt í lagi — engin ný mörk farin í dag."}
        </div>
      )}

      <div className="space-y-2">
        {unacked.map((n) => {
          const style = SEVERITY_STYLES[n.severity];
          const paramLbl = PARAMETER_LABELS[n.parameter] ?? { en: n.parameter, is: n.parameter };
          const dirLbl = DIRECTION_LABELS[n.direction];
          const summary = en ? n.summary : (n.summary_is ?? n.summary);
          return (
            <div
              key={n.id}
              className={`rounded-lg border ${style.border} ${style.bg} ${style.text} p-3`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base">{style.icon}</span>
                    <span className="font-semibold">
                      {n.players?.full_name ?? "—"}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full border border-current/20">
                      {en ? paramLbl.en : paramLbl.is}
                    </span>
                    {dirLbl && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${dirLbl.cls}`}>
                        {en ? dirLbl.en : dirLbl.is}
                      </span>
                    )}
                    {n.is_post_match && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/60 border border-current/20">
                        {en ? "post-match" : "eftir leik"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm">{summary}</p>
                  {(n.value_now != null || n.value_prev != null) && (
                    <p className="mt-1 text-xs opacity-70">
                      {n.value_prev != null && (
                        <>
                          {en ? "before" : "fyrir"}: <strong>{n.value_prev}</strong>
                          {" → "}
                        </>
                      )}
                      {n.value_now != null && (
                        <>
                          {en ? "now" : "núna"}: <strong>{n.value_now}</strong>
                        </>
                      )}
                      {n.threshold != null && (
                        <span className="ml-2 opacity-60">
                          ({en ? "threshold" : "mörk"}: {n.threshold})
                        </span>
                      )}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] opacity-50">
                    {new Date(n.fired_at).toLocaleString(en ? "en-GB" : "is-IS", {
                      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleAcknowledge(n.id)}
                  disabled={ackingId === n.id}
                  className="shrink-0 rounded-md border border-current/30 bg-white/80 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                >
                  {ackingId === n.id ? "…" : (en ? "Acknowledge" : "Staðfest")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Acknowledged history toggle */}
      <div className="mt-6 border-t pt-4">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={includeAcked}
            onChange={(e) => setIncludeAcked(e.target.checked)}
          />
          {en ? "Show acknowledged history (last 7 days)" : "Sýna staðfesta sögu (síðustu 7 daga)"}
        </label>

        {includeAcked && acked.length > 0 && (
          <div className="mt-3 space-y-2 opacity-60">
            {acked.map((n) => {
              const paramLbl = PARAMETER_LABELS[n.parameter] ?? { en: n.parameter, is: n.parameter };
              const summary = en ? n.summary : (n.summary_is ?? n.summary);
              return (
                <div key={n.id} className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{n.players?.full_name ?? "—"}</span>
                    <span className="text-[10px] px-1 py-0.5 rounded-full bg-white border">
                      {en ? paramLbl.en : paramLbl.is}
                    </span>
                    <span className="text-[10px] opacity-70 ml-auto">
                      ✓ {new Date(n.acknowledged_at!).toLocaleString(en ? "en-GB" : "is-IS", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] opacity-80">{summary}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 text-xs text-slate-500">
        <Link href="/coach" className="hover:text-slate-700">
          {en ? "← Back to dashboard" : "← Til baka á dashboard"}
        </Link>
      </div>
    </div>
  );
}

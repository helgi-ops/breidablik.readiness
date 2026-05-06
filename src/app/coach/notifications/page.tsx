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
import PlayerRecoveryMessageModal from "@/components/coach/PlayerRecoveryMessageModal";

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
  /** Set when the coach has already sent an AI recovery message for this
   *  notification (see PlayerRecoveryMessageModal). Null until then. */
  player_message_sent_at: string | null;
  /** TRUE when Stig 2 auto-send orchestrator delivered the AI message
   *  (no coach review). Drives the "🤖 Auto-sent" pill on the row. */
  auto_sent: boolean;
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
// over-trained or under-trained. Wellness signals are special: the score is
// 1–5 with HIGHER = better-feeling, so a "drop" in score means symptom-rise
// (more pain, less sleep, less energy). The chip text follows the symptom
// language used in the summary so coach doesn't see "DROP" + "rose" side
// by side and have to mentally reconcile them.
const DIRECTION_LABELS: Record<string, { en: string; is: string; cls: string }> = {
  overload:           { en: "↑ OVER",     is: "↑ YFIR",      cls: "bg-rose-100 text-rose-800 border-rose-300" },
  underload:          { en: "↓ UNDER",    is: "↓ UNDIR",     cls: "bg-amber-100 text-amber-800 border-amber-300" },
  wellness_drop:      { en: "↓ WORSE",    is: "↓ VERRA",     cls: "bg-slate-100 text-slate-700 border-slate-300" },
};

// Wellness-specific override — when direction is wellness_drop, picks a
// label that matches the symptom direction the coach reads in the summary.
const WELLNESS_PARAM_LABELS: Record<string, { en: string; is: string }> = {
  wellness_soreness:  { en: "↑ SORE",     is: "↑ EYMSL"  },
  wellness_sleep:     { en: "↓ SLEEP",    is: "↓ SVEFN"  },
  wellness_energy:    { en: "↓ ENERGY",   is: "↓ ORKA"   },
  wellness_readiness: { en: "↓ READINESS", is: "↓ READINESS" },
};

function getDirectionChip(parameter: string, direction: string, lang: "en" | "is") {
  if (direction === "wellness_drop") {
    const wellnessLabel = WELLNESS_PARAM_LABELS[parameter];
    const base = DIRECTION_LABELS.wellness_drop;
    if (wellnessLabel) {
      return { en: wellnessLabel.en, is: wellnessLabel.is, cls: base.cls }[lang === "en" ? "en" : "is"]
        ? { label: wellnessLabel[lang], cls: base.cls }
        : { label: base[lang], cls: base.cls };
    }
    return { label: base[lang], cls: base.cls };
  }
  const dir = DIRECTION_LABELS[direction];
  if (!dir) return null;
  return { label: dir[lang], cls: dir.cls };
}

export default function CoachNotificationsPage() {
  const [lang] = useLang();
  const [rows, setRows] = React.useState<NotificationRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [includeAcked, setIncludeAcked] = React.useState(false);
  const [detecting, setDetecting] = React.useState(false);
  const [ackingId, setAckingId] = React.useState<string | null>(null);
  // AI player-recovery-message modal — open per-notification.
  const [draftFor, setDraftFor] = React.useState<NotificationRow | null>(null);

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
          const dirChip = getDirectionChip(n.parameter, n.direction, en ? "en" : "is");
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
                    {dirChip && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${dirChip.cls}`}>
                        {dirChip.label}
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
                <div className="flex shrink-0 flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDraftFor(n)}
                    disabled={!n.players?.full_name}
                    className={`rounded-md border px-3 py-1 text-xs transition-colors disabled:opacity-50 ${
                      n.player_message_sent_at
                        ? n.auto_sent
                          ? "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
                          : "border-emerald-400 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        : "border-current/30 bg-white/80 text-current hover:bg-white"
                    }`}
                    title={n.player_message_sent_at
                      ? n.auto_sent
                        ? (en ? "AI auto-sent — click to view what was delivered" : "AI sendi sjálfvirkt — smelltu til að skoða hvað var sent")
                        : (en ? "AI message already sent — click to view" : "AI skilaboð þegar send — smelltu til að skoða")
                      : (en ? "Draft an AI recovery message to send to the player" : "Búa til AI recovery skilaboð til leikmanns")}
                  >
                    {n.player_message_sent_at
                      ? n.auto_sent
                        ? (en ? "🤖 Auto-sent" : "🤖 Sjálfvirkt")
                        : (en ? "✓ AI msg sent" : "✓ AI sent")
                      : (en ? "🤖 Draft AI msg" : "🤖 Draga upp AI skilaboð")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAcknowledge(n.id)}
                    disabled={ackingId === n.id}
                    className="rounded-md border border-current/30 bg-white/80 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                  >
                    {ackingId === n.id ? "…" : (en ? "Acknowledge" : "Staðfest")}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* AI player-recovery-message modal — opens when coach clicks the
          "Draft AI msg" button on a notification row. Wraps fetch +
          edit + send so the coach has a single contained surface for
          per-flag athlete outreach. */}
      {draftFor && (
        <PlayerRecoveryMessageModal
          open
          notificationId={draftFor.id}
          playerName={draftFor.players?.full_name ?? "—"}
          parameterLabel={
            (PARAMETER_LABELS[draftFor.parameter] ?? { en: draftFor.parameter, is: draftFor.parameter })[
              en ? "en" : "is"
            ]
          }
          lang={en ? "EN" : "IS"}
          onClose={() => setDraftFor(null)}
          onSent={() => { setDraftFor(null); void fetchNotifications(); }}
        />
      )}

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

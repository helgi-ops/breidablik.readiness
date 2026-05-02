"use client";

/**
 * PlayerRecoveryMessageModal
 *
 * Coach clicks "Draft AI message" on a notification row → this modal
 * opens, fetches a fresh AI draft, and lets the coach edit before
 * sending. After send, the row refreshes and shows "✓ sent at HH:MM".
 *
 * Wired against /api/coach/notifications/[id]/player-message
 *   GET  → returns { message } (or { sent: true, message } if already sent)
 *   POST → sends the (possibly edited) message to the player
 *
 * ELITE-gated server-side; on 402 we render an upgrade nudge inline.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Props = {
  open: boolean;
  notificationId: string;
  playerName: string;
  parameterLabel: string;
  lang: "EN" | "IS";
  onClose: () => void;
  onSent?: () => void;
};

type DraftState =
  | { kind: "loading" }
  | { kind: "ready"; message: string; alreadySent: false }
  | { kind: "alreadySent"; message: string; sentAt: string }
  | { kind: "elite" }
  | { kind: "error"; error: string };

const COPY = {
  IS: {
    title: "AI recovery skilaboð til leikmanns",
    subtitle: (name: string, param: string) => `${name} · ${param}`,
    loading: "Skrifa drög…",
    regenerate: "↻ Endurnýja drög",
    send: "Senda til leikmanns",
    sending: "Sendi…",
    cancel: "Loka",
    sentBadge: "Sent",
    sentBody: (when: string) => `Skilaboð voru send ${when}. Leikmaðurinn fær push á símann sinn ef PWA er virkt.`,
    eliteTitle: "AI player messages — ELITE feature",
    eliteBody: "AI-skrifuð recovery skilaboð til leikmanna eru hluti af ELITE áskrift.",
    eliteCta: "Sjá pakka",
    editorHint: "Lestu yfir og breyttu áður en þú sendir. Þetta fer beint í app-ið og push á símann.",
    poweredBy: "Drög búin til af Claude Haiku — ELITE",
    error: "Villa við að búa til skilaboð",
  },
  EN: {
    title: "AI recovery message to player",
    subtitle: (name: string, param: string) => `${name} · ${param}`,
    loading: "Drafting…",
    regenerate: "↻ Regenerate",
    send: "Send to player",
    sending: "Sending…",
    cancel: "Close",
    sentBadge: "Sent",
    sentBody: (when: string) => `Message sent at ${when}. Player gets a push on their phone if PWA is active.`,
    eliteTitle: "AI player messages — ELITE feature",
    eliteBody: "AI-drafted recovery messages to players are part of the ELITE plan.",
    eliteCta: "See plans",
    editorHint: "Read and edit before sending. The message goes straight to their app + push notification.",
    poweredBy: "Draft by Claude Haiku — ELITE",
    error: "Couldn't generate the message",
  },
} as const;

export default function PlayerRecoveryMessageModal({
  open,
  notificationId,
  playerName,
  parameterLabel,
  lang,
  onClose,
  onSent,
}: Props) {
  const t = COPY[lang];
  const [state, setState] = React.useState<DraftState>({ kind: "loading" });
  const [sending, setSending] = React.useState(false);

  // Fetch on open. Re-fetch on regenerate by bumping `nonce`.
  const [nonce, setNonce] = React.useState(0);
  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    setState({ kind: "loading" });
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: sessionData } = await sb.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) { setState({ kind: "error", error: "Not signed in" }); return; }
        const res = await fetch(
          `/api/coach/notifications/${notificationId}/player-message?lang=${lang}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.status === 402) { if (alive) setState({ kind: "elite" }); return; }
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) { setState({ kind: "error", error: json.error ?? `HTTP ${res.status}` }); return; }
        if (json.sent) {
          setState({ kind: "alreadySent", message: json.message ?? "", sentAt: json.sent_at ?? "" });
        } else {
          setState({ kind: "ready", message: json.message ?? "", alreadySent: false });
        }
      } catch (e) {
        if (alive) setState({ kind: "error", error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { alive = false; };
  }, [open, notificationId, lang, nonce]);

  async function handleSend() {
    if (state.kind !== "ready") return;
    setSending(true);
    try {
      const sb = getSupabaseClient();
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) { setState({ kind: "error", error: "Not signed in" }); return; }
      const res = await fetch(
        `/api/coach/notifications/${notificationId}/player-message`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ message: state.message }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        setState({ kind: "error", error: json.error ?? `HTTP ${res.status}` });
        return;
      }
      onSent?.();
      onClose();
    } catch (e) {
      setState({ kind: "error", error: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
        className="relative w-full max-w-xl rounded-lg bg-white shadow-xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t.title}</h2>
            <p className="text-xs text-slate-500">{t.subtitle(playerName, parameterLabel)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={t.cancel}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {state.kind === "loading" && (
            <div className="flex h-32 items-center justify-center text-sm text-slate-500">
              {t.loading}
            </div>
          )}

          {state.kind === "elite" && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
              <div className="text-sm font-semibold text-amber-900">{t.eliteTitle}</div>
              <p className="mt-1 text-sm text-amber-900">{t.eliteBody}</p>
              <a
                href="/pricing"
                className="mt-2 inline-block text-sm font-semibold text-amber-900 underline hover:text-amber-700"
              >
                {t.eliteCta} →
              </a>
            </div>
          )}

          {state.kind === "error" && (
            <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
              <strong>{t.error}:</strong> {state.error}
            </div>
          )}

          {state.kind === "alreadySent" && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                  ✓ {t.sentBadge}
                </span>
                <span className="text-xs text-emerald-800">
                  {t.sentBody(new Date(state.sentAt).toLocaleString(lang === "EN" ? "en-GB" : "is-IS", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  }))}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">{state.message}</p>
            </div>
          )}

          {state.kind === "ready" && (
            <>
              <p className="text-xs text-slate-500">{t.editorHint}</p>
              <textarea
                value={state.message}
                onChange={(e) => setState({ kind: "ready", message: e.target.value, alreadySent: false })}
                rows={9}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
              <div className="text-[10px] text-slate-400">{t.poweredBy}</div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <div>
            {state.kind === "ready" && (
              <button
                type="button"
                onClick={() => setNonce((n) => n + 1)}
                disabled={sending}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
              >
                {t.regenerate}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              {t.cancel}
            </button>
            {state.kind === "ready" && (
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || state.message.trim().length < 40}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {sending ? t.sending : t.send}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

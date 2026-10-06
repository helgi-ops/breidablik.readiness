"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import {
  groupsWithCounts,
  resolveRecipientIds,
  recipientCountOf,
  type RosterRow,
} from "@/lib/micropulse/pitchSession/sessionRecipients";

/**
 * Confirm + send a built pitch ("Build session") session to the player app — to
 * the whole team, a position group, or a hand-picked subset.
 *
 * The recipient selection (sendGroup / customIds) is OWNED BY THE PARENT so the
 * inline picker in SessionBuilder and this dialog stay in lock-step. The dialog
 * adds the date, the hand-picked list (when "custom"), and the publish call.
 *
 * It publishes a `saved_sessions` row with a `recipient_player_ids` target; the
 * existing player pipeline (/api/team/training-sessions → "Næsta æfing frá
 * þjálfara" Today card + /player/sessions) surfaces it to exactly those players.
 * Parallel to the strength send — never touches the readiness colour.
 */

type SessionToPublish = {
  session_name: string;
  md_day: string;
  target_pl: number | null;
  items: Array<{ drill_id: string; drill_name: string; sets: number }>;
  totals: Record<string, number> | null;
  focus_points?: string[];
  duration_min?: number;
};

const C = {
  IS: {
    title: "Senda æfingu til leikmanna",
    subtitle: "Leikmenn í valda hópnum sjá æfinguna í appinu sínu (Næsta æfing frá þjálfara).",
    unnamed: "Æfing án nafns",
    drills: "æfingaratriði",
    min: "mín",
    dateLabel: "Dagsetning",
    recipients: "Hverjir fá hana",
    wholeTeam: "Allt liðið",
    pickPlayers: "Velja leikmenn…",
    none: "Enginn valinn",
    willReceive: (n: number) => `${n} ${n === 1 ? "leikmaður fær" : "leikmenn fá"} æfinguna`,
    cancel: "Hætta við",
    send: "Senda",
    sending: "Sendi…",
    sent: "Sent ✓",
    loadingRoster: "Sæki leikmenn…",
    errNoPlayers: "Enginn leikmaður í valinu.",
    errAuth: "Vantar auðkenningu",
    errGeneric: "Villa við sendingu",
  },
  EN: {
    title: "Send session to players",
    subtitle: "Players in the chosen group see it in their app (Next session from your coach).",
    unnamed: "Untitled session",
    drills: "drills",
    min: "min",
    dateLabel: "Date",
    recipients: "Who gets it",
    wholeTeam: "Whole team",
    pickPlayers: "Pick players…",
    none: "None selected",
    willReceive: (n: number) => `${n} ${n === 1 ? "player" : "players"} will get this session`,
    cancel: "Cancel",
    send: "Send",
    sending: "Sending…",
    sent: "Sent ✓",
    loadingRoster: "Loading players…",
    errNoPlayers: "No players in the selection.",
    errAuth: "Missing authentication",
    errGeneric: "Send failed",
  },
} as const;

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function SessionPublishDialog({
  teamId,
  teamSport = null,
  session,
  roster,
  rosterLoading,
  sendGroup,
  setSendGroup,
  customIds,
  setCustomIds,
  onClose,
  onPublished,
}: {
  teamId: string;
  teamSport?: string | null;
  session: SessionToPublish;
  roster: RosterRow[];
  rosterLoading: boolean;
  sendGroup: string; // "all" | group key | "custom"
  setSendGroup: (g: string) => void;
  customIds: Set<string>;
  setCustomIds: (next: Set<string>) => void;
  onClose: () => void;
  onPublished?: (info: { recipientCount: number; sessionDate: string }) => void;
}) {
  const [lang] = useLang();
  const t = C[lang === "IS" ? "IS" : "EN"];

  const [sessionDate, setSessionDate] = useState<string>(todayIso());
  const [sending, setSending] = useState(false);
  const [sentFlash, setSentFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const posGroups = useMemo(() => groupsWithCounts(roster, teamSport), [roster, teamSport]);
  const recipientIds = useMemo(
    () => resolveRecipientIds(sendGroup, customIds, roster, teamSport),
    [sendGroup, customIds, roster, teamSport]
  );
  const recipientCount = recipientCountOf(recipientIds, roster.length);

  function toggleCustom(id: string) {
    const next = new Set(customIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCustomIds(next);
  }

  async function handleSend() {
    setError(null);
    if (recipientIds != null && recipientIds.length === 0) {
      setError(t.errNoPlayers);
      return;
    }
    setSending(true);
    try {
      const sb = getSupabaseClient();
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error(t.errAuth);

      const createRes = await fetch("/api/coach/saved-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          team_id: teamId,
          session_name: session.session_name,
          md_day: session.md_day,
          target_pl: session.target_pl,
          items: session.items,
          totals: session.totals,
          session_date: sessionDate,
          focus_points: session.focus_points ?? [],
          recipient_player_ids: recipientIds, // null = whole team
        }),
      });
      const createJson = await createRes.json().catch(() => ({}));
      if (!createRes.ok || !createJson.ok || !createJson.session?.id)
        throw new Error(createJson.error || t.errGeneric);

      const pubRes = await fetch(`/api/coach/saved-sessions/${createJson.session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ publish: true }),
      });
      const pubJson = await pubRes.json().catch(() => ({}));
      if (!pubRes.ok || !pubJson.ok) throw new Error(pubJson.error || t.errGeneric);

      setSentFlash(true);
      onPublished?.({ recipientCount, sessionDate });
      setTimeout(() => onClose(), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  const drillCount = session.items.length;
  const dur = session.duration_min ?? session.totals?.duration_min ?? 0;

  const overlay = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-slate-100 px-5 pb-3 pt-4">
          <h2 className="text-base font-semibold text-[#14181c]">{t.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{t.subtitle}</p>
          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">{session.session_name?.trim() || t.unnamed}</span>
            {session.md_day ? <span className="ml-1.5 rounded bg-[#2740e6]/10 px-1.5 py-0.5 font-semibold text-[#2740e6]">{session.md_day}</span> : null}
            <span className="ml-1.5 text-slate-400">·</span> {drillCount} {t.drills}
            {dur > 0 ? <> <span className="text-slate-400">·</span> {Math.round(dur)} {t.min}</> : null}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {/* Date */}
          <label className="mb-3 block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.dateLabel}</span>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm tabular-nums"
            />
          </label>

          {/* Recipients */}
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.recipients}</div>
          {rosterLoading ? (
            <div className="py-2 text-xs text-slate-500">{t.loadingRoster}</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <GroupChip label={t.wholeTeam} count={roster.length} active={sendGroup === "all"} onClick={() => setSendGroup("all")} />
              {posGroups.map((g) => (
                <GroupChip
                  key={g.key}
                  label={lang === "IS" ? g.is : g.en}
                  count={g.count}
                  active={sendGroup === g.key}
                  onClick={() => setSendGroup(g.key)}
                />
              ))}
              <GroupChip label={t.pickPlayers} active={sendGroup === "custom"} onClick={() => setSendGroup("custom")} />
            </div>
          )}

          {/* Custom player list */}
          {sendGroup === "custom" && !rosterLoading && (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 p-1">
              {roster.length === 0 ? (
                <div className="px-2 py-2 text-xs text-slate-500">{t.none}</div>
              ) : (
                roster.map((p) => {
                  const on = customIds.has(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${on ? "bg-[#2740e6]/5" : "hover:bg-slate-50"}`}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggleCustom(p.id)} className="h-4 w-4 accent-[#2740e6]" />
                      <span className="text-slate-800">{p.full_name}</span>
                      {p.position ? <span className="ml-auto text-[11px] text-slate-400">{p.position}</span> : null}
                    </label>
                  );
                })
              )}
            </div>
          )}

          <div className="mt-3 text-xs font-medium text-slate-600">{t.willReceive(recipientCount)}</div>
          {error && <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-[#a83e28]">{error}</div>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300">
            {t.cancel}
          </button>
          <button
            onClick={handleSend}
            disabled={sending || sentFlash || rosterLoading || (recipientIds != null && recipientIds.length === 0)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50 ${sentFlash ? "bg-[#1c7a4a]" : "bg-[#2740e6] hover:bg-[#1f34c0]"}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            {sentFlash ? t.sent : sending ? t.sending : t.send}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}

function GroupChip({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
        active ? "border-[#2740e6] bg-[#2740e6] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800"
      }`}
    >
      {label}
      {count != null ? <span className={`ml-1 ${active ? "text-white/70" : "text-slate-400"}`}>{count}</span> : null}
    </button>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { positionGroup, positionGroupsForSport } from "@/lib/micropulse/positionStyle";

/**
 * Send a built pitch ("Build session") session to the player app — to the whole
 * team, a position group, or a hand-picked subset.
 *
 * This is the delivery surface the coach asked for ("split into groups in Build
 * session → players see it in their app"). It publishes a `saved_sessions` row
 * with a `recipient_player_ids` target; the already-existing player pipeline
 * (/api/team/training-sessions → "Næsta æfing frá þjálfara" Today card +
 * /player/sessions) surfaces it to exactly those players.
 *
 * Parallel to the strength send — it is a pitch/field session, NOT the strength
 * `player_today_strength_override` Today layer, and it never touches the colour.
 */

type RosterRow = { id: string; full_name: string; position: string | null };

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
    selected: "valdir",
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
    selected: "selected",
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
  onClose,
  onPublished,
}: {
  teamId: string;
  teamSport?: string | null;
  session: SessionToPublish;
  onClose: () => void;
  onPublished?: (info: { recipientCount: number; sessionDate: string }) => void;
}) {
  const [lang] = useLang();
  const t = C[lang === "IS" ? "IS" : "EN"];

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [sessionDate, setSessionDate] = useState<string>(todayIso());
  const [sendGroup, setSendGroup] = useState<"all" | string>("all"); // "all" | group key | "custom"
  const [customIds, setCustomIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sentFlash, setSentFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Roster (active players with positions) — mirrors the Builder's own client reads.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data } = await sb
          .from("players")
          .select("id, full_name, position, is_active")
          .eq("team_id", teamId)
          .eq("is_active", true)
          .order("full_name");
        if (cancelled) return;
        setRoster(
          ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
            id: String(r.id),
            full_name: String(r.full_name ?? ""),
            position: (r.position as string | null) ?? null,
          }))
        );
      } finally {
        if (!cancelled) setRosterLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  // Position groups that actually have players, with counts.
  const posGroups = useMemo(() => {
    const groups = positionGroupsForSport(teamSport);
    const counts = new Map<string, number>();
    for (const p of roster) {
      const key = positionGroup(p.position, teamSport);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return groups
      .map((g) => ({ ...g, count: counts.get(g.key) ?? 0 }))
      .filter((g) => g.count > 0);
  }, [roster, teamSport]);

  // The resolved recipient ids for the current selection (null = whole team).
  const recipientIds = useMemo<string[] | null>(() => {
    if (sendGroup === "all") return null;
    if (sendGroup === "custom") return Array.from(customIds);
    return roster
      .filter((p) => positionGroup(p.position, teamSport) === sendGroup)
      .map((p) => p.id);
  }, [sendGroup, customIds, roster, teamSport]);

  const recipientCount = recipientIds == null ? roster.length : recipientIds.length;

  const toggleCustom = useCallback((id: string) => {
    setCustomIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

      // 1. Create the row (draft) with its target + date.
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

      // 2. Publish it — this is what makes it visible to the targeted players.
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

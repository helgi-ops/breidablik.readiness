"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import {
  unionOfGroups,
  assignmentMap,
  type RosterRow,
  type SessionGroup,
} from "@/lib/micropulse/pitchSession/sessionRecipients";

/**
 * Split the squad into named teams for a built pitch session, then send it to
 * the player app. Every assigned player gets the SAME session and sees which
 * team they're in ("Þitt lið: Lið A"). Players left unassigned don't receive it;
 * with no teams at all it goes to the whole team with no labels.
 *
 * The team list (`groups`) is OWNED BY THE PARENT so the inline summary in
 * SessionBuilder and this editor stay in lock-step. Publishes a `saved_sessions`
 * row with `groups` (+ a derived `recipient_player_ids` union); the existing
 * player pipeline surfaces it. Parallel to the strength send — never the colour.
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

const TEAM_COLORS = ["#2740e6", "#de9328", "#1c7a4a", "#a83e28", "#7a5cc4", "#0e7490"];
const LETTERS = ["A", "B", "C", "D", "E", "F"];

const C = {
  IS: {
    title: "Senda æfingu til leikmanna",
    subtitle: "Skiptu í lið ef þú vilt — hver leikmaður sér sitt lið í appinu. Annars fer hún á allt liðið.",
    unnamed: "Æfing án nafns",
    drills: "æfingaratriði",
    min: "mín",
    dateLabel: "Dagsetning",
    teams: "Lið",
    addTeam: "Bæta við liði",
    splitEven: "Skipta jafnt",
    clearSplit: "Hreinsa skiptingu",
    teamName: "Nafn liðs",
    unassigned: "—",
    roster: "Leikmenn",
    inTeams: (p: number, g: number) => `${p} leikmenn í ${g} ${g === 1 ? "liði" : "liðum"}`,
    wholeTeamNote: "Engin skipting — fer á allt liðið",
    cancel: "Hætta við",
    send: "Senda",
    sending: "Sendi…",
    sent: "Sent ✓",
    loadingRoster: "Sæki leikmenn…",
    errAuth: "Vantar auðkenningu",
    errGeneric: "Villa við sendingu",
  },
  EN: {
    title: "Send session to players",
    subtitle: "Split into teams if you like — each player sees their team in the app. Otherwise it goes to the whole team.",
    unnamed: "Untitled session",
    drills: "drills",
    min: "min",
    dateLabel: "Date",
    teams: "Teams",
    addTeam: "Add team",
    splitEven: "Split evenly",
    clearSplit: "Clear split",
    teamName: "Team name",
    unassigned: "—",
    roster: "Players",
    inTeams: (p: number, g: number) => `${p} players in ${g} ${g === 1 ? "team" : "teams"}`,
    wholeTeamNote: "No split — goes to the whole team",
    cancel: "Cancel",
    send: "Send",
    sending: "Sending…",
    sent: "Sent ✓",
    loadingRoster: "Loading players…",
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
  session,
  roster,
  rosterLoading,
  groups,
  setGroups,
  onClose,
  onPublished,
}: {
  teamId: string;
  session: SessionToPublish;
  roster: RosterRow[];
  rosterLoading: boolean;
  groups: SessionGroup[];
  setGroups: (next: SessionGroup[]) => void;
  onClose: () => void;
  onPublished?: (info: { recipientCount: number; teamCount: number; sessionDate: string }) => void;
}) {
  const [lang] = useLang();
  const t = C[lang === "IS" ? "IS" : "EN"];

  const [sessionDate, setSessionDate] = useState<string>(todayIso());
  const [sending, setSending] = useState(false);
  const [sentFlash, setSentFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assign = useMemo(() => assignmentMap(groups), [groups]);
  const recipientIds = useMemo(() => unionOfGroups(groups), [groups]);
  const recipientCount = recipientIds.length; // 0 → whole team

  function addTeam() {
    if (groups.length >= 6) return;
    const idx = groups.length;
    setGroups([...groups, { id: `g${idx + 1}_${Math.random().toString(36).slice(2, 6)}`, name: `${lang === "IS" ? "Lið" : "Team"} ${LETTERS[idx] ?? idx + 1}`, player_ids: [] }]);
  }
  function removeTeam(id: string) {
    setGroups(groups.filter((g) => g.id !== id));
  }
  function renameTeam(id: string, name: string) {
    setGroups(groups.map((g) => (g.id === id ? { ...g, name } : g)));
  }
  function setPlayerTeam(pid: string, groupId: string) {
    const cleared = groups.map((g) => ({ ...g, player_ids: g.player_ids.filter((x) => x !== pid) }));
    if (!groupId) return setGroups(cleared);
    setGroups(cleared.map((g) => (g.id === groupId ? { ...g, player_ids: [...g.player_ids, pid] } : g)));
  }
  function splitEvenly() {
    const teams = groups.length >= 2 ? groups : [
      { id: `g1_${Math.random().toString(36).slice(2, 6)}`, name: `${lang === "IS" ? "Lið" : "Team"} A`, player_ids: [] as string[] },
      { id: `g2_${Math.random().toString(36).slice(2, 6)}`, name: `${lang === "IS" ? "Lið" : "Team"} B`, player_ids: [] as string[] },
    ];
    const cleared = teams.map((g) => ({ ...g, player_ids: [] as string[] }));
    roster.forEach((p, i) => { cleared[i % cleared.length].player_ids.push(p.id); });
    setGroups(cleared);
  }

  async function handleSend() {
    setError(null);
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
          groups: groups.length > 0 ? groups : null, // null = whole team, no labels
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
      onPublished?.({
        recipientCount: recipientCount > 0 ? recipientCount : roster.length,
        teamCount: groups.length,
        sessionDate,
      });
      setTimeout(() => onClose(), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  const drillCount = session.items.length;
  const dur = session.duration_min ?? session.totals?.duration_min ?? 0;
  const colorOf = (id: string) => TEAM_COLORS[groups.findIndex((g) => g.id === id) % TEAM_COLORS.length] ?? "#64748b";

  const overlay = (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
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
            <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm tabular-nums" />
          </label>

          {/* Teams toolbar */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.teams}</span>
            <button onClick={addTeam} disabled={groups.length >= 6} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-40">+ {t.addTeam}</button>
            <button onClick={splitEvenly} disabled={rosterLoading || roster.length === 0} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-40">{t.splitEven}</button>
            {groups.length > 0 && (
              <button onClick={() => setGroups([])} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 hover:border-red-300 hover:text-red-600">{t.clearSplit}</button>
            )}
          </div>

          {/* Team name chips */}
          {groups.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {groups.map((g) => (
                <div key={g.id} className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: colorOf(g.id) }} />
                  <input
                    value={g.name}
                    onChange={(e) => renameTeam(g.id, e.target.value)}
                    placeholder={t.teamName}
                    className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-800"
                  />
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{g.player_ids.length}</span>
                  <button onClick={() => removeTeam(g.id)} className="shrink-0 rounded px-1.5 py-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="remove">✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Roster → per-player team picker */}
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.roster}</div>
          {rosterLoading ? (
            <div className="py-2 text-xs text-slate-500">{t.loadingRoster}</div>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 p-1">
              {roster.map((p) => {
                const gid = assign.get(p.id) ?? "";
                return (
                  <div key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-slate-50">
                    {gid ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(gid) }} /> : <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-slate-200" />}
                    <span className="min-w-0 flex-1 truncate text-slate-800">{p.full_name}</span>
                    {p.position ? <span className="shrink-0 text-[10px] text-slate-400">{p.position}</span> : null}
                    <select
                      value={gid}
                      onChange={(e) => setPlayerTeam(p.id, e.target.value)}
                      disabled={groups.length === 0}
                      className="shrink-0 rounded border border-slate-200 bg-white px-1.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                    >
                      <option value="">{t.unassigned}</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 text-xs font-medium text-slate-600">
            {groups.length === 0 ? t.wholeTeamNote : t.inTeams(recipientCount, groups.length)}
          </div>
          {error && <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-[#a83e28]">{error}</div>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300">{t.cancel}</button>
          <button
            onClick={handleSend}
            disabled={sending || sentFlash || rosterLoading || (groups.length > 0 && recipientCount === 0)}
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

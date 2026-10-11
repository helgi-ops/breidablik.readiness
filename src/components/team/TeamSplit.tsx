// The practice team organisation as the player sees it: every named team the coach split
// the squad into, with its members. The viewer's own team is highlighted and their name
// badged "you". Shared by the /player/sessions overview + detail pages (one source).
"use client";

import type { SessionTeam, SessionCopyT } from "@/components/team/sessionShared";

export default function TeamSplit({ teams, t }: { teams: SessionTeam[]; t: SessionCopyT }) {
  if (!teams || teams.length === 0) return null;
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {t.teamsHeading}
      </h2>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {teams.map((team, i) => {
          const mine = team.members.some((m) => m.is_you);
          return (
            <div
              key={i}
              className={
                "rounded-xl border p-3 " +
                (mine
                  ? "border-[var(--primary,#2740e6)]/40 bg-[var(--primary,#2740e6)]/5"
                  : "border-zinc-200 bg-zinc-50")
              }
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="font-display text-sm font-bold tracking-tight text-zinc-900">
                  {team.name || "–"}
                </span>
                {mine && (
                  <span className="rounded-full bg-[var(--primary,#2740e6)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                    {t.yourTeam}
                  </span>
                )}
              </div>
              <ul className="space-y-0.5">
                {team.members.map((m) => (
                  <li
                    key={m.id}
                    className={"flex items-center gap-1.5 text-[13px] " + (m.is_you ? "font-semibold text-zinc-900" : "text-zinc-600")}
                  >
                    <span className={"h-1.5 w-1.5 shrink-0 rounded-full " + (m.is_you ? "bg-[var(--primary,#2740e6)]" : "bg-zinc-300")} />
                    <span className="truncate">{m.name}</span>
                    {m.is_you && <span className="text-[10px] font-normal text-[var(--primary,#2740e6)]">({t.you})</span>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

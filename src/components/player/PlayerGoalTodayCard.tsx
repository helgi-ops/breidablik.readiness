"use client";

/**
 * PlayerGoalTodayCard — the player's goal plan on Today (lota 3): "My goal: top speed · week 3 of 8".
 *
 * An ADD-ON on its own card, below the day's session: it never changes Today's session or the readiness colour.
 * Layered read: (0) one sentence for today, (1) 2–3 plain facts (this week's days, what the colour does to it),
 * the session itself, (2) "behind the plan" (how days are picked, the start, the sources).
 *
 * Reads `/api/player/goal-plan/today`, which places the week's sessions around the team's matches and picks today's
 * version from the check-in colour (only read). Silent when there is no plan, on any error, and for FREE clubs.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { GoalTodayCard } from "@/lib/micropulse/goalPlan/today";
import type { Bi } from "@/lib/micropulse/goalPlan/types";

export default function PlayerGoalTodayCard({ lang = "EN" }: { lang?: "IS" | "EN" }) {
  const [card, setCard] = React.useState<GoalTodayCard | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await getSupabaseClient().auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch("/api/player/goal-plan/today", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { card?: GoalTodayCard | null };
        const c = j?.card;
        if (alive && c && c.verdict && Array.isArray(c.facts)) setCard(c);
      } catch { /* optional card — never break Today */ }
    })();
    return () => { alive = false; };
  }, []);

  if (!card) return null;
  return <GoalTodayCardView card={card} lang={lang} />;
}

const VERSION_STYLE = {
  full: "bg-[#2740e6]/10 text-[#2740e6]",
  lighter: "bg-[#de9328]/15 text-[#8a5a12]",
  skip: "bg-[#a83e28]/10 text-[#a83e28]",
} as const;

/** The card itself, given its data (split out so it can be rendered without a login). */
export function GoalTodayCardView({ card, lang = "EN" }: { card: GoalTodayCard; lang?: "IS" | "EN" }) {
  const IS = lang === "IS";
  const L = (b: Bi | null | undefined) => (b ? (IS ? b.is : b.en) : "");
  const T = (en: string, is: string) => (IS ? is : en);
  const t = card.today;

  return (
    <div data-player-card="goal-plan" className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-zinc-900">{L(card.title)}</span>
        {card.state === "on" ? (
          <span className="font-display text-[12px] font-semibold text-zinc-500">{T(`week ${card.week} of ${card.weeksTotal}`, `vika ${card.week} af ${card.weeksTotal}`)}</span>
        ) : null}
        <span
          className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500"
          title={T("Extra to the team's session. It never changes it or your colour.", "Aukalega við æfingu liðsins. Breytir henni aldrei né litnum þínum.")}
        >
          {T("Add-on", "Viðbót")}
        </span>
      </div>

      <p className="mt-2 text-[15px] font-semibold leading-snug text-zinc-900">{L(card.verdict)}</p>

      {card.facts.length ? (
        <ul className="mt-2 space-y-1 text-[13px] leading-snug text-zinc-700">
          {card.facts.map((f, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-zinc-400" aria-hidden />
              <span>{L(f)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {t && t.version !== "skip" && t.blocks.length ? (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-zinc-900">{T(`Session ${t.slot}`, `Æfing ${t.slot}`)}: {L(t.focus)}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${VERSION_STYLE[t.version]}`}>
              {t.version === "lighter" ? T("Lighter version", "Léttari útgáfa") : T("Full session", "Öll æfingin")} · {T(`~${t.minutes} min`, `~${t.minutes} mín`)}
            </span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {t.blocks.map((b, i) => (
              <li key={i} className="text-[12.5px] leading-snug text-zinc-700">
                <span className="font-semibold text-zinc-900">{L(b.what)}</span>
                {b.supervised ? <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]">{T("with a coach", "með þjálfara")}</span> : null}
                <span className="block text-zinc-600">{L(b.dose)}</span>
              </li>
            ))}
          </ul>
          {t.version === "lighter" ? (
            <p className="mt-2 text-[11.5px] text-zinc-600">{T("Half the sets of each, and stop well short of your limit.", "Helmingur settanna í hverju, og hættu vel áður en þú nærð hámarki.")}</p>
          ) : null}
          {card.supervision ? <p className="mt-2 text-[11.5px] text-zinc-600">{L(card.supervision)}</p> : null}
        </div>
      ) : null}

      {card.thisWeek.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {card.thisWeek.map((s) => (
            <span
              key={s.slot}
              className={`rounded-lg border px-2 py-1 text-[11px] ${s.isToday ? "border-[#2740e6] bg-[#2740e6]/5 font-semibold text-[#2740e6]" : s.past ? "border-zinc-200 text-zinc-400" : "border-zinc-200 text-zinc-700"}`}
            >
              {s.slot} · {s.day ? L(s.day) : T("no day", "enginn dagur")}
            </span>
          ))}
        </div>
      ) : null}

      {card.coachNote ? (
        <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-[12.5px] text-zinc-700">
          <span className="font-semibold">{T("From your coach:", "Frá þjálfaranum:")}</span> {card.coachNote}
        </p>
      ) : null}

      <details className="mt-3 group/behind">
        <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-700">
          <span className="transition group-open/behind:rotate-90">▸</span>
          {T("Behind the plan", "Á bak við áætlunina")}
        </summary>
        <ul className="mt-2 list-inside list-disc space-y-1 rounded-xl border border-zinc-200 bg-white/70 p-3 text-[11px] leading-relaxed text-zinc-600">
          {card.weekLabel ? <li>{L(card.weekLabel)}</li> : null}
          {card.details.map((d, i) => <li key={i}>{L(d)}</li>)}
        </ul>
      </details>
    </div>
  );
}

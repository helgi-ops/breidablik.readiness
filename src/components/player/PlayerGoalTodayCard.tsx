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
 *
 * Lota 4: the player ticks a session as done / not done (POST, only sessions placed on today or earlier this week),
 * and after the last week the card shows the outcome for 14 days.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { GoalTodayCard } from "@/lib/micropulse/goalPlan/today";
import type { Bi } from "@/lib/micropulse/goalPlan/types";

export default function PlayerGoalTodayCard({ lang = "EN" }: { lang?: "IS" | "EN" }) {
  const [card, setCard] = React.useState<GoalTodayCard | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const mark = React.useCallback(async (slot: string, status: "done" | "skipped" | "clear") => {
    setBusy(true); setErr(null);
    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch("/api/player/goal-plan/today", {
        method: "POST", cache: "no-store",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ slot, status }),
      });
      const j = (await res.json().catch(() => ({}))) as { card?: GoalTodayCard | null; error?: string; error_is?: string | null };
      if (!res.ok) { setErr((lang === "IS" ? j.error_is : null) ?? j.error ?? String(res.status)); return; }
      if (j.card && j.card.verdict) setCard(j.card);
    } catch {
      setErr(lang === "IS" ? "Tókst ekki að vista. Reyndu aftur." : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }, [lang]);

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
  return <GoalTodayCardView card={card} lang={lang} onMark={mark} busy={busy} error={err} />;
}

const VERSION_STYLE = {
  full: "bg-[#2740e6]/10 text-[#2740e6]",
  lighter: "bg-[#de9328]/15 text-[#8a5a12]",
  skip: "bg-[#a83e28]/10 text-[#a83e28]",
} as const;

/** The card itself, given its data (split out so it can be rendered without a login). */
export function GoalTodayCardView({ card, lang = "EN", onMark, busy = false, error = null }: {
  card: GoalTodayCard;
  lang?: "IS" | "EN";
  onMark?: (slot: string, status: "done" | "skipped" | "clear") => void;
  busy?: boolean;
  error?: string | null;
}) {
  const IS = lang === "IS";
  const L = (b: Bi | null | undefined) => (b ? (IS ? b.is : b.en) : "");
  const T = (en: string, is: string) => (IS ? is : en);
  const t = card.today;
  // Sessions earlier this week that were placed but not ticked yet (today's has its own buttons).
  const unticked = card.thisWeek.filter((s) => s.canMark && !s.isToday && !s.mark);

  return (
    <div data-player-card="goal-plan" className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-zinc-900">{L(card.title)}</span>
        {card.state === "on" ? (
          <span className="font-display text-[12px] font-semibold text-zinc-500">{T(`week ${card.week} of ${card.weeksTotal}`, `vika ${card.week} af ${card.weeksTotal}`)}</span>
        ) : card.state === "finished" ? (
          <span className="font-display text-[12px] font-semibold text-zinc-500">{T("finished", "lokið")}</span>
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
          {onMark ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-2.5">
              {t.mark === "done" ? (
                <>
                  <span className="rounded-full bg-[#2740e6]/10 px-2.5 py-1 text-[12px] font-semibold text-[#2740e6]">✓ {T("Done", "Búið")}</span>
                  <button type="button" disabled={busy} onClick={() => onMark(t.slot, "clear")} className="text-[11.5px] font-medium text-zinc-500 underline-offset-2 hover:underline disabled:opacity-50">{T("Undo", "Afturkalla")}</button>
                </>
              ) : t.mark === "skipped" ? (
                <>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[12px] font-semibold text-zinc-600">{T("Not done today", "Ekki gert í dag")}</span>
                  <button type="button" disabled={busy} onClick={() => onMark(t.slot, "clear")} className="text-[11.5px] font-medium text-zinc-500 underline-offset-2 hover:underline disabled:opacity-50">{T("Undo", "Afturkalla")}</button>
                </>
              ) : (
                <>
                  <button type="button" disabled={busy} onClick={() => onMark(t.slot, "done")} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50">{T("Mark as done", "Merkja búið")}</button>
                  <button type="button" disabled={busy} onClick={() => onMark(t.slot, "skipped")} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[12.5px] font-medium text-zinc-700 disabled:opacity-50">{T("Couldn't do it", "Náði því ekki")}</button>
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {onMark && t && t.version === "skip" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-zinc-700">
          {t.mark ? (
            <>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[12px] font-semibold text-zinc-600">{t.mark === "done" ? `✓ ${T("Done", "Búið")}` : T("Ticked as not done", "Merkt ekki gerð")}</span>
              <button type="button" disabled={busy} onClick={() => onMark(t.slot, "clear")} className="text-[11.5px] font-medium text-zinc-500 underline-offset-2 hover:underline disabled:opacity-50">{T("Undo", "Afturkalla")}</button>
            </>
          ) : (
            <>
              <span>{T("Tick it off so your coach sees it was skipped:", "Merktu hana svo þjálfarinn sjái að henni var sleppt:")}</span>
              <button type="button" disabled={busy} onClick={() => onMark(t.slot, "skipped")} className="rounded-md border border-zinc-300 px-2 py-0.5 text-[11.5px] font-medium text-zinc-600 disabled:opacity-50">{T("Skipped", "Sleppt")}</button>
            </>
          )}
        </div>
      ) : null}

      {onMark && unticked.length ? (
        <div className="mt-3 space-y-1.5">
          {unticked.map((s) => (
            <div key={s.slot} className="flex flex-wrap items-center gap-2 text-[12.5px] text-zinc-700">
              <span>{T(`Did you do session ${s.slot}${s.day ? ` (${s.day.en})` : ""}?`, `Gerðirðu æfingu ${s.slot}${s.day ? ` (${s.day.is})` : ""}?`)}</span>
              <button type="button" disabled={busy} onClick={() => onMark(s.slot, "done")} className="rounded-md border border-[#2740e6]/40 px-2 py-0.5 text-[11.5px] font-semibold text-[#2740e6] disabled:opacity-50">{T("Yes", "Já")}</button>
              <button type="button" disabled={busy} onClick={() => onMark(s.slot, "skipped")} className="rounded-md border border-zinc-300 px-2 py-0.5 text-[11.5px] font-medium text-zinc-600 disabled:opacity-50">{T("No", "Nei")}</button>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-[12px] text-[#a83e28]">{error}</p> : null}

      {card.thisWeek.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {card.thisWeek.map((s) => (
            <span
              key={s.slot}
              className={`rounded-lg border px-2 py-1 text-[11px] ${s.isToday ? "border-[#2740e6] bg-[#2740e6]/5 font-semibold text-[#2740e6]" : s.past ? "border-zinc-200 text-zinc-400" : "border-zinc-200 text-zinc-700"}`}
            >
              {s.mark === "done" ? "✓ " : ""}{s.slot} · {s.day ? L(s.day) : T("no day", "enginn dagur")}
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

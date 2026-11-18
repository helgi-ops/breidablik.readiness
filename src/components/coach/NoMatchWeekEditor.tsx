"use client";

/**
 * Weeks without a match (2026-11-17), under "Session structure per MD day" on the coach's strength page.
 *
 * With no match from 4 days back to 5 ahead there is no MD countdown, so every strength day used to read as MD-3.
 * Here the coach says what each weekday is in such a week: a strength, power or light day, or rest. The method still
 * comes from the MD rows above (strength = MD-4, power = MD-3, light = MD-2), so a method is picked in one place.
 * Saved with the same "Save structures" button (team_strength_palette.no_match_week). Rules: structures.ts.
 */

import { useState } from "react";
import NoMatchWeekCheck from "./NoMatchWeekCheck";
import {
  DEFAULT_STRUCTURE_BY_MD,
  NO_MATCH_DAY_KINDS,
  NO_MATCH_DAY_LABEL,
  NO_MATCH_DAY_MD,
  STRUCTURE_LABEL,
  WEEKDAYS,
  WEEKDAY_LABEL,
  isRestDay,
  type MdStructures,
  type NoMatchDayKind,
  type NoMatchWeek,
  type Weekday,
} from "@/lib/micropulse/strengthProgramming/structures";

export default function NoMatchWeekEditor({
  lang,
  value,
  onChange,
  mdStructures,
}: {
  lang: "IS" | "EN";
  value: NoMatchWeek;
  onChange: (next: NoMatchWeek) => void;
  /** The MD rows above (unsaved edits included), so each day shows the method it will use. */
  mdStructures: MdStructures;
}) {
  const is = lang === "IS";
  const t = (en: string, isText: string) => (is ? isText : en);
  const L = (b: { en: string; is: string }) => (is ? b.is : b.en);

  /** The method a kind of day uses: that MD row's pick, else its default; the light day's built-in session otherwise. */
  const methodFor = (kind: Exclude<NoMatchDayKind, "rest">): string => {
    const md = NO_MATCH_DAY_MD[kind];
    const pick = mdStructures[md];
    const key = pick && !isRestDay(pick) ? pick : DEFAULT_STRUCTURE_BY_MD[md];
    return key ? L(STRUCTURE_LABEL[key]) : t("built-in light session", "innbyggð létt æfing");
  };

  const setDay = (d: Weekday, v: NoMatchDayKind | "") => {
    const next: NoMatchWeek = { ...value };
    if (v === "") delete next[d];
    else next[d] = v;
    onChange(next);
  };

  const setCount = WEEKDAYS.filter((d) => value[d]).length;
  const [todayIso] = useState(() => new Date().toISOString().slice(0, 10));

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="no-match-week">
      <div className="text-[11px] font-semibold text-slate-800">{t("Weeks without a match", "Vikur án leiks")}</div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
        {t(
          "With no match from 4 days back to 5 days ahead, say what each weekday is. The method comes from the rows above: a strength day uses MD-4, a power day MD-3, a light day MD-2. A day left unset works as before (MD-3).",
          "Þegar enginn leikur er frá 4 dögum aftur til 5 daga fram, segðu hvað hver vikudagur er. Aðferðin kemur úr línunum hér fyrir ofan: styrktardagur notar MD-4, sprengikraftsdagur MD-3, léttur dagur MD-2. Dagur sem er ekki stilltur virkar eins og áður (MD-3).",
        )}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        {t(
          "Used by Individualised and Individualised + goals, in sends and auto-send. Weeks with a match are unchanged, and a send day you pick by hand wins.",
          "Gildir fyrir Einstaklingsmiðað og Einstaklingsmiðað + markmið, í sendingu og sjálfvirkri sendingu. Vikur með leik eru óbreyttar og sendingardagur sem þú velur sjálfur ræður.",
        )}
      </p>
      <div className="mt-2 space-y-1.5">
        {WEEKDAYS.map((d) => {
          const kind = value[d] ?? "";
          return (
            <div key={d} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="w-24 shrink-0 text-[12px] font-semibold capitalize text-slate-700">{is ? WEEKDAY_LABEL[d].is : WEEKDAY_LABEL[d].en}</span>
              <select
                value={kind}
                onChange={(e) => setDay(d, e.target.value as NoMatchDayKind | "")}
                aria-label={is ? WEEKDAY_LABEL[d].is : WEEKDAY_LABEL[d].en}
                data-testid={`no-match-${d}`}
                className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-[12px]"
              >
                <option value="">{t("Not set — as before (MD-3)", "Ekki stillt — eins og áður (MD-3)")}</option>
                {NO_MATCH_DAY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k === "rest" ? t("Rest — no strength session", "Hvíld — engin styrktaræfing") : `${L(NO_MATCH_DAY_LABEL[k])} (${NO_MATCH_DAY_MD[k]})`}
                  </option>
                ))}
              </select>
              {kind && kind !== "rest" ? (
                <span className="w-full pl-26 text-[11px] text-slate-500 sm:w-auto sm:pl-0">{methodFor(kind)}</span>
              ) : null}
            </div>
          );
        })}
      </div>
      {setCount === 0 ? (
        <div className="mt-2 text-[11px] text-slate-500">{t("Nothing set: every strength day in such a week reads as MD-3.", "Ekkert stillt: hver styrktardagur í slíkri viku telst MD-3.")}</div>
      ) : null}
      {/* The next 4 weeks against this plan (unsaved edits included): a strength / power day that is a day off. */}
      <NoMatchWeekCheck lang={lang} from={todayIso} days={28} plan={value} />
    </div>
  );
}

"use client";

/**
 * /client (today)
 *
 * Mobile home screen for the PT client:
 *   - One rule-based decision (src/lib/client/todayDecision)
 *   - Today's prescribed workout — pulled from active Explosive Power
 *     assignment or custom_template_sets player override
 *   - Corrective, on scheduled days
 *   - Momentum, AI insight, then one line each for everything else
 *
 * One API call: GET /api/client/today composes everything.
 */

export const dynamic = "force-dynamic";

import Link from "next/link";
import MomentumCard from "@/components/player/MomentumCard";
import AICoachCard from "@/components/player/AICoachCard";
import ClientVacationBanner from "@/components/player/ClientVacationBanner";
import ClientNudges from "@/components/player/ClientNudges";
import ExerciseInfo from "@/components/exercise/ExerciseInfo";
import { decideToday, weekdayName, type DecisionTone } from "@/lib/client/todayDecision";
import { isSeasonPhase, SEASON_PHASE_SPEC } from "@/lib/client/seasonPhase";
import { buildSessionBlocks } from "@/lib/client/sessionGrouping";

/** Whole days from today (this device's date) to a YYYY-MM-DD date. */
function daysFromToday(dateIso: string): number {
  const todayIso = new Date().toLocaleDateString("en-CA");
  return Math.round((Date.parse(`${dateIso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000);
}
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import ClientCorrectiveCard, { type CorrectiveData } from "@/components/player/ClientCorrectiveCard";
import ClientWeekOverview from "@/components/player/ClientWeekOverview";
import ClientProgrammeOverview from "@/components/player/ClientProgrammeOverview";
import ClientMoveSessionButton from "@/components/player/ClientMoveSessionButton";
import ClientMoveSessionControl from "@/components/player/ClientMoveSessionControl";
import MethodologyLink from "@/components/common/MethodologyLink";
import { sanitizeVbtPrescription, formatVbtForPlayer } from "@/lib/micropulse/vbtMethods";
import { ptInputFromClientRow, rxForPtLift } from "@/lib/micropulse/strengthProgramming/ptLiftRx";
import { LiftRxDetails } from "@/components/trainer/LiftRxTable";

type TodayResp = {
  ok: true;
  player: { id: string; full_name: string };
  /** Effective check-in mode for this client (per-client override folded in).
   *  false = GPS/load-only, so no check-in surfaces. Resolved server-side. */
  usesWellnessFeatures?: boolean;
  /** Corrective / prehab "morning" session for today (null unless today is a
   *  scheduled corrective weekday). Separate from the strength session. */
  corrective?: CorrectiveData | null;
  team: { id: string; name: string; type: string | null; short: string | null } | null;
  explosive: {
    level: string;
    programme_name: string | null;
    phase: number;
    phase_name: string;
    weeks_label: string;
    week_in_phase: number | null;
    weekday_label: string | null;
    weekday_index?: number | null;
    rest_day: boolean;
    next_session_label: string | null;
    next_session_weekday?: number | null;
    /** "custom" = the trainer's own plan (sessions can be moved); "starter" = a starter programme. */
    plan_source?: "starter" | "custom";
    upcoming_start?: string | null;
    completed?: boolean;
    moved_from?: string | null;
    moved_to?: string | null;
    weeks_per_phase?: number;
    total_phases?: number;
    season_phase?: string | null;
    is_match_day?: boolean;
    days_to_game?: number | null;
    blocks: Array<{ name: string; rows: Array<{
      num?: string; exercise: string; reps: string; sets: number;
      velocity?: string | number; pct1rm?: number | null; method?: string;
      group?: string | null; group_method?: string | null;
      cluster_rest?: string; set_rest?: string;
      target_kg?: number | null; target_stale?: boolean; target_auto?: boolean;
      description?: string | null; description_is?: string | null; video_url?: string | null;
      /** Bar-speed method (Weakley et al. 2021, Table 5), sanitised server-side. */
      vbt?: unknown;
      /** Individual plan: the trainer's own numbers, read by "All the details" (ptLiftRx). */
      load_value?: number | null; rpe_target?: number | null; tempo?: string | null; notes?: string | null;
      dropoff?: number | null;
    }> }>;
    retest_due?: string[];
    needs_test?: string[];
    readiness?: {
      applied: boolean;
      zone: "green" | "yellow" | "red";
      volume_pct: number;
      intensity_pct: number;
      action: "normal" | "deload" | "recovery" | "skip";
      source: "plan" | "default";
    } | null;
  } | null;
  /** A plan that starts later (only set when there's nothing for today). */
  upcoming_plan?: { name: string; start_date: string } | null;
  readinessToday: { id: string; total_score: number | null; color: string | null } | null;
  session_logged_today?: boolean;
  load?: { ratio: number | null; confidence: "low" | "medium" | "high" };
  bodyweight: { latest: { log_date: string; weight_kg: number }; delta_kg: number | null } | null;
  intelligence: {
    foster: {
      monotony: number | null; strain: number; total_load: number;
      status: "ok" | "watch" | "deload_recommended" | "deload_required";
      reason: string;
    };
    exposure: {
      heavy_sets: number; cap: number; saturation: number;
      status: "low" | "optimal" | "high" | "excessive";
      reason: string;
    };
    pr_forecast: {
      exercise_name: string;
      forecast: {
        current_pr_kg: number; weekly_rate_kg: number;
        target_kg: number; eta_days: number | null; eta_weeks: number | null;
        sessions: number; reason: string;
      };
    } | null;
  };
};

export default function ClientTodayPage() {
  const [lang, setLang] = useLang();
  const [data, setData] = useState<TodayResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/client/today", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.error ?? "Failed to load");
        return;
      }
      setData(json as TodayResp);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Effective check-in mode for this client — resolved server-side with the
  // per-client override folded in (players.uses_wellness_features over the
  // practice-wide default). false = GPS/load-only → no check-in surfaces. Before
  // the one API call resolves, data is null and the page shows a loader, so a
  // Full Suite client never flashes hidden.
  const gpsOnly = data?.usesWellnessFeatures === false;

  if (err) return <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>;
  if (!data) return <div className="text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>;

  const L = lang === "EN" ? "EN" : "IS";
  const firstName = data.player.full_name.split(" ")[0];
  const checkinOn = !gpsOnly;
  const readinessDone = !!data.readinessToday;
  const ex = data.explosive;
  const hasBlocks = !!ex && ex.blocks.length > 0;
  // Moving a session only works on the trainer's own plan (not starter programmes).
  const canMove = ex?.plan_source === "custom";
  const upcomingStart = ex?.upcoming_start ?? data.upcoming_plan?.start_date ?? null;
  const decision = decideToday({
    checkinOn,
    checkedIn: readinessDone,
    upcoming: upcomingStart ? { startDate: upcomingStart, daysUntil: daysFromToday(upcomingStart) } : null,
    completed: !!ex?.completed,
    session: ex
      ? {
          restDay: ex.rest_day,
          nextSessionWeekday: ex.next_session_weekday ?? null,
          matchDay: !!ex.is_match_day,
          daysToGame: ex.days_to_game ?? null,
          readiness: ex.readiness
            ? {
                applied: ex.readiness.applied, zone: ex.readiness.zone, action: ex.readiness.action,
                volumePct: ex.readiness.volume_pct, intensityPct: ex.readiness.intensity_pct,
              }
            : null,
        }
      : null,
    fosterStatus: data.intelligence.foster.status,
    fosterReason: data.intelligence.foster.reason,
    loadRatio: data.load?.ratio ?? null,
  });
  const TONE: Record<DecisionTone, { text: string; dot: string }> = {
    good: { text: "text-emerald-700", dot: "bg-emerald-600" },
    warn: { text: "text-amber-800", dot: "bg-amber-500" },
    bad: { text: "text-red-700", dot: "bg-red-600" },
    neutral: { text: "text-slate-600", dot: "bg-slate-400" },
  };
  const tone = TONE[decision.tone];
  const corrective = data.corrective ? <ClientCorrectiveCard data={data.corrective} lang={L} primary={!!ex?.rest_day} /> : null;
  const today = new Date().toLocaleDateString(lang === "IS" ? "is-IS" : "en-GB", { weekday: "short", day: "numeric", month: "short" });
  const pr = data.intelligence.pr_forecast;

  const rowClass = "flex min-h-12 items-center justify-between gap-3 border-b border-slate-100 px-4 text-sm text-slate-900 last:border-b-0 hover:bg-slate-50";

  return (
    <div className="space-y-3.5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight text-slate-900">
            {lang === "IS" ? "Hæ" : "Hi"}, {firstName}
          </h1>
          <div className="mt-0.5 text-[13px] text-slate-500">
            {today}
            {data.team && <> · {lang === "IS" ? "Þjálfari" : "Trainer"}: {data.team.short ?? data.team.name}</>}
          </div>
        </div>
        <div role="group" aria-label={lang === "IS" ? "Tungumál" : "Language"} className="flex gap-0.5 rounded-[9px] bg-slate-200 p-[3px]">
          {(["EN", "IS"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={L === l}
              onClick={() => setLang(l)}
              className={`min-h-8 min-w-9 rounded-[7px] text-xs font-semibold ${L === l ? "bg-white text-slate-900" : "text-slate-600"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </header>

      {/* Vacation / return banner (declared per-client breaks). */}
      <ClientVacationBanner lang={L} />

      {/* The one decision — readiness, taper, deload and load, stated once. */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        {decision.label && (
          <div className={`mb-2 flex items-center gap-2 text-xs font-semibold ${tone.text}`}>
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
            <span>{decision.label[L]}</span>
          </div>
        )}
        <h2 className="font-display text-[26px] font-extrabold leading-tight tracking-tight text-slate-900">{decision.headline[L]}</h2>
        <p className="mt-1 text-sm text-slate-700">{decision.why[L]}</p>
        {decision.fosterCited && (
          <details className="mt-1.5 text-[11px] text-slate-500">
            <summary className="cursor-pointer select-none">{lang === "IS" ? "Sýna nánar" : "Show details"}</summary>
            {decision.detail && <div className="mt-1">{decision.detail}</div>}
            <div className="mt-1 text-[10px]">Foster 1998 · sRPE × duration · 7-day rolling</div>
            <MethodologyLink />
          </details>
        )}
        {/* Hidden when check-in is off for this client. */}
        {checkinOn && !readinessDone && (
          <Link
            href="/player/checkin?return=/client"
            className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground"
          >
            {lang === "IS" ? "Opna check-in" : "Open check-in"}
          </Link>
        )}
      </section>

      {/* On a rest day corrective is the day's only work, so it comes first. */}
      {ex?.rest_day && corrective}

      {/* Today's workout, or the next one on a rest day */}
      {ex && hasBlocks && !ex.is_match_day ? (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <div className="text-xs font-semibold text-slate-500">
              {ex.rest_day
                ? `${lang === "IS" ? "Næsta æfing" : "Next session"}${ex.next_session_weekday ? ` · ${weekdayName(ex.next_session_weekday, lang)}` : ""}`
                : (() => {
                    const wpp = ex.weeks_per_phase ?? 3;
                    const total = wpp * (ex.total_phases ?? 4);
                    const cur = (ex.phase - 1) * wpp + (ex.week_in_phase ?? 1);
                    return lang === "IS" ? `Æfing dagsins · Vika ${cur} af ${total}` : `Today's session · Week ${cur} of ${total}`;
                  })()}
            </div>
            <h2 className="mt-0.5 font-display text-xl font-bold leading-tight text-slate-900">{ex.blocks[0]?.name ?? ex.phase_name}</h2>
            {ex.programme_name && (
              <div className="mt-0.5 text-xs text-slate-500">
                {ex.programme_name}
                {ex.weekday_index != null && !ex.rest_day ? ` · ${weekdayName(ex.weekday_index, lang)}` : ""}
              </div>
            )}
            {/* The trainer's chosen block, with its plain-language adjustment. */}
            {isSeasonPhase(ex.season_phase) && (
              <div className="mt-1 text-xs text-slate-600">
                {SEASON_PHASE_SPEC[ex.season_phase].label[L]} · {SEASON_PHASE_SPEC[ex.season_phase].note[L]}
              </div>
            )}
          </div>

          {/* Show prescribed exercises — for both today's session AND rest-day
              preview of next session. UI label above clarifies which it is.
              Block list capped to first 8 rows in either mode. */}
          {ex.blocks.slice(0, 1).map((b) => {
            const groups = buildSessionBlocks(b.rows);
            let shown = 0;
            const CAP = 8;
            return (
              <div key={b.name} className="space-y-2">
                {groups.map((g) => {
                  if (shown >= CAP) return null;
                  const grouped = g.kind !== "single";
                  return (
                    <div key={g.key} className={grouped ? "rounded-lg border border-indigo-100 bg-indigo-50/40 p-2" : ""}>
                      {grouped && (
                        <div className="mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{g.label[lang]}</span>
                            <span className="text-[11px] font-medium text-indigo-700">{g.rows.length} {lang === "IS" ? "æfingar saman" : "exercises together"}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{g.howto[lang]}</p>
                        </div>
                      )}
                      <div className={grouped ? "space-y-1" : ""}>
                        {g.rows.map((r, i) => {
                          if (shown >= CAP) return null;
                          shown += 1;
                          const vbt = sanitizeVbtPrescription(r.vbt);
                          return (
                            <div key={i} className="border-b border-slate-100 pb-1.5 last:border-0">
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                              <span className="flex min-w-0 items-center gap-1 font-medium text-slate-800">
                                {grouped && <span className="shrink-0 text-[11px] font-semibold text-indigo-400">{g.tag}{i + 1}</span>}
                                <span className="truncate">{r.exercise}</span>
                                <ExerciseInfo name={r.exercise} description={r.description} descriptionIs={r.description_is} videoUrl={r.video_url} className="shrink-0" />
                              </span>
                              <span className="text-xs text-slate-500 tabular-nums shrink-0">
                                {r.sets}×{r.reps}
                                {r.target_kg != null
                                  ? <> · <span className="font-semibold text-slate-900">{r.target_kg} kg</span>{r.pct1rm ? ` (${Math.round(r.pct1rm * 100)}%)` : ""}{r.target_auto ? <span className="ml-1 text-emerald-600" title={lang === "IS" ? "Sjálfvirk framvinda úr skráðum lyftum" : "Auto-progressed from your logged lifts"}>↑</span> : null}</>
                                  : (r.pct1rm ? ` · ${Math.round(r.pct1rm * 100)}%1RM` : "")}
                                {r.velocity ? ` · ${r.velocity} m/s` : ""}
                              </span>
                            </div>
                            {vbt && (
                              <p className="mt-0.5 text-[11.5px] leading-snug text-[#1f33b8]">
                                <span className="font-semibold">{lang === "IS" ? "Stangarhraði" : "Bar speed"}:</span> {formatVbtForPlayer(vbt, lang === "IS" ? "IS" : "EN").headline}
                              </p>
                            )}
                            {(() => {
                              const L = lang === "IS" ? "IS" : "EN";
                              const rx = rxForPtLift(ptInputFromClientRow(r), L);
                              return rx ? <LiftRxDetails rx={[rx]} lang={L} player bare /> : null;
                            })()}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {b.rows.length > CAP && (
                  <div className="text-[11px] text-slate-400 italic">
                    +{b.rows.length - CAP} {lang === "IS" ? "fleiri" : "more"}
                  </div>
                )}
              </div>
            );
          })}

          {/* Auto-progression caption (mobile has no hover for the ↑). */}
          {ex.blocks.some((b) => b.rows.some((r) => r.target_auto)) && (
            <div className="text-[10px] text-emerald-700">
              {lang === "IS"
                ? "↑ sjálfvirk framvinda — þyngd hækkuð út frá þínum skráðu lyftum."
                : "↑ auto-progressed — weight raised from your logged lifts."}
            </div>
          )}


          {!ex.rest_day && (
            <Link
              href="/client/log"
              className="flex min-h-12 items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground"
            >
              {data.session_logged_today
                ? (lang === "IS" ? "Halda áfram með æfingu" : "Continue session")
                : (lang === "IS" ? "Byrja æfingu" : "Start session")}
            </Link>
          )}

          {/* Move today's session to another day when life gets in the way
              (the trainer's own plan only — starter programmes can't be moved). */}
          {canMove && (!ex.rest_day || ex.moved_to) && (
            <ClientMoveSessionButton
              lang={L}
              movedTo={ex.moved_to ?? null}
              movedFrom={ex.moved_from ?? null}
              endDate={null}
              onChanged={() => { void load(); }}
            />
          )}

          {/* Closed loop — retest / test nudges. Stale tests = retest; lifts
              with a %1RM but no test yet = test to unlock target weights. */}
          {/* The trainer records strength tests, so the nudge says to ask them
              (and opens the chat) rather than sending the client to a page
              they can't act on. */}
          {(ex.retest_due?.length || ex.needs_test?.length) ? (
            <Link href="/client/chat" className="block rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 hover:bg-emerald-100">
              {ex.retest_due && ex.retest_due.length > 0 ? (
                <div className="text-[12px] text-emerald-900">
                  <span className="font-semibold">{lang === "IS" ? "Tími á endurprófi" : "Time to retest"}:</span>{" "}
                  {ex.retest_due.join(", ")}
                  <span className="text-emerald-700"> — {lang === "IS" ? "biddu þjálfarann um nýtt próf svo þyngdirnar haldist réttar →" : "ask your trainer for a new test so target weights stay accurate →"}</span>
                </div>
              ) : (
                <div className="text-[12px] text-emerald-900">
                  <span className="font-semibold">{lang === "IS" ? "Biddu þjálfarann um styrkpróf" : "Ask your trainer for a strength test"}:</span>{" "}
                  {ex.needs_test!.join(", ")}
                  <span className="text-emerald-700"> — {lang === "IS" ? "þá færðu þyngdir í kílóum í stað prósenta →" : "then you get target weights in kg instead of percentages →"}</span>
                </div>
              )}
            </Link>
          ) : null}
        </section>
      ) : (!ex || (!hasBlocks && !ex.rest_day)) ? (
        <Link href="/client/log" className="flex min-h-12 items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground">
          {lang === "IS" ? "Skrá æfingu" : "Log session"}
        </Link>
      ) : null}

      {/* A session moved away can leave today empty; keep the undo reachable. */}
      {canMove && ex?.moved_to && !hasBlocks && (
        <ClientMoveSessionButton lang={L} movedTo={ex.moved_to} movedFrom={ex.moved_from ?? null} endDate={null} onChanged={() => { void load(); }} />
      )}

      {!ex?.rest_day && corrective}

      {/* Session-logged and weekly recap prompts sit below the session. */}
      {/* hasSessionToday stays false here on purpose: the session card above
          already carries the Start button, so a second "session today" banner
          would repeat it. The banner is for screens without the session card. */}
      <ClientNudges lang={L} hasSessionToday={false} sessionLoggedToday={!!data.session_logged_today} />

      <MomentumCard lang={L} compact />

      {/* Daily AI Coach — labelled AI, cites real signals (lazy, hides if none). */}
      <AICoachCard lang={L} />

      {/* This week at a glance — all 7 days, today highlighted (hides if the
          week has no sessions). Answers "what's on the other days?". */}
      <ClientWeekOverview lang={L} />

      {/* Full programme overview — shown by default for PT clients; the coach
          can hide it per client (read-only, no loads). */}
      <ClientProgrammeOverview lang={L} />

      {/* Move any of my sessions, either direction (the trainer's own plan only). */}
      {canMove && <ClientMoveSessionControl lang={L} onChanged={() => { void load(); }} />}

      {/* Everything else, one line each. */}
      <nav aria-label={lang === "IS" ? "Meira" : "More"} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {pr && pr.forecast.eta_days !== null && (
          <Link href="/client/progression" className={rowClass}>
            <span className="truncate">{lang === "IS" ? "Næsta met" : "Next record"}: {pr.exercise_name}</span>
            <span className="shrink-0 text-slate-600">
              ~{pr.forecast.target_kg} kg · {pr.forecast.eta_weeks} {lang === "IS" ? "vikur" : "weeks"}
            </span>
          </Link>
        )}
        <Link href="/client/profile" className={rowClass}>
          <span>{lang === "IS" ? "Líkamsþyngd" : "Body weight"}</span>
          <span className="text-slate-600">
            {data.bodyweight ? `${data.bodyweight.latest.weight_kg.toFixed(1)} kg` : (lang === "IS" ? "Skrá þyngd" : "Log weight")}
          </span>
        </Link>
        <Link href="/client/progression#reports" className={rowClass}>
          <span>{lang === "IS" ? "Skýrslur" : "Reports"}</span>
        </Link>
      </nav>
    </div>
  );
}

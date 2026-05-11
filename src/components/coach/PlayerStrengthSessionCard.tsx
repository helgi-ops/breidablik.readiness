"use client";

import { useEffect, useState, type FC } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import CoachAssignProtocolButton from "@/components/recovery/CoachAssignProtocolButton";
import { EXERCISE_LIBRARY } from "@/lib/micropulse/strengthProgramming/exerciseLibrary";
import type {
  StrengthSession,
  MdContext,
  AppliedAdaptation,
  ExerciseCategory,
} from "@/lib/micropulse/strengthProgramming/types";

/**
 * PlayerStrengthSessionCard — Individualized strength session viewer.
 *
 * Renders the prescribed session from /api/coach/player/[id]/strength-session
 * with exercise-level dosing, modification reasons and the audit trail of
 * adaptation rules that fired. Coach can switch MD-context (MD-4 / MD-3 /
 * MD-2) via inline buttons.
 *
 * Self-hides when the player is OFF, on a match day or has an active injury
 * (returns null instead of rendering an empty container).
 */
export const PlayerStrengthSessionCard: FC<{ playerId: string }> = ({ playerId }) => {
  const [lang] = useLang();
  const [session, setSession] = useState<StrengthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [md, setMd] = useState<MdContext | "AUTO">("AUTO");
  const [showAdaptations, setShowAdaptations] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const [coachNote, setCoachNote] = useState("");
  const [showNoteBox, setShowNoteBox] = useState(false);
  const [swapTarget, setSwapTarget] = useState<
    { blockId: string; position: number; originalId: string; category: ExerciseCategory } | null
  >(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Trigger a refetch of the session (used after swap apply / clear)
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) {
          if (alive) setLoading(false);
          return;
        }
        const qs = md === "AUTO" ? "" : `?md=${md.replace("MD-", "")}`;
        const res = await fetch(`/api/coach/player/${playerId}/strength-session${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (alive) setLoading(false);
          return;
        }
        const json = await res.json();
        if (!alive) return;
        setSession(json.session ?? null);
      } catch {
        /* silent — card just won't render */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [playerId, md, reloadKey]);

  if (loading) {
    return (
      <div className="rounded-lg border-2 border-slate-200 bg-slate-50 p-4">
        <div className="h-3 w-32 bg-slate-200 rounded animate-pulse" />
        <div className="mt-2 h-2 w-48 bg-slate-200 rounded animate-pulse" />
      </div>
    );
  }
  if (!session) return null;

  const t = (en: string, is: string) => (lang === "IS" ? is : en);
  const totalExercises = session.blocks.reduce((s, b) => s + b.exercises.length, 0);
  const noStrength = totalExercises === 0;

  return (
    <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/60 p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-indigo-900">
            {t("Strength session", "Styrktaræfing")}
          </h3>
          <p className="mt-0.5 text-xs text-indigo-800 opacity-80">
            {t(
              "Individualized program based on today's signals",
              "Sérstillt prógramm út frá daglegum gögnum",
            )}
          </p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-md bg-indigo-700 text-white px-2.5 py-1 text-xs font-bold">
          {session.mdContext}
          <span className="ml-1 opacity-80">· ~{session.durationMin} min</span>
        </div>
      </div>

      {/* MD-context picker */}
      <div className="mt-3 flex items-center gap-1 text-xs">
        <span className="text-indigo-700 mr-1">{t("Context:", "Samhengi:")}</span>
        {(["AUTO", "MD-4", "MD-3", "MD-2", "MD-1", "MD+1"] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setMd(opt)}
            className={`rounded px-2 py-0.5 transition ${
              md === opt
                ? "bg-indigo-600 text-white font-semibold"
                : "bg-white text-indigo-800 border border-indigo-200 hover:bg-indigo-100"
            }`}
          >
            {opt === "AUTO" ? t("Auto", "Sjálfvalið") : opt}
          </button>
        ))}
      </div>

      {/* Summary */}
      <p className="mt-3 text-sm text-indigo-900 leading-snug">
        {lang === "IS" ? session.summaryIS : session.summaryEN}
      </p>

      {noStrength ? (
        // Stripped session — verdict is RECOVERY/HOLD, player on rehab, or
        // adaptation engine cleared all blocks. Surface rehab assignment
        // path when injury is the reason so coach can pick a protocol
        // straight from this card.
        (() => {
          const injuryBlocked = session.appliedAdaptations.some(
            (a) => a.ruleId === "INJURY_BLOCK",
          );
          return (
            <div className="mt-3 space-y-2">
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {injuryBlocked
                  ? t(
                      "Player is on rehab — no team strength session today. Assign a rehab protocol below.",
                      "Leikmaður er á rehab — engin styrktaræfing í dag. Úthlutaðu rehab protocol fyrir neðan.",
                    )
                  : t(
                      "No team strength session today. See decision summary for details.",
                      "Engin styrktaræfing í dag. Sjá decision summary fyrir frekari upplýsingar.",
                    )}
              </div>
              {injuryBlocked && (
                <div className="rounded-md border border-indigo-200 bg-white p-3">
                  <p className="mb-2 text-xs font-semibold text-indigo-900">
                    {t("Assign a rehab / recovery protocol", "Úthluta rehab / recovery protocol")}
                  </p>
                  <p className="mb-3 text-[11px] text-slate-600 leading-relaxed">
                    {t(
                      "Pulls from the recovery_protocols library (tendinopathy stages, ankle sprain 5-stage, post-match restore, etc.). The protocol shows up in the player's app exactly like a sent strength session.",
                      "Sækir úr recovery_protocols safninu (sin-rehab fasar, ökla rehab 5-stiga, post-match restore, o.fl.). Protocol-inn birtist í app leikmannsins eins og send styrktaræfing.",
                    )}
                  </p>
                  <CoachAssignProtocolButton playerId={playerId} />
                </div>
              )}
            </div>
          );
        })()
      ) : (
        <>
          {/* Blocks */}
          <div className="mt-3 space-y-3">
            {session.blocks.map((block) => (
              <div
                key={block.id}
                className="rounded-md border border-indigo-200 bg-white p-3"
              >
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-indigo-800">
                    {lang === "IS" ? block.titleIS : block.titleEN}
                  </h4>
                  <span className="text-[10px] uppercase tracking-wide text-indigo-500">
                    {block.type.replace(/_/g, " ").toLowerCase()}
                  </span>
                </div>
                {(block.noteEN || block.noteIS) && (
                  <p className="mt-1 text-[11px] text-slate-600 italic leading-snug">
                    {lang === "IS" ? (block.noteIS ?? block.noteEN) : (block.noteEN ?? block.noteIS)}
                  </p>
                )}
                <ul className="mt-2 space-y-1.5">
                  {block.exercises.map((ex, i) => (
                    <li
                      key={`${ex.exerciseId}-${i}`}
                      className={`rounded border px-2.5 py-1.5 text-xs ${
                        ex.modificationReason
                          ? "border-amber-200 bg-amber-50"
                          : ex.isAdaptiveAddition
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900">
                          {lang === "IS" ? ex.nameIS : ex.nameEN}
                        </span>
                        <span className="text-[11px] tabular-nums text-slate-700">
                          {ex.dose.sets} × {ex.dose.reps} · {ex.dose.intensity} · rest {ex.dose.rest}
                          {ex.dose.intraRepRestSec ? ` · cluster ${ex.dose.intraRepRestSec}s` : ""}
                          {ex.dose.velocityLossCap ? ` · stop @ −${ex.dose.velocityLossCap}%v` : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSwapTarget({
                            blockId: block.id,
                            position: i,
                            originalId: ex.exerciseId,
                            category: ex.category,
                          })}
                          className="text-[10px] text-indigo-700 hover:text-indigo-900 underline"
                          title={t("Swap this exercise", "Skipta um æfingu")}
                        >
                          ↻ {t("swap", "skipta")}
                        </button>
                      </div>
                      {ex.dose.cue && (
                        <p className="mt-0.5 text-[10px] text-slate-600 italic">→ {ex.dose.cue}</p>
                      )}
                      {ex.modificationReason && (
                        <p className="mt-0.5 text-[10px] text-amber-800 font-medium">
                          ⚙ {ex.modificationReason}
                        </p>
                      )}
                      {ex.isAdaptiveAddition && !ex.modificationReason && (
                        <p className="mt-0.5 text-[10px] text-emerald-800 font-medium">
                          ＋ {t("Added by adaptation engine", "Bætt við af adaptation engine")}
                        </p>
                      )}
                      {ex.rationale && (
                        <p className="mt-0.5 text-[10px] text-slate-500 leading-snug">
                          {ex.rationale}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Adaptations audit trail */}
          {session.appliedAdaptations.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowAdaptations((v) => !v)}
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
              >
                {showAdaptations ? "▾" : "▸"}{" "}
                {t(
                  `Why these changes? (${session.appliedAdaptations.length} adaptation${session.appliedAdaptations.length === 1 ? "" : "s"})`,
                  `Af hverju þessar breytingar? (${session.appliedAdaptations.length} sérstilling${session.appliedAdaptations.length === 1 ? "" : "ar"})`,
                )}
              </button>
              {showAdaptations && (
                <ul className="mt-2 space-y-1.5">
                  {session.appliedAdaptations.map((a: AppliedAdaptation) => (
                    <li
                      key={a.ruleId}
                      className="rounded border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px]"
                    >
                      <p className="font-semibold text-indigo-900">
                        {lang === "IS" ? a.triggerIS : a.triggerEN}
                      </p>
                      <p className="mt-0.5 text-slate-700">
                        → {lang === "IS" ? a.actionIS : a.actionEN}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500 italic">{a.evidence}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {/* Send-to-player block (only when there's a real session) */}
      {!noStrength && (
        <div className="mt-4 border-t border-indigo-200 pt-3">
          {!showNoteBox ? (
            <button
              type="button"
              onClick={() => setShowNoteBox(true)}
              disabled={sendStatus === "sending" || sendStatus === "sent"}
              className={`w-full rounded-md px-3 py-2 text-xs font-semibold transition ${
                sendStatus === "sent"
                  ? "bg-emerald-100 text-emerald-800 cursor-default"
                  : sendStatus === "sending"
                    ? "bg-indigo-200 text-indigo-700 cursor-wait"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
              title={t(
                "Sends this session as a message to the player's app with a push notification.",
                "Sendir þessa æfingu sem skilaboð í app leikmannsins með push tilkynningu.",
              )}
            >
              {sendStatus === "sent"
                ? t("✓ Sent to player's app", "✓ Sent í app leikmannsins")
                : sendStatus === "sending"
                  ? t("Sending…", "Sendi…")
                  : t("📲 Send to player's app", "📲 Senda í app leikmannsins")}
            </button>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-indigo-900">
                {t("Optional note for the player:", "Valfrjáls athugasemd til leikmanns:")}
              </label>
              <textarea
                value={coachNote}
                onChange={(e) => setCoachNote(e.target.value.slice(0, 280))}
                rows={2}
                placeholder={t(
                  "e.g. 'Pair this with your warm-up before tomorrow's session.'",
                  "t.d. 'Tengdu þetta við upphitun fyrir æfinguna á morgun.'",
                )}
                className="w-full rounded border border-indigo-200 bg-white px-2 py-1.5 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setSendStatus("sending");
                    setSendError(null);
                    try {
                      const sb = getSupabaseClient();
                      const { data: sess } = await sb.auth.getSession();
                      const token = sess?.session?.access_token;
                      if (!token) {
                        setSendError(t("Not signed in", "Ekki innskráð(ur)"));
                        setSendStatus("error");
                        return;
                      }
                      const res = await fetch(`/api/coach/player/${playerId}/send-strength-session`, {
                        method: "POST",
                        headers: {
                          Authorization: `Bearer ${token}`,
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          md: md === "AUTO" ? undefined : md.replace("MD-", "").replace("MD+", "+"),
                          note: coachNote.trim() || undefined,
                          lang,
                        }),
                      });
                      const json = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        setSendError(typeof json?.error === "string" ? json.error : "Send failed");
                        setSendStatus("error");
                        return;
                      }
                      setSendStatus("sent");
                      setShowNoteBox(false);
                      setCoachNote("");
                    } catch (e) {
                      setSendError(e instanceof Error ? e.message : "Network error");
                      setSendStatus("error");
                    }
                  }}
                  disabled={sendStatus === "sending"}
                  className="flex-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:bg-indigo-300"
                >
                  {sendStatus === "sending"
                    ? t("Sending…", "Sendi…")
                    : t("Send", "Senda")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNoteBox(false);
                    setCoachNote("");
                    setSendStatus("idle");
                  }}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  {t("Cancel", "Hætta við")}
                </button>
              </div>
              {sendError && (
                <p className="text-[10px] text-rose-700">{sendError}</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[10px] text-indigo-700/70">
        <span>
          {t("Duration ~", "Lengd ~")}
          {session.durationMin} min
          {session.vbtAutoRegulated && <span className="ml-2">· VBT auto-regulated</span>}
        </span>
        <span>
          {t("Confidence", "Vissustig")}: {Math.round(session.confidence * 100)}%
        </span>
      </div>

      {/* Coach exercise swap modal — opens when coach clicks "↻ swap" next
          to any prescribed exercise. Shows all exercises in the same
          category from the library so the substitution is mechanically
          sensible (e.g. swap one compound for another, not for a mobility
          drill). */}
      {swapTarget && (() => {
        const candidates = EXERCISE_LIBRARY.filter((e) => e.category === swapTarget.category);
        return (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setSwapTarget(null)}
          >
            <div
              className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  {t("Swap exercise", "Skipta um æfingu")}
                </h3>
                <button
                  type="button"
                  onClick={() => setSwapTarget(null)}
                  className="text-slate-500 hover:text-slate-900"
                  aria-label={t("Close", "Loka")}
                >
                  ✕
                </button>
              </div>
              <p className="mb-3 text-xs text-slate-600">
                {t(
                  `Choose a replacement from the ${swapTarget.category.replace(/_/g, " ").toLowerCase()} library. Saved for today only.`,
                  `Veldu staðgengil úr ${swapTarget.category.replace(/_/g, " ").toLowerCase()} safninu. Vistað bara fyrir daginn í dag.`,
                )}
              </p>
              <ul className="space-y-1">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={c.id === swapTarget.originalId}
                      onClick={async () => {
                        try {
                          const sb = getSupabaseClient();
                          const { data: sess } = await sb.auth.getSession();
                          const token = sess?.session?.access_token;
                          if (!token) return;
                          await fetch(`/api/coach/player/${playerId}/strength-override`, {
                            method: "POST",
                            headers: {
                              Authorization: `Bearer ${token}`,
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              blockId: swapTarget.blockId,
                              position: swapTarget.position,
                              exerciseId: c.id,
                              originalExerciseId: swapTarget.originalId,
                            }),
                          });
                          setSwapTarget(null);
                          reload();
                        } catch {
                          // silent
                        }
                      }}
                      className={`w-full rounded border px-2 py-1.5 text-left text-xs transition ${
                        c.id === swapTarget.originalId
                          ? "border-indigo-300 bg-indigo-50 text-indigo-900 cursor-default"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">
                          {lang === "IS" ? c.nameIS : c.nameEN}
                        </span>
                        {c.id === swapTarget.originalId && (
                          <span className="text-[10px] text-indigo-700">
                            {t("(current)", "(núverandi)")}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-500 leading-snug">
                        {c.evidence}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const sb = getSupabaseClient();
                      const { data: sess } = await sb.auth.getSession();
                      const token = sess?.session?.access_token;
                      if (!token) return;
                      await fetch(`/api/coach/player/${playerId}/strength-override`, {
                        method: "DELETE",
                        headers: {
                          Authorization: `Bearer ${token}`,
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          blockId: swapTarget.blockId,
                          position: swapTarget.position,
                        }),
                      });
                      setSwapTarget(null);
                      reload();
                    } catch {
                      // silent
                    }
                  }}
                  className="text-xs text-rose-700 hover:text-rose-900 underline"
                >
                  {t("Revert to engine choice", "Setja aftur á tillögu kerfis")}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default PlayerStrengthSessionCard;

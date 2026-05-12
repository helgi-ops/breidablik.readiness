"use client";

/**
 * Recovery Protocol TV display — fullscreen wall-poster view that shows
 * the WHOLE protocol at once so players can read the entire routine at a
 * glance and follow it at their own pace. Designed to be cast / mirrored
 * to a locker-room display.
 *
 * URL params (all optional):
 *   ?protocol=<slug>     Pin a specific protocol (default: post_match_vst_reset).
 *   ?focus=1             Switch to single-drill focused mode (auto-advancing
 *                        countdown timer, useful for guided group sessions).
 *
 * In the default poster view there is no countdown timer — players move
 * through the drills themselves. Use ?focus=1 when a coach wants the screen
 * to lead the team through it with an auto-advancing timer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  CATEGORY_LABELS,
  EVIDENCE_LABELS,
  type RecoveryDrill,
  type RecoveryProtocol,
} from "@/lib/recovery/types";

const DEFAULT_PROTOCOL_SLUG = "post_match_vst_reset";
const DEFAULT_INTERVAL_SEC = 30;

type FlatStep = {
  sectionIdx: number;
  drillIdx: number;
  globalIdx: number;
  drill: RecoveryDrill;
};

function buildPlaylist(p: RecoveryProtocol): FlatStep[] {
  const steps: FlatStep[] = [];
  let global = 0;
  for (let si = 0; si < p.sections.length; si += 1) {
    const sec = p.sections[si];
    for (let di = 0; di < sec.drills.length; di += 1) {
      steps.push({ sectionIdx: si, drillIdx: di, globalIdx: global, drill: sec.drills[di] });
      global += 1;
    }
  }
  return steps;
}

/** Try to pull a duration from `reps_or_time` for the focused-mode timer. */
function inferStepSeconds(reps_or_time: string, fallbackSec: number): number {
  const text = reps_or_time.toLowerCase();
  const setsXSec = text.match(/(\d+)\s*[×x]\s*(\d+)\s*s/);
  if (setsXSec) {
    const sets = Number(setsXSec[1]);
    const sec = Number(setsXSec[2]);
    if (Number.isFinite(sets) && Number.isFinite(sec)) return sets * sec;
  }
  const sec = text.match(/(\d+)\s*s(ec|econds?)?\b/) || text.match(/(\d+)\s*seconds?/);
  if (sec) {
    const n = Number(sec[1]);
    if (Number.isFinite(n)) return n;
  }
  const repRange = text.match(/(\d+)[–-](\d+)\s*(reps?|breaths?|rolls?)/);
  if (repRange) {
    const high = Number(repRange[2]);
    if (Number.isFinite(high)) return Math.max(15, high * 5);
  }
  const repSingle = text.match(/(\d+)\s*(reps?|breaths?|rolls?)/);
  if (repSingle) {
    const reps = Number(repSingle[1]);
    if (Number.isFinite(reps)) return Math.max(15, reps * 5);
  }
  return fallbackSec;
}

/** Color-code sections so the wall layout reads as distinct blocks. */
const SECTION_PALETTE = [
  { ring: "border-violet-400/40", bg: "bg-violet-500/10", title: "text-violet-200", chip: "bg-violet-500/20 border-violet-400/40 text-violet-100" },
  { ring: "border-sky-400/40", bg: "bg-sky-500/10", title: "text-sky-200", chip: "bg-sky-500/20 border-sky-400/40 text-sky-100" },
  { ring: "border-emerald-400/40", bg: "bg-emerald-500/10", title: "text-emerald-200", chip: "bg-emerald-500/20 border-emerald-400/40 text-emerald-100" },
  { ring: "border-amber-400/40", bg: "bg-amber-500/10", title: "text-amber-200", chip: "bg-amber-500/20 border-amber-400/40 text-amber-100" },
  { ring: "border-rose-400/40", bg: "bg-rose-500/10", title: "text-rose-200", chip: "bg-rose-500/20 border-rose-400/40 text-rose-100" },
];

export default function RecoveryDisplayClient() {
  const sp = useSearchParams();
  const protocolSlug = sp.get("protocol") || DEFAULT_PROTOCOL_SLUG;
  const focusMode = sp.get("focus") === "1";

  const [protocol, setProtocol] = useState<RecoveryProtocol | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) {
          setError("Sign in to view recovery protocols");
          return;
        }
        const res = await fetch("/api/recovery-protocols", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          return;
        }
        const json = (await res.json()) as { ok: boolean; protocols: RecoveryProtocol[] };
        const found = json.protocols.find((p) => p.slug === protocolSlug) ?? json.protocols[0] ?? null;
        if (!found) {
          setError("No recovery protocols configured");
          return;
        }
        if (!cancelled) setProtocol(found);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [protocolSlug]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-rose-200">
        <div className="text-2xl">{error}</div>
      </div>
    );
  }

  if (!protocol) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        <div className="text-2xl">Loading recovery protocol…</div>
      </div>
    );
  }

  return focusMode ? (
    <FocusedView protocol={protocol} />
  ) : (
    <WallPosterView protocol={protocol} />
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  WALL POSTER VIEW — full protocol visible at once                     */
/* ────────────────────────────────────────────────────────────────────── */

function WallPosterView({ protocol }: { protocol: RecoveryProtocol }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-10 py-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
              Recovery Protocol
            </div>
            <h1 className="mt-2 text-5xl font-extrabold tracking-tight">{protocol.title}</h1>
            <p className="mt-2 max-w-4xl text-lg text-slate-300">{protocol.goal}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2 text-sm">
            <span className="rounded-md border border-violet-400/40 bg-violet-500/20 px-3 py-1 font-medium text-violet-100">
              {CATEGORY_LABELS[protocol.category]}
            </span>
            <span className="rounded-md border border-amber-400/40 bg-amber-500/15 px-3 py-1 font-medium text-amber-100">
              {EVIDENCE_LABELS[protocol.evidence_tier]}
            </span>
            <span className="rounded-md border border-white/20 bg-white/5 px-3 py-1 text-slate-200">
              ~{protocol.duration_min} min total
            </span>
          </div>
        </div>
        {protocol.when_to_use && (
          <div className="mt-3 text-base text-slate-300">
            <span className="font-semibold uppercase tracking-wide text-slate-400">
              When to use ·{" "}
            </span>
            {protocol.when_to_use}
          </div>
        )}
      </header>

      {/* Sections grid — all sections visible, drills inside each */}
      <main className="flex-1 px-10 py-8">
        <div
          className={`grid gap-6 ${
            protocol.sections.length >= 3
              ? "grid-cols-1 lg:grid-cols-3"
              : protocol.sections.length === 2
                ? "grid-cols-1 lg:grid-cols-2"
                : "grid-cols-1"
          }`}
        >
          {protocol.sections.map((sec, si) => {
            const palette = SECTION_PALETTE[si % SECTION_PALETTE.length];
            return (
              <section
                key={si}
                className={`rounded-2xl border ${palette.ring} ${palette.bg} p-6`}
              >
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <div className={`text-2xl font-bold ${palette.title}`}>
                    {si + 1}. {sec.title}
                  </div>
                  <span
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium ${palette.chip}`}
                  >
                    {sec.duration_min} min
                  </span>
                </div>
                <p className="mb-4 text-sm leading-snug text-slate-300">{sec.description}</p>

                <ul className="space-y-3">
                  {sec.drills.map((d, di) => (
                    <li
                      key={di}
                      className="rounded-xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xl font-bold tracking-tight text-white">
                          {d.name}
                        </span>
                        <span className="shrink-0 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-sm font-medium text-emerald-200">
                          {d.reps_or_time}
                        </span>
                      </div>
                      {d.cues.length > 0 && (
                        <ul className="mt-2 space-y-1.5 text-base leading-snug text-slate-200">
                          {d.cues.map((c, ci) => (
                            <li key={ci} className="flex items-start gap-2">
                              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </main>

      {/* Footer hint — links to focused mode + cite list */}
      <footer className="border-t border-white/10 bg-black/30 px-10 py-4 text-xs text-slate-400">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            For a guided group session, switch to{" "}
            <a
              href={`?protocol=${protocol.slug}&focus=1`}
              className="font-medium text-violet-200 underline decoration-violet-400/40 underline-offset-2 hover:text-violet-100"
            >
              focused / countdown mode
            </a>
            .
          </div>
          {protocol.citations && protocol.citations.length > 0 && (
            <div className="text-[11px] text-slate-500">
              Refs: {protocol.citations.map((c) => c.label.split(" — ")[0]).slice(0, 3).join(" · ")}
              {protocol.citations.length > 3 ? " · …" : ""}
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  FOCUSED VIEW — single drill at a time with countdown timer           */
/*  (preserved for guided group sessions where the screen leads timing)  */
/* ────────────────────────────────────────────────────────────────────── */

function FocusedView({ protocol }: { protocol: RecoveryProtocol }) {
  const playlist = useMemo<FlatStep[]>(() => buildPlaylist(protocol), [protocol]);
  const [stepIdx, setStepIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const tickRef = useRef<number | null>(null);

  const step = playlist[stepIdx] ?? null;
  const stepSeconds = step ? inferStepSeconds(step.drill.reps_or_time, DEFAULT_INTERVAL_SEC) : DEFAULT_INTERVAL_SEC;
  const [secondsLeft, setSecondsLeft] = useState(stepSeconds);

  useEffect(() => setSecondsLeft(stepSeconds), [stepIdx, stepSeconds]);

  useEffect(() => {
    if (paused || playlist.length === 0) return;
    if (tickRef.current != null) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setStepIdx((i) => (i + 1) % playlist.length);
          return stepSeconds;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current != null) window.clearInterval(tickRef.current);
    };
  }, [paused, playlist.length, stepSeconds]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        setStepIdx((i) => (playlist.length ? (i + 1) % playlist.length : 0));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setStepIdx((i) => (playlist.length ? (i - 1 + playlist.length) % playlist.length : 0));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [playlist.length]);

  const goNext = useCallback(
    () => setStepIdx((i) => (playlist.length ? (i + 1) % playlist.length : 0)),
    [playlist.length],
  );
  const goPrev = useCallback(
    () => setStepIdx((i) => (playlist.length ? (i - 1 + playlist.length) % playlist.length : 0)),
    [playlist.length],
  );

  if (!step) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        <div className="text-2xl">No drills configured</div>
      </div>
    );
  }

  const sectionTitle = protocol.sections[step.sectionIdx]?.title ?? "";
  const progressPct = stepSeconds > 0 ? ((stepSeconds - secondsLeft) / stepSeconds) * 100 : 0;

  return (
    <div
      className="flex min-h-screen flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white"
      onClick={() => setPaused((p) => !p)}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-10 py-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
            Recovery Protocol · Focused
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{protocol.title}</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <a
            href={`?protocol=${protocol.slug}`}
            className="rounded-md border border-white/20 bg-white/5 px-3 py-1 text-slate-200 hover:bg-white/10"
          >
            ← Wall view
          </a>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-10 py-6">
        <div className="mb-3 flex items-baseline gap-3 text-sm uppercase tracking-[0.2em] text-slate-400">
          <span>
            Section {step.sectionIdx + 1} · {sectionTitle}
          </span>
          <span className="text-slate-500">·</span>
          <span>
            Drill {step.globalIdx + 1} of {playlist.length}
          </span>
        </div>
        <h2 className="mb-2 text-center text-7xl font-extrabold leading-tight tracking-tight">
          {step.drill.name}
        </h2>
        <div className="mb-8 text-3xl font-medium text-emerald-300">{step.drill.reps_or_time}</div>
        {step.drill.cues.length > 0 && (
          <ul className="mx-auto max-w-4xl space-y-3 text-2xl leading-snug text-slate-100">
            {step.drill.cues.map((c, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-2 inline-block h-2 w-2 shrink-0 rounded-full bg-sky-400" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-white/10 bg-black/30 px-10 py-5">
        <div className="flex items-center justify-between gap-6">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="rounded-md border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
          >
            ◀ Prev
          </button>
          <div className="flex flex-1 flex-col items-center">
            <div className="text-7xl font-bold tabular-nums">
              {String(Math.floor(secondsLeft / 60)).padStart(1, "0")}:
              {String(secondsLeft % 60).padStart(2, "0")}
            </div>
            <div className="mt-2 text-xs uppercase tracking-[0.25em] text-slate-400">
              {paused ? "Paused — tap or press space to resume" : "Auto-advancing"}
            </div>
            <div className="mt-3 h-1.5 w-full max-w-2xl overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-emerald-400 transition-all"
                style={{ width: `${progressPct.toFixed(1)}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className="rounded-md border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
          >
            Next ▶
          </button>
        </div>
      </div>
    </div>
  );
}

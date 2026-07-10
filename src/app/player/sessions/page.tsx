"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PtClientGuard from "@/components/auth/PtClientGuard";
import {
  type PublishedSession,
  type SessionCopyT,
  SessionCopy,
  dateLabel,
  sessionStats,
} from "@/components/team/sessionShared";

export default function PlayerSessionsPage() {
  const router = useRouter();
  const [lang] = useLang();
  const t = SessionCopy[lang];
  const locale = lang === "IS" ? "is-IS" : "en-GB";

  const [sessions, setSessions] = useState<PublishedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (!token) {
        router.replace("/login?next=/player/sessions");
        return;
      }
      const res = await fetch("/api/team/training-sessions?range=upcoming", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.ok) setSessions(json.sessions ?? []);
      else setError(json.error ?? "error");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  const hero = sessions[0] ?? null;
  const rest = sessions.slice(1);

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-[var(--surface,#f4f2ec)] px-4 pb-16">
      <PtClientGuard />

      {/* Sticky escape bar — this route sits outside the tab shell. */}
      <div
        className="sticky top-0 z-10 -mx-4 mb-4 border-b border-zinc-200 bg-[var(--surface,#f4f2ec)]/90 px-4 pb-3 backdrop-blur"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <Link
          href="/player"
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 active:bg-zinc-100"
        >
          <span aria-hidden className="text-base leading-none">←</span> {t.back}
        </Link>
      </div>

      <header className="mb-5 px-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900">{t.heading}</h1>
        <p className="mt-0.5 text-sm text-zinc-500">{t.subtitle}</p>
      </header>

      {loading ? (
        <div className="py-16 text-center text-sm text-zinc-400">{t.loading}</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">{error}</div>
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 py-16 text-center text-sm text-zinc-500">
          {t.empty}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Hero — the next (or today's) session, prominent. */}
          {hero && <HeroCard s={hero} t={t} locale={locale} lang={lang} />}

          {rest.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                {t.upcoming}
              </h2>
              <div className="space-y-2.5">
                {rest.map((s) => <RowCard key={s.id} s={s} t={t} locale={locale} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function HeroCard({ s, t, locale, lang }: { s: PublishedSession; t: SessionCopyT; locale: string; lang: "IS" | "EN" }) {
  const { drillCount, duration, targetPl } = sessionStats(s);
  const dl = dateLabel(s.session_date, locale, t);
  const isToday = t.today === dl;
  return (
    <Link
      href={`/player/sessions/${s.id}`}
      className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md active:scale-[0.995]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${isToday ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"}`}>
          {dl}
        </span>
        {s.md_day && (
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">{s.md_day}</span>
        )}
      </div>
      <h3 className="mt-2 font-display text-xl font-bold tracking-tight text-zinc-900">{s.session_name || "–"}</h3>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label={t.drills} value={String(drillCount)} />
        <Stat label={t.duration} value={duration != null ? `${duration}${t.minShort}` : "–"} />
        <Stat label={t.load} value={targetPl != null ? String(targetPl) : "–"} />
      </div>

      {s.focus_points && s.focus_points.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {s.focus_points.slice(0, 3).map((f, i) => (
            <span key={i} className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200">{f}</span>
          ))}
        </div>
      )}

      <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary,#2740e6)]">
        {lang === "IS" ? "Opna æfingu" : "Open session"} <span aria-hidden>→</span>
      </div>
    </Link>
  );
}

function RowCard({ s, t, locale }: { s: PublishedSession; t: SessionCopyT; locale: string }) {
  const { drillCount, duration, targetPl } = sessionStats(s);
  return (
    <Link
      href={`/player/sessions/${s.id}`}
      className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm transition hover:shadow-md"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600">
            {dateLabel(s.session_date, locale, t)}
          </span>
          {s.md_day && <span className="text-[10px] font-semibold text-zinc-400">{s.md_day}</span>}
        </div>
        <div className="mt-0.5 truncate text-sm font-semibold text-zinc-900">{s.session_name || "–"}</div>
        <div className="text-[11px] text-zinc-500">
          {drillCount} {t.drills.toLowerCase()}
          {duration != null ? ` · ${duration} ${t.minShort}` : ""}
          {targetPl != null ? ` · ${t.load} ${targetPl}` : ""}
        </div>
      </div>
      <span aria-hidden className="shrink-0 text-zinc-300">→</span>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-2.5 py-2 text-center">
      <div className="font-display text-lg font-bold leading-none text-zinc-900">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-zinc-400">{label}</div>
    </div>
  );
}

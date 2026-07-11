"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PtClientGuard from "@/components/auth/PtClientGuard";
import {
  type PublishedSession,
  SessionCopy,
  dateLabel,
  sessionStats,
} from "@/components/team/sessionShared";
import SessionDrillList from "../SessionDrillList";

export default function PlayerSessionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const [lang] = useLang();
  const t = SessionCopy[lang];
  const locale = lang === "IS" ? "is-IS" : "en-GB";

  const [session, setSession] = useState<PublishedSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (!token) {
        router.replace(`/login?next=/player/sessions/${id}`);
        return;
      }
      const res = await fetch(`/api/team/training-sessions?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.ok) setSession((json.sessions ?? [])[0] ?? null);
      else setError(json.error ?? "error");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { void load(); }, [load]);

  const stats = session ? sessionStats(session) : null;

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-[var(--surface,#f4f2ec)] px-4 pb-16">
      <PtClientGuard />

      <div
        className="sticky top-0 z-10 -mx-4 mb-4 border-b border-zinc-200 bg-[var(--surface,#f4f2ec)]/90 px-4 pb-3 backdrop-blur"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <Link
          href="/player/sessions"
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 active:bg-zinc-100"
        >
          <span aria-hidden className="text-base leading-none">←</span> {t.heading}
        </Link>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-zinc-400">{t.loading}</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">{error}</div>
      ) : !session || !stats ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 py-16 text-center text-sm text-zinc-500">
          {t.empty}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Header */}
          <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${t.today === dateLabel(session.session_date, locale, t) ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"}`}>
                {dateLabel(session.session_date, locale, t)}
              </span>
              {session.md_day && (
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">{session.md_day}</span>
              )}
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-zinc-900">{session.session_name || "–"}</h1>

            <div className="mt-4 grid grid-cols-4 gap-2">
              <Stat label={t.drills} value={String(stats.drillCount)} />
              <Stat label={t.duration} value={stats.duration != null ? `${stats.duration}${t.minShort}` : "–"} />
              <Stat label={t.distance} value={stats.distance != null ? `${stats.distance}m` : "–"} />
              <Stat label={t.target + " " + t.load} value={stats.targetPl != null ? String(stats.targetPl) : "–"} />
            </div>
          </header>

          {/* Focus points */}
          {session.focus_points && session.focus_points.length > 0 && (
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{t.focus}</h2>
              <ul className="space-y-1.5">
                {session.focus_points.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Drills as blocks */}
          <section>
            <h2 className="mb-2 px-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{t.drills}</h2>
            <SessionDrillList sessionId={id} items={session.items} lang={lang} />
          </section>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-2 py-2 text-center">
      <div className="font-display text-lg font-bold leading-none text-zinc-900">{value}</div>
      <div className="mt-1 text-[9px] uppercase tracking-wide text-zinc-400">{label}</div>
    </div>
  );
}

"use client";

/**
 * /player/log-session
 *
 * Dedicated PT-client surface for logging per-set weight + reps + RPE.
 * Self-contained — does not touch the giant PlayerClient.tsx so we can
 * iterate on it without regressing the football-player flow.
 *
 * Anyone signed in as a player can use the page. PT clients (team_type =
 * 'personal_trainer') are the primary audience; football players who also
 * want to log strength sessions can use it too — the data falls into the
 * same table and feeds back into their trainer's Client Summary if relevant.
 */

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang";
import { supabase } from "@/lib/supabaseClient";
import PtSessionLogForm from "@/components/player/PtSessionLogForm";

export default function LogSessionPage() {
  const [lang] = useLang();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setAuthed(!!data.session);
    })();
  }, []);

  if (authed === false) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="rounded-2xl border bg-white p-6 max-w-sm w-full text-center">
          <p className="text-sm text-slate-700 mb-3">
            {lang === "IS" ? "Þú þarft að skrá þig inn." : "You need to sign in."}
          </p>
          <Link href="/login?next=/player/log-session"
            className="inline-block rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
          >
            {lang === "IS" ? "Skrá inn" : "Sign in"}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <header>
          <Link href="/player" className="text-xs text-slate-500 hover:text-slate-700">← {lang === "IS" ? "Til baka" : "Back"}</Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {lang === "IS" ? "Skrá æfingu" : "Log session"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {lang === "IS"
              ? "Skráðu þyngdir, endurtekningar og RPE per sett — þjálfarinn þinn sér framvinduna sjálfkrafa."
              : "Log weights, reps and RPE per set — your trainer sees the progression automatically."}
          </p>
        </header>

        {authed === null ? (
          <div className="text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>
        ) : (
          <PtSessionLogForm lang={lang === "EN" ? "EN" : "IS"} />
        )}
      </div>
    </main>
  );
}

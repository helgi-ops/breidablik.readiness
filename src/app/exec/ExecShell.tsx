"use client";

/**
 * ExecShell — minimal read-only shell for the EXEC (management/GM) role.
 * No coach navigation, no settings, no edit surfaces: a top bar with the
 * language toggle + sign-out, and the club-status dashboard below. The hard
 * read-only boundary is enforced server-side (the /api/exec/* endpoints require
 * role EXEC and expose no mutations); this shell simply offers nothing to edit.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

export default function ExecShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [lang, setLang] = useLang();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) { router.replace("/login"); return; }
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [router]);

  if (!ready) return null;

  const langBtn = (code: "IS" | "EN") =>
    `rounded-full px-2.5 py-1 transition-colors ${lang === code ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">MicroPulse</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {lang === "IS" ? "Stjórnandi" : "Management"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full border border-slate-200 bg-white p-0.5 text-xs font-semibold">
              <button type="button" onClick={() => setLang("IS")} className={langBtn("IS")}>IS</button>
              <button type="button" onClick={() => setLang("EN")} className={langBtn("EN")}>EN</button>
            </div>
            <button
              type="button"
              onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              {lang === "IS" ? "Útskrá" : "Sign out"}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

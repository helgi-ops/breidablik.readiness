"use client";

/**
 * PT-client PWA shell — mobile-first bottom-nav layout. Different from
 * /player which is wired for the football monitoring flow (GPS, MD-N,
 * Catapult). PT clients see: Today / Log / Progression / LV / Chat /
 * Profile and nothing else.
 *
 * Auth-gated: redirects to /login if no session. Everyone who lands
 * here is a player (PT client or football player who's a PT trainer's
 * client) — we don't gate by team_type because non-PT players who want
 * to log strength sessions can still use this surface.
 */

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Tab = {
  href: string;
  match: (p: string) => boolean;
  label: { IS: string; EN: string };
  icon: string;
};

const TABS: Tab[] = [
  { href: "/client",             match: (p) => p === "/client",                    label: { IS: "Í dag",      EN: "Today" },       icon: "🏠" },
  { href: "/client/log",         match: (p) => p.startsWith("/client/log"),        label: { IS: "Skrá",       EN: "Log" },         icon: "🏋️" },
  { href: "/client/progression", match: (p) => p.startsWith("/client/progression"), label: { IS: "Framvinda",  EN: "Progression" }, icon: "📈" },
  { href: "/client/lv-profile",  match: (p) => p.startsWith("/client/lv-profile"), label: { IS: "LV próf",    EN: "LV Test" },     icon: "⚡" },
  { href: "/client/chat",        match: (p) => p.startsWith("/client/chat"),       label: { IS: "Spjall",     EN: "Chat" },        icon: "💬" },
  { href: "/client/profile",     match: (p) => p.startsWith("/client/profile"),    label: { IS: "Ég",         EN: "Me" },          icon: "👤" },
];

export default function ClientLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/client";
  const [lang] = useLang();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (!data.session) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        setAuthed(false);
        return;
      }
      setAuthed(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace("/login?next=/client");
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [router, pathname]);

  if (authed === null) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>
      </main>
    );
  }
  if (!authed) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📡</span>
          <span className="text-sm font-semibold text-slate-900">MicroPulse PT</span>
        </div>
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace("/login");
          }}
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          {lang === "IS" ? "Útskrá" : "Sign out"}
        </button>
      </header>

      <div className="mx-auto w-full max-w-2xl px-3 py-3">
        {children}
      </div>

      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 px-1 py-1.5 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-2xl grid grid-cols-6">
          {TABS.map((t) => {
            const active = t.match(pathname);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors ${
                  active ? "text-slate-900" : "text-slate-400 hover:text-slate-700"
                }`}
              >
                <span className={`text-lg leading-none ${active ? "" : "opacity-60"}`}>{t.icon}</span>
                <span className="leading-tight">{t.label[lang === "EN" ? "EN" : "IS"]}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

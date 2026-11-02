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
 *
 * Rendered by the (server) client/layout.tsx, which owns the PWA metadata
 * (manifest + apple-mobile-web-app-title) so installs get the MicroPulse PT
 * identity, not the default team identity.
 */

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import InstallPrompt from "@/components/client/InstallPrompt";
import PlayerPrivacyConsentPrompt from "@/components/player/PlayerPrivacyConsentPrompt";

type Tab = {
  href: string;
  match: (p: string) => boolean;
  label: { IS: string; EN: string };
  icon: ReactNode;
};

const Icon = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

// Five tabs; the LV test is reached from Progression, so it lights that tab.
const TABS: Tab[] = [
  { href: "/client",             match: (p) => p === "/client",                    label: { IS: "Í dag",     EN: "Today" },       icon: <Icon d="M3 11 12 4l9 7M6 10v10h12V10" /> },
  { href: "/client/log",         match: (p) => p.startsWith("/client/log"),        label: { IS: "Skrá",      EN: "Log" },         icon: <Icon d="M4 9v6M8 6v12M16 6v12M20 9v6M8 12h8" /> },
  { href: "/client/progression", match: (p) => p.startsWith("/client/progression") || p.startsWith("/client/lv-profile"), label: { IS: "Framvinda", EN: "Progression" }, icon: <Icon d="M4 18 10 12l4 4 6-8" /> },
  { href: "/client/chat",        match: (p) => p.startsWith("/client/chat"),       label: { IS: "Spjall",    EN: "Chat" },        icon: <Icon d="M4 5h16v11H9l-5 4z" /> },
  { href: "/client/profile",     match: (p) => p.startsWith("/client/profile"),    label: { IS: "Ég",        EN: "Me" },          icon: <Icon d="M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /> },
];

export default function ClientShell({ children }: { children: ReactNode }) {
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

      // Route a NON-PT player off the PT surface. A player with no personal_trainer
      // relationship (their own team isn't a PT team AND they have no PT membership
      // or data grant) belongs on the team app /player — they only reach /client via
      // an old installed PWA / stale link. This mirrors PtClientGuard (which sends PT
      // players TO /client). Genuine dual-use — a team player who is also a PT
      // trainer's client — has a PT membership/grant and stays here. Fail-safe: on
      // any error we do NOT redirect (keep the permissive default), so a transient
      // failure never bounces a real PT client.
      type TeamTypeRow = { teams: { team_type: string | null } | { team_type: string | null }[] | null };
      const hasPtTeam = (rows: TeamTypeRow[] | null | undefined) =>
        (rows ?? []).some((r) => {
          const t = Array.isArray(r.teams) ? r.teams[0] : r.teams;
          return String(t?.team_type ?? "").toLowerCase() === "personal_trainer";
        });
      try {
        const uid = data.session.user.id;
        const { data: prof } = await supabase.from("profiles").select("team_id").eq("id", uid).maybeSingle();
        const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
        let isPtRelated = false;
        if (teamId) {
          const { data: team } = await supabase.from("teams").select("team_type").eq("id", teamId).maybeSingle();
          if (String((team as { team_type?: string | null } | null)?.team_type ?? "").toLowerCase() === "personal_trainer") {
            isPtRelated = true; // pure PT client — the common case, one query
          }
        }
        if (!isPtRelated) {
          const { data: pl } = await supabase.from("players").select("id").eq("user_id", uid).maybeSingle();
          const playerId = (pl as { id?: string } | null)?.id ?? null;
          if (playerId) {
            const [{ data: mem }, { data: grants }] = await Promise.all([
              supabase.from("player_team_memberships").select("teams(team_type)").eq("player_id", playerId),
              supabase.from("player_data_grants").select("teams:granted_to_team_id(team_type)").eq("player_id", playerId),
            ]);
            if (hasPtTeam(mem as TeamTypeRow[] | null) || hasPtTeam(grants as TeamTypeRow[] | null)) isPtRelated = true;
          }
          if (!alive) return;
          if (!isPtRelated) {
            router.replace("/player");
            return;
          }
        }
      } catch {
        /* fail-safe: stay on /client on any error */
      }
      if (!alive) return;
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
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">MicroPulse PT</span>
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

      <InstallPrompt lang={lang === "EN" ? "EN" : "IS"} />
      <PlayerPrivacyConsentPrompt />

      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 px-1 py-1.5 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-2xl grid grid-cols-5">
          {TABS.map((t) => {
            const active = t.match(pathname);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[11px] font-medium transition-colors ${
                  active ? "text-primary" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {t.icon}
                <span className="leading-tight">{t.label[lang === "EN" ? "EN" : "IS"]}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

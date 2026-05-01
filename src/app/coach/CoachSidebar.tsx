"use client";

/**
 * Coach sidebar — vertical navigation that replaces the previous top-nav.
 *
 * Industry pattern: every athlete-monitoring / sport-science platform that
 * MicroPulse competes against (Smartabase, Kitman Labs, VALD Hub, Catapult
 * OpenField, Statsports Sonra, Hawkin Dynamics, Output Sports, Zone7,
 * Edge10, Teambuildr) renders a left sidebar. Coaches who have used any
 * of those tools at a previous club (likely for most pilot prospects)
 * expect this layout. Top-nav with dropdowns reads as "older / less
 * professional" in this category.
 *
 * Same component renders in two contexts:
 *   - Desktop (>= md): persistent left sidebar inside the layout grid
 *   - Mobile (<  md): inside the drawer wrapper that opens from a
 *                     hamburger button in the minimal header
 *
 * `onNavigate` is invoked whenever a link is clicked so the drawer can
 * auto-close on mobile (no-op on desktop).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang, type Lang } from "@/lib/lang";
import TeamSwitcher, { type CoachTeam } from "@/components/coach/TeamSwitcher";

// ─── Bilingual link helper ──────────────────────────────────────────────────
type Bi = { EN: string; IS: string };
const tt = (b: Bi, lang: Lang) => (lang === "IS" ? b.IS : b.EN);

const communicationLinks: { href: string; label: Bi }[] = [
  { href: "/coach/conversations", label: { EN: "Conversations", IS: "Samtöl" } },
  { href: "/coach/messages",      label: { EN: "Messages",      IS: "Skilaboð" } },
  { href: "/team",                label: { EN: "Team Page",     IS: "Liðssíða" } },
];

const monitoringLinks: { href: string; label: Bi }[] = [
  { href: "/coach/quadrant",           label: { EN: "Quadrant view (Gabbett)",        IS: "Quadrant view (Gabbett)" } },
  { href: "/coach/indoor-load",        label: { EN: "Indoor Load (höll-mode)",        IS: "Indoor Load (höll-mode)" } },
  { href: "/coach/decel-intelligence", label: { EN: "Decel Intelligence (McBurnie)",  IS: "Decel Intelligence (McBurnie)" } },
  { href: "/coach/injuries",           label: { EN: "Injury Pattern Analysis",        IS: "Meiðsla-munstursgreining" } },
  { href: "/coach/notifications",      label: { EN: "Notifications",                  IS: "Tilkynningar" } },
];

const planningLinks: { href: string; label: Bi }[] = [
  { href: "/coach?tab=md",           label: { EN: "MD Comparison",       IS: "MD Samanburður" } },
  { href: "/coach?tab=drills",       label: { EN: "Session builder",     IS: "Session builder" } },
  { href: "/coach/templates",        label: { EN: "Session templates",   IS: "Session templates" } },
  { href: "/coach/custom-templates", label: { EN: "Custom templates",    IS: "Sérsniðnar templates" } },
  { href: "/coach/match-minutes",    label: { EN: "Match minutes",       IS: "Leikmínútur" } },
];

const adminLinks: { href: string; label: Bi }[] = [
  { href: "/coach/settings",          label: { EN: "Settings",          IS: "Stillingar" } },
  { href: "/coach/reporting-center",  label: { EN: "Reporting center",  IS: "Reporting center" } },
  { href: "/coach/integrations",      label: { EN: "Integrations",      IS: "Tengingar" } },
  { href: "/coach/catapult-upload",   label: { EN: "Catapult CSV upload", IS: "Catapult CSV upload" } },
  { href: "/coach/automation-center", label: { EN: "Automation",        IS: "Automation" } },
];

const superAdminLinks: { href: string; label: Bi }[] = [
  { href: "/coach/leads", label: { EN: "Leads (demo/pilot)", IS: "Leads (demo/pilot)" } },
];

// ─── Active-link matcher (handles ?tab=… deep links too) ────────────────────
function isLinkActive(href: string, pathname: string, currentTab: string | null): boolean {
  const [path, query] = href.split("?");
  if (!query) return pathname?.startsWith(path) ?? false;
  if (pathname !== path) return false;
  const params = new URLSearchParams(query);
  const wantedTab = params.get("tab");
  return wantedTab != null && currentTab === wantedTab;
}

// ─── Section component (collapsible header + list of links) ─────────────────
//
// Each section persists its open/closed state in localStorage so coaches'
// preferences survive page refreshes. If any link inside the section matches
// the current route the section is force-opened so the active item stays
// visible (otherwise an active link would be hidden behind a collapsed
// header — disorienting). Default state on first visit is OPEN so coaches
// see the full nav surface immediately and can collapse sections they
// don't use.
function Section({
  label,
  links,
  pathname,
  currentTab,
  lang,
  onNavigate,
}: {
  label: string;
  links: { href: string; label: Bi }[];
  pathname: string;
  currentTab: string | null;
  lang: Lang;
  onNavigate?: () => void;
}) {
  // Versioned key — bump the suffix whenever the default flips so previously
  // stored prefs (which would otherwise force the old default) are ignored.
  // v2: default flipped from collapsed → open (2026-05-01).
  const storageKey = `coach-sidebar-section-v2:${label}`;
  const hasActive = links.some((l) => isLinkActive(l.href, pathname, currentTab));

  // Default to open; rehydrate from localStorage after mount to avoid
  // SSR/hydration mismatches. If the coach explicitly collapsed this
  // section before, the stored "0" wins on rehydrate.
  const [open, setOpen] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "1") setOpen(true);
      else if (stored === "0") setOpen(false);
    } catch {
      /* localStorage may be blocked — silently fall back to default */
    }
  }, [storageKey]);

  // Force-open whenever the active route is inside this section.
  const effectiveOpen = open || hasActive;

  function toggle() {
    const next = !effectiveOpen;
    setOpen(next);
    try {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mt-4 first:mt-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={effectiveOpen}
        className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700"
      >
        <span>{label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${effectiveOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {effectiveOpen && (
        <ul className="flex flex-col gap-0.5">
          {links.map((l) => {
            const active = isLinkActive(l.href, pathname, currentTab);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={onNavigate}
                  className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-slate-900 text-white font-medium"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {tt(l.label, lang)}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Public Sidebar ─────────────────────────────────────────────────────────
export function CoachSidebar({
  isAdmin,
  notesCount,
  pendingCount,
  currentTab,
  currentTeamId,
  onSwitchTeam,
  onNavigate,
}: {
  isAdmin: boolean;
  notesCount: number;
  pendingCount: number;
  /** The current `?tab=` URL param. Passed in (rather than read via
   *  useSearchParams) because the parent shell already reads it via a
   *  Suspense-safe window.location helper. */
  currentTab: string | null;
  /** The coach's currently active team_id (from profiles). Passed through
   *  to the TeamSwitcher so coaches with multiple teams can swap from the
   *  sidebar without leaving their current page. */
  currentTeamId: string | null;
  /** Invoked when the coach picks a different team from the switcher. The
   *  shell handles persistence (writes profiles.team_id) and reload. */
  onSwitchTeam: (team: CoachTeam) => void;
  /** Invoked when any link inside the sidebar is clicked. The mobile drawer
   *  uses this to close itself; desktop passes a no-op. */
  onNavigate?: () => void;
}) {
  const [lang] = useLang();
  const pathname = usePathname() ?? "";

  const isOnCoach = pathname === "/coach" && currentTab == null;
  const isOnPlayers = pathname?.startsWith("/coach/players") ?? false;
  const isOnWeek = pathname?.startsWith("/coach/week-setup") ?? false;

  return (
    <div className="flex h-full flex-col">
      {/* Team switcher — renders nothing when the coach only has one team,
          so single-team clubs don't see a redundant chip. */}
      <div className="px-3 pt-3">
        <TeamSwitcher currentTeamId={currentTeamId} onSwitch={onSwitchTeam} />
      </div>

      {/* Top-priority links — Dashboard / Players / Week setup with badge counts. */}
      <nav className="flex flex-col gap-0.5 px-3 pt-4">
        <Link
          href="/coach"
          onClick={onNavigate}
          className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
            isOnCoach
              ? "bg-slate-900 text-white font-medium"
              : "text-slate-800 hover:bg-slate-100"
          }`}
        >
          <span>Dashboard</span>
          {notesCount > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              isOnCoach ? "bg-white/20 text-white" : "bg-blue-500 text-white"
            }`}>
              {notesCount}
            </span>
          )}
        </Link>
        <Link
          href="/coach/players"
          onClick={onNavigate}
          className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
            isOnPlayers
              ? "bg-slate-900 text-white font-medium"
              : "text-slate-800 hover:bg-slate-100"
          }`}
        >
          <span>{lang === "IS" ? "Leikmenn" : "Players"}</span>
          {pendingCount > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              isOnPlayers ? "bg-white/20 text-white" : "bg-amber-500 text-white"
            }`}>
              {pendingCount}
            </span>
          )}
        </Link>
        <Link
          href="/coach/week-setup"
          onClick={onNavigate}
          className={`block rounded-md px-3 py-2 text-sm transition-colors ${
            isOnWeek
              ? "bg-slate-900 text-white font-medium"
              : "text-slate-800 hover:bg-slate-100"
          }`}
        >
          {lang === "IS" ? "Vikuskipulag" : "Week setup"}
        </Link>
      </nav>

      {/* Categorised sections */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <Section
          label={lang === "IS" ? "Samskipti" : "Communication"}
          links={communicationLinks}
          pathname={pathname}
          currentTab={currentTab}
          lang={lang}
          onNavigate={onNavigate}
        />
        <Section
          label={lang === "IS" ? "Eftirlit" : "Monitoring"}
          links={monitoringLinks}
          pathname={pathname}
          currentTab={currentTab}
          lang={lang}
          onNavigate={onNavigate}
        />
        <Section
          label={lang === "IS" ? "Skipulag" : "Planning"}
          links={planningLinks}
          pathname={pathname}
          currentTab={currentTab}
          lang={lang}
          onNavigate={onNavigate}
        />
        <Section
          label="Admin"
          links={adminLinks}
          pathname={pathname}
          currentTab={currentTab}
          lang={lang}
          onNavigate={onNavigate}
        />
        {isAdmin && (
          <Section
            label="MicroPulse"
            links={superAdminLinks}
            pathname={pathname}
            currentTab={currentTab}
            lang={lang}
            onNavigate={onNavigate}
          />
        )}
        <div className="mt-4">
          <div className="mb-1 px-3 py-1.5 text-sm font-semibold text-slate-500">
            TV
          </div>
          <a
            href="/coach/display?refresh=15"
            target="_blank"
            rel="noreferrer"
            className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            {lang === "IS" ? "Skjár ↗" : "TV view ↗"}
          </a>
        </div>
      </div>

      {/* Sticky footer with sign-out */}
      <div className="border-t border-slate-200 bg-white p-3">
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/login";
          }}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
        >
          {lang === "IS" ? "Útskrá" : "Sign out"}
        </button>
      </div>
    </div>
  );
}

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
import { useTeamMode } from "@/lib/useTeamMode";
import { isGpsOnly } from "@/lib/teamMode";

// ─── Bilingual link helper ──────────────────────────────────────────────────
type Bi = { EN: string; IS: string };
const tt = (b: Bi, lang: Lang) => (lang === "IS" ? b.IS : b.EN);

// `badgeKey` lets a link opt into one of the live counts the sidebar already
// fetches (currently just "pending" = pending player approvals). The Section
// component reads the count from a `badges` prop and renders the pill.
type SidebarLink = { href: string; label: Bi; badgeKey?: "pending" };

const communicationLinks: SidebarLink[] = [
  { href: "/coach/conversations", label: { EN: "Conversations", IS: "Samtöl" } },
  { href: "/coach/messages",      label: { EN: "Messages",      IS: "Skilaboð" } },
  { href: "/team",                label: { EN: "Team Page",     IS: "Liðssíða" } },
];

// NOTE: Players is *roster management* (approve pending, edit profiles), not
// daily monitoring — coaches drilldown to individual players through the
// Watch list / Daily Briefing. So Players lives in Admin, not Monitoring.
// Week setup is the entry-point of the planning workflow → top of Planning.
//
// Monitoring split into three groups (May 2026):
//
//   Load Monitoring — daily training load + biomechanical session profiles.
//     Answers "what did the team train today and how?" Includes the IMU/GPS
//     load surfaces (Decel + IMA Intelligence) because those describe
//     session shape and intensity, not injury verdicts per se.
//
//   Injury Monitoring — explicit injury / RTP tracking and threshold alerts.
//     Answers "who is hurt or flagged, and what do we do about it?"
//
//   Performance Analytics — longer-window analytical views and capacity tests.
//     Answers "how is the squad trending and what is each player capable of
//     right now?" Includes neuromuscular tests (VALD/CMJ, Strength/VBT)
//     which are capacity assessments rather than daily-load decisions.
// All Load Monitoring labels end in "Intelligence" — consistent naming
// pattern signals to coaches that these are analytical surfaces (not raw
// data dumps) and groups them visually in the sidebar.
const loadMonitoringLinks: SidebarLink[] = [
  { href: "/coach/load-intelligence",  label: { EN: "Load Intelligence",                IS: "Álagsgreining" } },
  { href: "/coach/quadrant",           label: { EN: "Quadrant Intelligence",            IS: "Quadrant Intelligence" } },
  { href: "/coach/indoor-load",        label: { EN: "Indoor Load Intelligence",         IS: "Indoor Load Intelligence" } },
  { href: "/coach/decel-intelligence", label: { EN: "Decel Intelligence",               IS: "Decel Intelligence" } },
  { href: "/coach/ima-intelligence",   label: { EN: "IMA Intelligence",                 IS: "IMA Intelligence" } },
  // KSÍ Report lives under Admin (it's an outbound export/report, not a
  // real-time monitoring surface) — see adminLinks below.
  // HSR Intelligence is the Lite-tier counterpart to Decel Intelligence —
  // shown only when LITE filtering keeps it (Malone 2017 + Buchheit 2014).
  { href: "/coach/hsr-intelligence",   label: { EN: "HSR Intelligence",                 IS: "HSR Intelligence" } },
];

const injuryMonitoringLinks: SidebarLink[] = [
  { href: "/coach/injuries",           label: { EN: "Injury Pattern Analysis",          IS: "Meiðsla-munstursgreining" } },
  { href: "/coach?tab=rtp",            label: { EN: "Injuries / RTP",                   IS: "Meiðsli / RTP" } },
  { href: "/coach/notifications",      label: { EN: "Notifications",                    IS: "Tilkynningar" } },
];

const performanceAnalyticsLinks: SidebarLink[] = [
  { href: "/coach?tab=trend",          label: { EN: "Trends",                           IS: "Þróun" } },
  { href: "/coach?tab=volatility",     label: { EN: "Volatility",                       IS: "Sveiflur" } },
  { href: "/coach?tab=vald",           label: { EN: "VALD / CMJ",                       IS: "VALD / CMJ" } },
  { href: "/coach?tab=strength",       label: { EN: "Strength / VBT",                   IS: "Styrkur / VBT" } },
  { href: "/coach/assessment-profile", label: { EN: "Assessment Profile",               IS: "Mælingaprófíll" } },
];

// Planning split into pitch / S&C workflows (May 2026). Coaches were
// struggling to find Strength + Recovery in a flat list dominated by
// pitch-session items. The two workflows have different owners at most
// clubs (head coach vs S&C coach) so separating them mirrors how the
// staff actually splits responsibilities.
const teamPlanningLinks: SidebarLink[] = [
  { href: "/coach/week-setup",         label: { EN: "Week setup",          IS: "Vikuskipulag" } },
  { href: "/coach?tab=md",             label: { EN: "MD Comparison",       IS: "MD Samanburður" } },
  { href: "/coach?tab=drills",         label: { EN: "Session builder",     IS: "Session builder" } },
  { href: "/coach/match-minutes",      label: { EN: "Match minutes",       IS: "Leikmínútur" } },
];

// /coach/templates is a library of pre-built S&C/recovery programmes
// (categories: microdose, rehab, prehab, strength, power, recovery,
// activation, matchday). /coach/custom-templates lets the coach build
// custom cluster structures (Garcia-Ramos, French Contrast, etc.).
// Both are strength-coach tools, not pitch-session tools, so they sit
// under Strength Planning with strength-aware names.
// ── Personal-Training mode sidebar ───────────────────────────────────
// PT teams (team_type='personal_trainer') don't use the football-coach
// Monitoring/Planning/Admin layout. Their daily workflow is: client
// overview → assign / adjust programmes → message client. Everything
// else from the football side (Decel Intel, Indoor Load, Match minutes,
// Week setup, etc.) is irrelevant. Keep the surface tiny.
//
// PT side keeps the strength tools that are genuinely PT-shaped:
//   • Custom programmes — build per-client cluster/contrast structures.
//     Helgi's Explosive Power 12w shows up as a pinned card INSIDE this
//     page (admin-only) rather than as its own sidebar entry, because
//     it's just a programme he authored — not a separate sidebar tool.
//   • Load-Velocity Profile — ELITE per-client add-on (Banyard 2017,
//     González-Badillo 2010). LV ramp tests + DSI are core to ANY
//     serious 1-on-1 strength practice.
//
// Programme library / Isometric / Recovery deliberately live on the
// team side only, not here.
const ptStrengthLinks: SidebarLink[] = [
  { href: "/coach/starter-templates", label: { EN: "Starter templates",     IS: "Tilbúin kerfi" } },
  { href: "/coach/plan-builder",      label: { EN: "Plan builder",          IS: "Kerfasmiður" } },
  { href: "/coach/custom-templates",  label: { EN: "Custom programmes",     IS: "Sérsniðin prógramm" } },
  // LV Profile renders as a TrainerDashboard tab on PT side, so the
  // sidebar deep-links into the dashboard with `?tab=lvProfile`. Same
  // pattern coach-side uses for dashTab navigation.
  { href: "/coach?tab=lvProfile",     label: { EN: "Load-Velocity Profile", IS: "Kraft-/hraðapróf" } },
];
const ptAdminLinks: SidebarLink[] = [
  { href: "/coach?tab=invitations",  label: { EN: "Invitations",   IS: "Boð" } },
  { href: "/coach/settings",         label: { EN: "Settings",      IS: "Stillingar" } },
];

// PT Communication links — same as team-side communicationLinks but WITHOUT
// "Team Page". The /team page is football-team facing (squad roster, fixtures,
// team-wide notes) and irrelevant to a 1-on-1 personal trainer relationship.
const ptCommunicationLinks: SidebarLink[] = [
  { href: "/coach/conversations", label: { EN: "Conversations", IS: "Samtöl" } },
  { href: "/coach/messages",      label: { EN: "Messages",      IS: "Skilaboð" } },
];

const strengthPlanningLinks: SidebarLink[] = [
  // /coach/strength is the DAILY action page — per-player ~20 min sessions
  // auto-adapted to today's signals (Rønnestad 2023 micro-dose design).
  { href: "/coach/strength",            label: { EN: "Today's session",       IS: "Æfing dagsins" } },
  { href: "/coach/templates",           label: { EN: "Programme library",     IS: "Prógrammasafn" } },
  { href: "/coach/custom-templates",    label: { EN: "Custom programmes",     IS: "Sérsniðin prógramm" } },
  // LV Profile = ELITE add-on; ramp-test 1RM prediction (González-Badillo
  // 2010, Banyard 2017) used by strength coaches to set per-player loads.
  { href: "/coach/lv-profile",          label: { EN: "Load-Velocity Profile", IS: "Kraft-/hraðapróf" } },
  { href: "/coach/isometric-protocols", label: { EN: "Isometric protocols",   IS: "Ísómetrísk prótocol" } },
  { href: "/coach/recovery-protocols",  label: { EN: "Recovery protocols",    IS: "Recovery protocols" } },
];

const adminLinks: SidebarLink[] = [
  // Players sits at the top — it's the highest-frequency admin task
  // (approving pending players + roster edits) and the badge needs
  // visibility.
  { href: "/coach/players",           label: { EN: "Players",           IS: "Leikmenn" }, badgeKey: "pending" },
  { href: "/coach/settings",          label: { EN: "Settings",          IS: "Stillingar" } },
  { href: "/coach/reporting-center",  label: { EN: "Reporting center",  IS: "Reporting center" } },
  { href: "/coach/ksi-report",        label: { EN: "KSÍ Report",        IS: "KSÍ skýrsla" } },
  { href: "/coach/integrations",      label: { EN: "Integrations",      IS: "Tengingar" } },
  { href: "/coach/catapult-upload",   label: { EN: "Catapult CSV upload", IS: "Catapult CSV upload" } },
  { href: "/coach/vald-upload",       label: { EN: "VALD CSV upload",   IS: "VALD CSV upload" } },
  { href: "/coach/assessment-upload", label: { EN: "Assessment upload", IS: "Mælingaupphleðsla" } },
  { href: "/coach/automation-center", label: { EN: "Automation",        IS: "Automation" } },
];

// Super-admin links — visible ONLY to MicroPulse owner/admin accounts
// (e.g. Helgi). Hidden from all coach/trainer users by the `{isAdmin &&}`
// guard around the section render.
//
// Explosive Power 12w is NOT here — it's mounted under PT Strength training
// (still admin-only) so Helgi can reach it alongside Custom programmes and
// LV Profile rather than via a separate super-admin section.
const superAdminLinks: SidebarLink[] = [
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
  badges,
}: {
  label: string;
  links: SidebarLink[];
  pathname: string;
  currentTab: string | null;
  lang: Lang;
  onNavigate?: () => void;
  /** Live counts the sidebar fetches; rendered as a pill on links whose
   *  `badgeKey` matches a key here (currently only "pending"). */
  badges?: { pending?: number };
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
        className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm font-bold text-slate-800 hover:bg-slate-100"
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
            const badgeCount = l.badgeKey ? badges?.[l.badgeKey] ?? 0 : 0;
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={onNavigate}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-slate-900 text-white font-medium"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span>{tt(l.label, lang)}</span>
                  {badgeCount > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      active ? "bg-white/20 text-white" : "bg-amber-500 text-white"
                    }`}>
                      {badgeCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Pages that need full Catapult B2-3 / IMA-band data to render anything
// useful — hidden from teams on Lite tier so coaches don't navigate to
// pages that look broken. Surfaced again automatically once B2-3 efforts
// start arriving in player_external_load_daily.
//
// Note: /coach/quadrant is INTENTIONALLY allowed on Lite — it uses the
// Gabbett 2016 volume-axis variant (total_distance × sRPE) which works
// fine without B2-3. Only Indoor Load (FMP / IMA bands) and Decel
// Intelligence (McBurnie 2022 B2-3 cluster) have no useful Lite fallback.
const LITE_HIDDEN_HREFS = new Set<string>([
  "/coach/indoor-load",
  "/coach/decel-intelligence",
  "/coach/ima-intelligence",
]);

// Pages shown ONLY on Lite tier — Lite-specific equivalents of Premium
// features. /coach/hsr-intelligence is the Malone 2017 + Buchheit 2014
// counterpart to Decel Intelligence; on Full plans it's redundant with
// the higher-fidelity Decel page so we hide it.
const FULL_HIDDEN_HREFS = new Set<string>([
  "/coach/hsr-intelligence",
]);

// ─── Public Sidebar ─────────────────────────────────────────────────────────
export function CoachSidebar({
  isAdmin,
  notesCount,
  pendingCount,
  currentTab,
  currentTeamId,
  catapultDataTier,
  teamType,
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
  /** Auto-detected Catapult data tier for the active team. 'lite' hides
   *  features that need B2-3 / IMA bands; 'full' shows everything. Default
   *  'lite' (conservative — show fewer items when undetermined). */
  catapultDataTier?: "full" | "lite";
  /** Team type from teams.team_type. 'personal_trainer' switches the
   *  sidebar to the PT-mode layout (Dashboard + Strength training +
   *  Settings). Anything else gets the football-coach layout. */
  teamType?: string | null;
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
  const isPt = String(teamType ?? "").toLowerCase() === "personal_trainer";

  // GPS-only teams hide the Communication section since check-in/RPE
  // workflows are disabled. PT teams use their own gating below.
  const teamMode = useTeamMode(currentTeamId);
  const hideWellness = isGpsOnly(teamMode);

  // ── Personal-Training mode ────────────────────────────────────────
  // PT teams get a 4-section sidebar: Dashboard / Strength training /
  // Admin / (optional MicroPulse super-admin). No football monitoring
  // surfaces, no team-planning sections — clean and minimal.
  if (isPt) {
    return (
      <div className="flex h-full flex-col">
        <div className="px-3 pt-3">
          <TeamSwitcher currentTeamId={currentTeamId} onSwitch={onSwitchTeam} />
        </div>

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
        </nav>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <Section
            label={lang === "IS" ? "Styrktarþjálfun" : "Strength training"}
            links={ptStrengthLinks}
            pathname={pathname}
            currentTab={currentTab}
            lang={lang}
            onNavigate={onNavigate}
          />
          <Section
            label={lang === "IS" ? "Samskipti" : "Communication"}
            links={ptCommunicationLinks}
            pathname={pathname}
            currentTab={currentTab}
            lang={lang}
            onNavigate={onNavigate}
          />
          <Section
            label="Admin"
            links={ptAdminLinks}
            pathname={pathname}
            currentTab={currentTab}
            lang={lang}
            onNavigate={onNavigate}
            badges={{ pending: pendingCount }}
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
        </div>
      </div>
    );
  }

  // Filter Monitoring items by Catapult data tier. Lite teams get the
  // /coach/hsr-intelligence page (Malone 2017) instead of the Premium-
  // only Decel Intelligence + Indoor Load + IMA Intelligence. See
  // migration 20260502170000. Applied per sub-group.
  const isLite = catapultDataTier !== "full";
  const filterForTier = (links: SidebarLink[]) => isLite
    ? links.filter((l) => !LITE_HIDDEN_HREFS.has(l.href))
    : links.filter((l) => !FULL_HIDDEN_HREFS.has(l.href));
  const loadMonitoringForTier = filterForTier(loadMonitoringLinks);
  const injuryMonitoringForTier = filterForTier(injuryMonitoringLinks);
  const performanceAnalyticsForTier = filterForTier(performanceAnalyticsLinks);

  return (
    <div className="flex h-full flex-col">
      {/* Team switcher — renders nothing when the coach only has one team,
          so single-team clubs don't see a redundant chip. */}
      <div className="px-3 pt-3">
        <TeamSwitcher currentTeamId={currentTeamId} onSwitch={onSwitchTeam} />
      </div>

      {/* Dashboard sits alone at the top — it's the daily landing page.
          Players moved into Monitoring, Week setup into Planning. */}
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
      </nav>

      {/* Categorised sections */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {!hideWellness && (
          <Section
            label={lang === "IS" ? "Samskipti" : "Communication"}
            links={communicationLinks}
            pathname={pathname}
            currentTab={currentTab}
            lang={lang}
            onNavigate={onNavigate}
          />
        )}
        <Section
          label={lang === "IS" ? "Álagseftirlit" : "Load Monitoring"}
          links={loadMonitoringForTier}
          pathname={pathname}
          currentTab={currentTab}
          lang={lang}
          onNavigate={onNavigate}
        />
        <Section
          label={lang === "IS" ? "Meiðslaeftirlit" : "Injury Monitoring"}
          links={injuryMonitoringForTier}
          pathname={pathname}
          currentTab={currentTab}
          lang={lang}
          onNavigate={onNavigate}
        />
        <Section
          label={lang === "IS" ? "Frammistöðugreining" : "Performance Analytics"}
          links={performanceAnalyticsForTier}
          pathname={pathname}
          currentTab={currentTab}
          lang={lang}
          onNavigate={onNavigate}
        />
        <Section
          label={lang === "IS" ? "Liðs-skipulag" : "Team Planning"}
          links={teamPlanningLinks}
          pathname={pathname}
          currentTab={currentTab}
          lang={lang}
          onNavigate={onNavigate}
        />
        <Section
          label={lang === "IS" ? "Styrktarskipulag" : "Strength Planning"}
          links={strengthPlanningLinks}
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
          badges={{ pending: pendingCount }}
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
          <div className="mb-1 px-3 py-1.5 text-sm font-bold text-slate-800">
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

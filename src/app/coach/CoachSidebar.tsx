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
export type Bi = { EN: string; IS: string };
export const tt = (b: Bi, lang: Lang) => (lang === "IS" ? b.IS : b.EN);

// `badgeKey` lets a link opt into one of the live counts the sidebar already
// fetches (currently just "pending" = pending player approvals). The Section
// component reads the count from a `badges` prop and renders the pill.
export type SidebarLink = { href: string; label: Bi; badgeKey?: "pending" };

export const communicationLinks: SidebarLink[] = [
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
export const loadMonitoringLinks: SidebarLink[] = [
  { href: "/coach/load-intelligence",  label: { EN: "Load Intelligence",                IS: "Álagsgreining" } },
  // Power Curve Intelligence — the ADI peak-period layer (power curve + % of peak
  // capacity per drill + Session Builder). Pulled off Load Intelligence to keep that
  // page focused; GPS/Catapult-based so it hides for no-GPS teams.
  { href: "/coach/power-curve-intelligence", label: { EN: "Power Curve Intelligence",     IS: "Afl-kúrfu greining" } },
  // HSR Intelligence sits right under Load Intelligence; it's also the Lite-tier
  // counterpart to Decel Intelligence (Malone 2017 + Buchheit 2014).
  { href: "/coach/hsr-intelligence",   label: { EN: "HSR Intelligence",                 IS: "HSR Intelligence" } },
  { href: "/coach/quadrant",           label: { EN: "Quadrant Intelligence",            IS: "Quadrant Intelligence" } },
  { href: "/coach/indoor-load",        label: { EN: "Indoor Load Intelligence",         IS: "Indoor Load Intelligence" } },
  { href: "/coach/decel-intelligence", label: { EN: "Decel Intelligence",               IS: "Decel Intelligence" } },
  // Heart Rate Intelligence — belt HR as an objective cross-check on sRPE. Belt-based,
  // so on BOTH tiers (not Catapult-tier gated); hidden only for no-hardware teams.
  { href: "/coach/heart-rate-intelligence", label: { EN: "Heart Rate Intelligence",     IS: "Púls-greining" } },
  { href: "/coach/ima-intelligence",   label: { EN: "IMA Intelligence",                 IS: "IMA Intelligence" } },
  // KSÍ Report lives under Admin (it's an outbound export/report, not a
  // real-time monitoring surface) — see adminLinks below.
];

// Match / game analysis — post-match and match-referenced surfaces. Split out of
// Load Monitoring (Aug 2026): these analyse a game, they aren't daily load.
export const matchAnalysisLinks: SidebarLink[] = [
  { href: "/coach/match-analysis",     label: { EN: "Single Match Analysis",            IS: "Stakur leikur" } },
  { href: "/coach/match-insights",     label: { EN: "Season Match Analysis",            IS: "Heilt tímabil" } },
  { href: "/coach/win-factors",        label: { EN: "League Win Factors",               IS: "Hvað vinnur deildina" } },
  { href: "/coach/opponent-scouting",  label: { EN: "Opponent Analysis",                IS: "Andstæðinga-greining" } },
  { href: "/coach/player-analysis",    label: { EN: "Player Season Analysis",           IS: "Leikmanna-tímabilsgreining" } },
  { href: "/coach/total-player-analysis", label: { EN: "Total Player Analysis",          IS: "Heildar leikmannagreining" } },
  { href: "/coach/transfer-report",    label: { EN: "Player Transfer Report",           IS: "Félagaskipta-skýrsla" } },
  { href: "/coach/form-vs-state",      label: { EN: "Form vs State",                    IS: "Form vs ástand" } },
];

// The GPS/IMA physical read — its own section (all four are NO_GPS_HIDDEN, so it hides for no-GPS teams).
export const movementLinks: SidebarLink[] = [
  { href: "/coach/match-movement",     label: { EN: "Player Match Movement",            IS: "Leikmanna-hreyfing" } },
  { href: "/coach/player-game-report", label: { EN: "Player Game Report",               IS: "Leikjaskýrsla leikmanns" } },
  { href: "/coach/position-comparison", label: { EN: "Position Comparison",              IS: "Stöðu-samanburður" } },
  { href: "/coach/train-like-you-play", label: { EN: "Train like you Play",              IS: "Train like you Play" } },
];

export const injuryMonitoringLinks: SidebarLink[] = [
  { href: "/coach/injuries",           label: { EN: "Injury Pattern Analysis",          IS: "Meiðsla-munstursgreining" } },
  { href: "/coach?tab=rtp",            label: { EN: "Injuries / RTP",                   IS: "Meiðsli / RTP" } },
  { href: "/coach/return-to-training", label: { EN: "Return-to-training",               IS: "Aftur í æfingar" } },
  { href: "/coach/clinical-reports",   label: { EN: "Clinical reports",                 IS: "Klínískar skýrslur" } },
  { href: "/coach/notifications",      label: { EN: "Notifications",                    IS: "Tilkynningar" } },
];

// Rehab protocols — the staged-loading / criteria-based clinical modules. Split
// out of Injury Monitoring (Aug 2026) so the monitoring surfaces stay scannable
// and the protocols read as one group. All Breiðablik-only (see
// TEAM_RESTRICTED_HREFS); the section is hidden for clubs with none.
export const rehabProtocolLinks: SidebarLink[] = [
  { href: "/coach/hamstring-rehab",       label: { EN: "Hamstring (Ramping Iso)",   IS: "Hamstring (Ramping Iso)" } },
  { href: "/coach/jumpers-knee",          label: { EN: "Jumper's Knee",             IS: "Stökkhné" } },
  { href: "/coach/achilles-tendinopathy", label: { EN: "Achilles Tendinopathy",     IS: "Achilles-sinabólga" } },
  { href: "/coach/adductor-groin",        label: { EN: "Adductor / Groin",          IS: "Aðleiðara-nári" } },
  { href: "/coach/ankle-sprain",          label: { EN: "Ankle Sprain (I–II)",       IS: "Ökkla-tognun (I–II)" } },
];

export const performanceAnalyticsLinks: SidebarLink[] = [
  { href: "/coach?tab=trend",          label: { EN: "Readiness Trends",                 IS: "Readiness-þróun" } },
  { href: "/coach?tab=volatility",     label: { EN: "Readiness Swings",                 IS: "Readiness-sveiflur" } },
  { href: "/coach/post-match-recovery", label: { EN: "Post-match Recovery",              IS: "Endurheimt eftir leik" } },
  { href: "/coach?tab=vald",           label: { EN: "Neuromuscular Fatigue (CMJ)",      IS: "Taugavöðva-þreyta (CMJ)" } },
  { href: "/coach/rtp",                label: { EN: "Force-plate Assessment",           IS: "Kraftplötu-mat" } },
  { href: "/coach?tab=strength",       label: { EN: "Strength Monitoring",              IS: "Styrktareftirlit" } },
  { href: "/coach/assessment-profile", label: { EN: "Assessment Profile",               IS: "Mælingaprófíll" } },
  // Conditioning — the energy-system / aerobic profile (Critical Speed / D′ / ASR + fitness tests).
  // A capacity/fitness read, so it lives with the other assessments here (not Load Monitoring). NOT
  // GPS-gated: the fitness tests (Yo-Yo/30-15/beep/VAMEVAL) serve every team including basketball.
  { href: "/coach/conditioning",       label: { EN: "Conditioning",                     IS: "Þrek" } },
  // Player Statistics merged into Player Analysis (Match Analysis) — source is a toggle there.
];

// Planning split into pitch / S&C workflows (May 2026). Coaches were
// struggling to find Strength + Recovery in a flat list dominated by
// pitch-session items. The two workflows have different owners at most
// clubs (head coach vs S&C coach) so separating them mirrors how the
// staff actually splits responsibilities.
export const teamPlanningLinks: SidebarLink[] = [
  // Fixtures is the upstream source of match days — Week setup reads the match
  // day for a week from here, so it sits first in the planning workflow.
  { href: "/coach/fixtures",           label: { EN: "Fixtures",            IS: "Leikjadagatal" } },
  { href: "/coach/availability-board", label: { EN: "Availability Board",  IS: "Leikmannastaða" } },
  { href: "/coach/game-plan-fit",      label: { EN: "Game-Plan Fit",       IS: "Leikáætlunar-hæfni" } },
  { href: "/coach/week-setup",         label: { EN: "Week setup",          IS: "Vikuskipulag" } },
  { href: "/coach/load-plan",          label: { EN: "Pre-session report",  IS: "Æfingaskýrsla (fyrir)" } },
  { href: "/coach/post-training",      label: { EN: "Post-training report", IS: "Æfingaskýrsla (eftir)" } },
  { href: "/coach/progressive-overload", label: { EN: "Progressive overload", IS: "Stigvaxandi álag" } },
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
  { href: "/coach/my-exercises",      label: { EN: "Exercise library",      IS: "Æfingasafn" } },
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

export const strengthPlanningLinks: SidebarLink[] = [
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

export const adminLinks: SidebarLink[] = [
  // Players sits at the top — it's the highest-frequency admin task
  // (approving pending players + roster edits) and the badge needs
  // visibility.
  { href: "/coach/players",           label: { EN: "Players",           IS: "Leikmenn" }, badgeKey: "pending" },
  { href: "/coach/settings",          label: { EN: "Settings",          IS: "Stillingar" } },
  { href: "/coach/reporting-center",  label: { EN: "Reporting center",  IS: "Skýrslumiðstöð" } },
  { href: "/coach/ksi-report",        label: { EN: "KSÍ Report",        IS: "KSÍ skýrsla" } },
  { href: "/coach/integrations",      label: { EN: "Integrations",      IS: "Tengingar" } },
  { href: "/coach/catapult-upload",   label: { EN: "Catapult CSV upload", IS: "Catapult CSV upload" } },
  { href: "/coach/vald-upload",       label: { EN: "VALD CSV upload",   IS: "VALD CSV upload" } },
  { href: "/coach/assessment-upload", label: { EN: "Assessment upload", IS: "Mælingaupphleðsla" } },
];

// Super-admin links — visible ONLY to MicroPulse owner/admin accounts
// (e.g. Helgi). Hidden from all coach/trainer users by the `{isAdmin &&}`
// guard around the section render.
//
// Explosive Power 12w is NOT here — it's mounted under PT Strength training
// (still admin-only) so Helgi can reach it alongside Custom programmes and
// LV Profile rather than via a separate super-admin section.
export const superAdminLinks: SidebarLink[] = [
  { href: "/coach/leads", label: { EN: "Leads (demo/pilot)", IS: "Leads (demo/pilot)" } },
  { href: "/coach/usage-analytics", label: { EN: "Usage analytics", IS: "Notkunar-greining" } },
];

// ─── Active-link matcher (handles ?tab=… deep links too) ────────────────────
export function isLinkActive(href: string, pathname: string, currentTab: string | null): boolean {
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
        className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-[family-name:var(--font-display)] hover:bg-muted/60"
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
                  className={`flex items-center justify-between rounded-md border-l-2 px-3 py-2 text-sm transition-colors ${
                    active
                      ? "border-primary bg-primary/5 font-semibold text-primary"
                      : "border-transparent text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span>{tt(l.label, lang)}</span>
                  {badgeCount > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      active ? "bg-primary/15 text-primary" : "bg-amber-500 text-white"
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
export const LITE_HIDDEN_HREFS = new Set<string>([
  "/coach/indoor-load",
  "/coach/decel-intelligence",
  "/coach/ima-intelligence",
]);

// Lite-hidden pages a BASKETBALL team keeps anyway. IMA is INERTIAL (accel/decel/CoD
// from the pod) — it works indoors without GPS, so an indoor Catapult basketball team
// genuinely has this data even though it resolves to Lite tier. The page itself shows an
// honest "needs genuine IMA data" empty-state for a box-score-only club, so keeping the
// link never renders a broken page. (Mirrors BASKETBALL_KEEP_HREFS for the no-GPS gate.)
export const BASKETBALL_KEEP_LITE_HREFS = new Set<string>([
  "/coach/ima-intelligence",
]);

// Pages shown ONLY on Lite tier — Lite-specific equivalents of Premium
// features. /coach/hsr-intelligence is the Malone 2017 + Buchheit 2014
// counterpart to Decel Intelligence; on Full plans it's redundant with
// the higher-fidelity Decel page so we hide it.
export const FULL_HIDDEN_HREFS = new Set<string>([
  "/coach/hsr-intelligence",
]);

// GPS-dependent Monitoring pages that are permanently empty for a team with no
// external tracking at all (e.g. an indoor basketball club — no GPS indoors, no
// IMA). Lite tier hides only the IMA-premium pages above and deliberately KEEPS
// the GPS-volume pages (it was designed for a Core football club that has GPS
// but no IMA). A no-hardware team has neither, so we additionally drop these.
// Applied only when CoachShell resolves noGpsTeam (intent + zero GPS in 30d),
// so a GPS-equipped Lite football team is unaffected. Note /coach/quadrant is
// listed here even though it's Lite-allowed: its Gabbett-2016 volume axis needs
// total_distance, which a no-GPS team never has.
export const NO_GPS_HIDDEN_HREFS = new Set<string>([
  "/coach/power-curve-intelligence",
  "/coach/hsr-intelligence",
  "/coach/quadrant",
  "/coach/match-movement",
  "/coach/match-insights",
  "/coach/player-game-report",
  "/coach/position-comparison",
  "/coach/train-like-you-play",
  // Both axes would be empty for a no-GPS / basketball team (athlete = GPS/VALD,
  // footballer = StatsBomb squad), so the hub hides rather than showing a dead page.
  "/coach/total-player-analysis",
  // The transfer dossier is a GPS/VALD/VBT export — empty for a no-GPS team.
  "/coach/transfer-report",
]);

// Pages that a BASKETBALL team keeps even though they're in NO_GPS_HIDDEN_HREFS,
// because they have a basketball-native version (box scores, not GPS). Season Match
// Analysis renders the KKÍ / Instat box-score read for basketball.
export const BASKETBALL_KEEP_HREFS = new Set<string>([
  "/coach/match-insights",
  "/coach/win-factors",
]);

// Basketball-ONLY pages — hidden for non-basketball (e.g. football) teams, where they
// have no data. League Win Factors reads the basketball FIBA league boxes only.
export const BASKETBALL_ONLY_HREFS = new Set<string>([
  "/coach/win-factors",
]);

// Club-specific resources — visible ONLY to the listed team_id(s). The
// hamstring ramping-isometrics rehab protocol was set up for Breiðablik and
// should not appear (or be reachable) for any other club. A link with no
// entry here is visible to everyone.
export const TEAM_RESTRICTED_HREFS: Record<string, string[]> = {
  "/coach/hamstring-rehab": ["94b52a06-0b83-48da-8664-639ec3486a0c"], // Breiðablik only
  "/coach/jumpers-knee": ["94b52a06-0b83-48da-8664-639ec3486a0c"], // Breiðablik only
  "/coach/achilles-tendinopathy": ["94b52a06-0b83-48da-8664-639ec3486a0c"], // Breiðablik only
  "/coach/adductor-groin": ["94b52a06-0b83-48da-8664-639ec3486a0c"], // Breiðablik only
  "/coach/ankle-sprain": ["94b52a06-0b83-48da-8664-639ec3486a0c"], // Breiðablik only
};

// ─── Public Sidebar ─────────────────────────────────────────────────────────
export function CoachSidebar({
  isAdmin,
  notesCount,
  pendingCount,
  currentTab,
  currentTeamId,
  catapultDataTier,
  noGpsTeam,
  basketballTeam,
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
  /** True for an indoor / no-hardware team (e.g. basketball with no Catapult):
   *  additionally hides the GPS-only Monitoring pages that would always be empty
   *  (see NO_GPS_HIDDEN_HREFS). Resolved by the shell from sport + data presence. */
  noGpsTeam?: boolean;
  /** True for a basketball team — keeps the pages in BASKETBALL_KEEP_HREFS (which
   *  have a basketball-native version) visible despite the no-GPS gate. */
  basketballTeam?: boolean;
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

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
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
        {/* Sticky footer with sign-out — same as the football-team sidebar.
            The PT variant was missing it, leaving PT coaches no way to log out. */}
        <div className="shrink-0 border-t border-slate-200 bg-white p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <button
            type="button"
            onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            {lang === "IS" ? "Útskrá" : "Sign out"}
          </button>
        </div>
      </div>
    );
  }

  // Filter Monitoring items by Catapult data tier. Lite teams get the
  // /coach/hsr-intelligence page (Malone 2017) instead of the Premium-
  // only Decel Intelligence + Indoor Load + IMA Intelligence. See
  // migration 20260502170000. Applied per sub-group.
  const isLite = catapultDataTier !== "full";
  // Club-specific pages: drop any link restricted to teams that don't include
  // the currently-active team.
  const allowedForTeam = (href: string) => {
    const teams = TEAM_RESTRICTED_HREFS[href];
    return !teams || (currentTeamId != null && teams.includes(currentTeamId));
  };
  const filterForTier = (links: SidebarLink[]) =>
    (isLite
      // Basketball keeps its indoor-capable IMA page despite the Lite gate (IMA is inertial).
      ? links.filter((l) => !(LITE_HIDDEN_HREFS.has(l.href) && !(basketballTeam && BASKETBALL_KEEP_LITE_HREFS.has(l.href))))
      : links.filter((l) => !FULL_HIDDEN_HREFS.has(l.href))
    )
      // No-hardware indoor teams: also drop the GPS-only pages Lite still keeps —
      // except the ones a basketball team has a native (box-score) version of.
      .filter((l) => !(noGpsTeam && NO_GPS_HIDDEN_HREFS.has(l.href) && !(basketballTeam && BASKETBALL_KEEP_HREFS.has(l.href))))
      // Basketball-only pages never show for non-basketball teams (no data there).
      .filter((l) => !(BASKETBALL_ONLY_HREFS.has(l.href) && !basketballTeam))
      .filter((l) => allowedForTeam(l.href));
  const loadMonitoringForTier = filterForTier(loadMonitoringLinks);
  const matchAnalysisForTier = filterForTier(matchAnalysisLinks);
  const movementForTier = filterForTier(movementLinks);
  const injuryMonitoringForTier = filterForTier(injuryMonitoringLinks);
  const rehabProtocolForTier = filterForTier(rehabProtocolLinks);
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
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
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
          label={lang === "IS" ? "Leikgreining" : "Match Analysis"}
          links={matchAnalysisForTier}
          pathname={pathname}
          currentTab={currentTab}
          lang={lang}
          onNavigate={onNavigate}
        />
        {movementForTier.length > 0 && (
          <Section
            label={lang === "IS" ? "Hreyfigreining" : "Movement Analysis"}
            links={movementForTier}
            pathname={pathname}
            currentTab={currentTab}
            lang={lang}
            onNavigate={onNavigate}
          />
        )}
        <Section
          label={lang === "IS" ? "Meiðslaeftirlit" : "Injury Monitoring"}
          links={injuryMonitoringForTier}
          pathname={pathname}
          currentTab={currentTab}
          lang={lang}
          onNavigate={onNavigate}
        />
        {rehabProtocolForTier.length > 0 && (
          <Section
            label={lang === "IS" ? "Endurhæfing" : "Rehab Protocols"}
            links={rehabProtocolForTier}
            pathname={pathname}
            currentTab={currentTab}
            lang={lang}
            onNavigate={onNavigate}
          />
        )}
        <Section
          label={lang === "IS" ? "Frammistöðueftirlit" : "Performance Monitoring"}
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
          <div className="mb-1 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-[family-name:var(--font-display)]">
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

      {/* Sticky footer with sign-out. Safe-area padding keeps the button above
          the iOS home indicator in the installed PWA. */}
      <div className="shrink-0 border-t border-slate-200 bg-white p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
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

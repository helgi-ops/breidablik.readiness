"use client";

/**
 * CoachIconRail — Fasi 3B (experimental, behind a flag).
 *
 * A narrow dark icon rail (top-level sections) + a flyout panel that shows ONE
 * section's links at a time, collapsing ~40 links into ~7 icons. It reuses the
 * EXACT same section data, tier filtering and active-state logic as the list
 * sidebar (CoachSidebar) — no link is ever removed. The default nav stays the
 * list sidebar; a coach opts into this rail via the toggle, so the daily tool is
 * never at risk. PT teams keep the list (their layout differs).
 *
 * Not wired for mobile — the shell keeps the off-canvas list drawer on phones.
 */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang } from "@/lib/lang";
import TeamSwitcher, { type CoachTeam } from "@/components/coach/TeamSwitcher";
import CoachAdoptionBubble from "@/components/coach/CoachAdoptionBubble";
import {
  tt, isLinkActive, type Bi, type SidebarLink,
  communicationLinks, loadMonitoringLinks, matchAnalysisLinks, movementLinks, injuryMonitoringLinks, rehabProtocolLinks, performanceAnalyticsLinks,
  teamPlanningLinks, strengthPlanningLinks, adminLinks, superAdminLinks,
  LITE_HIDDEN_HREFS, FULL_HIDDEN_HREFS, NO_GPS_HIDDEN_HREFS, BASKETBALL_KEEP_HREFS, BASKETBALL_ONLY_HREFS,
} from "./CoachSidebar";

type RailSection = { key: string; label: Bi; links: SidebarLink[] };

export function CoachIconRail({
  isAdmin,
  notesCount,
  pendingCount,
  currentTab,
  currentTeamId,
  catapultDataTier,
  noGpsTeam,
  basketballTeam,
  onSwitchTeam,
  onToggleNav,
  onNavigate,
}: {
  isAdmin: boolean;
  notesCount: number;
  pendingCount: number;
  currentTab: string | null;
  currentTeamId: string | null;
  catapultDataTier?: "full" | "lite";
  noGpsTeam?: boolean;
  basketballTeam?: boolean;
  onSwitchTeam: (team: CoachTeam) => void;
  onToggleNav?: () => void;
  onNavigate?: () => void;
}) {
  const [lang] = useLang();
  const pathname = usePathname() ?? "";
  const isOnCoach = pathname === "/coach" && currentTab == null;

  const isLite = catapultDataTier !== "full";
  const filterForTier = (links: SidebarLink[]) =>
    (isLite ? links.filter((l) => !LITE_HIDDEN_HREFS.has(l.href)) : links.filter((l) => !FULL_HIDDEN_HREFS.has(l.href)))
      .filter((l) => !(noGpsTeam && NO_GPS_HIDDEN_HREFS.has(l.href) && !(basketballTeam && BASKETBALL_KEEP_HREFS.has(l.href))))
      .filter((l) => !(BASKETBALL_ONLY_HREFS.has(l.href) && !basketballTeam));

  const sections = useMemo<RailSection[]>(() => [
    { key: "load", label: { EN: "Load Monitoring", IS: "Álagseftirlit" }, links: filterForTier(loadMonitoringLinks) },
    { key: "match", label: { EN: "Match Analysis", IS: "Leikgreining" }, links: filterForTier(matchAnalysisLinks) },
    { key: "movement", label: { EN: "Movement Analysis", IS: "Hreyfigreining" }, links: filterForTier(movementLinks) },
    { key: "injury", label: { EN: "Injury Monitoring", IS: "Meiðslaeftirlit" }, links: filterForTier(injuryMonitoringLinks) },
    { key: "rehab", label: { EN: "Rehab Protocols", IS: "Endurhæfing" }, links: filterForTier(rehabProtocolLinks) },
    { key: "perf", label: { EN: "Performance Monitoring", IS: "Frammistöðueftirlit" }, links: filterForTier(performanceAnalyticsLinks) },
    { key: "plan", label: { EN: "Team Planning", IS: "Liðs-skipulag" }, links: teamPlanningLinks },
    { key: "strength", label: { EN: "Strength Planning", IS: "Styrktarskipulag" }, links: strengthPlanningLinks },
    // Communication + Alerts moved down here, under Strength Planning (Alerts renders right after Communication in the rail).
    { key: "comm", label: { EN: "Communication", IS: "Samskipti" }, links: communicationLinks },
    { key: "admin", label: { EN: "Admin", IS: "Admin" }, links: adminLinks },
    ...(isAdmin ? [{ key: "mp", label: { EN: "MicroPulse", IS: "MicroPulse" }, links: superAdminLinks }] : []),
  // Drop any section a team's tier/no-GPS filter emptied (e.g. Movement for no-GPS teams) so the
  // rail never shows a dead icon with an empty flyout.
  ].filter((s) => s.links.length > 0),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [isLite, isAdmin, noGpsTeam, basketballTeam]);

  const activeKey = sections.find((s) => s.links.some((l) => isLinkActive(l.href, pathname, currentTab)))?.key ?? null;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Default the flyout to the section holding the active route (once, on mount /
  // when the active section changes), so the coach lands on their current area.
  useEffect(() => { if (activeKey) setOpenKey(activeKey); }, [activeKey]);

  // Close the flyout on outside click / Escape.
  useEffect(() => {
    if (!openKey) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpenKey(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenKey(null); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [openKey]);

  const open = sections.find((s) => s.key === openKey) ?? null;
  const badgeFor = (key: string) => (key === "admin" ? pendingCount : 0);

  return (
    <div ref={ref} className="relative flex h-full">
      {/* Rail */}
      <div className="flex h-full w-[68px] shrink-0 flex-col items-center gap-1 bg-slate-900 py-3 text-white">
        {/* Team identity + switcher (compact square initial) */}
        <div className="mb-1"><TeamSwitcher currentTeamId={currentTeamId} onSwitch={onSwitchTeam} variant="compact" /></div>
        {/* Home / Í dag */}
        <RailButton
          label={lang === "IS" ? "Í dag" : "Today"}
          active={isOnCoach}
          badge={notesCount}
          onClick={() => { setOpenKey(null); onNavigate?.(); }}
          href="/coach"
          icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></svg>}
        />
        <div className="my-1 h-px w-8 bg-white/10" />
        {/* Sections scroll independently so the bottom ones (Admin) are never clipped on
            short screens; Today stays pinned above, the utilities pinned below. */}
        <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sections.map((s) => {
            const label = tt(s.label, lang);
            // Icon = the first 1–2 letters of the CURRENT-language label, so it
            // follows EN/IS (no hardcoded Icelandic initials).
            const initial = label.replace(/[^\p{L}]/gu, "").slice(0, 2) || label.slice(0, 2);
            return (
              <Fragment key={s.key}>
                <RailButton
                  label={label}
                  active={activeKey === s.key}
                  selected={openKey === s.key}
                  badge={badgeFor(s.key)}
                  onClick={() => setOpenKey((k) => (k === s.key ? null : s.key))}
                  icon={<span className="text-[13px] font-bold">{initial}</span>}
                />
                {/* Alerts sits right under Communication (both moved down from the top). */}
                {s.key === "comm" && (
                  <RailButton
                    label={lang === "IS" ? "Tilkynn." : "Alerts"}
                    active={isLinkActive("/coach/notifications", pathname, currentTab)}
                    onClick={() => { setOpenKey(null); onNavigate?.(); }}
                    href="/coach/notifications"
                    icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>}
                  />
                )}
              </Fragment>
            );
          })}
        </div>
        <div className="flex flex-col items-center gap-1 pt-1">
          {/* MicroPulse assistant — mirrors the list-sidebar/mobile mount so the bubble
              is present on desktop in icon-rail mode too. Opens rightward (see placement). */}
          <CoachAdoptionBubble placement="rail" />
          <button
            type="button"
            onClick={onToggleNav}
            title={lang === "IS" ? "Skipta í lista-valmynd" : "Switch to list menu"}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>
          </button>
        </div>
      </div>

      {/* Flyout panel */}
      {open && open.links.length > 0 && (
        <div className="absolute left-[68px] top-0 z-40 h-full w-64 overflow-y-auto rounded-r-2xl border-y border-r border-border bg-card shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-sm font-bold text-foreground">{tt(open.label, lang)}</span>
          </div>
          <ul className="flex flex-col gap-0.5 p-2">
            {open.links.map((l) => {
              const active = isLinkActive(l.href, pathname, currentTab);
              const badge = l.badgeKey === "pending" ? pendingCount : 0;
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => { setOpenKey(null); onNavigate?.(); }}
                    className={`flex items-center justify-between rounded-md border-l-2 px-3 py-2 text-sm transition-colors ${
                      active ? "border-primary bg-primary/5 font-semibold text-primary" : "border-transparent text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span>{tt(l.label, lang)}</span>
                    {badge > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-primary/15 text-primary" : "bg-amber-500 text-white"}`}>{badge}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
            {lang === "IS" ? "Aðeins einn kafli í einu — restin bíður á röndinni." : "One section at a time — the rest wait on the rail."}
          </p>
        </div>
      )}
    </div>
  );
}

function RailButton({ label, icon, active, selected, badge = 0, onClick, href }: {
  label: string; icon: React.ReactNode; active?: boolean; selected?: boolean; badge?: number; onClick?: () => void; href?: string;
}) {
  const inner = (
    <>
      <span className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
        active ? "bg-primary text-primary-foreground" : selected ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10"
      }`}>
        {icon}
        {badge > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">{badge}</span>}
      </span>
      <span className="mt-0.5 max-w-[64px] truncate text-[9px] leading-tight text-white/70">{label}</span>
    </>
  );
  const cls = "flex w-full flex-col items-center";
  if (href) return <Link href={href} onClick={onClick} className={cls} aria-current={active ? "page" : undefined}>{inner}</Link>;
  return <button type="button" onClick={onClick} className={cls} aria-pressed={selected}>{inner}</button>;
}

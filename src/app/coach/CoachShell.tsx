"use client";

// src/app/coach/CoachShell.tsx
// Client shell for the coach area. The actual layout.tsx is a server
// component that exports metadata (including the coach PWA manifest link)
// and renders this shell around the route's children.
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import InstallPwaButton from "@/components/pwa/InstallPwaButton";
import CoachPwaBottomNav from "@/components/pwa/CoachPwaBottomNav";
import PWANotificationPrompt from "@/app/player/dev-player-dashboard/PWANotificationPrompt";
import { useLang } from "@/lib/lang";
import PullToRefresh from "@/components/player/PullToRefresh";
import type { CoachTeam } from "@/components/coach/TeamSwitcher";
import { CoachSidebar } from "./CoachSidebar";
import { CoachIconRail } from "./CoachIconRail";
import UsageTracker from "@/components/coach/UsageTracker";
import CoachAdoptionBubble from "@/components/coach/CoachAdoptionBubble";
import { resolveTeamSport } from "@/lib/micropulse/weekSetup/resolveSport";


/**
 * Read the `?tab=` URL param without using Next.js `useSearchParams()`.
 *
 * `useSearchParams()` requires the consuming subtree to be wrapped in a
 * `<Suspense>` boundary (otherwise static prerender fails for every page
 * under this shell). Reading from `window.location.search` on the client
 * sidesteps that requirement — the trade-off is the active-state
 * highlight on dropdowns appears one frame after first paint, which is
 * imperceptible.
 */
function useUrlTabParam(): string | null {
  const [tab, setTab] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      setTab(params.get("tab"));
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  return tab;
}

/** Manual refresh — the coach app fetches on mount and never refetches, so
 *  without this the only way to see new data was to close and reopen the app.
 *  A full reload (not a soft refetch) because the dashboard is many independent
 *  cards; deliberately MANUAL — never auto-reload on foreground, which would
 *  discard unsaved coach input (match minutes, week setup) mid-edit. */
function RefreshButton({ lang, className }: { lang: "IS" | "EN"; className?: string }) {
  const [spinning, setSpinning] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { setSpinning(true); window.location.reload(); }}
      aria-label={lang === "IS" ? "Endurnýja" : "Refresh"}
      title={lang === "IS" ? "Endurnýja gögn" : "Refresh data"}
      className={className ?? "rounded-md p-2 text-muted-foreground hover:bg-muted"}
    >
      <svg className={spinning ? "animate-spin" : ""} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M23 4v6h-6" />
        <path d="M1 20v-6h6" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    </button>
  );
}

export default function CoachShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentTab = useUrlTabParam();
  const isDisplayRoute = pathname?.startsWith("/coach/display");
  const [lang] = useLang();

  const [pendingCount, setPendingCount] = useState(0);
  const [notesCount, setNotesCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  // Team brand for the sidebar header (logo + short name).
  const [teamBrand, setTeamBrand] = useState<{ name: string; logoUrl: string }>({
    name: "",
    logoUrl: "",
  });

  // Coach's currently active team_id — read from profiles, passed to the
  // sidebar's TeamSwitcher so coaches with multiple teams can swap clubs.
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);

  // Auto-detected Catapult data tier — controls which Monitoring items
  // appear in the sidebar. 'lite' hides Decel Intelligence, Indoor Load
  // and Quadrant View (require B2-3 / IMA-band data the lower-tier
  // Catapult plans don't expose). Auto-promotes to 'full' when B2-3
  // efforts start arriving via Catapult sync. See migration 20260502170000.
  const [catapultDataTier, setCatapultDataTier] = useState<"full" | "lite">("lite");

  // Indoor / no-hardware teams (e.g. a basketball club with no Catapult) would
  // otherwise see GPS-only Monitoring pages that are permanently empty. This
  // flag hides that cluster. Gated on BOTH intent (sport_type basketball /
  // indoor_mode) AND reality (no GPS distance in the last 30 days) so a football
  // team is never affected and it self-corrects if GPS ever starts arriving.
  const [noGpsTeam, setNoGpsTeam] = useState(false);

  // Team type drives whether the sidebar renders the football-coach layout
  // (Monitoring / Planning / Admin sections) or the simplified personal-
  // trainer layout (Dashboard + Strength training + Comms + Settings).
  const [teamType, setTeamType] = useState<string | null>(null);

  // Fetch team_id + branding once per session.
  useEffect(() => {
    let alive = true;
    async function fetchBrand() {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;
      const { data: prof } = await supabase
        .from("profiles").select("team_id").eq("id", userId).maybeSingle();
      const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
      if (alive) setCurrentTeamId(teamId);
      if (!teamId) return;
      const { data: team } = await supabase
        .from("teams")
        .select("name, club_short_name, club_logo_url, team_type")
        .eq("id", teamId)
        .maybeSingle();
      if (!alive || !team) return;
      const t = team as { name?: string; club_short_name?: string; club_logo_url?: string; team_type?: string | null };
      setTeamBrand({
        name: (t.club_short_name?.trim() || t.name?.trim() || "MicroPulse"),
        logoUrl: (t.club_logo_url?.trim() || ""),
      });
      setTeamType(t.team_type ?? null);

      // Catapult data tier — drives Lite-Mode sidebar gating. See
      // src/lib/micropulse/catapultTier for the full feature matrix.
      try {
        const { data: tierData } = await supabase.rpc("get_catapult_data_tier", { p_team_id: teamId });
        if (!alive) return;
        const t = String(tierData ?? "").toLowerCase();
        setCatapultDataTier(t === "full" ? "full" : "lite");
      } catch {
        if (alive) setCatapultDataTier("lite");
      }

      // No-GPS indoor teams: hide the GPS-only Monitoring cluster (see noGpsTeam).
      // Resolve sport via resolveTeamSport so a basketball team that has no
      // team_settings row yet (falls back to teams.sport) is still recognised —
      // otherwise its empty GPS pages leak into the sidebar.
      try {
        const sport = await resolveTeamSport(supabase, teamId);
        const { data: settings } = await supabase
          .from("team_settings").select("indoor_mode").eq("team_id", teamId).maybeSingle();
        const indoorIntent =
          sport === "basketball" ||
          (settings as { indoor_mode?: boolean | null } | null)?.indoor_mode === true;
        if (indoorIntent) {
          const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
          const { count } = await supabase
            .from("player_external_load_daily")
            .select("player_id", { count: "exact", head: true })
            .eq("team_id", teamId)
            .gte("date", since)
            .gt("total_distance", 0);
          if (alive) setNoGpsTeam((count ?? 0) === 0);
        }
      } catch { /* leave noGpsTeam false — show everything if the check fails */ }
    }
    void fetchBrand();
    return () => { alive = false; };
  }, []);

  // Switch the coach's active team. Persists to profiles.team_id (every
  // coach surface reads its team scope from there) then hard-reloads so all
  // pages re-fetch with the new team. Hard reload is intentional — there
  // are dozens of components with their own Supabase queries scoped by
  // team_id, plumbing a context through all of them would be a weeks-long
  // refactor for a once-per-session action.
  async function handleSwitchTeam(team: CoachTeam) {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;
      await supabase.from("profiles").update({ team_id: team.id }).eq("id", userId);
      window.location.reload();
    } catch (err) {
      console.error("[CoachShell] team switch failed", err);
    }
  }

  // ── Mobile nav drawer state ───────────────────────────────────────────
  // Below the md (768px) breakpoint the horizontal desktop nav is hidden
  // (it overflows badly with 7 top-level links + 4 dropdowns) and replaced
  // with a hamburger button that opens this slide-out drawer.
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // ── Fasi 3B: desktop nav mode (experiment, behind a flag) ─────────────────
  // "list" = the current section sidebar (default, safe). "rail" = the narrow
  // icon rail + flyout. Persisted per browser so a coach who opts in keeps it.
  // PT teams always get the list (the rail covers the football-coach layout).
  const [navMode, setNavMode] = useState<"list" | "rail">("list");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe: hydrate the persisted nav mode after mount (localStorage is client-only)
      if (localStorage.getItem("coach-nav-mode") === "rail") setNavMode("rail");
    } catch { /* ignore */ }
  }, []);
  const setNavModePersist = (m: "list" | "rail") => {
    setNavMode(m);
    try { localStorage.setItem("coach-nav-mode", m); } catch { /* ignore */ }
  };

  // Close drawer whenever the route changes (so tapping a link inside the
  // drawer feels like normal navigation — no manual close needed).
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [pathname]);

  // Close on Escape + lock body scroll while the drawer is open.
  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileDrawerOpen(false); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileDrawerOpen]);

  // ── Onboarding guard ──
  // If a COACH lands on /coach/** without a team_id on their profile, redirect
  // them to the self-serve club-creation wizard so they can finish setup.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId || !alive) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("role, team_id")
        .eq("id", userId)
        .maybeSingle();

      if (!alive || !prof) return;
      const role = (prof as { role?: string }).role ?? "";
      const teamId = (prof as { team_id?: string | null }).team_id;

      if (String(role).toLowerCase() === "admin") {
        setIsAdmin(true);
      }

      if (String(role).toUpperCase() === "COACH" && !teamId) {
        window.location.replace("/signup/create-team");
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;

    async function fetchPending() {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", userId)
        .maybeSingle();

      const teamId = (prof as any)?.team_id;
      if (!teamId || !alive) return;

      // Pending player approvals
      const { count } = await supabase
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId)
        .eq("status", "PENDING");

      if (alive) setPendingCount(count ?? 0);

      // Player notes written today
      const today = new Date().toISOString().slice(0, 10);
      const { count: nc } = await supabase
        .from("readiness_entries")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId)
        .eq("entry_date", today)
        .not("notes", "is", null)
        .neq("notes", "");

      if (alive) setNotesCount(nc ?? 0);
    }

    fetchPending();
    // Refresh every 60 seconds
    const interval = setInterval(fetchPending, 60_000);
    return () => { alive = false; clearInterval(interval); };
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────
  // TV display route is its own world (no chrome). Everything else gets
  // the sidebar layout: persistent left rail on >= md, slide-out drawer on
  // < md. Header is minimal and only renders on mobile (it's the trigger
  // for the drawer). On desktop the sidebar replaces the header entirely.
  if (isDisplayRoute) {
    return (
      <div className="min-h-screen bg-background">
        <main className="w-full px-4 py-6">{children}</main>
      </div>
    );
  }

  const isPt = String(teamType ?? "").toLowerCase() === "personal_trainer";
  const useRail = navMode === "rail" && !isPt;

  return (
    <div className={`min-h-screen bg-background md:grid ${useRail ? "md:grid-cols-[68px_1fr]" : "md:grid-cols-[264px_1fr]"}`}>
      {/* Usage analytics — one fire-and-forget page_view per route change. */}
      <UsageTracker />
      {/* Pull down from the top to refresh — so a coach never has to close and
          reopen the app to see new data (mobile; desktop uses the buttons). */}
      <PullToRefresh onRefresh={() => window.location.reload()} lang={lang === "IS" ? "IS" : "EN"} />
      {/* ── Mobile-only header (drawer trigger) ─────────────────────────── */}
      <header className="md:hidden sticky top-0 z-40 border-b bg-background/95 backdrop-blur flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted"
            aria-label={lang === "IS" ? "Opna valmynd" : "Open menu"}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="flex items-center gap-2 min-w-0">
            {teamBrand.logoUrl ? (
              <img
                src={teamBrand.logoUrl}
                alt={teamBrand.name}
                className="h-8 w-8 rounded-md object-contain bg-white border border-slate-200 shrink-0"
              />
            ) : null}
            <div className="text-sm font-semibold tracking-tight truncate">
              {teamBrand.name || "MicroPulse"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Notifications — always reachable in the app. It used to live only deep
              inside the menu (under Injury Monitoring), so coaches on the phone
              couldn't find or press it; a top-level bell fixes that. */}
          <Link
            href="/coach/notifications"
            aria-label={lang === "IS" ? "Tilkynningar" : "Notifications"}
            className="relative rounded-md p-2 text-muted-foreground hover:bg-muted"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            {pendingCount > 0 ? (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">{pendingCount}</span>
            ) : null}
          </Link>
          <CoachAdoptionBubble />
          <RefreshButton lang={lang === "IS" ? "IS" : "EN"} />
          <InstallPwaButton role="coach" variant="compact" />
        </div>
      </header>

      {/* ── Desktop persistent sidebar ─────────────────────────────────── */}
      {/* Brand bar removed: the team-switcher dropdown at the top of the
          CoachSidebar already shows the team identity, so the separate
          logo+name row was redundant. Install PWA button stays in the
          top-right slot — small footprint, only visible when installable. */}
      {useRail ? (
        <aside className="relative z-30 hidden md:block md:sticky md:top-0 md:h-screen">
          <CoachIconRail
            isAdmin={isAdmin}
            notesCount={notesCount}
            pendingCount={pendingCount}
            currentTab={currentTab}
            currentTeamId={currentTeamId}
            catapultDataTier={catapultDataTier}
            noGpsTeam={noGpsTeam}
            onSwitchTeam={handleSwitchTeam}
            onToggleNav={() => setNavModePersist("list")}
          />
        </aside>
      ) : (
        <aside className="hidden md:flex md:flex-col md:border-r md:border-slate-200 md:bg-white md:sticky md:top-0 md:h-screen">
          <div className="flex items-center justify-between px-4 py-2">
            {!isPt && (
              <button
                type="button"
                onClick={() => setNavModePersist("rail")}
                title={lang === "IS" ? "Prófa táknarönd (tilraun)" : "Try the icon rail (experiment)"}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={lang === "IS" ? "Prófa táknarönd" : "Try the icon rail"}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="6" height="18" rx="1" /><line x1="13" y1="7" x2="20" y2="7" /><line x1="13" y1="12" x2="20" y2="12" /><line x1="13" y1="17" x2="18" y2="17" /></svg>
                {lang === "IS" ? "Táknarönd" : "Icon rail"}
              </button>
            )}
            <div className="flex items-center gap-1">
              <CoachAdoptionBubble />
              <RefreshButton lang={lang === "IS" ? "IS" : "EN"} />
              <InstallPwaButton role="coach" variant="compact" />
            </div>
          </div>
          <CoachSidebar
            isAdmin={isAdmin}
            notesCount={notesCount}
            pendingCount={pendingCount}
            currentTab={currentTab}
            currentTeamId={currentTeamId}
            catapultDataTier={catapultDataTier}
            noGpsTeam={noGpsTeam}
            teamType={teamType}
            onSwitchTeam={handleSwitchTeam}
          />
        </aside>
      )}

      {/* ── Mobile drawer (renders the same CoachSidebar) ──────────────── */}
      {mobileDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(false)}
            className="absolute inset-0 bg-black/40"
            aria-label={lang === "IS" ? "Loka valmynd" : "Close menu"}
          />
          <aside
            className="absolute inset-y-0 left-0 w-[85%] max-w-sm bg-white shadow-xl flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label={lang === "IS" ? "Aðalvalmynd" : "Main menu"}
          >
            {/* Drawer header — close button only. Brand removed because the
                team-switcher dropdown immediately below already shows the
                team identity. */}
            <div className="flex items-center justify-end px-4 py-2">
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                aria-label={lang === "IS" ? "Loka" : "Close"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {/* Bounded, shrinkable wrapper so CoachSidebar's h-full resolves to
                the remaining drawer height — its internal list scrolls and the
                sticky sign-out footer stays pinned and reachable (PWA fix). */}
            <div className="min-h-0 flex-1 flex flex-col">
              <CoachSidebar
                isAdmin={isAdmin}
                notesCount={notesCount}
                pendingCount={pendingCount}
                currentTab={currentTab}
                currentTeamId={currentTeamId}
                catapultDataTier={catapultDataTier}
                noGpsTeam={noGpsTeam}
                teamType={teamType}
                onSwitchTeam={handleSwitchTeam}
                onNavigate={() => setMobileDrawerOpen(false)}
              />
            </div>
          </aside>
        </div>
      )}

      {/* ── Main content column ────────────────────────────────────────── */}
      <div className="flex flex-col min-h-screen">
        <main className="flex-1 px-4 py-6 md:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="mb-4">
              <PWANotificationPrompt />
            </div>
            {children}
          </div>
        </main>

        {/* PWA bottom navigation — only renders in standalone/PWA mode */}
        <CoachPwaBottomNav />
      </div>
    </div>
  );
}

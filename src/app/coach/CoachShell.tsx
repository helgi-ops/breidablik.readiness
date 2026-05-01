"use client";

// src/app/coach/CoachShell.tsx
// Client shell for the coach area. The actual layout.tsx is a server
// component that exports metadata (including the coach PWA manifest link)
// and renders this shell around the route's children.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import InstallPwaButton from "@/components/pwa/InstallPwaButton";
import CoachPwaBottomNav from "@/components/pwa/CoachPwaBottomNav";
import PWANotificationPrompt from "@/app/player/dev-player-dashboard/PWANotificationPrompt";
import { useLang, type Lang } from "@/lib/lang";

// ── Bilingual nav labels ──────────────────────────────────────────────
type Bi = { EN: string; IS: string };
const tt = (b: Bi, lang: Lang) => (lang === "IS" ? b.IS : b.EN);

// Player-monitoring cluster — "what's happening with my players right now?"
// Deeper analytics layered on top of the dashboard's daily Today/Squad views.
const monitoringLinks: { href: string; label: Bi }[] = [
  { href: "/coach/quadrant",           label: { EN: "Quadrant view (Gabbett)",        IS: "Quadrant view (Gabbett)" } },
  { href: "/coach/indoor-load",        label: { EN: "Indoor Load (höll-mode)",        IS: "Indoor Load (höll-mode)" } },
  { href: "/coach/decel-intelligence", label: { EN: "Decel Intelligence (McBurnie)",  IS: "Decel Intelligence (McBurnie)" } },
  { href: "/coach/injuries",           label: { EN: "Injury Pattern Analysis",        IS: "Meiðsla-munstursgreining" } },
  { href: "/coach/notifications",      label: { EN: "Notifications",                  IS: "Tilkynningar" } },
];

// Session-building cluster — "how do I plan and run training?"
// MD Comparison + Session builder live as in-app dashboard tabs (?tab=…),
// the others are standalone routes.
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

// Only shown to users with profiles.role === 'admin'
const superAdminLinks: { href: string; label: Bi }[] = [
  { href: "/coach/leads", label: { EN: "Leads (demo/pilot)", IS: "Leads (demo/pilot)" } },
];

/**
 * Match a link href against the current location, supporting both pure path
 * links ("/coach/quadrant") and query-string deep links ("/coach?tab=md").
 *
 * Pure path: pathname must startsWith href.
 * Query link: pathname must equal the path part AND every query param in
 * href must match what's currently in the URL (so /coach matches but
 * /coach?tab=squad doesn't match /coach?tab=md).
 */
function isLinkActive(href: string, pathname: string, currentTab: string | null): boolean {
  const [path, query] = href.split("?");
  if (!query) return pathname?.startsWith(path) ?? false;
  if (pathname !== path) return false;
  const params = new URLSearchParams(query);
  const wantedTab = params.get("tab");
  return wantedTab != null && currentTab === wantedTab;
}

function NavDropdown({
  label,
  links,
  pathname,
  currentTab,
  lang,
}: {
  label: string;
  links: { href: string; label: Bi }[];
  pathname: string;
  currentTab: string | null;
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeLink = links.find((l) => isLinkActive(l.href, pathname, currentTab)) ?? null;
  const isActive = activeLink != null;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm hover:bg-muted ${
          isActive ? "font-medium text-foreground" : "text-muted-foreground"
        }`}
      >
        {/* When a child page is active, surface its label so the user knows
            which dropdown contains the current view. */}
        {activeLink ? `${label} · ${tt(activeLink.label, lang)}` : label}
        <svg
          className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border bg-background py-1 shadow-lg">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2 text-sm hover:bg-muted ${
                isLinkActive(link.href, pathname, currentTab)
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {tt(link.label, lang)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

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

export default function CoachShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentTab = useUrlTabParam();
  const isDisplayRoute = pathname?.startsWith("/coach/display");
  const [lang] = useLang();

  const [pendingCount, setPendingCount] = useState(0);
  const [notesCount, setNotesCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  // ── Mobile nav drawer state ───────────────────────────────────────────
  // Below the md (768px) breakpoint the horizontal desktop nav is hidden
  // (it overflows badly with 7 top-level links + 4 dropdowns) and replaced
  // with a hamburger button that opens this slide-out drawer.
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div
          className={`${
            isDisplayRoute ? "w-full px-4 py-3" : "mx-auto max-w-6xl px-4 py-3"
          } flex items-center justify-between`}
        >
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold tracking-tight">
              Coach · Readiness
            </div>
            <div className="hidden text-xs text-muted-foreground sm:block">
              MicroPulse
            </div>
            <InstallPwaButton role="coach" variant="compact" />
          </div>

          {/* Mobile hamburger — opens slide-out drawer below md breakpoint.
              Desktop nav is hidden under md and shown from md+. */}
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="md:hidden rounded-md p-2 text-muted-foreground hover:bg-muted"
            aria-label={lang === "IS" ? "Opna valmynd" : "Open menu"}
            aria-expanded={mobileDrawerOpen}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/coach"
              className={`relative rounded-md px-3 py-2 text-sm hover:bg-muted ${pathname === "/coach" ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              Dashboard
              {notesCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                  {notesCount}
                </span>
              )}
            </Link>

            <Link
              href="/coach/players"
              className={`relative rounded-md px-3 py-2 text-sm hover:bg-muted ${pathname?.startsWith("/coach/players") ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              Players
              {pendingCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </Link>

            <Link
              href="/coach/week-setup"
              className={`rounded-md px-3 py-2 text-sm hover:bg-muted ${pathname?.startsWith("/coach/week-setup") ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              Week setup
            </Link>

            <Link
              href="/coach/conversations"
              className={`rounded-md px-3 py-2 text-sm hover:bg-muted ${pathname?.startsWith("/coach/conversations") ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              Conversations
            </Link>

            <Link
              href="/team"
              className={`rounded-md px-3 py-2 text-sm hover:bg-muted ${pathname === "/team" ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              Team Page
            </Link>

            <Link
              href="/coach/messages"
              className={`rounded-md px-3 py-2 text-sm hover:bg-muted ${pathname?.startsWith("/coach/messages") ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              Messages
            </Link>

            <Link
              href="/coach/display?refresh=15"
              target="_blank"
              rel="noreferrer"
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              TV ↗
            </Link>

            <NavDropdown
              label={lang === "IS" ? "Eftirlit" : "Monitoring"}
              links={monitoringLinks}
              pathname={pathname ?? ""}
              currentTab={currentTab}
              lang={lang}
            />

            <NavDropdown
              label={lang === "IS" ? "Skipulag" : "Planning"}
              links={planningLinks}
              pathname={pathname ?? ""}
              currentTab={currentTab}
              lang={lang}
            />

            <NavDropdown
              label="Admin"
              links={adminLinks}
              pathname={pathname ?? ""}
              currentTab={currentTab}
              lang={lang}
            />

            {isAdmin && (
              <NavDropdown
                label="MicroPulse"
                links={superAdminLinks}
                pathname={pathname ?? ""}
                currentTab={currentTab}
                lang={lang}
              />
            )}

            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/login";
              }}
              className="ml-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>

      {/* ── Mobile slide-out drawer ───────────────────────────────────────
          Opens from the hamburger button below md (768px). Renders ALL
          nav items the desktop header has, grouped into sections so the
          coach can scan instead of scrolling a flat list of 18 routes.
          Auto-closes on route change (see useEffect above), Escape, and
          backdrop tap.
      */}
      {mobileDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(false)}
            className="absolute inset-0 bg-black/40"
            aria-label={lang === "IS" ? "Loka valmynd" : "Close menu"}
          />
          {/* Drawer panel */}
          <aside
            className="absolute inset-y-0 left-0 w-[85%] max-w-sm bg-white shadow-xl overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-label={lang === "IS" ? "Aðalvalmynd" : "Main menu"}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <div className="text-sm font-semibold tracking-tight">Coach · Readiness</div>
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

            <nav className="flex flex-col gap-0.5 p-3">
              {/* Top-level frequent routes */}
              <Link href="/coach" className="rounded-md px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100 flex items-center justify-between">
                <span>Dashboard</span>
                {notesCount > 0 && (
                  <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{notesCount}</span>
                )}
              </Link>
              <Link href="/coach/players" className="rounded-md px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100 flex items-center justify-between">
                <span>{lang === "IS" ? "Leikmenn" : "Players"}</span>
                {pendingCount > 0 && (
                  <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{pendingCount}</span>
                )}
              </Link>
              <Link href="/coach/week-setup" className="rounded-md px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100">
                {lang === "IS" ? "Vikuskipulag" : "Week setup"}
              </Link>

              {/* Communication */}
              <div className="mt-4 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {lang === "IS" ? "Samskipti" : "Communication"}
              </div>
              <Link href="/coach/conversations" className="rounded-md px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100">Conversations</Link>
              <Link href="/coach/messages" className="rounded-md px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100">Messages</Link>
              <Link href="/team" className="rounded-md px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100">Team Page</Link>

              {/* Monitoring */}
              <div className="mt-4 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {lang === "IS" ? "Eftirlit" : "Monitoring"}
              </div>
              {monitoringLinks.map((l) => (
                <Link key={l.href} href={l.href} className="rounded-md px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100">
                  {tt(l.label, lang)}
                </Link>
              ))}

              {/* Planning */}
              <div className="mt-4 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {lang === "IS" ? "Skipulag" : "Planning"}
              </div>
              {planningLinks.map((l) => (
                <Link key={l.href} href={l.href} className="rounded-md px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100">
                  {tt(l.label, lang)}
                </Link>
              ))}

              {/* Admin */}
              <div className="mt-4 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Admin</div>
              {adminLinks.map((l) => (
                <Link key={l.href} href={l.href} className="rounded-md px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100">
                  {tt(l.label, lang)}
                </Link>
              ))}

              {/* Super-admin only */}
              {isAdmin && (
                <>
                  <div className="mt-4 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">MicroPulse</div>
                  {superAdminLinks.map((l) => (
                    <Link key={l.href} href={l.href} className="rounded-md px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100">
                      {tt(l.label, lang)}
                    </Link>
                  ))}
                </>
              )}

              {/* TV */}
              <div className="mt-4 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">TV</div>
              <a
                href="/coach/display?refresh=15"
                target="_blank"
                rel="noreferrer"
                className="rounded-md px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100"
              >
                {lang === "IS" ? "Skjár ↗" : "TV view ↗"}
              </a>
            </nav>

            {/* Footer with sign-out */}
            <div className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-3">
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = "/login";
                }}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
              >
                {lang === "IS" ? "Útskrá" : "Sign out"}
              </button>
            </div>
          </aside>
        </div>
      )}

      <main className={isDisplayRoute ? "w-full px-4 py-6" : "mx-auto max-w-6xl px-4 py-6"}>
        {/* One-time push-notification opt-in. Self-suppresses after dismissal
            or once permission is already granted/denied. */}
        {!isDisplayRoute && (
          <div className="mb-4">
            <PWANotificationPrompt />
          </div>
        )}
        {children}
      </main>

      {/* PWA bottom navigation — only renders in standalone/PWA mode */}
      {!isDisplayRoute && <CoachPwaBottomNav />}
    </div>
  );
}

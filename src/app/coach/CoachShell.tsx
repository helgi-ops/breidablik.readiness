"use client";

// src/app/coach/CoachShell.tsx
// Client shell for the coach area. The actual layout.tsx is a server
// component that exports metadata (including the coach PWA manifest link)
// and renders this shell around the route's children.
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import InstallPwaButton from "@/components/pwa/InstallPwaButton";
import CoachPwaBottomNav from "@/components/pwa/CoachPwaBottomNav";
import PWANotificationPrompt from "@/app/player/dev-player-dashboard/PWANotificationPrompt";
import { useLang } from "@/lib/lang";
import { CoachSidebar } from "./CoachSidebar";


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

  // Team brand for the sidebar header (logo + short name).
  const [teamBrand, setTeamBrand] = useState<{ name: string; logoUrl: string }>({
    name: "",
    logoUrl: "",
  });

  // Fetch team branding once per session.
  useEffect(() => {
    let alive = true;
    async function fetchBrand() {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;
      const { data: prof } = await supabase
        .from("profiles").select("team_id").eq("id", userId).maybeSingle();
      const teamId = (prof as { team_id?: string | null } | null)?.team_id;
      if (!teamId) return;
      const { data: team } = await supabase
        .from("teams")
        .select("name, club_short_name, club_logo_url")
        .eq("id", teamId)
        .maybeSingle();
      if (!alive || !team) return;
      const t = team as { name?: string; club_short_name?: string; club_logo_url?: string };
      setTeamBrand({
        name: (t.club_short_name?.trim() || t.name?.trim() || "MicroPulse"),
        logoUrl: (t.club_logo_url?.trim() || ""),
      });
    }
    void fetchBrand();
    return () => { alive = false; };
  }, []);

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

  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[240px_1fr]">
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
        <InstallPwaButton role="coach" variant="compact" />
      </header>

      {/* ── Desktop persistent sidebar ─────────────────────────────────── */}
      <aside className="hidden md:flex md:flex-col md:border-r md:border-slate-200 md:bg-white md:sticky md:top-0 md:h-screen">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
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
          <InstallPwaButton role="coach" variant="compact" />
        </div>
        <CoachSidebar
          isAdmin={isAdmin}
          notesCount={notesCount}
          pendingCount={pendingCount}
          currentTab={currentTab}
        />
      </aside>

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
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
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
            <CoachSidebar
              isAdmin={isAdmin}
              notesCount={notesCount}
              pendingCount={pendingCount}
              currentTab={currentTab}
              onNavigate={() => setMobileDrawerOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* ── Main content column ────────────────────────────────────────── */}
      <div className="flex flex-col min-h-screen">
        <main className="flex-1 px-4 py-6 md:px-8">
          <div className="mx-auto max-w-6xl">
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

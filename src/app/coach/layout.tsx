"use client";

// src/app/coach/layout.tsx
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDisplayRoute = pathname?.startsWith("/coach/display");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className={`${isDisplayRoute ? "w-full px-4 py-3" : "mx-auto flex max-w-6xl items-center justify-between px-4 py-3"} flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold tracking-tight">
              Coach · Readiness
            </div>
            <div className="hidden text-xs text-muted-foreground sm:block">
              Breiðablik Readiness
            </div>
          </div>

          <nav className="flex items-center gap-2">
            <Link
              href="/coach"
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              Dashboard
            </Link>

            <Link
              href="/coach/players"
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              Players
            </Link>

            <Link
              href="/coach/messages"
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              Messages
            </Link>

            <Link
              href="/coach/week-setup"
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              Week setup
            </Link>

            <Link
              href="/coach/match-minutes"
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              Match minutes
            </Link>

            {/* 🔥 NÝTT */}
            <Link
              href="/coach/templates"
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              Templates
            </Link>

            <Link
              href="/coach/session-workflow"
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              Session workflow
            </Link>

            <Link
              href="/coach/settings"
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              Settings
            </Link>

            <Link
              href="/coach/org-reporting"
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              Org reporting
            </Link>

            <Link
              href="/coach/reporting-center"
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              Reporting center
            </Link>

            <Link
              href="/coach/integrations"
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              Integrations
            </Link>

            <Link
              href="/coach/automation-center"
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              Automation
            </Link>
          </nav>
        </div>
      </header>

      <main className={isDisplayRoute ? "w-full px-4 py-6" : "mx-auto max-w-6xl px-4 py-6"}>{children}</main>
    </div>
  );
}

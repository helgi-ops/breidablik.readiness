"use client";

// src/app/coach/layout.tsx
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

const operationsLinks = [
  { href: "/coach/week-setup", label: "Week setup" },
  { href: "/coach/match-minutes", label: "Match minutes" },
  { href: "/coach/session-workflow", label: "Session workflow" },
  { href: "/coach/templates", label: "Templates" },
];

const adminLinks = [
  { href: "/coach/settings", label: "Settings" },
  { href: "/coach/org-reporting", label: "Org reporting" },
  { href: "/coach/reporting-center", label: "Reporting center" },
  { href: "/coach/integrations", label: "Integrations" },
  { href: "/coach/automation-center", label: "Automation" },
];

function NavDropdown({
  label,
  links,
  pathname,
}: {
  label: string;
  links: { href: string; label: string }[];
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = links.some((l) => pathname?.startsWith(l.href));

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
        {label}
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
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border bg-background py-1 shadow-lg">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2 text-sm hover:bg-muted ${
                pathname?.startsWith(link.href)
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDisplayRoute = pathname?.startsWith("/coach/display");

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
              Breiðablik Readiness
            </div>
          </div>

          <nav className="flex items-center gap-1">
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

            <NavDropdown
              label="Operations"
              links={operationsLinks}
              pathname={pathname ?? ""}
            />

            <NavDropdown
              label="Admin"
              links={adminLinks}
              pathname={pathname ?? ""}
            />
          </nav>
        </div>
      </header>

      <main className={isDisplayRoute ? "w-full px-4 py-6" : "mx-auto max-w-6xl px-4 py-6"}>
        {children}
      </main>
    </div>
  );
}

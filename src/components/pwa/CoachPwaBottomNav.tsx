"use client";

/**
 * CoachPwaBottomNav
 *
 * Bottom navigation bar for the Coach PWA. Mirrors the player's PWABottomNav
 * pattern so the coach dashboard feels like a native app when installed.
 *
 * Only renders when the page is running in standalone / PWA display mode so it
 * doesn't clutter the desktop browser view.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

function usePwaMode(): boolean {
  const [isPwa, setIsPwa] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const update = () =>
      setIsPwa(
        mq.matches ||
          Boolean(
            (window.navigator as Navigator & { standalone?: boolean }).standalone
          )
      );
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return isPwa;
}

/* ── Icons ──────────────────────────────────────────────────────────────── */

type IconProps = { active: boolean };

function IconHome({ active }: IconProps) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12L12 4l9 8" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}

function IconTeam({ active }: IconProps) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function IconCalendar({ active }: IconProps) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconChat({ active }: IconProps) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function IconBarChart({ active }: IconProps) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="12" width="4" height="9" />
      <rect x="10" y="7" width="4" height="14" />
      <rect x="17" y="3" width="4" height="18" />
    </svg>
  );
}

/* ── Tab definitions ────────────────────────────────────────────────────── */

type Tab = {
  href: string;
  label: string;
  Icon: (p: IconProps) => React.JSX.Element;
  /** Paths that should mark this tab as active (prefix match). */
  matchPrefixes: string[];
};

const TABS: Tab[] = [
  {
    href: "/coach",
    label: "YFIRLIT",
    Icon: IconHome,
    matchPrefixes: ["/coach"],
  },
  {
    href: "/coach/players",
    label: "LEIKMENN",
    Icon: IconTeam,
    matchPrefixes: ["/coach/players"],
  },
  {
    href: "/coach/week-setup",
    label: "VIKA",
    Icon: IconCalendar,
    matchPrefixes: ["/coach/week-setup"],
  },
  {
    href: "/coach/conversations",
    label: "SAMTÖL",
    Icon: IconChat,
    matchPrefixes: ["/coach/conversations", "/coach/messages"],
  },
  {
    href: "/team",
    label: "LIÐ",
    Icon: IconBarChart,
    matchPrefixes: ["/team"],
  },
];

/**
 * Determine which tab is active. For /coach we require an exact match because
 * every coach path is a prefix of /coach.
 */
function activeTabIndex(pathname: string): number {
  // Exact /coach wins
  if (pathname === "/coach") return 0;
  // Longest matching prefix (other than /coach itself) wins
  let best = -1;
  let bestLen = 0;
  for (let i = 0; i < TABS.length; i++) {
    for (const prefix of TABS[i].matchPrefixes) {
      if (prefix === "/coach") continue;
      if (pathname.startsWith(prefix) && prefix.length > bestLen) {
        best = i;
        bestLen = prefix.length;
      }
    }
  }
  return best;
}

/* ── Component ──────────────────────────────────────────────────────────── */

export default function CoachPwaBottomNav() {
  const isPwa = usePwaMode();
  const pathname = usePathname() ?? "";

  if (!isPwa) return null;

  const active = activeTabIndex(pathname);

  return (
    <>
      {/* Spacer so content isn't hidden behind the fixed bar */}
      <div
        aria-hidden
        style={{ height: "calc(56px + env(safe-area-inset-bottom))" }}
      />
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Coach navigation"
      >
        <div className="flex">
          {TABS.map((tab, i) => {
            const isActive = i === active;
            const Icon = tab.Icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
                  isActive ? "text-green-700" : "text-zinc-400"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon active={isActive} />
                <span
                  className={`text-[9px] font-semibold tracking-wide ${
                    isActive ? "text-green-700" : "text-zinc-400"
                  }`}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

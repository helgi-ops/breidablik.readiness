"use client";

import { useEffect, useState } from "react";
import { registerPushSubscription, RegisterPushSubscriptionError } from "@/lib/push/registerPushSubscription";

type PermState = "unknown" | "granted" | "denied" | "default";
type UiState = "idle" | "requesting" | "success" | "error";

function getCurrentPermission(): PermState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unknown";
  return (Notification.permission as PermState) ?? "unknown";
}

/** Re-show the dismissed prompt after this many days. Players who said
 *  "Ekki núna" still need reminders eventually — permanent dismissal led
 *  to <30% adoption (Þór, Grindavík). 7 days = weekly reminder loop. */
const DISMISS_REMIND_AFTER_DAYS = 7;

function isDismissalStale(): boolean {
  try {
    const raw = localStorage.getItem("pwa-notif-dismissed-at");
    if (!raw) {
      // Legacy "1" flag from before timestamp tracking — treat as stale so
      // we re-prompt these players once.
      return localStorage.getItem("pwa-notif-dismissed") === "1";
    }
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt)) return true;
    const ageMs = Date.now() - dismissedAt;
    return ageMs > DISMISS_REMIND_AFTER_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/** True when running on iOS Safari outside standalone (PWA) mode. iOS only
 *  supports push from installed PWAs, so the prompt must guide install
 *  instead of asking permission directly. */
function isIosNonStandalone(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as { MSStream?: unknown }).MSStream;
  // navigator.standalone is iOS-specific
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia?.("(display-mode: standalone)")?.matches === true;
  return isIos && !standalone;
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function BellOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
      <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
      <path d="M18 8a6 6 0 0 0-9.33-5" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export default function PWANotificationPrompt() {
  const [permission, setPermission] = useState<PermState>("unknown");
  const [uiState, setUiState] = useState<UiState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [iosInstallNeeded, setIosInstallNeeded] = useState(false);

  useEffect(() => {
    // Re-show prompt every DISMISS_REMIND_AFTER_DAYS even after dismissal.
    setDismissed(!isDismissalStale() && !!localStorage.getItem("pwa-notif-dismissed-at"));
    setPermission(getCurrentPermission());
    setIosInstallNeeded(isIosNonStandalone());
  }, []);

  // iOS Safari outside standalone — different copy, no permission ask
  // (iOS doesn't expose Notification API in browser tabs).
  if (iosInstallNeeded && !dismissed) {
    return (
      <div className="mx-4 mb-3 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-blue-600 shrink-0">
            <BellIcon />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-900 leading-snug">
              Settu upp sem app til að fá tilkynningar
            </p>
            <p className="text-xs text-blue-800/80 mt-0.5 leading-relaxed">
              Tap-aðu á <span className="font-semibold">Share</span> ⤴ → <span className="font-semibold">&ldquo;Add to Home Screen&rdquo;</span>. Síðan opnar þú app-icon-ið og enable-ar tilkynningar — þá færðu áminningu um check-in.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 text-blue-400 hover:text-blue-600 p-0.5 -mt-0.5 -mr-0.5"
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Don't show anything if:
  // - Notifications not supported
  // - Permission already granted (subscribed)
  // - Permission denied (can't ask again from JS)
  // - User dismissed the banner (and not yet stale)
  if (
    permission === "unknown" ||
    permission === "granted" ||
    permission === "denied" ||
    dismissed
  ) {
    return null;
  }

  function handleDismiss() {
    try {
      // Store timestamp so we can re-show after DISMISS_REMIND_AFTER_DAYS
      localStorage.setItem("pwa-notif-dismissed-at", String(Date.now()));
      // Clean up legacy flag if present
      localStorage.removeItem("pwa-notif-dismissed");
    } catch { /* ignore */ }
    setDismissed(true);
  }

  async function handleEnable() {
    setUiState("requesting");
    setErrorMsg(null);
    try {
      await registerPushSubscription();
      setPermission("granted");
      setUiState("success");
    } catch (err) {
      if (err instanceof RegisterPushSubscriptionError) {
        if (err.code === "PERMISSION_DENIED") {
          setPermission("denied");
          setUiState("idle");
          return;
        }
        if (err.code === "SERVICE_WORKER_UNSUPPORTED" || err.code === "PUSH_UNSUPPORTED") {
          setErrorMsg("Push notifications not supported on this device.");
        } else {
          setErrorMsg("Could not enable notifications. Please try again.");
        }
      } else {
        setErrorMsg("Could not enable notifications. Please try again.");
      }
      setUiState("error");
    }
  }

  // Success flash — auto-hide after 3 s
  if (uiState === "success") {
    setTimeout(() => setDismissed(true), 3000);
    return (
      <div className="mx-4 mb-3 rounded-xl bg-green-50 border border-green-200 px-4 py-3 flex items-center gap-3 text-sm text-green-800">
        <BellIcon />
        <span className="flex-1 font-medium">Tilkynningar virkar!</span>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3 rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-zinc-500 shrink-0">
          <BellIcon />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-800 leading-snug">
            Ekki missa af check-in
          </p>
          <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
            Án tilkynninga gleymist check-in oft og þá veit þjálfarinn ekki hvernig þér líður. Tap-aðu Virkja og samþykktu í kerfinu.
          </p>
          {uiState === "error" && errorMsg && (
            <p className="text-xs text-red-600 mt-1">{errorMsg}</p>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 text-zinc-400 hover:text-zinc-600 p-0.5 -mt-0.5 -mr-0.5"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleEnable}
          disabled={uiState === "requesting"}
          className="flex-1 rounded-lg bg-zinc-900 text-white text-xs font-medium py-2 px-3 disabled:opacity-50 active:opacity-80"
        >
          {uiState === "requesting" ? "Virkjar..." : "Virkja"}
        </button>
        <button
          onClick={handleDismiss}
          className="rounded-lg border border-zinc-200 bg-white text-zinc-600 text-xs font-medium py-2 px-3 active:opacity-80"
        >
          Ekki núna
        </button>
      </div>
    </div>
  );
}

/** Small icon-only bell button to re-enable notifications (shown when permission is denied or not yet set) */
export function PWANotificationSettingsButton() {
  const [permission, setPermission] = useState<PermState>("unknown");
  const [uiState, setUiState] = useState<UiState>("idle");

  useEffect(() => {
    setPermission(getCurrentPermission());
  }, []);

  // Only show when permission is still requestable (default state)
  // If denied — browser controls it, nothing we can do from JS
  if (permission !== "default" && permission !== "unknown") return null;

  async function handlePress() {
    if (uiState === "requesting") return;
    setUiState("requesting");
    try {
      await registerPushSubscription();
      setPermission("granted");
      setUiState("success");
    } catch {
      setUiState("idle");
    }
  }

  if (uiState === "success") {
    return (
      <span className="text-green-600">
        <BellIcon />
      </span>
    );
  }

  return (
    <button
      onClick={handlePress}
      disabled={uiState === "requesting"}
      title="Virkja tilkynningar"
      className="text-zinc-400 hover:text-zinc-700 disabled:opacity-40"
    >
      <BellOffIcon />
    </button>
  );
}

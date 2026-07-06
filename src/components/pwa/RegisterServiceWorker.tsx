"use client";

import { useEffect } from "react";

export default function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // In development the service worker's cache masks code changes — HMR updates
    // the source but the SW keeps serving the old cached build (this is why UI
    // edits weren't showing up on the check-in page). Skip registration in dev
    // and proactively tear down any SW + caches left over from a prior prod
    // build so development always reflects the latest code.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.error("Service worker registration failed:", err));
  }, []);

  return null;
}

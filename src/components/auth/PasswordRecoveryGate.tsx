"use client";

/**
 * PasswordRecoveryGate
 *
 * Supabase password-reset emails redirect with a recovery token. If the exact
 * reset URL isn't on the project's Redirect-URLs allowlist, Supabase falls back
 * to the Site URL (usually the homepage) and drops the token there — leaving the
 * user stranded on the homepage, unable to set a new password.
 *
 * This gate runs on every page and reliably routes any recovery session to
 * /reset-password, regardless of where Supabase landed the user:
 *   1. If a `type=recovery` token is still in the URL hash → forward it.
 *   2. supabase-js (detectSessionInUrl) parses the token and fires a
 *      PASSWORD_RECOVERY event → navigate to /reset-password.
 *
 * Mounted once in the root layout.
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function PasswordRecoveryGate() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onReset = window.location.pathname.startsWith("/reset-password");

    // 1. Recovery token still in the hash but we're not on the reset page yet.
    const hash = window.location.hash || "";
    if (!onReset && hash.includes("type=recovery")) {
      router.replace(`/reset-password${hash}`);
      return;
    }

    // 2. supabase fires PASSWORD_RECOVERY once it detects the recovery session
    //    in the URL (works even after the hash has been consumed).
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && !window.location.pathname.startsWith("/reset-password")) {
        router.replace("/reset-password");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router, pathname]);

  return null;
}

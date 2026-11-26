"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { sessionNeedsMfa } from "@/lib/auth/mfaClient";
import MfaChallenge from "@/components/auth/MfaChallenge";
import { useLang } from "@/lib/lang";

const COPY = {
  EN: {
    checking: "Checking your link…",
    moment: "One moment.",
    invalid: "This link is invalid or has expired. Ask for a new one from the sign-in page.",
    title: "Set a new password",
    label: "New password",
    placeholder: "At least 6 characters",
    saving: "Saving…",
    save: "Save new password",
  },
  IS: {
    checking: "Staðfesti hlekk…",
    moment: "Augnablik.",
    invalid: "Ógildur eða útrunninn hlekkur. Biddu um nýjan á innskráningarsíðunni.",
    title: "Settu nýtt lykilorð",
    label: "Nýtt lykilorð",
    placeholder: "A.m.k. 6 stafir",
    saving: "Vista...",
    save: "Vista nýtt lykilorð",
  },
} as const;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [lang] = useLang();
  const t = COPY[lang];

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [invalid, setInvalid] = useState(false);

  // Establish the recovery session, however the user arrived here.
  useEffect(() => {
    let active = true;
    let settled = false;

    async function init() {
      // Path A — tokens still in the URL hash (landed directly on /reset-password).
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.replace("#", ""));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!active) return;
          if (error) setError(error.message);
          else { settled = true; setReady(true); }
          return;
        }
      }
      // Path B — the recovery session was already established elsewhere (e.g.
      // Supabase dropped us on the homepage and the global gate routed us here
      // after the hash was consumed). If a session exists, let them reset.
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) { settled = true; setReady(true); }
    }
    void init();

    // Path C — a PASSWORD_RECOVERY event may arrive a moment later.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) {
        settled = true;
        setReady(true);
      }
    });

    // Nothing established a session within a moment → the link is invalid/expired.
    const timer = setTimeout(() => {
      if (active && !settled) setInvalid(true);
    }, 3000);

    return () => { active = false; sub.subscription.unsubscribe(); clearTimeout(timer); };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Supabase refuses a password change from an account with an app until the code has been given.
    if (await sessionNeedsMfa()) {
      setLoading(false);
      setNeedsCode(true);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // password sett → fara í role redirect
    router.replace("/auth/redirect");
  }

  if (needsCode) {
    return (
      <div style={{ padding: 16 }}>
        <MfaChallenge onVerified={() => setNeedsCode(false)} />
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
        <h1>{t.checking}</h1>
        <p>{t.moment}</p>
        {(error || invalid) && <p style={{ color: "#a83e28" }}>{error ?? t.invalid}</p>}
        {invalid && <p><a href="/login" style={{ textDecoration: "underline" }}>/login</a></p>}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>{t.title}</h1>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>{t.label}</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.placeholder}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
          />
        </label>

        {error && (
          <div style={{ background: "#f8e9e3", padding: 10, borderRadius: 8 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "none",
            background: "black",
            color: "white",
            fontWeight: 700,
          }}
        >
          {loading ? t.saving : t.save}
        </button>
      </form>
    </div>
  );
}

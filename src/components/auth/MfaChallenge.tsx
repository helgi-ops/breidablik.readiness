"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { cleanCode, isCompleteCode, mfaErrorMessage } from "@/lib/auth/mfaText";

type Factor = { id: string; friendly_name?: string | null };

/** The code step after the password. Calls `onVerified` once the session has been raised to two-step. */
export default function MfaChallenge({ onVerified }: { onVerified: () => void }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (!alive) return;
      if (listError) { setError(mfaErrorMessage(listError, lang)); setFactors([]); return; }
      const totp = (data?.totp ?? []) as Factor[];
      setFactors(totp);
      setFactorId(totp[0]?.id ?? "");
    })();
    return () => { alive = false; };
  }, [lang]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!isCompleteCode(code) || !factorId) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (verifyError) {
      setError(mfaErrorMessage(verifyError, lang));
      setCode("");
      return;
    }
    onVerified();
  }

  async function signOut() {
    await supabase.auth.signOut();
    // A full reload on purpose: the login page holds this step in its own state, so a soft route would stay here.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  return (
    <div className="mx-auto mt-10 max-w-sm rounded-xl border bg-card p-6 text-card-foreground">
      <h1 className="text-xl font-semibold">{is ? "Sláðu inn kóðann" : "Enter your code"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {is
          ? "Opnaðu auðkenningarforritið þitt og sláðu inn 6 stafa kóðann fyrir MicroPulse."
          : "Open your authenticator app and enter the 6-digit code for MicroPulse."}
      </p>

      <form onSubmit={verify} className="mt-4 grid gap-3">
        {factors && factors.length > 1 && (
          <label className="grid gap-1 text-sm">
            <span>{is ? "Forrit" : "App"}</span>
            <select
              value={factorId}
              onChange={(e) => setFactorId(e.target.value)}
              className="rounded-lg border bg-background p-2"
            >
              {factors.map((f) => (
                <option key={f.id} value={f.id}>{f.friendly_name || f.id.slice(0, 8)}</option>
              ))}
            </select>
          </label>
        )}

        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label={is ? "6 stafa kóði" : "6-digit code"}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(cleanCode(e.target.value))}
          className="rounded-lg border bg-background p-3 text-center text-2xl tracking-[0.3em]"
        />

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={busy || !isCompleteCode(code) || !factorId}
          className="rounded-lg bg-primary p-3 font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? (is ? "Staðfesti…" : "Checking…") : (is ? "Staðfesta" : "Confirm")}
        </button>
        <button type="button" onClick={signOut} className="text-sm text-muted-foreground underline">
          {is ? "Skrá út" : "Sign out"}
        </button>
      </form>
    </div>
  );
}

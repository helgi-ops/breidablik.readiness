"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { cleanCode, isCompleteCode, mfaErrorMessage } from "@/lib/auth/mfaText";

type Factor = { id: string; friendly_name?: string | null; status: string; created_at: string };
type Pending = { id: string; qr: string; secret: string };

export default function AdminSecurityPage() {
  const [lang] = useLang();
  const is = lang === "IS";

  const [verified, setVerified] = useState<Factor[] | null>(null);
  const [name, setName] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) { setError(mfaErrorMessage(listError, lang)); return null; }
    setVerified((data?.totp ?? []) as Factor[]);
    return ((data?.all ?? []) as Factor[]);
  }, [lang]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (!alive) return;
      if (listError) { setError(mfaErrorMessage(listError, lang)); return; }
      setVerified((data?.totp ?? []) as Factor[]);
    })();
    return () => { alive = false; };
  }, [lang]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const friendlyName = name.trim();
    if (!friendlyName) return;
    setBusy(true);
    setError(null);
    // An abandoned setup keeps its name and can block a new one, so clear unfinished setups first.
    const all = await load();
    for (const stale of (all ?? []).filter((f) => f.status !== "verified")) {
      await supabase.auth.mfa.unenroll({ factorId: stale.id });
    }
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName,
      issuer: "MicroPulse",
    });
    setBusy(false);
    if (enrollError || !data) { setError(mfaErrorMessage(enrollError, lang)); return; }
    setPending({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setCode("");
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!pending || !isCompleteCode(code)) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: pending.id, code });
    setBusy(false);
    if (verifyError) { setError(mfaErrorMessage(verifyError, lang)); setCode(""); return; }
    setPending(null);
    setName("");
    setCode("");
    await load();
  }

  async function cancel() {
    if (pending) await supabase.auth.mfa.unenroll({ factorId: pending.id });
    setPending(null);
    setCode("");
    setError(null);
  }

  async function remove(factorId: string) {
    setBusy(true);
    setError(null);
    const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId });
    setRemoving(null);
    setBusy(false);
    if (removeError) { setError(mfaErrorMessage(removeError, lang)); return; }
    // Removing a factor can lower the session, so read the session fresh for the next action.
    await supabase.auth.refreshSession();
    await load();
  }

  const count = verified?.length ?? 0;

  return (
    <div className="mx-auto grid max-w-xl gap-6">
      <section>
        <h1 className="text-xl font-semibold">
          {verified === null
            ? (is ? "Sæki stöðu…" : "Loading…")
            : count > 0
              ? (is ? "Tveggja þrepa innskráning er virk á þínum aðgangi" : "Two-step sign-in is on for your account")
              : (is ? "Tveggja þrepa innskráning er ekki virk á þínum aðgangi" : "Two-step sign-in is off for your account")}
        </h1>
        <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
          <li>
            {is
              ? "Stjórnendaaðgangur nær yfir öll lið, svo stolið lykilorð má ekki duga eitt og sér."
              : "An admin account reaches every team, so a stolen password alone must not be enough."}
          </li>
          {count === 1 && (
            <li className="font-medium text-foreground">
              {is
                ? "Þú ert með eitt forrit. Bættu við öðru á öðru tæki svo þú læsist ekki úti ef þetta týnist."
                : "You have one app. Add another on a second device so you aren't locked out if this one is lost."}
            </li>
          )}
        </ul>
      </section>

      {error && <p role="alert" className="rounded-lg border p-3 text-sm text-destructive">{error}</p>}

      {count > 0 && (
        <section className="rounded-xl border bg-card p-4 text-card-foreground">
          <h2 className="font-medium">{is ? "Skráð forrit" : "Registered apps"}</h2>
          <ul className="mt-2 grid gap-2">
            {verified!.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {f.friendly_name || f.id.slice(0, 8)}
                  <span className="ml-2 text-muted-foreground">{new Date(f.created_at).toLocaleDateString(is ? "is-IS" : "en-GB")}</span>
                </span>
                {removing === f.id ? (
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground">{is ? "Fjarlægja?" : "Remove?"}</span>
                    <button type="button" disabled={busy} onClick={() => remove(f.id)} className="font-medium text-destructive underline">
                      {is ? "Já, fjarlægja" : "Yes, remove"}
                    </button>
                    <button type="button" onClick={() => setRemoving(null)} className="underline">{is ? "Hætta við" : "Cancel"}</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setRemoving(f.id)} className="text-muted-foreground underline">
                    {is ? "Fjarlægja" : "Remove"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!pending ? (
        <form onSubmit={start} className="grid gap-3 rounded-xl border bg-card p-4 text-card-foreground">
          <h2 className="font-medium">{count > 0 ? (is ? "Bæta við öðru forriti" : "Add another app") : (is ? "Bæta við forriti" : "Add an app")}</h2>
          <label className="grid gap-1 text-sm">
            <span>{is ? "Nafn á tækinu" : "Device name"}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={is ? "Til dæmis: Sími" : "For example: Phone"}
              className="rounded-lg border bg-background p-2"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-lg bg-primary p-2.5 font-medium text-primary-foreground disabled:opacity-50"
          >
            {is ? "Halda áfram" : "Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={confirm} className="grid gap-3 rounded-xl border bg-card p-4 text-card-foreground">
          <h2 className="font-medium">{is ? "Skannaðu kóðann" : "Scan the code"}</h2>
          <p className="text-sm text-muted-foreground">
            {is
              ? "Skannaðu QR-kóðann með auðkenningarforriti, eða afritaðu lykilinn inn í það. Sýndu þetta engum."
              : "Scan the QR code with an authenticator app, or copy the key into it. Don't show this to anyone."}
          </p>
          {/* Supabase returns the QR as an SVG data URL; next/image can't take it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pending.qr} alt={is ? "QR-kóði fyrir auðkenningarforrit" : "QR code for your authenticator app"} className="mx-auto h-48 w-48 rounded-lg bg-white p-2" />
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">{is ? "Get ekki skannað" : "Can't scan"}</summary>
            <code className="mt-2 block break-all rounded-lg border p-2 select-all">{pending.secret}</code>
          </details>
          <label className="grid gap-1 text-sm">
            <span>{is ? "6 stafa kóði úr forritinu" : "6-digit code from the app"}</span>
            <input
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(cleanCode(e.target.value))}
              className="rounded-lg border bg-background p-3 text-center text-xl tracking-[0.3em]"
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={cancel} className="flex-1 rounded-lg border p-2.5">{is ? "Hætta við" : "Cancel"}</button>
            <button
              type="submit"
              disabled={busy || !isCompleteCode(code)}
              className="flex-1 rounded-lg bg-primary p-2.5 font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? (is ? "Staðfesti…" : "Checking…") : (is ? "Staðfesta" : "Confirm")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

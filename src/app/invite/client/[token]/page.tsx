"use client";

/**
 * /invite/client/[token]
 *
 * Self-contained PT client onboarding flow:
 *   1. Reads the invite via GET /api/client-invites/[token].
 *   2. If the visitor is signed out:
 *        - Inline signup form (name + password, email pre-filled from invite,
 *          role hard-coded to PLAYER). After signUp completes we call accept
 *          immediately so the new account already has a players row when
 *          they land on /player.
 *        - Or a "I already have an account → sign in" link.
 *   3. If signed in:
 *        - Verify email matches the invite, then call POST accept and
 *          redirect to /player.
 *
 * Replaces the broken `/signup?invite=…` flow which always created COACH
 * accounts because /signup hardcodes role: "COACH". Aníta Rut Helgadóttir
 * is the canonical "do not repeat this" case (2026-05-14).
 *
 * Mirrors /invite/coach/[token] structure so the two onboarding surfaces
 * feel consistent.
 */

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

type InviteInfo = {
  invite: {
    team_id: string;
    client_email: string;
    client_name: string | null;
    status: InviteStatus;
    expires_at: string;
    notes: string | null;
  };
  team: {
    id: string;
    name: string;
    team_type: string | null;
    club_short_name: string | null;
    club_logo_url: string | null;
  } | null;
};

type Lang = "IS" | "EN";

const COPY = {
  IS: {
    title: "Velkomin/n",
    loading: "Hleð boði…",
    notFound: "Boðið fannst ekki eða hefur verið afturkallað.",
    expiredHeader: "Boðið er útrunnið",
    revokedHeader: "Boðið hefur verið afturkallað",
    acceptedHeader: "Þú ert nú þegar tengd/ur þjálfara",
    pendingHeader: "Þú hefur fengið boð frá",
    inviteEmailLabel: "Boð sent á",
    nameLabel: "Fullt nafn",
    passwordLabel: "Lykilorð",
    passwordHint: "Lágmark 6 stafir",
    submit: "Búa til aðgang",
    submitting: "Stofna aðgang…",
    accept: "Samþykkja boð",
    accepting: "Samþykki boð…",
    orSignIn: "Ertu nú þegar með aðgang?",
    signInLabel: "Skrá inn",
    successHeader: "Allt komið!",
    successBody: "Þú ert tengd/ur þjálfara. Fer á viðskiptavinasvæðið…",
    openPlayer: "Fara á viðskiptavinasvæði",
    errorGeneric: "Ekki tókst að klára.",
    errorEmail: "Netfangið passar ekki við boðið. Skráðu þig út og inn aftur með rétta netfanginu.",
    errorExpired: "Boðið er útrunnið.",
    errorPassword: "Lykilorð verður að vera a.m.k. 6 stafir.",
    backHome: "Aftur á forsíðu",
    mismatchWarning: "Þú ert skráð/ur inn með öðru netfangi. Skráðu þig út og notaðu",
    signOut: "Skrá út",
  },
  EN: {
    title: "Welcome",
    loading: "Loading invitation…",
    notFound: "Invitation not found or has been revoked.",
    expiredHeader: "This invitation has expired",
    revokedHeader: "This invitation has been revoked",
    acceptedHeader: "You're already linked to this trainer",
    pendingHeader: "You've been invited by",
    inviteEmailLabel: "Invitation sent to",
    nameLabel: "Full name",
    passwordLabel: "Password",
    passwordHint: "At least 6 characters",
    submit: "Create account",
    submitting: "Creating account…",
    accept: "Accept invitation",
    accepting: "Accepting…",
    orSignIn: "Already have an account?",
    signInLabel: "Sign in",
    successHeader: "All set!",
    successBody: "You're linked to your trainer. Redirecting to the client area…",
    openPlayer: "Go to client area",
    errorGeneric: "Failed to finish.",
    errorEmail: "Your email doesn't match the invitation. Sign out and back in with the right email.",
    errorExpired: "Invitation has expired.",
    errorPassword: "Password must be at least 6 characters.",
    backHome: "Back to home",
    mismatchWarning: "You're signed in with a different email. Sign out and use",
    signOut: "Sign out",
  },
} as const;

export default function ClientInviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [lang, setLang] = useState<Lang>("IS");
  const t = COPY[lang];

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  // Inline signup form state (only used when visitor is signed out).
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("mp_lang") : null;
    if (saved === "IS" || saved === "EN") setLang(saved);
  }, []);

  // Fetch invite + team info.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/client-invites/${token}`, { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setFetchError(json?.error ?? "not_found");
        } else {
          setInfo(json as InviteInfo);
          if (!fullName && (json as InviteInfo).invite.client_name) {
            setFullName((json as InviteInfo).invite.client_name ?? "");
          }
        }
      } catch {
        if (alive) setFetchError("network_error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auth state — controls signup-vs-accept rendering.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setUserEmail(data.session?.user?.email?.toLowerCase() ?? null);
      setAuthLoaded(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserEmail(session?.user?.email?.toLowerCase() ?? null);
    });
    return () => {
      sub.subscription.unsubscribe();
      alive = false;
    };
  }, []);

  const inviteEmail = info?.invite.client_email.toLowerCase() ?? null;
  const emailMatches = useMemo(() => {
    if (!inviteEmail || !userEmail) return false;
    return inviteEmail === userEmail;
  }, [inviteEmail, userEmail]);

  // Trainer/team display name. PT teams use the trainer's name as
  // teams.name, football teams use club_short_name when available.
  const trainerDisplay = info?.team
    ? (info.team.team_type === "personal_trainer"
        ? info.team.name
        : (info.team.club_short_name ?? info.team.name))
    : "";

  // Server-side accept call — used both after fresh signup AND when an
  // already-signed-in user clicks Accept.
  async function callAccept(): Promise<boolean> {
    const { data: sess } = await supabase.auth.getSession();
    const jwt = sess.session?.access_token;
    if (!jwt) {
      setSubmitError(t.errorGeneric);
      return false;
    }
    const res = await fetch(`/api/client-invites/${token}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      const code = String(json?.error ?? "");
      if (code.includes("email_mismatch")) setSubmitError(t.errorEmail);
      else if (code.includes("expired")) setSubmitError(t.errorExpired);
      else setSubmitError(t.errorGeneric);
      return false;
    }
    return true;
  }

  // Signed-out path → inline signup, then accept.
  async function handleSignupAndAccept(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!info) return;
    setSubmitError(null);
    if (password.length < 6) { setSubmitError(t.errorPassword); return; }

    setSubmitting(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: info.invite.client_email,
        password,
        options: {
          data: {
            full_name: fullName.trim() || (info.invite.client_name ?? ""),
            // Critical: never store COACH here. The old /signup form did and
            // that's what created Aníta as a coach by mistake.
            role: "PLAYER",
            sport: "general",
            team_id: info.invite.team_id,
            product_plan: "FREE",
            client_invite_token: token,
          },
          emailRedirectTo: typeof window !== "undefined"
            ? `${window.location.origin}/invite/client/${encodeURIComponent(token)}`
            : undefined,
        },
      });
      if (signUpError) throw signUpError;

      // If Supabase returned an immediate session (email confirmation off in
      // dev or already-confirmed account), finish accept here. Otherwise the
      // user will land back on this page after email confirmation and we'll
      // pick up the accept flow then.
      if (data.session) {
        const ok = await callAccept();
        if (ok) {
          setSuccess(true);
          setTimeout(() => router.push("/client"), 1400);
        }
      } else {
        // Show a "check your email" style success — but for PT clients we
        // usually run with email confirm off in dev / production, so this
        // branch is rare. Surface a friendly note.
        setSubmitError(lang === "IS"
          ? "Aðgangur stofnaður — staðfestu netfangið þitt og smelltu aftur á linkinn í tölvupóstinum."
          : "Account created — confirm your email and click the link again.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg || t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  // Signed-in path → just accept.
  async function handleAccept() {
    if (!emailMatches) return;
    setSubmitting(true);
    setSubmitError(null);
    const ok = await callAccept();
    if (ok) {
      setSuccess(true);
      setTimeout(() => router.push("/client"), 1400);
    }
    setSubmitting(false);
  }

  const status = info?.invite.status;
  const loginUrl = `/login?next=${encodeURIComponent(`/invite/client/${token}`)}`;

  return (
    <main className="min-h-screen bg-white px-6 py-12 text-neutral-900">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="text-sm font-medium text-neutral-500">MicroPulse</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t.title}</h1>
          </div>
          <div className="mt-1 flex shrink-0 overflow-hidden rounded-lg border text-xs font-semibold">
            <button
              type="button"
              onClick={() => setLang("IS")}
              className={`px-3 py-1.5 transition ${lang === "IS" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-900"}`}
            >IS</button>
            <button
              type="button"
              onClick={() => setLang("EN")}
              className={`px-3 py-1.5 transition ${lang === "EN" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-900"}`}
            >EN</button>
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          {loading ? (
            <div className="text-sm text-neutral-500">{t.loading}</div>
          ) : fetchError || !info ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {t.notFound}
              </div>
              <Link href="/" className="text-sm font-medium text-neutral-900 underline">{t.backHome}</Link>
            </div>
          ) : status !== "pending" ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {status === "expired" && t.expiredHeader}
                {status === "revoked" && t.revokedHeader}
                {status === "accepted" && t.acceptedHeader}
              </div>
              <Link href="/" className="text-sm font-medium text-neutral-900 underline">{t.backHome}</Link>
            </div>
          ) : success ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <div className="font-medium">{t.successHeader}</div>
                <div className="mt-1">{t.successBody}</div>
              </div>
              <Link href="/player" className="text-sm font-medium text-neutral-900 underline">{t.openPlayer}</Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-sm text-neutral-500">{t.pendingHeader}</div>
                <div className="mt-1 text-xl font-semibold">{trainerDisplay || info.team?.name}</div>
              </div>

              <div className="rounded-xl border bg-neutral-50 px-3 py-2.5 text-sm">
                <div className="text-neutral-500">{t.inviteEmailLabel}</div>
                <div className="font-medium">{info.invite.client_email}</div>
              </div>

              {!authLoaded ? (
                <div className="text-sm text-neutral-500">…</div>
              ) : userEmail && !emailMatches ? (
                <div className="space-y-2">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {t.mismatchWarning} <span className="font-medium">{info.invite.client_email}</span>.
                  </div>
                  <button
                    type="button"
                    onClick={async () => { await supabase.auth.signOut(); }}
                    className="w-full rounded-2xl border bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
                  >
                    {t.signOut}
                  </button>
                </div>
              ) : userEmail && emailMatches ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleAccept}
                    disabled={submitting}
                    className="w-full rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50"
                  >
                    {submitting ? t.accepting : t.accept}
                  </button>
                  {submitError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSignupAndAccept} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600">{t.nameLabel}</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600">{t.passwordLabel}</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                    <div className="mt-1 text-[11px] text-neutral-500">{t.passwordHint}</div>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50"
                  >
                    {submitting ? t.submitting : t.submit}
                  </button>
                  {submitError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</div>
                  )}
                  <div className="text-center text-xs text-neutral-500">
                    {t.orSignIn}{" "}
                    <Link href={loginUrl} className="font-medium text-neutral-900 underline">{t.signInLabel}</Link>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

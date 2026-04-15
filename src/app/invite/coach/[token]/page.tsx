"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

type InviteInfo = {
  invite: {
    team_id: string;
    coach_email: string;
    coach_name: string | null;
    role: string;
    status: InviteStatus;
    expires_at: string;
  };
  team: {
    id: string;
    name: string;
    sport: string | null;
    gender: string | null;
    team_type: string | null;
  } | null;
};

type Lang = "IS" | "EN";

const COPY = {
  IS: {
    title: "Þjálfaraboð",
    loading: "Hleð boði…",
    notFound: "Boðið fannst ekki eða hefur verið afturkallað.",
    expiredHeader: "Boðið er útrunnið",
    revokedHeader: "Boðið hefur verið afturkallað",
    acceptedHeader: "Boðið var þegar samþykkt",
    pendingHeader: "Þú hefur verið boðin/n í",
    as: "sem",
    emailHint: "Samþykktu boðið með netfanginu",
    accept: "Samþykkja boð",
    accepting: "Samþykki boð…",
    signInFirst: "Skrá inn til að samþykkja",
    signUpFirst: "Búa til aðgang og samþykkja",
    signInLabel: "Skrá inn",
    signUpLabel: "Stofna aðgang",
    orSignIn: "Ertu þegar með aðgang?",
    orSignUp: "Ertu ekki með aðgang?",
    mismatchWarning: "Þú ert skráð/ur inn með öðru netfangi en boðið er á. Skráðu þig út og skráðu þig inn á",
    successHeader: "Allt komið!",
    successBody: "Þú hefur bæst við liðið. Fer á þjálfarasvæðið…",
    openCoach: "Fara á þjálfarasvæði",
    errorGeneric: "Ekki tókst að samþykkja boðið.",
    errorEmail: "Netfangið passar ekki við boðið.",
    errorExpired: "Boðið er útrunnið.",
    errorNotPending: "Boðið er ekki lengur virkt.",
    backHome: "Aftur á forsíðu",
  },
  EN: {
    title: "Coach invitation",
    loading: "Loading invitation…",
    notFound: "Invitation not found or has been revoked.",
    expiredHeader: "This invitation has expired",
    revokedHeader: "This invitation has been revoked",
    acceptedHeader: "This invitation has already been accepted",
    pendingHeader: "You've been invited to",
    as: "as",
    emailHint: "Accept the invitation with the email",
    accept: "Accept invitation",
    accepting: "Accepting…",
    signInFirst: "Sign in to accept",
    signUpFirst: "Create account and accept",
    signInLabel: "Sign in",
    signUpLabel: "Create account",
    orSignIn: "Already have an account?",
    orSignUp: "Don't have an account?",
    mismatchWarning: "You are signed in with a different email than this invite. Sign out and sign in as",
    successHeader: "All set!",
    successBody: "You've been added to the team. Redirecting to the coach area…",
    openCoach: "Go to coach area",
    errorGeneric: "Failed to accept invitation.",
    errorEmail: "Your email does not match the invitation.",
    errorExpired: "The invitation has expired.",
    errorNotPending: "This invitation is no longer active.",
    backHome: "Back to home",
  },
} as const;

function teamLabel(team: InviteInfo["team"], lang: Lang) {
  if (!team) return "";
  const genderMap: Record<string, Record<string, string>> = {
    IS: { M: "karlar", F: "konur" },
    EN: { M: "men", F: "women" },
  };
  const sportMap: Record<string, Record<string, string>> = {
    IS: { football: "Fótbolti", basketball: "Körfubolti", handball: "Handbolti" },
    EN: { football: "Football", basketball: "Basketball", handball: "Handball" },
  };
  const parts: string[] = [team.name];
  if (team.sport) parts.push(sportMap[lang][team.sport] ?? team.sport);
  if (team.gender) parts.push(genderMap[lang][team.gender] ?? team.gender);
  return parts.join(" · ");
}

export default function CoachInviteAcceptPage({
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

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("mp_lang") : null;
    if (saved === "IS" || saved === "EN") setLang(saved);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/coach-invites/${token}`, { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setFetchError(json?.error ?? "not_found");
        } else {
          setInfo(json as InviteInfo);
        }
      } catch {
        if (alive) setFetchError("network_error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

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
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const inviteEmail = info?.invite.coach_email.toLowerCase() ?? null;
  const emailMatches = useMemo(() => {
    if (!inviteEmail || !userEmail) return false;
    return inviteEmail === userEmail;
  }, [inviteEmail, userEmail]);

  async function handleAccept() {
    if (!emailMatches) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const jwt = sess.session?.access_token;
      if (!jwt) {
        setSubmitError(t.errorGeneric);
        return;
      }
      const res = await fetch(`/api/coach-invites/${token}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = String(json?.error ?? "");
        if (msg.includes("email_mismatch")) setSubmitError(t.errorEmail);
        else if (msg.includes("expired")) setSubmitError(t.errorExpired);
        else if (msg.includes("not_pending")) setSubmitError(t.errorNotPending);
        else setSubmitError(t.errorGeneric);
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push("/coach"), 1400);
    } catch {
      setSubmitError(t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  const status = info?.invite.status;
  const signupUrl =
    info?.invite && `/signup?coach_invite=${encodeURIComponent(token)}`;
  const loginUrl = `/login?next=${encodeURIComponent(`/invite/coach/${token}`)}`;

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
              className={`px-3 py-1.5 transition ${
                lang === "IS" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-900"
              }`}
            >
              IS
            </button>
            <button
              type="button"
              onClick={() => setLang("EN")}
              className={`px-3 py-1.5 transition ${
                lang === "EN" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-900"
              }`}
            >
              EN
            </button>
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
              <Link href="/" className="text-sm font-medium text-neutral-900 underline">
                {t.backHome}
              </Link>
            </div>
          ) : status !== "pending" ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {status === "expired" && t.expiredHeader}
                {status === "revoked" && t.revokedHeader}
                {status === "accepted" && t.acceptedHeader}
              </div>
              <Link href="/" className="text-sm font-medium text-neutral-900 underline">
                {t.backHome}
              </Link>
            </div>
          ) : success ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <div className="font-medium">{t.successHeader}</div>
                <div className="mt-1">{t.successBody}</div>
              </div>
              <Link href="/coach" className="text-sm font-medium text-neutral-900 underline">
                {t.openCoach}
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-sm text-neutral-500">{t.pendingHeader}</div>
                <div className="mt-1 text-xl font-semibold">{teamLabel(info.team, lang)}</div>
                <div className="mt-0.5 text-sm text-neutral-600">
                  {t.as} <span className="font-medium">{info.invite.role}</span>
                </div>
              </div>

              <div className="rounded-xl border bg-neutral-50 px-3 py-2.5 text-sm">
                <div className="text-neutral-500">{t.emailHint}</div>
                <div className="font-medium">{info.invite.coach_email}</div>
              </div>

              {!authLoaded ? (
                <div className="text-sm text-neutral-500">…</div>
              ) : !userEmail ? (
                <div className="space-y-2">
                  <Link
                    href={signupUrl || "/signup"}
                    className="block w-full rounded-2xl bg-neutral-900 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-neutral-700"
                  >
                    {t.signUpFirst}
                  </Link>
                  <div className="text-center text-xs text-neutral-500">
                    {t.orSignIn}{" "}
                    <Link href={loginUrl} className="font-medium text-neutral-900 underline">
                      {t.signInLabel}
                    </Link>
                  </div>
                </div>
              ) : !emailMatches ? (
                <div className="space-y-2">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {t.mismatchWarning}{" "}
                    <span className="font-medium">{info.invite.coach_email}</span>.
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await supabase.auth.signOut();
                    }}
                    className="w-full rounded-2xl border bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
                  >
                    {lang === "IS" ? "Skrá út" : "Sign out"}
                  </button>
                </div>
              ) : (
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
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {submitError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

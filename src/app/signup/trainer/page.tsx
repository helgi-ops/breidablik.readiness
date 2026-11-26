"use client";

/**
 * /signup/trainer — one-step signup for a personal trainer / S&C coach.
 *
 * The page only calls supabase.auth.signUp. The database does the rest
 * (setup_personal_trainer, migration 20261121120000): it creates the practice
 * (a team_type 'personal_trainer' team named after the practice, else the trainer),
 * links the trainer as its coach, and seeds a demo client. After the email is
 * confirmed, /auth/redirect opens /coach?welcome=pt, where the PT dashboard shows
 * the getting-started checklist. No admin step.
 */

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { PRACTICE_TERMS_VERSION } from "@/lib/legal/operator";

const WELCOME_PATH = "/coach?welcome=pt";

const COUNTRIES: Array<{ code: string; EN: string; IS: string }> = [
  { code: "IS", EN: "Iceland", IS: "Ísland" },
  { code: "NO", EN: "Norway", IS: "Noregur" },
  { code: "SE", EN: "Sweden", IS: "Svíþjóð" },
  { code: "DK", EN: "Denmark", IS: "Danmörk" },
  { code: "FI", EN: "Finland", IS: "Finnland" },
  { code: "GB", EN: "United Kingdom", IS: "Bretland" },
  { code: "IE", EN: "Ireland", IS: "Írland" },
  { code: "DE", EN: "Germany", IS: "Þýskaland" },
  { code: "NL", EN: "Netherlands", IS: "Holland" },
  { code: "ES", EN: "Spain", IS: "Spánn" },
  { code: "US", EN: "United States", IS: "Bandaríkin" },
  { code: "CA", EN: "Canada", IS: "Kanada" },
  { code: "AU", EN: "Australia", IS: "Ástralía" },
  { code: "OTHER", EN: "Other", IS: "Annað" },
];

const COPY = {
  EN: {
    brand: "MicroPulse",
    title: "Start your practice",
    subtitle: "For personal trainers and S&C coaches. Invite a client and send a first session in under 10 minutes.",
    fullName: "Full name",
    email: "Email",
    password: "Password",
    passwordPlaceholder: "At least 6 characters",
    practice: "Practice name (optional)",
    practiceHint: "Leave empty to use your name.",
    country: "Country",
    countryPlaceholder: "Select country…",
    submit: "Create my practice",
    submitting: "Creating…",
    errors: {
      name: "Your full name is required.",
      email: "A valid email is required.",
      password: "Password must be at least 6 characters.",
      country: "Please pick your country.",
      terms: "Please agree to the terms to continue.",
      fallback: "Unable to create account.",
    },
    success: "Account created. Check your email to confirm — the link opens your dashboard.",
    successSession: "Account created. Opening your dashboard…",
    hasAccount: "Already have an account?",
    signIn: "Sign in",
    other: "Not a personal trainer?",
    otherLink: "Other ways to sign up",
    agreePre: "I agree to the",
    terms: "terms for practices",
    agreeMid: "and the",
    privacy: "data processing terms",
    agreePost: ".",
  },
  IS: {
    brand: "MicroPulse",
    title: "Opnaðu þína stofu",
    subtitle: "Fyrir einkaþjálfara og styrktarþjálfara. Bjóddu viðskiptavini og sendu fyrstu æfinguna á innan við 10 mínútum.",
    fullName: "Fullt nafn",
    email: "Netfang",
    password: "Lykilorð",
    passwordPlaceholder: "A.m.k. 6 stafir",
    practice: "Nafn stofu (valfrjálst)",
    practiceHint: "Skildu eftir autt til að nota nafnið þitt.",
    country: "Land",
    countryPlaceholder: "Veldu land…",
    submit: "Stofna stofuna mína",
    submitting: "Bý til…",
    errors: {
      name: "Fullt nafn er nauðsynlegt.",
      email: "Gilt netfang er nauðsynlegt.",
      password: "Lykilorð þarf að vera a.m.k. 6 stafir.",
      country: "Veldu land.",
      terms: "Samþykktu skilmálana til að halda áfram.",
      fallback: "Ekki tókst að búa til aðgang.",
    },
    success: "Aðgangur búinn til. Staðfestu netfangið — hlekkurinn opnar stjórnborðið þitt.",
    successSession: "Aðgangur búinn til. Opna stjórnborðið…",
    hasAccount: "Ertu nú þegar með aðgang?",
    signIn: "Skrá inn",
    other: "Ekki einkaþjálfari?",
    otherLink: "Aðrar leiðir til að skrá sig",
    agreePre: "Ég samþykki",
    terms: "skilmála fyrir stofur",
    agreeMid: "og",
    privacy: "vinnsluskilmálana",
    agreePost: ".",
  },
} as const;

export default function TrainerSignupPage() {
  const [lang, setLang] = useLang();
  const t = COPY[lang];

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [practice, setPractice] = useState("");
  const [country, setCountry] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!fullName.trim()) { setError(t.errors.name); return; }
    if (!email.trim() || !email.includes("@")) { setError(t.errors.email); return; }
    if (password.length < 6) { setError(t.errors.password); return; }
    if (!country) { setError(t.errors.country); return; }
    if (!agreed) { setError(t.errors.terms); return; }

    try {
      setLoading(true);
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // The database trigger creates the practice from this — never create the team here.
          data: {
            full_name: fullName.trim(),
            role: "COACH",
            team_type: "personal_trainer",
            practice_name: practice.trim() || fullName.trim(),
            country,
            // Which terms were agreed to; auth.users.created_at is the server time of agreement.
            terms_version: PRACTICE_TERMS_VERSION,
          },
          emailRedirectTo: `${window.location.origin}/auth/redirect?next=${encodeURIComponent(WELCOME_PATH)}`,
        },
      });
      if (signUpError) throw signUpError;

      if (data.session) {
        setMessage(t.successSession);
        // Give the signup trigger a moment, then open the dashboard.
        window.setTimeout(() => { window.location.assign(new URL(WELCOME_PATH, window.location.origin).toString()); }, 800);
      } else {
        setMessage(t.success);
      }
      setPassword("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.errors.fallback);
    } finally {
      setLoading(false);
    }
  }

  const input = "rounded-xl border px-3 py-2";

  return (
    <main className="min-h-screen bg-background px-4 py-12 text-foreground sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-neutral-500">{t.brand}</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t.title}</h1>
            <p className="mt-2 text-sm text-neutral-600">{t.subtitle}</p>
          </div>
          <div className="mt-1 flex shrink-0 overflow-hidden rounded-lg border text-xs font-semibold">
            {(["EN", "IS"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`px-3 py-1.5 transition ${lang === l ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-900"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-3xl border bg-white p-6 shadow-sm">
          <label className="grid gap-1.5 text-sm">
            <span className="text-neutral-700">{t.fullName}</span>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={input} autoComplete="name" autoFocus required />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-neutral-700">{t.email}</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} autoComplete="email" required />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-neutral-700">{t.password}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} placeholder={t.passwordPlaceholder} autoComplete="new-password" minLength={6} required />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-neutral-700">{t.practice}</span>
            <input type="text" value={practice} onChange={(e) => setPractice(e.target.value)} className={input} placeholder={fullName.trim() || undefined} autoComplete="organization" />
            <span className="text-xs text-neutral-500">{t.practiceHint}</span>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-neutral-700">{t.country}</span>
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={input} required>
              <option value="">{t.countryPlaceholder}</option>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c[lang]}</option>)}
            </select>
          </label>

          <label className="flex items-start gap-2.5 text-sm text-neutral-700">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]" required />
            <span>
              {t.agreePre}{" "}
              <Link href="/terms" target="_blank" className="font-medium text-neutral-900 underline">{t.terms}</Link>{" "}
              {t.agreeMid}{" "}
              <Link href="/privacy/practices" target="_blank" className="font-medium text-neutral-900 underline">{t.privacy}</Link>
              {t.agreePost}
            </span>
          </label>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? t.submitting : t.submit}
          </button>
        </form>

        <div className="mt-4 space-y-1 text-center text-sm text-neutral-600">
          <div>
            {t.hasAccount}{" "}
            <Link href="/login" className="font-medium text-neutral-900 underline">{t.signIn}</Link>
          </div>
          <div>
            {t.other}{" "}
            <Link href="/signup" className="font-medium text-neutral-900 underline">{t.otherLink}</Link>
          </div>
        </div>
      </div>
    </main>
  );
}

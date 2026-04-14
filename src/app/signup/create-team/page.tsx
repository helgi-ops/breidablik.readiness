"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Lang = "IS" | "EN";
type Sport = "football" | "basketball" | "handball";
type Gender = "M" | "F" | "mixed" | "";

// ─────────────────────────────────────────────────────────────────────────────
// Copy
// ─────────────────────────────────────────────────────────────────────────────

const COPY = {
  EN: {
    brand: "MicroPulse",
    title: "Create a new club",
    subtitle: "Set up your team in 3 steps. 14-day Pro trial — no card required.",
    steps: { account: "Your account", team: "Team details", player: "First player" },
    step: (i: number) => `Step ${i} of 3`,
    back: "Back",
    next: "Next",
    finish: "Create club & start trial",
    submitting: "Creating…",
    hasAccount: "Already have an account?",
    joinInstead: "Joining an existing team instead?",
    signIn: "Sign in",
    joinLink: "Join a team",
    labels: {
      fullName: "Your full name",
      email: "Work email",
      password: "Password",
      teamName: "Club / team name",
      sport: "Sport",
      gender: "Team gender",
      clubShortName: "Short name (optional)",
      firstPlayerName: "First player's full name",
      firstPlayerHint: "You'll be able to add more players from the Squad tab.",
    },
    placeholders: {
      fullName: "Full name",
      email: "name@club.com",
      password: "At least 6 characters",
      teamName: "Breiðablik U-19",
      clubShortName: "UBK",
      firstPlayerName: "Player full name",
    },
    sports: { football: "Football", basketball: "Basketball", handball: "Handball" },
    genders: { M: "Men", F: "Women", mixed: "Mixed", "": "— not specified —" },
    trialBanner: "14 days Pro on us · no card · cancel anytime",
    errors: {
      fullName: "Your full name is required.",
      email: "A valid email is required.",
      password: "Password must be at least 6 characters.",
      teamName: "Team name is required.",
      sport: "Please pick a sport.",
      firstPlayer: "Add at least one player to get started.",
      fallback: "Unable to create account.",
    },
    success:
      "Account created. Check your email to verify, then sign in to open your dashboard.",
    successSession: "Account created. Redirecting to your dashboard…",
  },
  IS: {
    brand: "MicroPulse",
    title: "Stofna nýtt félag",
    subtitle: "Settu upp liðið þitt í 3 skrefum. 14 daga Pro prufa — ekkert kort.",
    steps: { account: "Aðgangurinn þinn", team: "Upplýsingar um liðið", player: "Fyrsti leikmaður" },
    step: (i: number) => `Skref ${i} af 3`,
    back: "Til baka",
    next: "Áfram",
    finish: "Stofna félag og byrja prufu",
    submitting: "Bý til aðgang…",
    hasAccount: "Ertu nú þegar með aðgang?",
    joinInstead: "Ertu að ganga í lið sem er nú þegar til?",
    signIn: "Skrá inn",
    joinLink: "Ganga í lið",
    labels: {
      fullName: "Þitt fulla nafn",
      email: "Netfang",
      password: "Lykilorð",
      teamName: "Nafn félags / liðs",
      sport: "Íþróttagrein",
      gender: "Kyn liðs",
      clubShortName: "Stytt heiti (valfrjálst)",
      firstPlayerName: "Nafn fyrsta leikmanns",
      firstPlayerHint: "Þú getur bætt við fleirum úr Squad flipanum.",
    },
    placeholders: {
      fullName: "Fullt nafn",
      email: "nafn@lið.is",
      password: "A.m.k. 6 stafir",
      teamName: "Breiðablik U-19",
      clubShortName: "UBK",
      firstPlayerName: "Nafn leikmanns",
    },
    sports: { football: "Fótbolti", basketball: "Körfubolti", handball: "Handbolti" },
    genders: { M: "Karlar", F: "Konur", mixed: "Blandað", "": "— ekki tilgreint —" },
    trialBanner: "14 daga Pro frítt · ekkert kort · hætta hvenær sem er",
    errors: {
      fullName: "Fullt nafn þitt er nauðsynlegt.",
      email: "Gilt netfang er nauðsynlegt.",
      password: "Lykilorð þarf að vera a.m.k. 6 stafir.",
      teamName: "Nafn liðs er nauðsynlegt.",
      sport: "Veldu íþróttagrein.",
      firstPlayer: "Bættu við a.m.k. einum leikmanni til að byrja.",
      fallback: "Ekki tókst að búa til aðgang.",
    },
    success:
      "Aðgangur búinn til. Athugaðu póstinn þinn til að staðfesta, skráðu þig svo inn.",
    successSession: "Aðgangur búinn til. Fer í stjórnborðið…",
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CreateTeamPage() {
  const [lang, setLang] = useState<Lang>("IS");
  const t = COPY[lang];

  // Sync language with home page preference
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("mp_lang");
    if (saved === "IS" || saved === "EN") setLang(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("mp_lang", lang);
  }, [lang]);

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Step 1 — account
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 2 — team
  const [teamName, setTeamName] = useState("");
  const [sport, setSport] = useState<Sport | "">("");
  const [gender, setGender] = useState<Gender>("");
  const [clubShortName, setClubShortName] = useState("");

  // Step 3 — first player
  const [firstPlayerName, setFirstPlayerName] = useState("");

  // ── Validation per step ──
  function validateStep(current: 1 | 2 | 3): string | null {
    if (current === 1) {
      if (!fullName.trim()) return t.errors.fullName;
      if (!email.trim() || !email.includes("@")) return t.errors.email;
      if (password.length < 6) return t.errors.password;
      return null;
    }
    if (current === 2) {
      if (!teamName.trim()) return t.errors.teamName;
      if (!sport) return t.errors.sport;
      return null;
    }
    if (current === 3) {
      if (!firstPlayerName.trim()) return t.errors.firstPlayer;
      return null;
    }
    return null;
  }

  function goNext() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError(null);
    setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
  }

  function goBack() {
    setError(null);
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));
  }

  async function onSubmit() {
    const err = validateStep(1) ?? validateStep(2) ?? validateStep(3);
    if (err) { setError(err); return; }
    setError(null);
    setMessage(null);

    try {
      setLoading(true);
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: "COACH",
            team_type: "club_team_new",
            team_name: teamName.trim(),
            sport,
            gender: gender || null,
            club_short_name: clubShortName.trim() || null,
            first_player_name: firstPlayerName.trim(),
            product_plan: "PRO",
          },
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/auth/redirect?next=${encodeURIComponent("/coach")}`
              : undefined,
        },
      });
      if (signUpError) throw signUpError;

      if (data.session) {
        setMessage(t.successSession);
        // Give trigger a moment to finish, then redirect.
        window.setTimeout(() => {
          window.location.href = "/coach";
        }, 800);
      } else {
        setMessage(t.success);
      }
      setPassword("");
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : t.errors.fallback);
    } finally {
      setLoading(false);
    }
  }

  // ── Render helpers ──

  const stepper = (
    <div className="flex items-center gap-2 text-xs font-medium">
      {[1, 2, 3].map((s) => {
        const active = s === step;
        const done = s < step;
        return (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full ${
                active
                  ? "bg-neutral-900 text-white"
                  : done
                    ? "bg-emerald-500 text-white"
                    : "bg-neutral-200 text-neutral-500"
              }`}
            >
              {done ? "✓" : s}
            </div>
            {s < 3 && (
              <div className={`h-px w-8 ${done ? "bg-emerald-500" : "bg-neutral-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <main className="min-h-screen bg-white px-6 py-12 text-neutral-900">
      <div className="mx-auto w-full max-w-md">

        {/* Header + language toggle */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="text-sm font-medium text-neutral-500">{t.brand}</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t.title}</h1>
            <p className="mt-2 text-sm text-neutral-600">{t.subtitle}</p>
          </div>
          <div className="mt-1 flex shrink-0 overflow-hidden rounded-lg border text-xs font-semibold">
            <button
              type="button"
              onClick={() => setLang("IS")}
              className={`px-3 py-1.5 transition ${lang === "IS" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-900"}`}
            >
              IS
            </button>
            <button
              type="button"
              onClick={() => setLang("EN")}
              className={`px-3 py-1.5 transition ${lang === "EN" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-900"}`}
            >
              EN
            </button>
          </div>
        </div>

        {/* Trial banner */}
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <span className="font-semibold">✨ </span>
          {t.trialBanner}
        </div>

        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          {/* Stepper */}
          <div className="mb-6 flex items-center justify-between">
            {stepper}
            <div className="text-xs text-neutral-500">{t.step(step)}</div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 3) goNext();
              else onSubmit();
            }}
            className="space-y-4"
          >
            {/* ── Step 1: Account ── */}
            {step === 1 && (
              <>
                <h2 className="text-lg font-semibold text-neutral-900">{t.steps.account}</h2>
                <label className="grid gap-1.5 text-sm">
                  <span className="text-neutral-700">{t.labels.fullName}</span>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="rounded-xl border px-3 py-2"
                    placeholder={t.placeholders.fullName}
                    autoFocus
                    required
                  />
                </label>

                <label className="grid gap-1.5 text-sm">
                  <span className="text-neutral-700">{t.labels.email}</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-xl border px-3 py-2"
                    placeholder={t.placeholders.email}
                    required
                  />
                </label>

                <label className="grid gap-1.5 text-sm">
                  <span className="text-neutral-700">{t.labels.password}</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rounded-xl border px-3 py-2"
                    placeholder={t.placeholders.password}
                    minLength={6}
                    required
                  />
                </label>
              </>
            )}

            {/* ── Step 2: Team ── */}
            {step === 2 && (
              <>
                <h2 className="text-lg font-semibold text-neutral-900">{t.steps.team}</h2>
                <label className="grid gap-1.5 text-sm">
                  <span className="text-neutral-700">{t.labels.teamName}</span>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="rounded-xl border px-3 py-2"
                    placeholder={t.placeholders.teamName}
                    autoFocus
                    required
                  />
                </label>

                <label className="grid gap-1.5 text-sm">
                  <span className="text-neutral-700">{t.labels.sport}</span>
                  <select
                    value={sport}
                    onChange={(e) => setSport((e.target.value as Sport) || "")}
                    className="rounded-xl border px-3 py-2"
                    required
                  >
                    <option value="">—</option>
                    <option value="football">{t.sports.football}</option>
                    <option value="basketball">{t.sports.basketball}</option>
                    <option value="handball">{t.sports.handball}</option>
                  </select>
                </label>

                <label className="grid gap-1.5 text-sm">
                  <span className="text-neutral-700">{t.labels.gender}</span>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as Gender)}
                    className="rounded-xl border px-3 py-2"
                  >
                    <option value="">{t.genders[""]}</option>
                    <option value="M">{t.genders.M}</option>
                    <option value="F">{t.genders.F}</option>
                    <option value="mixed">{t.genders.mixed}</option>
                  </select>
                </label>

                <label className="grid gap-1.5 text-sm">
                  <span className="text-neutral-700">{t.labels.clubShortName}</span>
                  <input
                    type="text"
                    value={clubShortName}
                    onChange={(e) => setClubShortName(e.target.value)}
                    className="rounded-xl border px-3 py-2"
                    placeholder={t.placeholders.clubShortName}
                  />
                </label>
              </>
            )}

            {/* ── Step 3: First player ── */}
            {step === 3 && (
              <>
                <h2 className="text-lg font-semibold text-neutral-900">{t.steps.player}</h2>
                <label className="grid gap-1.5 text-sm">
                  <span className="text-neutral-700">{t.labels.firstPlayerName}</span>
                  <input
                    type="text"
                    value={firstPlayerName}
                    onChange={(e) => setFirstPlayerName(e.target.value)}
                    className="rounded-xl border px-3 py-2"
                    placeholder={t.placeholders.firstPlayerName}
                    autoFocus
                    required
                  />
                </label>
                <p className="text-xs text-neutral-500">{t.labels.firstPlayerHint}</p>
              </>
            )}

            {/* Error / success */}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {message}
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-between pt-2">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={goBack}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  ← {t.back}
                </button>
              ) : (
                <span />
              )}

              {step < 3 ? (
                <button
                  type="submit"
                  className="rounded-2xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700"
                >
                  {t.next} →
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {loading ? t.submitting : t.finish}
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Footer links */}
        <div className="mt-4 space-y-1 text-center text-sm text-neutral-600">
          <div>
            {t.hasAccount}{" "}
            <Link href="/login" className="font-medium text-neutral-900 underline">
              {t.signIn}
            </Link>
          </div>
          <div>
            {t.joinInstead}{" "}
            <Link href="/signup" className="font-medium text-neutral-900 underline">
              {t.joinLink}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

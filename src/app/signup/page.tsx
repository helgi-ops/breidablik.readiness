"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Lang = "IS" | "EN";
type Sport = "football" | "basketball" | "handball";
type TeamRow = { id: string; name: string; sport: string | null; gender: string | null };

const COPY = {
  EN: {
    brand: "MicroPulse",
    title: "Create a coach account",
    subtitle: "Sign up as a coach and connect your account to your team.",
    fullName: "Full name",
    fullNamePlaceholder: "Full name",
    sport: "Sport",
    sportPlaceholder: "Select sport…",
    sports: { football: "Football", basketball: "Basketball", handball: "Handball" },
    genders: { M: "Men", F: "Women" },
    team: "Team",
    teamPlaceholder: "Select team…",
    noTeams: "No teams found for this sport.",
    email: "Work email",
    emailPlaceholder: "name@club.com",
    password: "Password",
    passwordPlaceholder: "At least 6 characters",
    submit: "Create account",
    submitting: "Creating account…",
    hasAccount: "Already have an account?",
    signIn: "Sign in",
    errors: {
      name: "Full name is required.",
      email: "A valid email address is required.",
      password: "Password must be at least 6 characters.",
      sport: "Please select a sport.",
      team: "Please select a team.",
      fallback: "Unable to create account.",
    },
    success: "Account created. Check your email to verify and complete sign in.",
    successSession: "Account created. Head to the coach dashboard to get started.",
  },
  IS: {
    brand: "MicroPulse",
    title: "Búa til þjálfara aðgang",
    subtitle: "Skráðu þig sem þjálfari og tengdu aðganginn við lið þitt.",
    fullName: "Fullt nafn",
    fullNamePlaceholder: "Fullt nafn",
    sport: "Íþróttagrein",
    sportPlaceholder: "Veldu íþróttagrein…",
    sports: { football: "Fótbolti", basketball: "Körfubolti", handball: "Handbolti" },
    genders: { M: "Karlar", F: "Konur" },
    team: "Lið",
    teamPlaceholder: "Veldu lið…",
    noTeams: "Engin lið fundust fyrir þessa íþróttagrein.",
    email: "Netfang",
    emailPlaceholder: "nafn@lið.is",
    password: "Lykilorð",
    passwordPlaceholder: "A.m.k. 6 stafir",
    submit: "Búa til aðgang",
    submitting: "Bý til aðgang…",
    hasAccount: "Ertu nú þegar með aðgang?",
    signIn: "Skrá inn",
    errors: {
      name: "Fullt nafn er nauðsynlegt.",
      email: "Gilt netfang er nauðsynlegt.",
      password: "Lykilorð þarf að vera a.m.k. 6 stafir.",
      sport: "Veldu íþróttagrein.",
      team: "Veldu lið.",
      fallback: "Ekki tókst að búa til aðgang.",
    },
    success: "Aðgangur búinn til. Athugaðu póstinn þinn til að staðfesta og klára innskráningu.",
    successSession: "Aðgangur búinn til. Farðu á þjálfarasvæðið til að byrja.",
  },
};

function SignupForm() {
  const searchParams = useSearchParams();
  const presetTeamId = searchParams.get("team_id") ?? "";
  const presetSport  = (searchParams.get("sport") ?? "") as Sport | "";

  const [lang, setLang] = useState<Lang>("IS");
  const t = COPY[lang];

  // Sync with home page language preference
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("mp_lang") : null;
    if (saved === "IS" || saved === "EN") setLang(saved);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("mp_lang", lang);
  }, [lang]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sport, setSport] = useState<Sport | null>(presetSport as Sport || null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamId, setTeamId] = useState(presetTeamId);
  const [presetTeamName, setPresetTeamName] = useState<string | null>(null);
  const [presetTeamGender, setPresetTeamGender] = useState<string | null>(null);

  // If team_id is preset, look up its name and sport immediately
  useEffect(() => {
    if (!presetTeamId) return;
    (async () => {
      const { data } = await supabase
        .from("teams").select("id, name, sport, gender").eq("id", presetTeamId).maybeSingle();
      if (data) {
        setPresetTeamName((data as TeamRow).name);
        setPresetTeamGender((data as TeamRow).gender ?? null);
        setSport((data as TeamRow).sport as Sport);
        setTeamId(presetTeamId);
      }
    })();
  }, [presetTeamId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load teams when sport is selected (only when no preset)
  useEffect(() => {
    if (presetTeamId) return; // locked to preset team
    let alive = true;
    async function loadTeams() {
      if (!sport) { setTeams([]); setTeamId(""); return; }
      const { data, error: fetchError } = await supabase
        .from("teams").select("id, name, sport, gender").eq("sport", sport).order("name");
      if (!alive) return;
      if (fetchError) { console.warn("loadTeams error:", fetchError); setTeams([]); return; }
      setTeams((data ?? []) as TeamRow[]);
      setTeamId("");
    }
    loadTeams();
    return () => { alive = false; };
  }, [sport, presetTeamId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!fullName.trim()) { setError(t.errors.name); return; }
    if (!email.trim() || !email.includes("@")) { setError(t.errors.email); return; }
    if (password.length < 6) { setError(t.errors.password); return; }
    if (!sport) { setError(t.errors.sport); return; }
    if (!teamId) { setError(t.errors.team); return; }

    try {
      setLoading(true);
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim(), role: "COACH", sport, team_id: teamId, product_plan: "FREE" },
          emailRedirectTo: typeof window !== "undefined"
            ? `${window.location.origin}/auth/redirect?next=${encodeURIComponent("/coach")}`
            : undefined,
        },
      });
      if (signUpError) throw signUpError;
      setMessage(data.session ? t.successSession : t.success);
      setPassword("");
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : t.errors.fallback);
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = Boolean(fullName.trim() && email.trim() && password && sport && teamId);

  function teamLabel(team: TeamRow) {
    const genderStr = team.gender ? (t.genders as Record<string, string>)[team.gender] : null;
    return genderStr ? `${team.name} — ${genderStr}` : team.name;
  }

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

        <form onSubmit={onSubmit} className="space-y-4 rounded-3xl border bg-white p-6 shadow-sm">

          {/* Full name */}
          <label className="grid gap-1.5 text-sm">
            <span className="text-neutral-700">{t.fullName}</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="rounded-xl border px-3 py-2"
              placeholder={t.fullNamePlaceholder}
              required
            />
          </label>

          {/* Sport — hidden when team is preset (sport auto-detected) */}
          {!presetTeamId && (
            <label className="grid gap-1.5 text-sm">
              <span className="text-neutral-700">{t.sport}</span>
              <select
                value={sport ?? ""}
                onChange={(e) => setSport((e.target.value as Sport) || null)}
                className="rounded-xl border px-3 py-2"
                required
              >
                <option value="">{t.sportPlaceholder}</option>
                <option value="football">{t.sports.football}</option>
                <option value="basketball">{t.sports.basketball}</option>
                <option value="handball">{t.sports.handball}</option>
              </select>
            </label>
          )}

          {/* Team — locked banner when preset, otherwise dropdown */}
          {presetTeamId ? (
            <div className="grid gap-1.5 text-sm">
              <span className="text-neutral-700">{t.team}</span>
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <span className="text-emerald-600">✓</span>
                <span className="font-medium text-emerald-800">
                  {presetTeamName
                    ? teamLabel({ id: presetTeamId, name: presetTeamName, sport, gender: presetTeamGender })
                    : "…"}
                </span>
                <span className="ml-auto text-xs text-emerald-500">Tengt við link</span>
              </div>
            </div>
          ) : sport && (
            <label className="grid gap-1.5 text-sm">
              <span className="text-neutral-700">{t.team}</span>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="rounded-xl border px-3 py-2"
                required
              >
                <option value="">{t.teamPlaceholder}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{teamLabel(team)}</option>
                ))}
              </select>
              {teams.length === 0 && (
                <span className="text-xs text-neutral-400">{t.noTeams}</span>
              )}
            </label>
          )}

          {/* Email */}
          <label className="grid gap-1.5 text-sm">
            <span className="text-neutral-700">{t.email}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border px-3 py-2"
              placeholder={t.emailPlaceholder}
              required
            />
          </label>

          {/* Password */}
          <label className="grid gap-1.5 text-sm">
            <span className="text-neutral-700">{t.password}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border px-3 py-2"
              placeholder={t.passwordPlaceholder}
              minLength={6}
              required
            />
          </label>

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

          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="w-full rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50"
          >
            {loading ? t.submitting : t.submit}
          </button>
        </form>

        <div className="mt-4 space-y-1 text-center text-sm text-neutral-600">
          <div>
            {t.hasAccount}{" "}
            <Link href="/login" className="font-medium text-neutral-900 underline">
              {t.signIn}
            </Link>
          </div>
          <div>
            {lang === "IS" ? "Stofnar þú nýtt félag?" : "Starting a new club?"}{" "}
            <Link href="/signup/create-team" className="font-medium text-neutral-900 underline">
              {lang === "IS" ? "Stofna nýtt félag" : "Create a new club"}
            </Link>
          </div>
        </div>

      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

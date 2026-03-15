"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type StaffRole = "COACH" | "PERFORMANCE" | "MEDICAL" | "ADMIN";

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState<StaffRole>("COACH");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Valid email is required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    try {
      setLoading(true);
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role,
            organization_name: organization.trim() || null,
            product_plan: "FREE",
          },
          emailRedirectTo:
            typeof window !== "undefined" ? `${window.location.origin}/auth/redirect?next=${encodeURIComponent("/coach")}` : undefined,
        },
      });

      if (signUpError) throw signUpError;

      if (!data.session) {
        setMessage("Account created. Check your email to verify and complete sign in.");
      } else {
        setMessage("Account created and signed in. Continue to onboarding from the coach dashboard.");
      }

      setPassword("");
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white px-6 py-12 text-neutral-900">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6">
          <div className="text-sm font-medium text-neutral-500">MicroPulse</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Start with Free</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Create your MicroPulse account and start with daily monitoring, readiness visibility, and team decision support foundations.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3 rounded-3xl border bg-white p-6 shadow-sm">
          <label className="grid gap-1.5 text-sm">
            <span className="text-neutral-700">Full name</span>
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="rounded-xl border px-3 py-2"
              placeholder="Full name"
              required
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-neutral-700">Work email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-xl border px-3 py-2"
              placeholder="name@club.com"
              required
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-neutral-700">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-xl border px-3 py-2"
              placeholder="At least 6 characters"
              minLength={6}
              required
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-neutral-700">Organization (optional)</span>
            <input
              type="text"
              value={organization}
              onChange={(event) => setOrganization(event.target.value)}
              className="rounded-xl border px-3 py-2"
              placeholder="Club or academy"
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-neutral-700">Primary role</span>
            <select value={role} onChange={(event) => setRole(event.target.value as StaffRole)} className="rounded-xl border px-3 py-2">
              <option value="COACH">Coach</option>
              <option value="PERFORMANCE">Performance Staff</option>
              <option value="MEDICAL">Medical Staff</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>

          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</div> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Create Free Account"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-neutral-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-neutral-900 underline">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

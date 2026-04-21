"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type InviteInfo = {
  invite: { token: string; targetRole: string; label: string | null };
  team: { id: string; name: string; sport: string | null; gender: string | null } | null;
};

const GENDER_LABEL: Record<string, string> = { M: "Karlar", F: "Konur" };
const SPORT_LABEL: Record<string, string> = {
  football: "Fótbolti",
  basketball: "Körfubolti",
  handball: "Handbolti",
};

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/team-invites/${token}`, { cache: "no-store" });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setError(json.error ?? "not_found");
          return;
        }
        const json = await res.json();
        setInfo(json);
      } catch {
        setError("network_error");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-sm text-neutral-500">Hleð...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-neutral-900">
            {error === "expired" ? "Boðslinkur útrunninn" : error === "deactivated" ? "Boðslinkur óvirkur" : "Linkur fannst ekki"}
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            {error === "expired"
              ? "Þessi boðslinkur er útrunninn. Biddu þjálfarann þinn um nýjan link."
              : error === "deactivated"
                ? "Þessi boðslinkur hefur verið óvirkjaður."
                : "Þessi boðslinkur er ekki gildur. Athugaðu hvort þú afritaðir hann rétt."}
          </p>
          <Link href="/login" className="mt-6 inline-block rounded-xl bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700">
            Fara á innskráningu
          </Link>
        </div>
      </main>
    );
  }

  if (!info?.team) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="text-sm text-neutral-500">Lið fannst ekki.</div>
      </main>
    );
  }

  const team = info.team;
  const isCoachInvite = info.invite.targetRole === "COACH";
  const genderLabel = team.gender ? GENDER_LABEL[team.gender] : null;
  const sportLabel = team.sport ? SPORT_LABEL[team.sport] : null;
  const teamDisplay = [team.name, genderLabel].filter(Boolean).join(" — ");

  // Build signup URL with pre-filled params
  const signupParams = new URLSearchParams();
  signupParams.set("team", team.id);
  if (team.sport) signupParams.set("sport", team.sport);
  if (team.gender) signupParams.set("gender", team.gender);
  signupParams.set("team_invite", token);

  const signupUrl = isCoachInvite
    ? `/signup?team_id=${team.id}&sport=${team.sport ?? ""}`
    : `/login?${signupParams.toString()}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm text-center">
        {/* Icon */}
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
          </svg>
        </div>

        <div className="text-xs font-medium uppercase tracking-wider text-neutral-400 mb-1">MicroPulse</div>
        <h1 className="text-2xl font-semibold text-neutral-900">
          {isCoachInvite ? "Þjálfaraboð" : "Skráðu þig í lið"}
        </h1>

        <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-5 py-4">
          <div className="text-lg font-semibold text-neutral-900">{teamDisplay}</div>
          {sportLabel && (
            <div className="mt-1 text-sm text-neutral-500">{sportLabel}</div>
          )}
        </div>

        <p className="mt-4 text-sm text-neutral-600">
          {isCoachInvite
            ? "Þú hefur fengið boð um að skrá þig sem þjálfari."
            : "Þjálfarinn þinn hefur boðið þér að skrá þig í MicroPulse. Smelltu á hnappinn til að búa til aðgang."}
        </p>

        <button
          onClick={() => router.push(signupUrl)}
          className="mt-6 w-full rounded-2xl bg-neutral-900 px-6 py-3 text-sm font-semibold text-white hover:bg-neutral-700 transition"
        >
          {isCoachInvite ? "Búa til þjálfaraaðgang" : "Búa til aðgang"}
        </button>

        <div className="mt-4 text-sm text-neutral-500">
          Ertu nú þegar með aðgang?{" "}
          <Link href="/login" className="font-medium text-neutral-900 underline">
            Skrá inn
          </Link>
        </div>
      </div>
    </main>
  );
}

"use client";

// AddPlayerButton — reusable "Add player" button + modal for coaches.
// Creates an ACTIVE player row for the coach's team with full_name as the
// only required field. Email + position are optional. No user account is
// created here; invite-magic-link is a separate flow.

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { POSITION_OPTIONS } from "@/lib/micropulse/positionStyle";

type Lang = "IS" | "EN";

const COPY = {
  IS: {
    button: "+ Bæta við leikmanni",
    title: "Bæta við nýjum leikmanni",
    subtitle: "Fullt nafn er nauðsynlegt. Hitt má fylla inn síðar.",
    fullName: "Fullt nafn",
    fullNamePlaceholder: "T.d. Jóhann Guðmundsson",
    position: "Staða (valfrjálst)",
    positions: { "": "—", GK: "Markvörður", DF: "Varnarmaður", MF: "Miðjumaður", FW: "Sóknarmaður" },
    cancel: "Hætta við",
    submit: "Bæta við",
    submitting: "Bæti við…",
    success: "Leikmaður bættist við ✓",
    errors: {
      name: "Nafn er nauðsynlegt.",
      team: "Ekkert lið fundið — reyndu aftur eftir að hafa hlaðið síðunni.",
      fallback: "Ekki tókst að bæta við leikmanni.",
    },
  },
  EN: {
    button: "+ Add player",
    title: "Add a new player",
    subtitle: "Full name is required. The rest can be filled later.",
    fullName: "Full name",
    fullNamePlaceholder: "e.g. Jóhann Guðmundsson",
    position: "Position (optional)",
    positions: { "": "—", GK: "Goalkeeper", DF: "Defender", MF: "Midfielder", FW: "Forward" },
    cancel: "Cancel",
    submit: "Add player",
    submitting: "Adding…",
    success: "Player added ✓",
    errors: {
      name: "Name is required.",
      team: "No team found — try again after the page has loaded.",
      fallback: "Failed to add player.",
    },
  },
} as const;

type Position = string; // position code from POSITION_OPTIONS (or "" = unset)

interface Props {
  teamId: string | null;
  lang?: Lang;
  onPlayerAdded?: () => void;
}

export default function AddPlayerButton({ teamId, lang = "IS", onPlayerAdded }: Props) {
  const t = COPY[lang];
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState<Position>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function reset() {
    setFullName("");
    setPosition("");
    setError(null);
    setSuccess(false);
  }

  function close() {
    reset();
    setOpen(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!fullName.trim()) { setError(t.errors.name); return; }
    if (!teamId) { setError(t.errors.team); return; }

    try {
      setLoading(true);
      const { error: insertError } = await supabase
        .from("players")
        .insert({
          full_name: fullName.trim(),
          team_id: teamId,
          status: "ACTIVE",
          is_active: true,
          ...(position ? { position } : {}),
        });
      if (insertError) throw insertError;

      setSuccess(true);
      setFullName("");
      setPosition("");
      if (onPlayerAdded) onPlayerAdded();

      // Auto-close after short delay
      window.setTimeout(() => {
        if (open) close();
      }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.errors.fallback);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 transition-colors"
      >
        {t.button}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">{t.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{t.subtitle}</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <label className="grid gap-1.5 text-sm">
                <span className="text-slate-700">{t.fullName}</span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="rounded-xl border px-3 py-2"
                  placeholder={t.fullNamePlaceholder}
                  autoFocus
                  required
                />
              </label>

              <label className="grid gap-1.5 text-sm">
                <span className="text-slate-700">{t.position}</span>
                <select
                  value={position}
                  onChange={(e) => setPosition(e.target.value as Position)}
                  className="rounded-xl border px-3 py-2"
                >
                  <option value="">{t.positions[""]}</option>
                  {POSITION_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>{o.code} · {lang === "IS" ? o.is : o.en}</option>
                  ))}
                </select>
              </label>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {t.success}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={loading || !fullName.trim() || !teamId}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {loading ? t.submitting : t.submit}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

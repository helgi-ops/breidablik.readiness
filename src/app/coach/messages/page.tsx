"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Flag = "GREEN" | "YELLOW" | "RED";

type MsgRow = {
  id: number;
  team_id: string | null;
  flag: Flag;
  lang: "is" | "en";
  title: string | null;
  message: string;
  why: string | null;
  is_active: boolean;
};

const FLAGS: Flag[] = ["GREEN", "YELLOW", "RED"];

function flagLabel(flag: Flag) {
  if (flag === "GREEN") return "Grænt (FULL)";
  if (flag === "YELLOW") return "Gult (MODIFIED)";
  return "Rautt (RECOVERY)";
}

export default function CoachMessagesPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  const [rows, setRows] = useState<Record<Flag, MsgRow | null>>({
    GREEN: null,
    YELLOW: null,
    RED: null,
  });

  const [draft, setDraft] = useState<Record<Flag, { title: string; message: string; why: string }>>({
    GREEN: { title: "Full æfing", message: "", why: "" },
    YELLOW: { title: "Aðlagað álag", message: "", why: "" },
    RED: { title: "Recovery", message: "", why: "" },
  });

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError("");

      // Ath: Global skilaboð = team_id IS NULL, lang='is'
      const { data, error: e } = await supabase
        .from("player_flag_messages")
        .select("id, team_id, flag, lang, title, message, why, is_active")
        .is("team_id", null)
        .eq("lang", "is")
        .eq("is_active", true);

      if (e) {
        setError(e.message);
        setLoading(false);
        return;
      }

      const map: any = { GREEN: null, YELLOW: null, RED: null };
      for (const r of (data ?? []) as MsgRow[]) {
        map[r.flag] = r;
      }

      setRows(map);

      // set drafts
      setDraft((prev) => {
        const next = { ...prev };
        for (const f of FLAGS) {
          const rr = map[f];
          if (rr) {
            next[f] = {
              title: rr.title ?? prev[f].title,
              message: rr.message ?? "",
              why: rr.why ?? "",
            };
          }
        }
        return next;
      });

      setLoading(false);
    };

    run();
  }, [supabase]);

  async function saveFlag(flag: Flag) {
    try {
      setSaving(true);
      setError("");

      const payload = {
        team_id: null,
        flag,
        lang: "is",
        title: draft[flag].title || null,
        message: draft[flag].message,
        why: draft[flag].why || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (!payload.message.trim()) {
        setError("Message má ekki vera tómt.");
        setSaving(false);
        return;
      }

      // Upsert á unique(team_id, flag, lang)
      const { data, error: e } = await supabase
        .from("player_flag_messages")
        .upsert(payload, { onConflict: "team_id,flag,lang" })
        .select("id, team_id, flag, lang, title, message, why, is_active")
        .single();

      if (e) {
        setError(e.message);
        setSaving(false);
        return;
      }

      setRows((prev) => ({ ...prev, [flag]: data as any }));
      setSaving(false);
    } catch (err: any) {
      setError(err?.message ?? "Óþekkt villa.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="h-4 w-64 animate-pulse rounded bg-zinc-200" />
            <div className="mt-6 h-28 animate-pulse rounded-xl bg-zinc-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-zinc-500">Coach · Settings</div>
              <div className="mt-2 text-xl font-semibold text-zinc-900">
                Generic skilaboð til leikmanna
              </div>
              <div className="mt-2 text-sm text-zinc-600">
                Þessi skilaboð birtast á player-síðunni (fallback). Global = gildir fyrir öll lið.
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4">
            {FLAGS.map((f) => (
              <div key={f} className="rounded-2xl border bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-zinc-900">{flagLabel(f)}</div>
                  <button
                    onClick={() => saveFlag(f)}
                    disabled={saving}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                  >
                    Save
                  </button>
                </div>

                <div className="mt-4 grid gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Titill</div>
                    <input
                      className="mt-2 w-full rounded-lg border bg-white p-3 text-sm"
                      value={draft[f].title}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [f]: { ...prev[f], title: e.target.value } }))
                      }
                    />
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Skilaboð</div>
                    <textarea
                      className="mt-2 w-full rounded-lg border bg-white p-3 text-sm"
                      rows={3}
                      value={draft[f].message}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [f]: { ...prev[f], message: e.target.value } }))
                      }
                    />
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Af hverju?</div>
                    <textarea
                      className="mt-2 w-full rounded-lg border bg-white p-3 text-sm"
                      rows={2}
                      value={draft[f].why}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [f]: { ...prev[f], why: e.target.value } }))
                      }
                    />
                  </div>

                  <div className="text-xs text-zinc-500">
                    Síðast vistað:{" "}
                    {rows[f]?.id ? `#${rows[f]?.id}` : "—"} (upsert á team_id=NULL, lang=is)
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-xs text-zinc-500">
            Prófaðu svo player-síðuna: <span className="font-mono">/player</span>
          </div>
        </div>
      </div>
    </div>
  );
}

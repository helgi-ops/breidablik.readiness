"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type DemoRequest = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  email: string;
  org: string;
  sport: string | null;
  message: string | null;
  plan: string | null;
  sport_env: string | null;
  lang: string | null;
  source: string | null;
  user_agent: string | null;
  referrer: string | null;
  status:
    | "new"
    | "contacted"
    | "meeting_scheduled"
    | "pilot"
    | "won"
    | "lost"
    | "spam";
  notes: string | null;
  assigned_to: string | null;
};

const STATUSES: Array<DemoRequest["status"]> = [
  "new",
  "contacted",
  "meeting_scheduled",
  "pilot",
  "won",
  "lost",
  "spam",
];

const STATUS_LABEL: Record<DemoRequest["status"], string> = {
  new: "Nýtt",
  contacted: "Haft samband",
  meeting_scheduled: "Fundur bókaður",
  pilot: "Í pilot",
  won: "Viðskiptavinur",
  lost: "Tapað",
  spam: "Ruslpóstur",
};

const STATUS_COLOR: Record<DemoRequest["status"], string> = {
  new: "bg-blue-100 text-blue-800 border-blue-200",
  contacted: "bg-amber-100 text-amber-800 border-amber-200",
  meeting_scheduled: "bg-purple-100 text-purple-800 border-purple-200",
  pilot: "bg-indigo-100 text-indigo-800 border-indigo-200",
  won: "bg-emerald-100 text-emerald-800 border-emerald-200",
  lost: "bg-gray-200 text-gray-700 border-gray-300",
  spam: "bg-red-100 text-red-700 border-red-200",
};

async function token() {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("is-IS", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LeadsClient() {
  const [leads, setLeads] = useState<DemoRequest[]>([]);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<"active" | DemoRequest["status"]>(
    "active",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await token();
      if (!t) throw new Error("Vantar auðkenningu");
      const params = new URLSearchParams();
      if (filter !== "active") params.set("status", filter);
      const res = await fetch(`/api/admin/demo-requests?${params}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok)
        throw new Error(json.error || "Villa við að sækja");
      setLeads(json.requests ?? []);
      setByStatus(json.byStatus ?? {});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function updateLead(
    id: string,
    patch: Partial<Pick<DemoRequest, "status" | "notes">>,
  ) {
    setSaving(id);
    try {
      const t = await token();
      if (!t) throw new Error("Vantar auðkenningu");
      const res = await fetch(`/api/admin/demo-requests/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Villa");
      setLeads((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...json.request } : l)),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  const totalActive = useMemo(() => {
    return STATUSES.filter((s) => s !== "spam").reduce(
      (acc, s) => acc + (byStatus[s] ?? 0),
      0,
    );
  }, [byStatus]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Demo / pilot beiðnir</h1>
          <p className="text-sm text-gray-600">
            Innkomnir leads úr /pricing formi og öðrum forsíðum.
          </p>
        </div>
        <div className="text-sm text-gray-600">
          Samtals virkir leads:{" "}
          <span className="font-semibold text-gray-900">{totalActive}</span>
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-white p-1 text-sm">
        <button
          type="button"
          onClick={() => setFilter("active")}
          className={
            "rounded-md px-3 py-1.5 font-medium transition " +
            (filter === "active"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-gray-700 hover:bg-gray-100")
          }
        >
          Allt virkt ({totalActive})
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={
              "rounded-md px-3 py-1.5 font-medium transition " +
              (filter === s
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-700 hover:bg-gray-100")
            }
          >
            {STATUS_LABEL[s]} ({byStatus[s] ?? 0})
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {loading && <div className="text-sm text-gray-500">Hleð…</div>}

      {!loading && leads.length === 0 && (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
          Engin beiðni í þessari flokkun enn.
        </div>
      )}

      <div className="space-y-2">
        {leads.map((l) => {
          const open = expandedId === l.id;
          return (
            <div
              key={l.id}
              className="rounded-lg border bg-white shadow-sm transition hover:border-blue-300"
            >
              <div
                className="flex cursor-pointer flex-wrap items-center gap-3 p-3"
                onClick={() => setExpandedId(open ? null : l.id)}
              >
                <div className="min-w-[180px] flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{l.org}</span>
                    <span
                      className={
                        "rounded border px-1.5 py-0.5 text-[11px] font-semibold " +
                        STATUS_COLOR[l.status]
                      }
                    >
                      {STATUS_LABEL[l.status]}
                    </span>
                  </div>
                  <div className="text-sm text-gray-700">
                    {l.name}{" "}
                    <a
                      href={`mailto:${l.email}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-600 hover:underline"
                    >
                      {l.email}
                    </a>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {l.plan && (
                    <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5">
                      {l.plan}
                      {l.sport_env ? ` · ${l.sport_env}` : ""}
                    </span>
                  )}
                  {l.sport && (
                    <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5">
                      {l.sport}
                    </span>
                  )}
                  <span>{formatDate(l.created_at)}</span>
                </div>
              </div>

              {open && (
                <div className="space-y-3 border-t bg-gray-50 p-3">
                  {l.message && (
                    <div className="rounded border bg-white p-2 text-sm text-gray-800">
                      <div className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">
                        Skilaboð
                      </div>
                      {l.message}
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">
                        Staða
                      </label>
                      <select
                        value={l.status}
                        disabled={saving === l.id}
                        onChange={(e) =>
                          updateLead(l.id, {
                            status: e.target.value as DemoRequest["status"],
                          })
                        }
                        className="w-full rounded border px-2 py-1.5 text-sm"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">
                        Uppruni
                      </label>
                      <div className="rounded border bg-white px-2 py-1.5 text-sm text-gray-700">
                        {l.source || "—"}{" "}
                        {l.lang && (
                          <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-600">
                            {l.lang}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <NotesEditor
                    initial={l.notes || ""}
                    disabled={saving === l.id}
                    onSave={(notes) => updateLead(l.id, { notes })}
                  />

                  {l.referrer && (
                    <div className="text-[11px] text-gray-500">
                      Referrer: <span className="font-mono">{l.referrer}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NotesEditor({
  initial,
  disabled,
  onSave,
}: {
  initial: string;
  disabled: boolean;
  onSave: (notes: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setValue(initial);
    setDirty(false);
  }, [initial]);

  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">
        Glósur
      </label>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setDirty(e.target.value !== initial);
        }}
        disabled={disabled}
        rows={3}
        className="w-full rounded border px-2 py-1.5 text-sm"
        placeholder="Hvað var rætt, næstu skref…"
      />
      {dirty && (
        <div className="mt-1 flex justify-end gap-2">
          <button
            onClick={() => {
              setValue(initial);
              setDirty(false);
            }}
            className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
            disabled={disabled}
          >
            Hætta við
          </button>
          <button
            onClick={() => {
              onSave(value);
              setDirty(false);
            }}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
            disabled={disabled}
          >
            Vista
          </button>
        </div>
      )}
    </div>
  );
}

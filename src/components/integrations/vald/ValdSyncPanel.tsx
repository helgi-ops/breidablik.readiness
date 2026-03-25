"use client";

type Props = {
  onSyncLatest: () => void;
  onResync: () => void;
  busy?: "sync" | "resync" | null;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  isEnabled?: boolean;
};

export default function ValdSyncPanel({
  onSyncLatest,
  onResync,
  busy = null,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  isEnabled = false,
}: Props) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-sm font-semibold text-zinc-900">Manual sync</div>
      <div className="mt-1 text-xs text-zinc-600">Sync latest tests or reprocess a date range safely.</div>
      {!isEnabled ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Virkjaðu VALD tenginguna fyrst. Sync virkar ekki meðan accountið er merkt `Disabled`.
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs text-zinc-700">
          <div className="mb-1 font-medium">Date from</div>
          <input type="date" className="w-full rounded-lg border px-3 py-2 text-sm" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} disabled={!isEnabled || busy !== null} />
        </label>
        <label className="text-xs text-zinc-700">
          <div className="mb-1 font-medium">Date to</div>
          <input type="date" className="w-full rounded-lg border px-3 py-2 text-sm" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} disabled={!isEnabled || busy !== null} />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onSyncLatest} disabled={!isEnabled || busy !== null} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {busy === "sync" ? "Syncing..." : "Sync latest"}
        </button>
        <button type="button" onClick={onResync} disabled={!isEnabled || busy !== null} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60">
          {busy === "resync" ? "Re-syncing..." : "Re-sync date range"}
        </button>
      </div>
    </div>
  );
}

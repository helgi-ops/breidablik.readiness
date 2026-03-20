"use client";

type Props = {
  history: Array<Record<string, unknown>>;
};

export default function ValdSyncHistoryTable({ history }: Props) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-sm font-semibold text-zinc-900">Sync history</div>
      {!history.length ? <div className="mt-3 rounded-lg border bg-zinc-50 px-3 py-2 text-xs text-zinc-600">No sync history yet.</div> : null}
      <div className="mt-3 space-y-2">
        {history.map((row) => (
          <div key={String(row.id)} className="rounded-lg border bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-zinc-900">{String(row.sync_type ?? "manual")}</span>
              <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold">{String(row.status ?? "unknown")}</span>
            </div>
            <div className="mt-1 text-zinc-600">{String(row.started_at ?? "—")} → {String(row.completed_at ?? "—")}</div>
            <div className="mt-1 text-zinc-600">{JSON.stringify(row.summary ?? {})}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
